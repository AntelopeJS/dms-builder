----------------------------- MODULE PageSave -----------------------------
(***************************************************************************)
(* One page file of a DMS project, written by the dms-builder engine on   *)
(* behalf of builder tabs and other modules, and by an editor outside the *)
(* builder. Paths are under packages/dms-builder/.                         *)
(*                                                                         *)
(* A file's content is the set of edits it holds. Each edit has a fresh   *)
(* id, so two contents are equal exactly when their texts are, and the    *)
(* version is the content itself (engine/page-structure.ts:12, a hash of  *)
(* the text). An edit lies in the page's blocks or elsewhere in the file  *)
(* (its options, category, imports): a save rewrites only the blocks.     *)
(*                                                                         *)
(* The engine runs one operation at a time: every mutation is synchronous *)
(* from refreshFromDisk to Transaction.flush (engine/writable.ts:52,443), *)
(* so no other operation of the process runs in between. Only a writer in *)
(* another process can act between the refresh and the flush, the window  *)
(* that holds the typecheck (engine/ops.ts:166).                           *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets, TLC

CONSTANTS
  Editors,            \* the builder tabs open on the page
  MaxIds,             \* edits made, by anyone, over a run
  MaxOutside,         \* writes by an editor outside the builder
  MaxModule,          \* edits by another module through the interface
  MaxMoves,           \* page moves to another category from a tab
  OutsideDuringWrite, \* whether an outside write may land inside the engine's window
  CheckVersion        \* whether SetPageBlocks checks expectedVersion (engine/page-draft.ts:519)

None == "none"

VARIABLES
  disk,     \* the edits the page file holds
  ever,     \* every edit the file has held
  blockIds, \* the edits that lie in the page's blocks
  next,     \* the next fresh edit id
  outside,  \* outside writes so far
  module,   \* module edits so far
  moves,    \* moves so far
  eng,      \* the engine's operation in flight
  ed        \* each tab's session (frontend-vue/app/runtime/session-model.ts)

vars == <<disk, ever, blockIds, next, outside, module, moves, eng, ed>>

Ids == 1..MaxIds

EditorSymmetry == Permutations(Editors)

TypeOK ==
  /\ disk \subseteq Ids
  /\ ever \subseteq Ids
  /\ blockIds \subseteq Ids
  /\ next \in 1..(MaxIds + 1)
  /\ eng.pc \in {"idle", "busy"}
  /\ eng.mem \subseteq Ids
  /\ eng.from \in Editors \cup {None}
  /\ eng.kind \in {"none", "save", "move", "edit"}
  /\ \A e \in Editors :
       /\ ed[e].pc \in {"closed", "idle", "saving", "moving", "stale", "refreshing"}
       /\ ed[e].draft \subseteq Ids
       /\ ed[e].base \subseteq Ids
       /\ ed[e].acked \subseteq Ids

Init ==
  /\ disk = {}
  /\ ever = {}
  /\ blockIds = {}
  /\ next = 1
  /\ outside = 0
  /\ module = 0
  /\ moves = 0
  /\ eng = [pc |-> "idle", mem |-> {}, from |-> None, kind |-> "none"]
  /\ ed = [e \in Editors |-> [pc |-> "closed", draft |-> {}, base |-> {}, acked |-> {}]]

Dirty(e) == ed[e].draft # ed[e].base

(* A tab reads the page: GetPageStructure answers the text on disk and its *)
(* version (engine/page-structure.ts:32, the source index restamps changed *)
(* files, engine/source-index.ts:28). It runs between engine operations.   *)
Open(e) ==
  /\ ed[e].pc = "closed"
  /\ eng.pc = "idle"
  /\ ed' = [ed EXCEPT ![e].pc = "idle", ![e].draft = disk, ![e].base = disk]
  /\ UNCHANGED <<disk, ever, blockIds, next, outside, module, moves, eng>>

(* An edit to a block in the tab's draft; nothing is written. *)
Edit(e) ==
  /\ ed[e].pc = "idle"
  /\ next <= MaxIds
  /\ ed' = [ed EXCEPT ![e].draft = @ \cup {next}]
  /\ blockIds' = blockIds \cup {next}
  /\ next' = next + 1
  /\ UNCHANGED <<disk, ever, outside, module, moves, eng>>

(* Save sends the draft with the version the tab holds (runtime/session-lifecycle.ts:289). *)
RequestSave(e) ==
  /\ ed[e].pc = "idle"
  /\ Dirty(e)
  /\ ed' = [ed EXCEPT ![e].pc = "saving"]
  /\ UNCHANGED <<disk, ever, blockIds, next, outside, module, moves, eng>>

(* Moving the page to another category writes at once, with no version (runtime/session-site.ts:216). *)
RequestMove(e) ==
  /\ ed[e].pc = "idle"
  /\ moves < MaxMoves
  /\ ed' = [ed EXCEPT ![e].pc = "moving"]
  /\ moves' = moves + 1
  /\ UNCHANGED <<disk, ever, blockIds, next, outside, module, eng>>

(* After a stale refusal, Keep my version adopts the page's version and keeps *)
(* the draft (runtime/session-lifecycle.ts:226): the tab has seen what it will overwrite. *)
KeepMine(e) ==
  /\ ed[e].pc = "stale"
  /\ eng.pc = "idle"
  /\ ed' = [ed EXCEPT ![e].pc = "idle", ![e].base = disk, ![e].acked = @ \cup (disk \ ed[e].draft)]
  /\ UNCHANGED <<disk, ever, blockIds, next, outside, module, moves, eng>>

(* After a stale refusal, Reload the page drops the draft for the page as it is (runtime/session-lifecycle.ts:106). *)
ReloadPage(e) ==
  /\ ed[e].pc = "stale"
  /\ eng.pc = "idle"
  /\ ed' = [ed EXCEPT ![e].pc = "idle", ![e].draft = disk, ![e].base = disk]
  /\ UNCHANGED <<disk, ever, blockIds, next, outside, module, moves, eng>>

(* After a move with an unsaved draft, refresh() adopts the page's version and *)
(* keeps the draft, without a stale check (runtime/session-lifecycle.ts:130). *)
RefreshAfterMove(e) ==
  /\ ed[e].pc = "refreshing"
  /\ eng.pc = "idle"
  /\ ed' = [ed EXCEPT ![e].pc = "idle", ![e].base = disk]
  /\ UNCHANGED <<disk, ever, blockIds, next, outside, module, moves, eng>>

(* setPageBlocks: openPage refreshes from disk (engine/ops.ts:132), checkVersion   *)
(* compares (engine/ops.ts:147), and the draft's blocks replace the page's; the  *)
(* rest of the file is the text just read (engine/page-draft.ts:542, the draft   *)
(* carries only the page options the tab changed, runtime/draft.ts:62).          *)
BeginSave(e) ==
  /\ eng.pc = "idle"
  /\ ed[e].pc = "saving"
  /\ IF CheckVersion /\ ed[e].base # disk
       THEN /\ ed' = [ed EXCEPT ![e].pc = "stale"]
            /\ UNCHANGED eng
       ELSE /\ eng' = [pc |-> "busy", mem |-> (ed[e].draft \cap blockIds) \cup (disk \ blockIds), from |-> e, kind |-> "save"]
            /\ UNCHANGED ed
  /\ UNCHANGED <<disk, ever, blockIds, next, outside, module, moves>>

(* configurePage with a category: an edit outside the blocks, applied to the text just read. *)
BeginMove(e) ==
  /\ eng.pc = "idle"
  /\ ed[e].pc = "moving"
  /\ next <= MaxIds
  /\ eng' = [pc |-> "busy", mem |-> disk \cup {next}, from |-> e, kind |-> "move"]
  /\ next' = next + 1
  /\ UNCHANGED <<disk, ever, blockIds, outside, module, moves, ed>>

(* Another module calls a mutation of @antelopejs/interface-dms-builder with no *)
(* expectedVersion, on a block (ConfigureBlock) or elsewhere (ConfigurePage).   *)
BeginModuleEdit ==
  /\ eng.pc = "idle"
  /\ module < MaxModule
  /\ next <= MaxIds
  /\ eng' = [pc |-> "busy", mem |-> disk \cup {next}, from |-> None, kind |-> "edit"]
  /\ \E inBlock \in BOOLEAN : blockIds' = IF inBlock THEN blockIds \cup {next} ELSE blockIds
  /\ next' = next + 1
  /\ module' = module + 1
  /\ UNCHANGED <<disk, ever, outside, moves, ed>>

Idle == [pc |-> "idle", mem |-> {}, from |-> None, kind |-> "none"]

(* commit: the typecheck passes and flush writes the text (engine/ops.ts:174). *)
(* A save answers the version of what it wrote (engine/page-draft.ts:607).     *)
Write ==
  /\ eng.pc = "busy"
  /\ disk' = eng.mem
  /\ ever' = ever \cup eng.mem
  /\ eng' = Idle
  /\ UNCHANGED blockIds
  /\ ed' = CASE eng.kind = "save" -> [ed EXCEPT ![eng.from].pc = "idle", ![eng.from].base = eng.mem]
             [] eng.kind = "move" /\ Dirty(eng.from) -> [ed EXCEPT ![eng.from].pc = "refreshing"]
             [] eng.kind = "move" -> [ed EXCEPT ![eng.from].pc = "idle", ![eng.from].base = eng.mem, ![eng.from].draft = eng.mem]
             [] OTHER -> ed
  /\ UNCHANGED <<next, outside, module, moves>>

(* commit: the typecheck fails and the transaction rolls back; nothing is written (engine/ops.ts:168). *)
Rollback ==
  /\ eng.pc = "busy"
  /\ eng' = Idle
  /\ ed' = IF eng.from = None THEN ed ELSE [ed EXCEPT ![eng.from].pc = "idle"]
  /\ UNCHANGED <<disk, ever, blockIds, next, outside, module, moves>>

(* An editor outside the builder saves the file. *)
OutsideWrite ==
  /\ outside < MaxOutside
  /\ next <= MaxIds
  /\ OutsideDuringWrite \/ eng.pc = "idle"
  /\ disk' = disk \cup {next}
  /\ ever' = ever \cup {next}
  /\ \E inBlock \in BOOLEAN : blockIds' = IF inBlock THEN blockIds \cup {next} ELSE blockIds
  /\ next' = next + 1
  /\ outside' = outside + 1
  /\ UNCHANGED <<module, moves, eng, ed>>

Next ==
  \/ \E e \in Editors :
       Open(e) \/ Edit(e) \/ RequestSave(e) \/ RequestMove(e)
       \/ KeepMine(e) \/ ReloadPage(e) \/ RefreshAfterMove(e)
       \/ BeginSave(e) \/ BeginMove(e)
  \/ BeginModuleEdit \/ Write \/ Rollback \/ OutsideWrite

Spec == Init /\ [][Next]_vars

(* No edit the file held is gone unless a tab that wrote over it had seen it: *)
(* the promise behind the banner "This page changed outside the builder since it was opened". *)
NoSilentLoss == \A i \in ever \ disk : \E e \in Editors : i \in ed[e].acked

=============================================================================
