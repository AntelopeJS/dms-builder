import type { FilterOp } from "@antelopejs/interface-dms-builder";
import {
  type CallExpression,
  type MethodDeclaration,
  Node,
  SyntaxKind,
} from "ts-morph";
import { stringLiteralValue } from "./literals";

/** The comparison operators a filter may use, shared by validation and read-back. */
export const FILTER_OPS = new Set<FilterOp>([
  "eq",
  "ne",
  "gt",
  "ge",
  "lt",
  "le",
]);

/**
 * A filter's value as read off the chain: a scalar baked into the body, or a
 * reference to one of the model method's parameters (a per-request value). The
 * parameter is identified by its *model-method* name — where the route sources
 * it is the route's business, resolved separately on read-back.
 */
type RawValue =
  | { kind: "literal"; value: unknown }
  | { kind: "param"; name: string };

interface RawFilter {
  field: string;
  op: FilterOp;
  value: RawValue;
}

/** A model method's body decomposed into `this.table.filter(...)*.<terminal>(...)`. */
interface RawChain {
  filters: RawFilter[];
  terminalName: string;
  terminalArgs: Node[];
}

function propName(call: CallExpression): string | undefined {
  const expr = call.getExpression();
  return Node.isPropertyAccessExpression(expr) ? expr.getName() : undefined;
}

function receiver(call: CallExpression): Node | undefined {
  const expr = call.getExpression();
  return Node.isPropertyAccessExpression(expr)
    ? expr.getExpression()
    : undefined;
}

function isThisTable(node: Node): boolean {
  return (
    Node.isPropertyAccessExpression(node) &&
    node.getName() === "table" &&
    node.getExpression().getKind() === SyntaxKind.ThisKeyword
  );
}

/** The single `return <call>;` of a method body, or `undefined` for any other shape. */
function returnedCall(method: MethodDeclaration): CallExpression | undefined {
  const body = method.getBody();
  if (!body || !Node.isBlock(body)) {
    return undefined;
  }
  const statements = body.getStatements();
  if (statements.length !== 1) {
    return undefined;
  }
  const [statement] = statements;
  if (!Node.isReturnStatement(statement)) {
    return undefined;
  }
  const expr = statement.getExpression();
  return expr && Node.isCallExpression(expr) ? expr : undefined;
}

/**
 * A filter arrow value: a literal baked in, or a bare identifier naming a model
 * parameter. Coercions (`Number`/`new Date`) live in the route, not here — the
 * one exception is a baked date, emitted `new Date("…")`, unwrapped to its
 * literal so it compares equal to the ISO string a caller passed.
 */
function readValue(node: Node, params: Set<string>): RawValue | undefined {
  if (Node.isIdentifier(node)) {
    return params.has(node.getText())
      ? { kind: "param", name: node.getText() }
      : undefined;
  }
  if (Node.isStringLiteral(node) || Node.isNumericLiteral(node)) {
    return { kind: "literal", value: node.getLiteralValue() };
  }
  if (Node.isTrueLiteral(node)) {
    return { kind: "literal", value: true };
  }
  if (Node.isFalseLiteral(node)) {
    return { kind: "literal", value: false };
  }
  if (node.getKind() === SyntaxKind.NullKeyword) {
    return { kind: "literal", value: null };
  }
  if (Node.isNewExpression(node)) {
    const callee = node.getExpression();
    const inner = node.getArguments()?.[0];
    if (Node.isIdentifier(callee) && callee.getText() === "Date" && inner) {
      if (Node.isStringLiteral(inner) || Node.isNumericLiteral(inner)) {
        return { kind: "literal", value: inner.getLiteralValue() };
      }
    }
  }
  return undefined;
}

