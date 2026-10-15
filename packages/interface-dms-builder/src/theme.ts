import { InterfaceFunction } from "@antelopejs/interface-core";
import type { MutationOpts, OpResult } from "./results";

/** The two color modes a theme value can be set for. */
export type ThemeMode = "light" | "dark";

/** CSS custom properties by name: `{ "--ui-bg": "#fafafa" }`. */
export type ThemeVariables = Record<string, string>;

/**
 * The CSS custom properties a theme overrides: those both modes share, and
 * those set for one mode only.
 *
 * A variable left out keeps the DMS default, so a theme only ever holds what
 * it changes. A shared value is one the modes cannot differ on, such as the
 * font or the corner radius; a mode's own value wins over a shared one.
 */
export interface ThemeVariableSets {
  shared: ThemeVariables;
  light: ThemeVariables;
  dark: ThemeVariables;
}

/** The Nuxt UI color roles a theme picks a palette for. */
export type ThemeColorRole =
  | "primary"
  | "success"
  | "warning"
  | "error"
  | "info";

/**
 * The palette each role takes, by name: a Tailwind palette (`violet`), or one
 * the project's stylesheets declare (`brand` for `--color-brand-50…950`). A
 * role left out keeps the DMS palette.
 */
export type ThemeColors = Partial<Record<ThemeColorRole, string>>;

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

/** The files a theme lives in, relative to the layer's source directory. */
export interface ThemeFiles {
  /** The unlayered stylesheet holding the variables. */
  stylesheet: string;
  /** The app config holding `ui.colors` and `branding.logo`. */
  appConfig: string;
  /** The layer's entry, which imports the stylesheet. */
  entry: string;
  /** Where uploaded logos are written, under the layer's `public/`. */
  assets: string;
}

/** A project's theme as its files hold it. */
export interface ThemeStructure {
  layer: ThemeLayer;
  variables: ThemeVariableSets;
  colors: ThemeColors;
  logos: ThemeLogos;
  files: ThemeFiles;
  /**
   * Whether the layer's entry imports the stylesheet already. The first save
   * that has to add the import changes the entry, which the development
   * server answers with a full page reload.
   */
  stylesheetImported: boolean;
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
  colors: ThemeColors;
  logos: ThemeLogos;
  uploads?: LogoUpload[];
}

/**
 * The project's theme, read from its frontend layer.
 *
 * The layer is the highest-priority frontend module registered from inside the
 * project root, unless the module config names one. `not_found` when the
 * project has none, its `ref` naming where `CreateThemeLayer` would create it;
 * `unsupported` when the stylesheet holds rules the builder does not write.
 */
export const GetTheme =
  InterfaceFunction<() => Promise<OpResult<ThemeStructure>>>();

/**
 * Write a theme: its stylesheet, `ui.colors` and the logo paths of its app
 * config, the logo files, and the entry's import of the stylesheet when it
 * lacks one. One transaction: every file is checked before any is written.
 *
 * SVG logos are written sanitized; the save warns when that removed anything.
 */
export const SetTheme =
  InterfaceFunction<
    (
      draft: ThemeDraft,
      opts?: MutationOpts,
    ) => Promise<OpResult<{ version: string }>>
  >();

/**
 * Give a project without a frontend layer of its own the one a theme is
 * written to: `frontend-vue/` beside its sources, with an entry importing the
 * stylesheet, registered from the project's `start()` above the DMS.
 *
 * The backend reloads with the registration; the frontend dev server reads
 * its frontend modules at startup, so it needs a restart to serve the layer.
 */
export const CreateThemeLayer =
  InterfaceFunction<() => Promise<OpResult<ThemeLayer>>>();
