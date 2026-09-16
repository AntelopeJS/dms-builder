import type { BlockNode } from "@antelopejs/interface-dms-builder";
import {
  type CallExpression,
  type ClassDeclaration,
  type Expression,
  Node,
} from "ts-morph";
import { isControllerLeadingBlock } from "./catalog";
import { resolveExpr, unwrapBuilderChain } from "./chain";
import { objectLiteralToValue } from "./config-literal";
import { stringLiteralValue } from "./literals";
import { findResourceBySymbol } from "./resource-index";
import type { PageRecord } from "./scan";

function buildOpaque(
  path: string,
  name: string,
  reason: string,
  slot?: string,
  meta?: Record<string, unknown>,
): BlockNode {
  return {
    path,
    name,
    type: null,
    editable: false,
    opaqueReason: reason,
    slot,
    meta,
  };
}

/** The `.child()` third argument, split into its `slot` and the rest. */
export function readChildMeta(metaArg: Node | undefined): {
  slot?: string;
  meta?: Record<string, unknown>;
} {
  if (!metaArg || !Node.isObjectLiteralExpression(metaArg)) {
    return {};
  }
  const value = objectLiteralToValue(metaArg).value as Record<string, unknown>;
  const { slot, ...rest } = value;
  return {
    slot: typeof slot === "string" ? slot : undefined,
    meta: Object.keys(rest).length > 0 ? rest : undefined,
  };
}

function buildChildNode(
  childCall: CallExpression,
  parentPath: string,
  ownerClass: ClassDeclaration,
): BlockNode | undefined {
  const [idArg, valueArg, metaArg] = childCall.getArguments();
  const id = stringLiteralValue(idArg);
  if (!id || !valueArg || !Node.isExpression(valueArg)) {
    return undefined;
  }
  const childMeta = readChildMeta(metaArg);
  return buildBlockNode(
    id,
    valueArg,
    `${parentPath}/${id}`,
    ownerClass,
    childMeta,
  );
}

interface BlockNodeMeta {
  slot?: string;
  meta?: Record<string, unknown>;
}

export function buildBlockNode(
  name: string,
  expr: Expression,
  path: string,
  ownerClass: ClassDeclaration,
  nodeMeta: BlockNodeMeta = {},
): BlockNode | undefined {
  const { slot, meta } = nodeMeta;
  const resolved = resolveExpr(expr);
  if (resolved.opaqueReason || !resolved.expr) {
    return buildOpaque(
      path,
      name,
      resolved.opaqueReason ?? "unresolved",
      slot,
      meta,
    );
  }
  const chain = unwrapBuilderChain(resolved.expr);
  if (!chain.factory || !chain.factoryCall) {
    return undefined;
  }
  const children = chain.childCalls
    .map((call) => buildChildNode(call, path, ownerClass))
    .filter((child): child is BlockNode => child !== undefined);
  const controllerLeading = isControllerLeadingBlock(chain.factory);
  const args = chain.factoryCall.getArguments();
  let controller: string | undefined;
  if (controllerLeading) {
    const controllerArg = args[0];
    if (controllerArg && Node.isIdentifier(controllerArg)) {
      controller = findResourceBySymbol(controllerArg.getText())?.ref;
    }
  }
  const optionsArg = controllerLeading ? args[1] : args[0];
  const hasObjectConfig =
    !optionsArg || Node.isObjectLiteralExpression(optionsArg);
  const literal =
    optionsArg && Node.isObjectLiteralExpression(optionsArg)
      ? objectLiteralToValue(optionsArg)
      : { value: {}, fullyLiteral: true };
  const config = literal.value as Record<string, unknown>;
  // A config the builder could read but not write back — an identifier, a call
  // it does not model — is reported opaque rather than editable: a whole-tree
  // write refuses `$expr`, so offering it for edit would only fail at save.
  const editable = hasObjectConfig && literal.fullyLiteral;
  const opaqueReason = hasObjectConfig
    ? literal.fullyLiteral
      ? undefined
      : "config holds an expression the builder cannot re-emit"
    : "non-object-literal config";
  return {
    path,
    name,
    type: chain.factory,
    editable,
    slot,
    meta,
    opaqueReason,
    config: editable ? config : undefined,
    controller,
    children: children.length > 0 ? children : undefined,
  };
}

export function buildPageBlocks(page: PageRecord): BlockNode[] {
  const blocks: BlockNode[] = [];
  for (const prop of page.classNode.getStaticProperties()) {
    if (!Node.isPropertyDeclaration(prop)) {
      continue;
    }
    const name = prop.getName();
    if (name.startsWith("_")) {
      continue;
    }
    const init = prop.getInitializer();
    if (!init) {
      continue;
    }
    const node = buildBlockNode(
      name,
      init,
      `${page.ref}#${name}`,
      page.classNode,
    );
    if (node) {
      blocks.push(node);
    }
  }
  return blocks;
}
