import {
  Node,
  type PropertyAccessExpression,
  SyntaxKind,
  VariableDeclarationKind,
} from "ts-morph";

/** Type-only syntax never changes the runtime value. */
export function unwrapExpression(node: Node): Node {
  while (
    Node.isParenthesizedExpression(node) ||
    Node.isSatisfiesExpression(node) ||
    (Node.isAsExpression(node) && node.getTypeNode()?.getText() === "const")
  ) {
    node = node.getExpression();
  }
  return node;
}

/** Resolve bindings, not their spelling: a local KpiCard is not a DMS import. */
export function importedName(
  node: Node,
  imports: { name: string; module?: string }[],
  seen = new Set<Node>(),
): string | undefined {
  node = unwrapExpression(node);
  if (seen.has(node)) return undefined;
  seen.add(node);
  const declarations = node.getSymbol()?.getDeclarations() ?? [];
  for (const declaration of declarations) {
    if (Node.isImportSpecifier(declaration)) {
      const module = declaration
        .getImportDeclaration()
        .getModuleSpecifierValue();
      const name = declaration.getName();
      if (
        imports.some((entry) => entry.module === module && entry.name === name)
      )
        return name;
    }
    if (
      Node.isVariableDeclaration(declaration) &&
      declaration.getVariableStatement()?.getDeclarationKind() ===
        VariableDeclarationKind.Const
    ) {
      const initializer = declaration.getInitializer();
      if (initializer) return importedName(initializer, imports, seen);
    }
  }
  return Node.isPropertyAccessExpression(node)
    ? propertyImport(node, imports, seen)
    : undefined;
}

function propertyImport(
  node: PropertyAccessExpression,
  imports: { name: string; module?: string }[],
  seen: Set<Node>,
): string | undefined {
  for (const entry of imports) {
    const dot = entry.name.lastIndexOf(".");
    if (
      dot !== -1 &&
      entry.name.slice(dot + 1) === node.getName() &&
      importedName(
        node.getExpression(),
        [{ ...entry, name: entry.name.slice(0, dot) }],
        new Set(seen),
      )
    )
      return entry.name;
  }
  const namespace = node.getExpression().getSymbol()?.getDeclarations()[0];
  if (namespace && Node.isNamespaceImport(namespace)) {
    const module = namespace
      .getFirstAncestorByKind(SyntaxKind.ImportDeclaration)
      ?.getModuleSpecifierValue();
    return imports.find(
      (entry) => entry.module === module && entry.name === node.getName(),
    )?.name;
  }
  return undefined;
}
