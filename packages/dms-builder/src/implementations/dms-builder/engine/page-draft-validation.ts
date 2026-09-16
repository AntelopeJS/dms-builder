import type {
  BlockDraft,
  BlockTypeDescriptor,
  FieldAspect,
  OptionSchema,
  PageDraft,
  ValidationIssue,
} from "@antelopejs/interface-dms-builder";
import { blockDescriptor } from "./catalog";
import { isIdentifier } from "./paths";
import {
  buildResourceStructure,
  RESERVED_FIELD_NAMES,
} from "./resource-structure";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Walk a config value alongside the schema that describes it. */
function walkOptions(
  schema: OptionSchema,
  value: unknown,
  pointer: string,
  visit: (schema: OptionSchema, value: unknown, pointer: string) => void,
): void {
  visit(schema, value, pointer);
  if (schema.properties && isPlainObject(value)) {
    for (const [key, nested] of Object.entries(schema.properties)) {
      if (key in value) {
        walkOptions(nested, value[key], `${pointer}/${key}`, visit);
      }
    }
  }
  if (schema.items && Array.isArray(value)) {
    value.forEach((entry, index) => {
      walkOptions(
        schema.items as OptionSchema,
        entry,
        `${pointer}/${index}`,
        visit,
      );
    });
  }
  if (schema.values && isPlainObject(value)) {
    for (const [key, entry] of Object.entries(value)) {
      walkOptions(schema.values, entry, `${pointer}/${key}`, visit);
    }
  }
}

function checkFieldAspects(
  block: BlockDraft,
  descriptor: BlockTypeDescriptor,
  pointer: string,
): ValidationIssue[] {
  if (!block.controller) {
    return [];
  }
  const structure = buildResourceStructure(block.controller);
  if (!structure.ok) {
    return [];
  }
  const fields = structure.data.fields;
  const issues: ValidationIssue[] = [];
  const config = block.config ?? {};
  for (const [key, schema] of Object.entries(descriptor.config)) {
    if (!(key in config)) {
      continue;
    }
    walkOptions(
      schema,
      config[key],
      `${pointer}/config/${key}`,
      (node, value, at) => {
        const declared = node.ui?.fieldAspect;
        if (!declared || typeof value !== "string") {
          return;
        }
        const aspects: FieldAspect[] = Array.isArray(declared)
          ? declared
          : [declared];
        if (RESERVED_FIELD_NAMES.has(value)) {
          return;
        }
        const field = fields.find((entry) => entry.name === value);
        if (!field) {
          issues.push(
            issue(
              at,
              `unknown field "${value}" on resource "${block.controller}"`,
            ),
          );
          return;
        }
        if (field.opaque) {
          return;
        }
        for (const aspect of aspects) {
          if (field[aspect] !== true) {
            issues.push(
              issue(
                at,
                `field "${value}" is not ${aspect}; the block would ignore this option`,
              ),
            );
          }
        }
      },
    );
  }
  return issues;
}

function issue(pointer: string, message: string): ValidationIssue {
  return { pointer, message };
}

/** Refuses `$expr` anywhere in a draft: a whole-tree write stays structured. */
function scanForExpr(value: unknown, pointer: string): ValidationIssue[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      scanForExpr(item, `${pointer}/${index}`),
    );
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  const record = value as Record<string, unknown>;
  if (typeof record.$expr === "string") {
    return [issue(pointer, "$expr is not allowed in a page draft")];
  }
  return Object.entries(record).flatMap(([key, entry]) =>
    scanForExpr(entry, `${pointer}/${key}`),
  );
}

function validateBlock(
  block: BlockDraft,
  pointer: string,
  originals: Map<string, string>,
  path: string,
): ValidationIssue[] {
  const name = block.name;
  if (!isIdentifier(name)) {
    return [
      issue(`${pointer}/name`, `"${String(name)}" is not a valid identifier`),
    ];
  }
  if (block.preserve) {
    if (!originals.has(path)) {
      return [issue(pointer, `no block named "${name}" to preserve`)];
    }
    return block.children?.length
      ? [
          issue(
            `${pointer}/children`,
            "a preserved block is written back as it stands and takes no child",
          ),
        ]
      : [];
  }
  const descriptor = block.type ? blockDescriptor(block.type) : undefined;
  if (!descriptor) {
    return [issue(`${pointer}/type`, `unknown block type "${block.type}"`)];
  }
  return [
    ...validateController(block, descriptor.controllerArg === true, pointer),
    ...validateChildren(block, descriptor.container, pointer, originals, path),
    ...scanForExpr(block.config, `${pointer}/config`),
    ...scanForExpr(block.meta, `${pointer}/meta`),
    ...checkFieldAspects(block, descriptor, pointer),
  ];
}

function validateController(
  block: BlockDraft,
  controllerArg: boolean,
  pointer: string,
): ValidationIssue[] {
  if (controllerArg && !block.controller) {
    return [
      issue(
        `${pointer}/controller`,
        `block type "${block.type}" requires a controller`,
      ),
    ];
  }
  if (!controllerArg && block.controller) {
    return [
      issue(
        `${pointer}/controller`,
        `block type "${block.type}" does not take a controller`,
      ),
    ];
  }
  return [];
}

function validateChildren(
  block: BlockDraft,
  container: boolean,
  pointer: string,
  originals: Map<string, string>,
  path: string,
): ValidationIssue[] {
  const children = block.children ?? [];
  if (children.length === 0) {
    return [];
  }
  if (!container) {
    return [
      issue(`${pointer}/children`, `block type "${block.type}" takes no child`),
    ];
  }
  const allowed = blockDescriptor(block.type ?? "")?.allowedChildren;
  const issues = children.flatMap((child, index) => {
    const childPointer = `${pointer}/children/${index}`;
    const rejected =
      allowed && child.type && !allowed.includes(child.type)
        ? [
            issue(
              `${childPointer}/type`,
              `block type "${block.type}" only accepts ${allowed.join(", ")} as children`,
            ),
          ]
        : [];
    return [
      ...rejected,
      ...validateBlock(child, childPointer, originals, `${path}/${child.name}`),
    ];
  });
  return [...issues, ...duplicateNames(children, pointer)];
}

function duplicateNames(
  blocks: BlockDraft[],
  pointer: string,
): ValidationIssue[] {
  const seen = new Set<string>();
  const issues: ValidationIssue[] = [];
  for (const [index, block] of blocks.entries()) {
    if (seen.has(block.name)) {
      issues.push(
        issue(`${pointer}/${index}/name`, `duplicate name "${block.name}"`),
      );
    }
    seen.add(block.name);
  }
  return issues;
}

export function validateDraft(
  draft: PageDraft,
  originals: Map<string, string>,
): ValidationIssue[] {
  return [
    ...draft.blocks.flatMap((block, index) =>
      validateBlock(block, `/blocks/${index}`, originals, block.name),
    ),
    ...duplicateNames(draft.blocks, "/blocks"),
  ];
}
