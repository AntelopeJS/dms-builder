import { HISTORY_LIMIT, UNDO_GROUP_MS } from './constants'

/**
 * Undo/redo stacks: `history` holds past states, newest last; `future` holds
 * undone states, next first. The page draft and the theme keep separate
 * stacks, so ⌘Z undoes what is on screen.
 */
export interface UndoStacks<T> {
	history: T[]
	future: T[]
}

/** What the last edit was about, and when: edits about one thing in quick succession are one step. */
export interface LastEdit {
	group: string | null
	at: number
}

/** No edit before: the next one is a step of its own, whatever it is about. */
export const NO_EDIT: LastEdit = Object.freeze({ group: null, at: 0 })

/** Make `before` the newest step back; an edit made from it drops the steps forward. */
export function pushStep<T>(stacks: UndoStacks<T>, before: T): void {
	stacks.history = [...stacks.history, before].slice(-HISTORY_LIMIT)
	stacks.future = []
}

/**
 * Pushes `before()` as an undo step unless the edit continues the previous one
 * (same `group` within UNDO_GROUP_MS), so typing a color is one step to undo.
 * `before` is only called when a step is pushed. Returns the edit to compare
 * the next one with.
 */
export function recordEdit<T>(
	stacks: UndoStacks<T>,
	before: () => T,
	group: string | null,
	last: LastEdit,
	now = Date.now(),
): LastEdit {
	if (group !== null && group === last.group && now - last.at < UNDO_GROUP_MS) {
		stacks.future = []
	} else {
		pushStep(stacks, before())
	}
	return { group, at: now }
}

/** Step back from `current`, which becomes the nearest step forward; returns the state to show, or undefined. */
export function stepBack<T>(stacks: UndoStacks<T>, current: T): T | undefined {
	const previous = stacks.history.at(-1)
	if (previous !== undefined) {
		stacks.history = stacks.history.slice(0, -1)
		stacks.future = [current, ...stacks.future]
	}
	return previous
}

/** Step forward from `current`, which becomes the newest step back; returns the state to show, or undefined. */
export function stepForward<T>(stacks: UndoStacks<T>, current: T): T | undefined {
	const next = stacks.future[0]
	if (next !== undefined) {
		stacks.future = stacks.future.slice(1)
		stacks.history = [...stacks.history, current]
	}
	return next
}
