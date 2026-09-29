import type {
  ThemeMode,
  ThemeVariableSets,
  ThemeVariables,
  ValidationIssue,
} from "@antelopejs/interface-dms-builder";

export const THEME_MODES: ThemeMode[] = ["light", "dark"];

/**
 * The selector each mode's overrides are written under. The DMS declares its
 * defaults in its `dms` cascade layer, and unlayered, the project's
 * declarations win over those whatever the stylesheet order. That is also why
 * light is not plain `:root`: an unlayered `:root` still matches a page in
 * dark mode and wins over the DMS's layered `.dark`, so a value set for light
 * alone would show in dark too.
 */
const MODE_SELECTORS: Record<ThemeMode, string> = {
  light: ":root:not(.dark)",
  dark: ".dark",
};

/** A selector the builder reads back: the modes it applies to and how specific it is. */
interface SelectorReach {
  modes: ThemeMode[];
  specificity: number;
}

/**
 * The selectors a stylesheet may hold: the two the builder writes, and
 * `:root`, which the DMS docs use for a value both modes share and a
 * hand-written file may carry.
 */
const SELECTOR_REACH: Record<string, SelectorReach> = {
  [MODE_SELECTORS.light]: { modes: ["light"], specificity: 2 },
  [MODE_SELECTORS.dark]: { modes: ["dark"], specificity: 1 },
  ":root": { modes: ["light", "dark"], specificity: 1 },
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

/** One rule of a stylesheet the builder reads back, in the order the file holds it. */
interface ReadRule {
  reach: SelectorReach;
  declarations: ThemeVariables;
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

function readRules(text: string): ReadRule[] | string {
  const rules: ReadRule[] = [];
  let rest = text;
  while (rest.trim() !== "") {
    const rule = RULE.exec(rest);
    const reach = rule?.[1] ? SELECTOR_REACH[rule[1].trim()] : undefined;
    if (!rule || !reach) {
      return `it holds rules other than ${Object.keys(SELECTOR_REACH).join(", ")}`;
    }
    const declarations = parseDeclarations(rule[2] ?? "");
    if (!declarations) {
      return `its ${rule[1]} rule holds more than custom properties`;
    }
    rules.push({ reach, declarations });
    rest = rest.slice(rule[0].length);
  }
  return rules;
}

/**
 * The values a mode shows, picked the way the cascade picks them among the
 * rules that match it: the more specific selector wins, then the later rule.
 */
function valuesOfMode(rules: ReadRule[], mode: ThemeMode): ThemeVariables {
  return Object.assign(
    {},
    ...rules
      .filter((rule) => rule.reach.modes.includes(mode))
      .sort((left, right) => left.reach.specificity - right.reach.specificity)
      .map((rule) => rule.declarations),
  );
}

/**
 * Read the overrides back from the stylesheet the builder writes.
 *
 * The file is the builder's: rules of custom properties and nothing else.
 * Anything more — another selector, a comment, an at-rule — is someone's hand
 * work the builder cannot keep while rewriting the file whole, so the file is
 * reported as opaque rather than silently flattened. A `:root` rule reads as a
 * value of both modes, which the rewrite keeps by writing it in each.
 */
export function parseStylesheet(text: string): ParsedStylesheet {
  const rules = readRules(text);
  if (typeof rules === "string") {
    return { opaque: rules };
  }
  return {
    variables: {
      light: valuesOfMode(rules, "light"),
      dark: valuesOfMode(rules, "dark"),
    },
  };
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
