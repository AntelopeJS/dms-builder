// A resource's icon: the `@TableIcon("…")` its DataController carries, which
// the DMS draws its table views with. Optional on both sides — a controller
// without one keeps the generic table icon — and absent from a DMS that
// predates it, where the builder offers none.

import type { ClassDeclaration, SourceFile } from "ts-morph";
import { TABLE_ICON_DECORATOR } from "./catalog";
import { ensureNamedImport } from "./emit";
import { stringLiteralValue } from "./literals";
import { TABLE_VIEW_MODULE } from "./resource-emit";
import { pruneUnusedImports } from "./writable";

/** The decorator registering the controller, which the icon goes under. */
const REGISTER_DECORATOR = "RegisterDataController";

/** The icon a DataController declares, when it names one as a literal. */
export function readTableIcon(apiClass: ClassDeclaration): string | undefined {
  const decorator = apiClass.getDecorator(TABLE_ICON_DECORATOR);
  return stringLiteralValue(decorator?.getArguments()[0]);
}

/**
 * Give a DataController its icon, or take it off with `null`: the decorator
 * goes, and its import with it once nothing else in the file uses it.
 */
export function writeTableIcon(
  file: SourceFile,
  apiClass: ClassDeclaration,
  icon: string | null,
): void {
  const decorator = apiClass.getDecorator(TABLE_ICON_DECORATOR);
  if (icon === null) {
    decorator?.remove();
    pruneUnusedImports(file, new Set([TABLE_ICON_DECORATOR]));
    return;
  }
  const argument = JSON.stringify(icon);
  if (decorator) {
    for (const previous of decorator.getArguments()) {
      decorator.removeArgument(previous);
    }
    decorator.addArgument(argument);
  } else {
    const registered = apiClass
      .getDecorators()
      .findIndex((entry) => entry.getName() === REGISTER_DECORATOR);
    apiClass.insertDecorator(registered + 1, {
      name: TABLE_ICON_DECORATOR,
      arguments: [argument],
    });
  }
  ensureNamedImport(file, TABLE_ICON_DECORATOR, TABLE_VIEW_MODULE);
}
