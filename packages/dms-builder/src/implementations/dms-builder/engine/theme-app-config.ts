import type {
  LogoSlot,
  LogoSources,
  ThemeLogos,
  ValidationIssue,
} from "@antelopejs/interface-dms-builder";
import type { ObjectLiteralExpression, SourceFile } from "ts-morph";
import {
  defaultExportObject,
  ensureObjectProperty,
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

/** The app config a layer starts from when it has none yet. */
export const EMPTY_APP_CONFIG = "export default {};\n";

const BRANDING_KEY = "branding";
const LOGO_KEY = "logo";

/** A path the frontend serves from `public/`: rooted, and never climbing out. */
const PUBLIC_PATH = /^\/(?!.*\.\.)[A-Za-z0-9._/-]+$/;

function logoObject(
  config: ObjectLiteralExpression,
): ObjectLiteralExpression | undefined {
  const branding = objectProperty(config, BRANDING_KEY);
  return branding ? objectProperty(branding, LOGO_KEY) : undefined;
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
  const logo = config ? logoObject(config) : undefined;
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

function writeSlot(
  logo: ObjectLiteralExpression,
  slot: LogoSlot,
  sources: LogoSources,
): void {
  if (!THEME_MODES.some((mode) => sources[mode] !== undefined)) {
    findProperty(logo, slot)?.remove();
    return;
  }
  const target = ensureObjectProperty(logo, slot);
  for (const mode of THEME_MODES) {
    const value = sources[mode];
    if (value === undefined) {
      findProperty(target, mode)?.remove();
    } else {
      setStringProperty(target, mode, value);
    }
  }
}

/**
 * Point every logo slot at the draft's paths. The rest of the file — its
 * `ui` overrides, its own keys, its formatting — is left as it was written.
 * Answers false when the file exports no object literal to write into.
 */
export function writeLogos(sourceFile: SourceFile, logos: ThemeLogos): boolean {
  const config = defaultExportObject(sourceFile);
  if (!config) {
    return false;
  }
  const branding = ensureObjectProperty(config, BRANDING_KEY);
  const logo = ensureObjectProperty(branding, LOGO_KEY);
  for (const slot of LOGO_SLOTS) {
    writeSlot(logo, slot, logos[slot] ?? {});
  }
  removeIfEmpty(branding, LOGO_KEY);
  removeIfEmpty(config, BRANDING_KEY);
  return true;
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
