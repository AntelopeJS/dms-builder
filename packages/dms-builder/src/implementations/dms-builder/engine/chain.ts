import { type CallExpression, type Expression, Node } from "ts-morph";
import { buildCatalog } from "./catalog";
import { importedName, unwrapExpression } from "./expression";

export interface ChainInfo {
  factory?: string;
  factoryCall?: CallExpression;
  childCalls: CallExpression[];
  opaqueReason?: string;
}

export interface ResolvedExpr {
  expr?: Expression;
  opaqueReason?: string;
}

export function unwrapBuilderChain(expr: Expression): ChainInfo {
  const childCalls: CallExpression[] = [];
  let opaqueReason: string | undefined;
  let current: Node = unwrapExpression(expr);
  while (Node.isCallExpression(current)) {
    const callee = unwrapExpression(current.getExpression());
    const factory = importedName(
      callee,
      buildCatalog().blocks.map((block) => block.import),
    );
    if (factory)
      return { factory, factoryCall: current, childCalls, opaqueReason };
    if (Node.isPropertyAccessExpression(callee)) {
      if (callee.getName() === "child") {
        childCalls.unshift(current);
      } else {
        opaqueReason = "Additional builder methods require editing in code";
      }
      current = unwrapExpression(callee.getExpression());
      continue;
    }
    break;
  }
  return { childCalls };
}

export function resolveExpr(expr: Expression): ResolvedExpr {
  const unwrapped = unwrapExpression(expr);
  if (Node.isExpression(unwrapped)) expr = unwrapped;
  if (Node.isIdentifier(expr)) {
    const def = expr.getDefinitionNodes()[0];
    if (!def) {
      return { opaqueReason: "unresolved reference" };
    }
    if (Node.isPropertyDeclaration(def) && def.isStatic()) {
      return { opaqueReason: "sibling-static reference (double-registers)" };
    }
    if (Node.isVariableDeclaration(def)) {
      const init = def.getInitializer();
      return init ? { expr: init } : { opaqueReason: "unresolved reference" };
    }
    return { opaqueReason: "unresolved reference" };
  }
  if (Node.isCallExpression(expr) || Node.isNewExpression(expr)) {
    const callee = unwrapExpression(expr.getExpression());
    if (Node.isFunctionExpression(callee) || Node.isArrowFunction(callee)) {
      return { opaqueReason: "computed (IIFE) block" };
    }
  }
  return { expr };
}

export interface UnwrapResult {
  chain?: ChainInfo;
  rootExpr?: Expression;
  opaqueReason?: string;
}

export function resolveAndUnwrap(expr: Expression): UnwrapResult {
  const resolved = resolveExpr(expr);
  if (resolved.opaqueReason || !resolved.expr) {
    return { opaqueReason: resolved.opaqueReason ?? "unresolved reference" };
  }
  const chain = unwrapBuilderChain(resolved.expr);
  if (!chain.factory || !chain.factoryCall) {
    return { opaqueReason: "not a block" };
  }
  return { chain, rootExpr: resolved.expr };
}
