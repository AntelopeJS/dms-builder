import { type CallExpression, type Expression, Node } from "ts-morph";

export interface ChainInfo {
  factory?: string;
  factoryCall?: CallExpression;
  childCalls: CallExpression[];
}

export interface ResolvedExpr {
  expr?: Expression;
  opaqueReason?: string;
}

export function unwrapBuilderChain(expr: Expression): ChainInfo {
  const childCalls: CallExpression[] = [];
  let current: Node = expr;
  while (Node.isCallExpression(current)) {
    const callee = current.getExpression();
    if (Node.isPropertyAccessExpression(callee)) {
      if (callee.getName() === "child") {
        childCalls.unshift(current);
      }
      current = callee.getExpression();
      continue;
    }
    if (Node.isIdentifier(callee)) {
      return { factory: callee.getText(), factoryCall: current, childCalls };
    }
    break;
  }
  return { childCalls };
}

export function resolveExpr(expr: Expression): ResolvedExpr {
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
    const callee = expr.getExpression();
    if (
      Node.isParenthesizedExpression(callee) ||
      Node.isArrowFunction(callee)
    ) {
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
