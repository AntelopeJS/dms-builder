import { InterfaceFunction } from "@antelopejs/interface-core";
import type { MutationOpts, OpResult } from "./results";

/** The two color modes every theme value is set for. */
export type ThemeMode = "light" | "dark";

/** CSS custom properties by name: `{ "--ui-primary": "#7c3aed" }`. */
export type ThemeVariables = Record<string, string>;

/**
 * The CSS custom properties a theme overrides, one set per color mode.
 *
 * A variable left out of a mode keeps the DMS default for that mode, so a
 * theme only ever holds what it changes.
 */
export interface ThemeVariableSets {
  light: ThemeVariables;
  dark: ThemeVariables;
}

/** Where the dashboard shows a logo. */
export type LogoSlot = "default" | "collapsed" | "email" | "favicon";

/** One logo slot: the public path of its file in each color mode. */
export type LogoSources = Partial<Record<ThemeMode, string>>;

/** The logo slots a theme sets. A slot or a mode left out keeps the DMS logo. */
export type ThemeLogos = Partial<Record<LogoSlot, LogoSources>>;

/** A logo file sent with a save, for one slot in one color mode. */
export interface LogoUpload {
  slot: LogoSlot;
  mode: ThemeMode;
  /** `image/svg+xml`, `image/png`, `image/webp` or `image/x-icon`. */
  contentType: string;
  /** The file's bytes, base64-encoded. */
  data: string;
}

/** The project's frontend layer a theme is read from and written to. */
export interface ThemeLayer {
  name: string;
  /** Absolute path of the layer's source directory. */
  sourcePath: string;
}

/** The files a theme save writes, relative to the layer's source directory. */
export interface ThemeFiles {
  /** The unlayered stylesheet holding the `:root` and `.dark` overrides. */
  stylesheet: string;
  /** The app config holding `branding.logo`. */
  appConfig: string;
  /** The module that applies both, called from the layer's entry. */
  applier: string;
  /** The layer's entry, which calls the applier. */
  entry: string;
  /** Where uploaded logos are written, under the layer's `public/`. */
  assets: string;
}

/** A project's theme as its files hold it. */
export interface ThemeStructure {
  layer: ThemeLayer;
  variables: ThemeVariableSets;
  logos: ThemeLogos;
  files: ThemeFiles;
  /** Whether the layer's entry already applies the theme. */
  applied: boolean;
  /** Content hash of the theme's files → pass back as `expectedVersion`. */
  version: string;
}

/**
 * A theme as it should be written: the whole of it, replacing the one on disk.
 *
 * An upload replaces whatever `logos` says for its slot and mode, since the
 * file's public path is only known once it is written.
 */
export interface ThemeDraft {
  variables: ThemeVariableSets;
  logos: ThemeLogos;
  uploads?: LogoUpload[];
}

/**
 * The project's theme, read from its frontend layer.
 *
 * The layer is the highest-priority frontend module registered from inside the
 * project root, unless the module config names one. `not_found` when there is
 * none; `unsupported` when the stylesheet holds rules the builder does not
 * write.
 */
export const GetTheme =
  InterfaceFunction<() => Promise<OpResult<ThemeStructure>>>();

/**
 * Write a theme: its stylesheet, the logo paths of its app config, the logo
 * files, and on first use the applier and the entry's call to it. One
 * transaction: every file is validated before any is written.
 */
export const SetTheme =
  InterfaceFunction<
    (
      draft: ThemeDraft,
      opts?: MutationOpts,
    ) => Promise<OpResult<{ version: string }>>
  >();
