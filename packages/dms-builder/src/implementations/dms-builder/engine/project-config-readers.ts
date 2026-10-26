import type { ImportOverrideInput } from "@antelopejs/interface-dms-builder";
import { Node, type ObjectLiteralExpression } from "ts-morph";
import { CATALOG_INTERFACE, DATABASE_INTERFACE } from "./interface-ids";
import { propertyKey } from "./modules";
import {
  type ConfigDraft,
  IMPORT_OVERRIDES,
  MODULES,
  objectAt,
  overrideOf,
  propertyNamed,
  stringOf,
} from "./project-config";

/** Whether an object literal may hold `key` where the builder cannot read it: in a spread, or as a shorthand. */
export function hides(owner: ObjectLiteralExpression, key: string): boolean {
  return owner
    .getProperties()
    .some(
      (property) =>
        Node.isSpreadAssignment(property) ||
        (Node.isShorthandPropertyAssignment(property) &&
          property.getName() === key),
    );
}

function literalOverride(element: Node): boolean {
  return (
    Node.isObjectLiteralExpression(element) &&
    element
      .getProperties()
      .every(
        (property) =>
          Node.isPropertyAssignment(property) &&
          stringOf(property.getInitializer()) !== undefined,
      )
  );
}

/**
 * Whether `importOverrides` is written with literals only, so rewriting it from what the builder
 * reads keeps all of it: absent, or an array or object of string values.
 */
export function overridesWrittenAsLiterals(
  overrides: Node | undefined,
): boolean {
  if (overrides === undefined) {
    return true;
  }
  if (Node.isArrayLiteralExpression(overrides)) {
    return overrides.getElements().every(literalOverride);
  }
  return literalOverride(overrides);
}

/** Every module of the configuration, by id, with its entry as written, whatever its form. */
export function writtenModules(
  draft: ConfigDraft,
): [string, Node | undefined][] {
  return (objectAt(draft, [MODULES])?.getProperties() ?? []).flatMap(
    (property): [string, Node | undefined][] => {
      if (Node.isPropertyAssignment(property)) {
        return [
          [propertyKey(property.getNameNode()), property.getInitializer()],
        ];
      }
      return Node.isShorthandPropertyAssignment(property)
        ? [[property.getName(), property.getNameNode()]]
        : [];
    },
  );
}

/**
 * The interfaces through which a module the builder removes, a database driver or a tables
 * module, can be a source: an override of another interface whose source is not a literal is not
 * one of its readers.
 */
const REMOVABLE_SOURCE_INTERFACES = new Set([
  DATABASE_INTERFACE,
  CATALOG_INTERFACE,
]);

function unreadSourceMayName(interfaceId: string | undefined): boolean {
  return (
    interfaceId === undefined || REMOVABLE_SOURCE_INTERFACES.has(interfaceId)
  );
}

function overridesMayName(
  overrides: Node,
  source: string,
  ignored: (override: ImportOverrideInput) => boolean,
): boolean {
  if (Node.isObjectLiteralExpression(overrides)) {
    return overrides.getProperties().some((property) => {
      if (!Node.isPropertyAssignment(property)) {
        return true;
      }
      const named = stringOf(property.getInitializer());
      return named === undefined
        ? unreadSourceMayName(propertyKey(property.getNameNode()))
        : named === source;
    });
  }
  if (!Node.isArrayLiteralExpression(overrides)) {
    return true;
  }
  return overrides.getElements().some((element) => {
    if (
      !Node.isObjectLiteralExpression(element) ||
      !element.getProperties().every(Node.isPropertyAssignment)
    ) {
      return true;
    }
    const override = overrideOf(element);
    const written = propertyNamed(element, "source") !== undefined;
    if (written && override.source === undefined) {
      return unreadSourceMayName(override.interface || undefined);
    }
    return override.source === source && !ignored(override);
  });
}

/**
 * Whether a module entry names `source` in its `importOverrides`, or may: an entry or an override
 * written other than as a plain literal counts, since the builder cannot tell what it names. A
 * module written as a version names none. `ignored` leaves out overrides that do not count.
 */
export function mayNameSource(
  entry: Node | undefined,
  source: string,
  ignored: (override: ImportOverrideInput) => boolean = () => false,
): boolean {
  if (entry === undefined || stringOf(entry) !== undefined) {
    return false;
  }
  if (
    !Node.isObjectLiteralExpression(entry) ||
    hides(entry, IMPORT_OVERRIDES)
  ) {
    return true;
  }
  const overrides = propertyNamed(entry, IMPORT_OVERRIDES)?.getInitializer();
  return (
    overrides !== undefined && overridesMayName(overrides, source, ignored)
  );
}
