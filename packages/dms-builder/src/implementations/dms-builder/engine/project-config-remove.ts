import type {
  RemoveConnectionStep,
  RemoveModuleStep,
} from "@antelopejs/interface-dms-builder";
import { Node, type ObjectLiteralExpression } from "ts-morph";
import { propertyKey } from "./modules";
import {
  type ConfigDraft,
  ENV_OVERRIDES,
  existingOverrides,
  IMPORT_OVERRIDES,
  MODULES,
  objectAt,
  overridesValue,
  propertyNamed,
  refuse,
  replace,
  setProperty,
  stringOf,
} from "./project-config";

const LINE_REST = /^[ \t]*/;
const TRAILING_COMMA = /^[ \t]*,/;
const LEADING_COMMA = /,[ \t]*$/;

function lineBounds(text: string, start: number, end: number) {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const newline = text.indexOf("\n", end);
  const lineEnd = newline === -1 ? text.length : newline;
  return { lineStart, lineEnd };
}

/** Removes `key` from the object at `path`: its whole line when it has one to itself. */
export function removeProperty(
  draft: ConfigDraft,
  path: string[],
  key: string,
): void {
  const owner =
    objectAt(draft, path) ?? refuse(`could not find ${path.join(".")}`);
  const property =
    propertyNamed(owner, key) ??
    refuse(`could not find ${[...path, key].join(".")}`);
  const text = draft.file.getFullText();
  let start = property.getStart();
  let end = property.getEnd();
  const comma = TRAILING_COMMA.exec(text.slice(end));
  end += comma ? comma[0].length : 0;
  const { lineStart, lineEnd } = lineBounds(text, start, end);
  const alone =
    text.slice(lineStart, start).trim() === "" &&
    text.slice(end, lineEnd).trim() === "";
  if (alone) {
    start = lineStart;
    end = Math.min(lineEnd + 1, text.length);
  } else if (comma) {
    end += LINE_REST.exec(text.slice(end))?.[0].length ?? 0;
  } else {
    start -= LEADING_COMMA.exec(text.slice(lineStart, start))?.[0].length ?? 0;
  }
  replace(draft, start, end, "");
}

function moduleEntries(
  draft: ConfigDraft,
): [string, ObjectLiteralExpression][] {
  const entries: [string, ObjectLiteralExpression][] = [];
  const modules = objectAt(draft, [MODULES]);
  for (const property of modules?.getProperties() ?? []) {
    if (!Node.isPropertyAssignment(property)) {
      continue;
    }
    const id = propertyKey(property.getNameNode());
    const entry = objectAt(draft, [MODULES, id]);
    if (entry) {
      entries.push([id, entry]);
    }
  }
  return entries;
}

function overridesOf(entry: ObjectLiteralExpression) {
  return existingOverrides(
    propertyNamed(entry, IMPORT_OVERRIDES)?.getInitializer(),
  );
}

function variablesSupplying(draft: ConfigDraft, id: string): string[] {
  const overrides = objectAt(draft, [ENV_OVERRIDES]);
  const prefix = `${MODULES}.${id}.`;
  return (overrides?.getProperties() ?? [])
    .filter(Node.isPropertyAssignment)
    .filter((property) =>
      stringOf(property.getInitializer())?.startsWith(prefix),
    )
    .map((property) => propertyKey(property.getNameNode()));
}

export function removeModule(draft: ConfigDraft, step: RemoveModuleStep): void {
  if (!objectAt(draft, [MODULES, step.id])) {
    refuse(`the project has no module "${step.id}"`);
  }
  const users = moduleEntries(draft)
    .filter(([id]) => id !== step.id)
    .filter(([, entry]) =>
      overridesOf(entry).some((override) => override.source === step.id),
    )
    .map(([id]) => `"${id}"`);
  if (users.length > 0) {
    refuse(
      `module "${step.id}" is still a source in the importOverrides of ${users.join(", ")}`,
    );
  }
  for (const variable of variablesSupplying(draft, step.id)) {
    removeProperty(draft, [ENV_OVERRIDES], variable);
  }
  removeProperty(draft, [MODULES], step.id);
}

export function removeConnection(
  draft: ConfigDraft,
  step: RemoveConnectionStep,
): void {
  const matches = (override: { interface: string; id?: string }) =>
    override.interface === step.interface && override.id === step.id;
  const holders = moduleEntries(draft)
    .filter(([, entry]) => overridesOf(entry).some(matches))
    .map(([id]) => id);
  if (holders.length === 0) {
    refuse(`no module has a connection "${step.id}" to ${step.interface}`);
  }
  for (const id of holders) {
    const entry =
      objectAt(draft, [MODULES, id]) ?? refuse(`could not find ${id}`);
    const kept = overridesOf(entry).filter((override) => !matches(override));
    if (kept.length === 0) {
      removeProperty(draft, [MODULES, id], IMPORT_OVERRIDES);
    } else {
      setProperty(draft, [MODULES, id], IMPORT_OVERRIDES, overridesValue(kept));
    }
  }
}
