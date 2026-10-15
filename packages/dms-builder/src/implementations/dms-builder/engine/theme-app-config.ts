import type {
  LogoSlot,
  LogoSources,
  ThemeColorRole,
  ThemeColors,
  ThemeLogos,
  ValidationIssue,
} from "@antelopejs/interface-dms-builder";
import type { ObjectLiteralExpression, SourceFile } from "ts-morph";
import {
  defaultExportObject,
  editableObject,
  findProperty,
  objectProperty,
  removeIfEmpty,
  setStringProperty,
  stringProperty,
} from "./theme-literals";
import { THEME_MODES } from "./theme-stylesheet";

/** Where the DMS shows a logo, in the order the editor lists them. */
export const LOGO_SLOTS: LogoSlot[] = [
  "default",
  "collapsed",
  "email",
  "favicon",
];

/** The color roles a theme picks a palette for, in the order the editor lists them. */
export const COLOR_ROLES: ThemeColorRole[] = [
  "primary",
  "success",
  "warning",
  "error",
  "info",
];

/** The app config a layer starts from when it has none yet. */
export const EMPTY_APP_CONFIG = "export default {};\n";

const UI_KEY = "ui";
const COLORS_KEY = "colors";
const BRANDING_KEY = "branding";
const LOGO_KEY = "logo";

/** A path the frontend serves from `public/`: rooted, and never climbing out. */
const PUBLIC_PATH = /^\/(?!.*\.\.)[A-Za-z0-9._/-]+$/;

/**
 * A palette name as Nuxt UI resolves it to `--color-<name>-50…950`: a
 * Tailwind palette, or one a stylesheet of the project declares.
 */
const PALETTE_NAME = /^[a-z][a-z0-9-]*$/;

function nestedObject(
  config: ObjectLiteralExpression,
  outer: string,
  inner: string,
): ObjectLiteralExpression | undefined {
  const parent = objectProperty(config, outer);
  return parent ? objectProperty(parent, inner) : undefined;
}

function readSources(sources: ObjectLiteralExpression): LogoSources {
  const read: LogoSources = {};
  for (const mode of THEME_MODES) {
    const value = stringProperty(sources, mode);
    if (value !== undefined) {
      read[mode] = value;
    }
  }
  return read;
}

/**
 * The logo paths an app config sets under `branding.logo`. Only string
 * literals are read: a path the file computes is the author's, and reads as
 * no override at all.
 */
export function readLogos(sourceFile: SourceFile): ThemeLogos {
  const config = defaultExportObject(sourceFile);
  const logo = config
    ? nestedObject(config, BRANDING_KEY, LOGO_KEY)
    : undefined;
  const logos: ThemeLogos = {};
  for (const slot of LOGO_SLOTS) {
    const sources = logo ? objectProperty(logo, slot) : undefined;
    const read = sources ? readSources(sources) : {};
    if (Object.keys(read).length > 0) {
      logos[slot] = read;
    }
  }
  return logos;
}

/** The palettes an app config picks under `ui.colors`, string literals only. */
export function readColors(sourceFile: SourceFile): ThemeColors {
  const config = defaultExportObject(sourceFile);
  const colors = config ? nestedObject(config, UI_KEY, COLORS_KEY) : undefined;
  const read: ThemeColors = {};
  for (const role of COLOR_ROLES) {
    const value = colors ? stringProperty(colors, role) : undefined;
    if (value !== undefined) {
      read[role] = value;
    }
  }
  return read;
}

/** Where an edit stopped: the key path the builder could not write into. */
type Refusal = string;

/**
 * Set every string a record names on an object literal, at `path` below
 * `config`, and drop those it leaves out: the objects on the way are created
 * when something is to be written, and dropped again once emptied. Answers
 * the path it could not edit, when an object on the way is the author's
 * expression rather than a literal.
 */
function writeStrings(
  config: ObjectLiteralExpression,
  path: string[],
  values: Partial<Record<string, string>>,
  keys: readonly string[],
): Refusal | undefined {
  const wanted = keys.some((key) => values[key] !== undefined);
  const chain: ObjectLiteralExpression[] = [config];
  for (const key of path) {
    const parent = chain[chain.length - 1] as ObjectLiteralExpression;
    const next = editableObject(parent, key, wanted);
    if (next === null) {
      return wanted ? path.slice(0, chain.length).join(".") : undefined;
    }
    if (next === undefined) {
      return undefined;
    }
    chain.push(next);
  }
  const target = chain[chain.length - 1] as ObjectLiteralExpression;
  for (const key of keys) {
    const value = values[key];
    if (value === undefined) {
      findProperty(target, key)?.remove();
    } else {
      setStringProperty(target, key, value);
    }
  }
  for (let depth = path.length - 1; depth >= 0; depth--) {
    removeIfEmpty(chain[depth] as ObjectLiteralExpression, path[depth] ?? "");
  }
  return undefined;
}

/**
 * Point the palette of every role and every logo slot at the draft's. The rest
 * of the file — its other `ui` overrides, its own keys, its formatting — is
 * left as it was written. Answers why it could not: the file exports no
 * object literal, or keeps one of these keys in an expression of its own.
 */
export function writeAppConfig(
  sourceFile: SourceFile,
  colors: ThemeColors,
  logos: ThemeLogos,
): Refusal | undefined {
  const config = defaultExportObject(sourceFile);
  if (!config) {
    return "it does not default-export an object literal";
  }
  const refusals = [
    writeStrings(config, [UI_KEY, COLORS_KEY], colors, COLOR_ROLES),
    ...LOGO_SLOTS.map((slot) =>
      writeStrings(
        config,
        [BRANDING_KEY, LOGO_KEY, slot],
        logos[slot] ?? {},
        THEME_MODES,
      ),
    ),
  ].filter((refusal): refusal is Refusal => refusal !== undefined);
  return refusals.length > 0
    ? `it sets ${refusals.join(", ")} with an expression the builder cannot edit`
    : undefined;
}

/** Every public path a set of logos points at. */
export function logoPaths(logos: ThemeLogos): string[] {
  return LOGO_SLOTS.flatMap((slot) =>
    THEME_MODES.flatMap((mode) => logos[slot]?.[mode] ?? []),
  );
}

/** Every logo of a draft that is not a slot, a mode or a public path. */
export function validateLogos(logos: ThemeLogos): ValidationIssue[] {
  return Object.entries(logos).flatMap(([slot, sources]) => {
    if (!LOGO_SLOTS.some((known) => known === slot)) {
      return [
        { pointer: `/logos/${slot}`, message: `${slot} is not a logo slot` },
      ];
    }
    return Object.entries(sources ?? {}).flatMap(([mode, value]) =>
      THEME_MODES.some((known) => known === mode) && PUBLIC_PATH.test(value)
        ? []
        : [
            {
              pointer: `/logos/${slot}/${mode}`,
              message: `${slot} ${mode} is not a public path such as /branding/logo.svg`,
            },
          ],
    );
  });
}

/** Every color of a draft that is not a role or a palette name. */
export function validateColors(colors: ThemeColors): ValidationIssue[] {
  return Object.entries(colors).flatMap(([role, palette]) => {
    const pointer = `/colors/${role}`;
    if (!COLOR_ROLES.some((known) => known === role)) {
      return [{ pointer, message: `${role} is not a color role` }];
    }
    return typeof palette === "string" && PALETTE_NAME.test(palette)
      ? []
      : [{ pointer, message: `${role} is not a palette name such as violet` }];
  });
}
