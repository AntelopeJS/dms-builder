import type {
  ThemeMode,
  ThemeVariableSets,
  ThemeVariables,
  ValidationIssue,
} from "@antelopejs/interface-dms-builder";

export const THEME_MODES: ThemeMode[] = ["light", "dark"];

/** The sets of a theme's variables: the shared one, then one per mode. */
export type VariableSet = keyof ThemeVariableSets;

const VARIABLE_SETS: VariableSet[] = ["shared", ...THEME_MODES];

/**
 * The selector each set is written under, in the order the file holds them.
 *
 * The DMS declares its defaults in its `dms` cascade layer, and unlayered, the
 * project's declarations win over those whatever the stylesheet order. Light
 * is not plain `:root`: an unlayered `:root` still matches a page in dark mode
 * and wins over the DMS's layered `.dark`, so a value set for light alone
 * would show in dark too. Plain `:root` is what both modes share, and a mode's
 * own rule beats it: the light one is more specific, the dark one comes later.
 */
const SET_SELECTORS: Record<VariableSet, string> = {
  shared: ":root",
  light: ":root:not(.dark)",
  dark: ".dark",
};

const SELECTOR_SETS = new Map(
  VARIABLE_SETS.map((set) => [SET_SELECTORS[set], set]),
);

const VARIABLE_NAME = /^--[A-Za-z0-9_-]+$/;
const DECLARATION = /^(--[A-Za-z0-9_-]+)\s*:\s*([\s\S]+)$/;
const RULE = /^\s*([^{}]+?)\s*\{([^{}]*)\}/;

/**
 * What a value may not hold: anything that ends a declaration or a rule, a
 * comment, an escape, markup, or a resource fetched from elsewhere. A theme
 * value is a color, a length, a font stack or a shadow, none of which needs
 * any of these.
 */
const UNSAFE_VALUE = /[;{}<>\\]|\/\*|\*\/|url\(|@import|!important/i;
const MAX_VALUE_LENGTH = 512;
const INDENT = "  ";

/** A stylesheet the builder reads back, or why it will not rewrite it. */
export interface ParsedStylesheet {
  variables?: ThemeVariableSets;
  opaque?: string;
}

export function emptyVariables(): ThemeVariableSets {
  return { shared: {}, light: {}, dark: {} };
}

function valueProblem(value: string): string | undefined {
  if (value.trim() === "") {
    return "is empty";
  }
  if (value.length > MAX_VALUE_LENGTH) {
    return `is longer than ${MAX_VALUE_LENGTH} characters`;
  }
  return UNSAFE_VALUE.test(value)
    ? "holds a character or a construct a theme value cannot carry"
    : undefined;
}

function parseDeclarations(body: string): ThemeVariables | undefined {
  const variables: ThemeVariables = {};
  const declarations = body
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  for (const declaration of declarations) {
    const match = DECLARATION.exec(declaration);
    const value = match?.[2]?.trim();
    if (!match?.[1] || value === undefined || valueProblem(value)) {
      return undefined;
    }
    variables[match[1]] = value;
  }
  return variables;
}

/**
 * Read the overrides back from the stylesheet the builder writes.
 *
 * The file is the builder's: rules of custom properties under its three
 * selectors and nothing else. Anything more — another selector, a comment, an
 * at-rule — is someone's hand work the builder cannot keep while rewriting the
 * file whole, so the file is reported as opaque rather than silently
 * flattened. Two rules under one selector read as one, the later winning.
 */
export function parseStylesheet(text: string): ParsedStylesheet {
  const variables = emptyVariables();
  let rest = text;
  while (rest.trim() !== "") {
    const rule = RULE.exec(rest);
    const set = rule?.[1] ? SELECTOR_SETS.get(rule[1].trim()) : undefined;
    if (!rule || !set) {
      return {
        opaque: `it holds rules other than ${[...SELECTOR_SETS.keys()].join(", ")}`,
      };
    }
    const declarations = parseDeclarations(rule[2] ?? "");
    if (!declarations) {
      return {
        opaque: `its ${rule[1]} rule holds more than custom properties`,
      };
    }
    Object.assign(variables[set], declarations);
    rest = rest.slice(rule[0].length);
  }
  return { variables };
}

function emitRule(selector: string, variables: ThemeVariables): string {
  const names = Object.keys(variables).sort();
  if (names.length === 0) {
    return "";
  }
  const lines = names.map((name) => `${INDENT}${name}: ${variables[name]};`);
  return `${selector} {\n${lines.join("\n")}\n}`;
}

/** The stylesheet for a theme, one rule per set, its declarations sorted. */
export function emitStylesheet(variables: ThemeVariableSets): string {
  const rules = VARIABLE_SETS.map((set) =>
    emitRule(SET_SELECTORS[set], variables[set] ?? {}),
  ).filter((rule) => rule !== "");
  return rules.length === 0 ? "" : `${rules.join("\n\n")}\n`;
}

function variableIssues(
  set: VariableSet,
  variables: ThemeVariables,
): ValidationIssue[] {
  return Object.entries(variables).flatMap(([name, value]) => {
    const pointer = `/variables/${set}/${name}`;
    if (!VARIABLE_NAME.test(name)) {
      return [
        { pointer, message: `${name} is not a CSS custom property name` },
      ];
    }
    const problem = valueProblem(value);
    return problem ? [{ pointer, message: `${name} ${problem}` }] : [];
  });
}

/** Every variable of a draft the stylesheet could not carry as it stands. */
export function validateVariables(
  variables: ThemeVariableSets,
): ValidationIssue[] {
  return VARIABLE_SETS.flatMap((set) =>
    variableIssues(set, variables[set] ?? {}),
  );
}
