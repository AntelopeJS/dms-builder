import {
  Node,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  type SourceFile,
  SyntaxKind,
} from "ts-morph";

function objectOf(node: Node | undefined): ObjectLiteralExpression | undefined {
  if (Node.isObjectLiteralExpression(node)) {
    return node;
  }
  if (Node.isCallExpression(node)) {
    return objectOf(node.getArguments()[0]);
  }
  if (
    Node.isAsExpression(node) ||
    Node.isSatisfiesExpression(node) ||
    Node.isParenthesizedExpression(node)
  ) {
    return objectOf(node.getExpression());
  }
  if (Node.isIdentifier(node)) {
    const declaration = node
      .getSourceFile()
      .getVariableDeclaration(node.getText());
    return objectOf(declaration?.getInitializer());
  }
  return undefined;
}

/**
 * The object a file default-exports, however it is spelled: a literal, a call
 * wrapping one (`defineAppConfig({…})`), a cast, or a local const holding
 * any of these.
 */
export function defaultExportObject(
  sourceFile: SourceFile,
): ObjectLiteralExpression | undefined {
  const assignment = sourceFile.getExportAssignment(
    (node) => !node.isExportEquals(),
  );
  return objectOf(assignment?.getExpression());
}

function propertyName(property: PropertyAssignment): string {
  const name = property.getNameNode();
  return Node.isStringLiteral(name) ? name.getLiteralValue() : name.getText();
}

/** A `key: value` property of an object literal, quoted or not. */
export function findProperty(
  parent: ObjectLiteralExpression,
  key: string,
): PropertyAssignment | undefined {
  return parent
    .getProperties()
    .find(
      (property): property is PropertyAssignment =>
        Node.isPropertyAssignment(property) && propertyName(property) === key,
    );
}

/** The object literal a property holds, if it holds one. */
export function objectProperty(
  parent: ObjectLiteralExpression,
  key: string,
): ObjectLiteralExpression | undefined {
  const initializer = findProperty(parent, key)?.getInitializer();
  return Node.isObjectLiteralExpression(initializer) ? initializer : undefined;
}

/** The string a property holds as a literal; anything computed reads as none. */
export function stringProperty(
  parent: ObjectLiteralExpression,
  key: string,
): string | undefined {
  const initializer = findProperty(parent, key)?.getInitializer();
  return Node.isStringLiteral(initializer) ||
    Node.isNoSubstitutionTemplateLiteral(initializer)
    ? initializer.getLiteralValue()
    : undefined;
}

/** The object a property holds, created when the property is absent or holds something else. */
export function ensureObjectProperty(
  parent: ObjectLiteralExpression,
  key: string,
): ObjectLiteralExpression {
  const existing = objectProperty(parent, key);
  if (existing) {
    return existing;
  }
  findProperty(parent, key)?.remove();
  return parent
    .addPropertyAssignment({ name: key, initializer: "{}" })
    .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
}

/**
 * Set a property to a string literal. An unchanged value is left as it was
 * written, so a save never re-quotes a line it did not change.
 */
export function setStringProperty(
  parent: ObjectLiteralExpression,
  key: string,
  value: string,
): void {
  if (stringProperty(parent, key) === value) {
    return;
  }
  const initializer = JSON.stringify(value);
  const existing = findProperty(parent, key);
  if (existing) {
    existing.setInitializer(initializer);
    return;
  }
  parent.addPropertyAssignment({ name: key, initializer });
}

/** Drop a property whose object literal a removal has left empty. */
export function removeIfEmpty(
  parent: ObjectLiteralExpression,
  key: string,
): void {
  if (objectProperty(parent, key)?.getProperties().length === 0) {
    findProperty(parent, key)?.remove();
  }
}
