import {
  type CallExpression,
  type ClassDeclaration,
  type Expression,
  Node,
  type ObjectLiteralExpression,
} from "ts-morph";
import { isControllerLeadingBlock } from "./catalog";
import { type ChainInfo, resolveAndUnwrap } from "./chain";
import { stringLiteralValue } from "./literals";

export interface BlockTarget {
  factoryCall: CallExpression;
  childCalls: CallExpression[];
  chainExpr: Expression;
  childCall?: CallExpression;
  optionsObj?: ObjectLiteralExpression;
  editable: boolean;
  /** Options object is the second argument (after a leading controller class). */
  controllerArg: boolean;
}

export type TargetResult =
  | { ok: true; target: BlockTarget }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "opaque"; detail: string };

function staticInitializer(
  cls: ClassDeclaration,
  name: string,
): Expression | undefined {
  for (const prop of cls.getStaticProperties()) {
    if (Node.isPropertyDeclaration(prop) && prop.getName() === name) {
      return prop.getInitializer();
    }
  }
  return undefined;
}

function childCallById(
  chain: ChainInfo,
  id: string,
): CallExpression | undefined {
  return chain.childCalls.find(
    (call) => stringLiteralValue(call.getArguments()[0]) === id,
  );
}

function toTarget(
  chain: ChainInfo,
  chainExpr: Expression,
  childCall?: CallExpression,
): BlockTarget {
  const factoryCall = chain.factoryCall as CallExpression;
  const controllerArg = chain.factory
    ? isControllerLeadingBlock(chain.factory)
    : false;
  const optionsArg = factoryCall.getArguments()[controllerArg ? 1 : 0];
  const optionsObj =
    optionsArg && Node.isObjectLiteralExpression(optionsArg)
      ? optionsArg
      : undefined;
  return {
    factoryCall,
    childCalls: chain.childCalls,
    chainExpr,
    childCall,
    optionsObj,
    editable: !optionsArg || optionsObj !== undefined,
    controllerArg,
  };
}

export function resolveBlockTarget(
  cls: ClassDeclaration,
  segments: string[],
): TargetResult {
  const [head, ...rest] = segments;
  const init = staticInitializer(cls, head);
  if (!init) {
    return { ok: false, reason: "not_found" };
  }
  let unwrapped = resolveAndUnwrap(init);
  if (unwrapped.opaqueReason || !unwrapped.chain || !unwrapped.rootExpr) {
    return {
      ok: false,
      reason: "opaque",
      detail: unwrapped.opaqueReason ?? "",
    };
  }
  let chain = unwrapped.chain;
  let chainExpr = unwrapped.rootExpr;
  let childCall: CallExpression | undefined;
  for (const segment of rest) {
    childCall = childCallById(chain, segment);
    const childExpr = childCall?.getArguments()[1];
    if (!childCall || !childExpr || !Node.isExpression(childExpr)) {
      return { ok: false, reason: "not_found" };
    }
    unwrapped = resolveAndUnwrap(childExpr);
    if (unwrapped.opaqueReason || !unwrapped.chain || !unwrapped.rootExpr) {
      return {
        ok: false,
        reason: "opaque",
        detail: unwrapped.opaqueReason ?? "",
      };
    }
    chain = unwrapped.chain;
    chainExpr = unwrapped.rootExpr;
  }
  return { ok: true, target: toTarget(chain, chainExpr, childCall) };
}
