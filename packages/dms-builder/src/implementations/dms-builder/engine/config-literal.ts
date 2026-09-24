import { Node, type PropertyAssignment, SyntaxKind } from "ts-morph";
import { blockDescriptor, buildCatalog } from "./catalog";
import { findResourceBySymbol } from "./resource-index";

export interface LiteralResult {
  value: unknown;
  fullyLiteral: boolean;
}

function opaqueExpr(node: Node): LiteralResult {
  return { value: { $expr: node.getText() }, fullyLiteral: false };
}

function isLocallyDeclared(callee: Node): boolean {
  if (!Node.isIdentifier(callee)) {
    return false;
  }
  return callee
    .getDefinitionNodes()
    .some(
      (definition) =>
        definition.getSourceFile() === callee.getSourceFile() &&
        !Node.isImportSpecifier(definition) &&
        !Node.isImportClause(definition),
    );
}

/**
 * A DataType instantiation inside a config value — a Form field's `type`. Read
 * back as a `$dataType` sentinel so the value stays editable and re-emittable
 * rather than falling through to an opaque expression.
 */
function dataTypeCall(node: Node): LiteralResult | undefined {
  if (!Node.isNewExpression(node)) {
    return undefined;
  }
  const callee = node.getExpression().getText();
  const descriptor = buildCatalog().dataTypes.find(
    (candidate) => candidate.import.name === callee,
  );
  if (!descriptor) {
    return undefined;
  }
  const args = node.getArguments();
  // The emitter writes a DataType back as `new X(config)` and nothing else, so
  // a second argument would be dropped on the next write. Falling through to
  // an opaque expression keeps it.
  if (args.length > 1) {
    return undefined;
  }
  const arg = args[0];
  if (arg && !Node.isObjectLiteralExpression(arg)) {
    return undefined;
  }
  const config = arg ? objectLiteralToValue(arg) : undefined;
  const value: Record<string, unknown> = { $dataType: descriptor.id };
  if (config && Object.keys(config.value as object).length > 0) {
    value.config = config.value;
  }
  return { value, fullyLiteral: config ? config.fullyLiteral : true };
}

/**
 * A nested factory call inside a config value — a ChartCard's `chart`. Read back
 * as a `$block` sentinel so the value stays editable rather than opaque.
 */
function blockCall(node: Node): LiteralResult | undefined {
  if (!Node.isCallExpression(node)) {
    return undefined;
  }
  const callee = node.getExpression();
  if (!Node.isIdentifier(callee) || !blockDescriptor(callee.getText())) {
    return undefined;
  }
  // A local declaration shadowing a catalog name is not that block: reading it
  // back as one would have the emitter import a factory the file never used.
  if (isLocallyDeclared(callee)) {
    return undefined;
  }
  const args = node.getArguments();
  if (args.length > 1) {
    return undefined;
  }
  const arg = args[0];
  if (arg && !Node.isObjectLiteralExpression(arg)) {
    return undefined;
  }
  const config = arg ? objectLiteralToValue(arg) : undefined;
  return {
    value: {
      $block: {
        type: callee.getText(),
        config: (config?.value as Record<string, unknown>) ?? {},
      },
    },
    fullyLiteral: config ? config.fullyLiteral : true,
  };
}

/**
 * A table's DataAPI class inside a config value — a relation field's
 * `dataApiController`. Read back as the `$ref` the builder writes it from, so
 * the table stays chosen in the panel rather than the whole block turning
 * opaque on its first save.
 */
function resourceRef(node: Node): LiteralResult | undefined {
  if (!Node.isIdentifier(node) || isLocallyDeclared(node)) {
    return undefined;
  }
  const found = findResourceBySymbol(node.getText());
  if (found?.as !== "dataApi") {
    return undefined;
  }
  return { value: { $ref: { resource: found.ref } }, fullyLiteral: true };
}

function propertyName(prop: PropertyAssignment): string {
  const nameNode = prop.getNameNode();
  if (
    Node.isStringLiteral(nameNode) ||
    Node.isNoSubstitutionTemplateLiteral(nameNode)
  ) {
    return nameNode.getLiteralValue();
  }
  return prop.getName();
}

export function literalToValue(node: Node | undefined): LiteralResult {
  if (!node) {
    return { value: undefined, fullyLiteral: true };
  }
  if (
    Node.isStringLiteral(node) ||
    Node.isNoSubstitutionTemplateLiteral(node)
  ) {
    return { value: node.getLiteralValue(), fullyLiteral: true };
  }
  if (Node.isNumericLiteral(node)) {
    return { value: node.getLiteralValue(), fullyLiteral: true };
  }
  if (Node.isPrefixUnaryExpression(node)) {
    const operand = node.getOperand();
    const token = node.getOperatorToken();
    if (
      Node.isNumericLiteral(operand) &&
      (token === SyntaxKind.MinusToken || token === SyntaxKind.PlusToken)
    ) {
      const magnitude = operand.getLiteralValue();
      return {
        value: token === SyntaxKind.MinusToken ? -magnitude : magnitude,
        fullyLiteral: true,
      };
    }
  }
  if (Node.isTrueLiteral(node)) {
    return { value: true, fullyLiteral: true };
  }
  if (Node.isFalseLiteral(node)) {
    return { value: false, fullyLiteral: true };
  }
  if (node.getKind() === SyntaxKind.NullKeyword) {
    return { value: null, fullyLiteral: true };
  }
  if (Node.isObjectLiteralExpression(node)) {
    return objectLiteralToValue(node);
  }
  if (Node.isArrayLiteralExpression(node)) {
    return arrayLiteralToValue(node);
  }
  return (
    dataTypeCall(node) ??
    blockCall(node) ??
    resourceRef(node) ??
    opaqueExpr(node)
  );
}

export function objectLiteralToValue(node: Node): LiteralResult {
  if (!Node.isObjectLiteralExpression(node)) {
    return opaqueExpr(node);
  }
  const result: Record<string, unknown> = {};
  let fullyLiteral = true;
  for (const prop of node.getProperties()) {
    if (!Node.isPropertyAssignment(prop)) {
      fullyLiteral = false;
      continue;
    }
    const child = literalToValue(prop.getInitializer());
    result[propertyName(prop)] = child.value;
    fullyLiteral = fullyLiteral && child.fullyLiteral;
  }
  return { value: result, fullyLiteral };
}

function arrayLiteralToValue(node: Node): LiteralResult {
  if (!Node.isArrayLiteralExpression(node)) {
    return opaqueExpr(node);
  }
  const items: unknown[] = [];
  let fullyLiteral = true;
  for (const element of node.getElements()) {
    const child = literalToValue(element);
    items.push(child.value);
    fullyLiteral = fullyLiteral && child.fullyLiteral;
  }
  return { value: items, fullyLiteral };
}
