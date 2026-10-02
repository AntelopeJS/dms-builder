// Reconciling a page's trees against a draft, inside the caller's transaction,
// the way its queries are: a block and the tree it reads are one edit.

import type {
  AddTreeInput,
  BlockDraft,
  OpResult,
  OpWarning,
  TreeStructure,
} from "@antelopejs/interface-dms-builder";
import type { ClassDeclaration, SourceFile } from "ts-morph";
import { applyImportRef } from "./emit";
import { invalidConfig, unsupported } from "./ops";
import { pageMemberNames } from "./query-ops";
import { pageRoutePaths } from "./query-structure";
import { compileTree, treeRouteMethodText } from "./tree-emit";
import {
  buildTreeStructure,
  findTreeRoute,
  findTreeRoutes,
} from "./tree-structure";
import type { Transaction } from "./writable";

interface SyncContext {
  page: string;
  pageFile: SourceFile;
  pageClass: ClassDeclaration;
  transaction: Transaction;
  /** The blocks being written, so a tree one of them reads is never dropped. */
  blocks: BlockDraft[];
}

/** Every string a block's configuration carries, at any depth. */
function configuredStrings(blocks: BlockDraft[], found: Set<string>): void {
  const walk = (value: unknown): void => {
    if (typeof value === "string") {
      found.add(value);
    } else if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value !== null && typeof value === "object") {
      Object.values(value as Record<string, unknown>).forEach(walk);
    }
  };
  for (const block of blocks) {
    walk(block.config);
    if (block.children) {
      configuredStrings(block.children, found);
    }
  }
}

function isRead(context: SyncContext, tree: TreeStructure): boolean {
  const urls = new Set<string>();
  configuredStrings(context.blocks, urls);
  return urls.has(`${context.page}${tree.endpoint}`);
}

function existingByName(
  pageClass: ClassDeclaration,
): Map<string, TreeStructure> {
  return new Map(
    findTreeRoutes(pageClass).map((route) => {
      const structure = buildTreeStructure(route);
      return [structure.name, structure];
    }),
  );
}

function opaqueWarning(name: string, action: string): OpWarning {
  return {
    code: "tree_opaque",
    message: `tree "${name}" was edited by hand and is no longer one the builder can read; it was left as it is rather than ${action}`,
  };
}

/** Write one tree, replacing the route already answering under that name. */
function writeTree(
  context: SyncContext,
  input: AddTreeInput,
): OpResult<never> | undefined {
  const tree = compileTree(input);
  if ("ok" in tree) {
    return tree;
  }
  const pageClassName = context.pageClass.getName();
  if (!pageClassName) {
    return unsupported<never>(
      "the page class has no name, so a generated route cannot name it in its permission guard",
    );
  }
  const previous = findTreeRoute(context.pageClass, input.name)?.method;
  // The block reading the tree is a static member of the same name; the route
  // is an instance one, and the two never meet.
  if (!previous && pageMemberNames(context.pageClass).has(input.name)) {
    return invalidConfig<never>(
      `the page already has a member named "${input.name}"`,
    );
  }
  if (pageRoutePaths(context.pageClass, previous).includes(tree.endpoint)) {
    return invalidConfig<never>(
      `the page already serves a route at "${tree.endpoint}"`,
    );
  }
  context.transaction.track(context.pageFile);
  previous?.remove();
  const route = treeRouteMethodText(tree, pageClassName);
  context.pageClass.addMember(route.text);
  for (const symbol of route.symbols) {
    applyImportRef(context.pageFile, symbol);
  }
  for (const model of tree.models) {
    applyImportRef(context.pageFile, {
      name: model.record.modelName,
      targetFile: model.record.databaseFile,
    });
  }
  return undefined;
}

function removeTree(context: SyncContext, current: TreeStructure): OpWarning[] {
  if (current.opaque) {
    return [opaqueWarning(current.name, "removed")];
  }
  if (isRead(context, current)) {
    return [
      {
        code: "tree_kept",
        message: `tree "${current.name}" is not in the draft but a block on the page still reads ${context.page}${current.endpoint}, so it was kept`,
      },
    ];
  }
  context.transaction.track(context.pageFile);
  findTreeRoute(context.pageClass, current.name)?.method.remove();
  return [];
}

/**
 * Bring the page's trees in line with the draft: write the ones it carries,
 * drop the generated ones it no longer does, and leave alone any a human has
 * taken over. Nothing is committed here: the caller holds the transaction.
 */
export function syncTrees(
  context: SyncContext,
  drafts: AddTreeInput[],
): OpWarning[] | OpResult<never> {
  const names = drafts.map((draft) => draft.name);
  const duplicate = names.find((name, at) => names.indexOf(name) !== at);
  if (duplicate) {
    return invalidConfig<never>(
      `two trees in the draft are named "${duplicate}"; a page serves one route per name`,
    );
  }
  const current = existingByName(context.pageClass);
  const warnings: OpWarning[] = [];
  const kept = new Set(names);
  // Removals first: a renamed tree frees its name and endpoint for the write.
  for (const [name, structure] of current) {
    if (!kept.has(name)) {
      warnings.push(...removeTree(context, structure));
    }
  }
  for (const draft of drafts) {
    if (current.get(draft.name)?.opaque) {
      warnings.push(opaqueWarning(draft.name, "rewritten"));
      continue;
    }
    const failed = writeTree(context, draft);
    if (failed) {
      return failed;
    }
  }
  return warnings;
}