/** One `.filter((row) => row.key("field").op(arg))` hop, or `undefined` if off-grammar. */
function readFilter(arrow: Node, params: Set<string>): RawFilter | undefined {
  if (!Node.isArrowFunction(arrow)) {
    return undefined;
  }
  const rowParams = arrow.getParameters();
  if (rowParams.length !== 1) {
    return undefined;
  }
  const rowName = rowParams[0].getName();
  const compare = arrow.getBody();
  if (!Node.isCallExpression(compare)) {
    return undefined;
  }
  const op = propName(compare);
  if (op === undefined || !FILTER_OPS.has(op as FilterOp)) {
    return undefined;
  }
  const compareArgs = compare.getArguments();
  if (compareArgs.length !== 1) {
    return undefined;
  }
  const keyCall = receiver(compare);
  if (
    !keyCall ||
    !Node.isCallExpression(keyCall) ||
    propName(keyCall) !== "key"
  ) {
    return undefined;
  }
  const keyReceiver = receiver(keyCall);
  if (
    !keyReceiver ||
    !Node.isIdentifier(keyReceiver) ||
    keyReceiver.getText() !== rowName
  ) {
    return undefined;
  }
  const field = stringLiteralValue(keyCall.getArguments()[0]);
  if (field === undefined) {
    return undefined;
  }
  const value = readValue(compareArgs[0], params);
  if (!value) {
    return undefined;
  }
  return { field, op: op as FilterOp, value };
}

/**
 * Reads a model method body as an AQL chain: `this.table`, a run of `.filter`
 * hops, and a terminal call. Returns `undefined` for anything outside that
 * grammar — the signal a template uses to reject a method it did not shape.
 */
export function readChain(method: MethodDeclaration): RawChain | undefined {
  const outer = returnedCall(method);
  if (!outer) {
    return undefined;
  }
  const terminalName = propName(outer);
  if (terminalName === undefined) {
    return undefined;
  }
  const params = new Set(method.getParameters().map((p) => p.getName()));
  const filters: RawFilter[] = [];
  let node: Node | undefined = receiver(outer);
  while (node && Node.isCallExpression(node) && propName(node) === "filter") {
    const filter = readFilter(node.getArguments()[0], params);
    if (!filter) {
      return undefined;
    }
    filters.unshift(filter);
    node = receiver(node);
  }
  if (!node || !isThisTable(node)) {
    return undefined;
  }
  return { filters, terminalName, terminalArgs: outer.getArguments() };
}

/**
 * A template's `where` params from parsed filters: each bound value becomes a
 * `$bind` referencing its model-method parameter, each baked value its literal.
 * Empty filters yield no `where` key — the same params a caller would omit.
 */
export function whereParams(filters: RawFilter[]): Record<string, unknown> {
  if (filters.length === 0) {
    return {};
  }
  return {
    where: filters.map((filter) => ({
      field: filter.field,
      op: filter.op,
      value:
        filter.value.kind === "param"
          ? { $bind: filter.value.name }
          : filter.value.value,
    })),
  };
}

/** The bound-parameter name a filter value carries, from either sentinel form. */
export function bindName(value: unknown): string | undefined {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.$bind === "string") {
      return record.$bind;
    }
    const param = record.$param;
    if (param && typeof param === "object") {
      const name = (param as Record<string, unknown>).name;
      if (typeof name === "string") {
        return name;
      }
    }
  }
  return undefined;
}

/**
 * A chain's identity as a string, independent of parameter names and sources:
 * every bound value collapses to a positional slot (assigned in `where` order),
 * every baked value to its literal. Two chains share this key iff they compute
 * the same thing, whatever their parameters are called or wherever the route
 * reads them — which is exactly when the builder may share one model method
 * between them. Accepts params carrying either the `$bind` (parsed) or `$param`
 * (input) sentinel, so a method on disk and an `AddQuery` input compare directly.
 */
export function canonicalChain(
  template: string,
  params: Record<string, unknown>,
): string {
  const slots = new Map<string, number>();
  const canonValue = (value: unknown): unknown => {
    const name = bindName(value);
    if (name === undefined) {
      return { lit: value };
    }
    let slot = slots.get(name);
    if (slot === undefined) {
      slot = slots.size;
      slots.set(name, slot);
    }
    return { slot };
  };
  const where = Array.isArray(params.where)
    ? params.where.map((filter) => {
        const record = filter as Record<string, unknown>;
        return {
          field: record.field,
          op: record.op,
          value: canonValue(record.value),
        };
      })
    : [];
  return JSON.stringify({
    template,
    op: params.op ?? null,
    field: params.field ?? null,
    where,
  });
}
