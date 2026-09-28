import type {
  ThemeMode,
  ThemeVariableSets,
  ThemeVariables,
  ValidationIssue,
} from "@antelopejs/interface-dms-builder";

export const THEME_MODES: ThemeMode[] = ["light", "dark"];

/**
 * The selector each mode's overrides are declared under: the ones the DMS
 * declares its own defaults under, in its `dms` cascade layer. Unlayered, the
 * project's declarations win over those whatever the stylesheet order.
 */
const MODE_SELECTORS: Record<ThemeMode, string> = {
  light: ":root",
  dark: ".dark",
};

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

function emptyVariableSets(): ThemeVariableSets {
  return { light: {}, dark: {} };
}

function modeOfSelector(selector: string): ThemeMode | undefined {
  return THEME_MODES.find((mode) => MODE_SELECTORS[mode] === selector.trim());
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
 * The file is the builder's: two rules of custom properties and nothing else.
 * Anything more — another selector, a comment, an at-rule — is someone's hand
 * work the builder cannot keep while rewriting the file whole, so the file is
 * reported as opaque rather than silently flattened.
 */
export function parseStylesheet(text: string): ParsedStylesheet {
  const variables = emptyVariableSets();
  let rest = text;
  while (rest.trim() !== "") {
    const rule = RULE.exec(rest);
    const mode = rule?.[1] ? modeOfSelector(rule[1]) : undefined;
    if (!rule || !mode) {
      return { opaque: "it holds rules other than :root and .dark" };
    }
    const declarations = parseDeclarations(rule[2] ?? "");
    if (!declarations) {
      return {
        opaque: `its ${rule[1]} rule holds more than custom properties`,
      };
    }
    Object.assign(variables[mode], declarations);
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

/** The stylesheet for a theme, one rule per mode, its declarations sorted. */
export function emitStylesheet(variables: ThemeVariableSets): string {
  const rules = THEME_MODES.map((mode) =>
    emitRule(MODE_SELECTORS[mode], variables[mode]),
  ).filter((rule) => rule !== "");
  return rules.length === 0 ? "" : `${rules.join("\n\n")}\n`;
}

function variableIssues(
  mode: ThemeMode,
  variables: ThemeVariables,
): ValidationIssue[] {
  return Object.entries(variables).flatMap(([name, value]) => {
    const pointer = `/variables/${mode}/${name}`;
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
  return THEME_MODES.flatMap((mode) =>
    variableIssues(mode, variables[mode] ?? {}),
  );
}
