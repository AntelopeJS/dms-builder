import { createHash } from "node:crypto";
import path from "node:path";
import type {
  LogoUpload,
  ThemeLayer,
  ThemeLogos,
  ValidationIssue,
} from "@antelopejs/interface-dms-builder";
import { LOGO_SLOTS, logoPaths } from "./theme-app-config";
import { THEME_MODES } from "./theme-stylesheet";

/** Where uploaded logos are written, under the layer's `public/`. */
export const ASSETS_DIRECTORY = "branding";
const PUBLIC_DIRECTORY = "public";

const MAX_LOGO_BYTES = 512 * 1024;
const HASH_LENGTH = 8;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const ICO_SIGNATURE = Buffer.from([0x00, 0x00, 0x01, 0x00]);
const RIFF_SIGNATURE = Buffer.from("RIFF");
const WEBP_SIGNATURE = Buffer.from("WEBP");
const WEBP_SIGNATURE_OFFSET = 8;
const SVG_ROOT = /<svg[\s>]/i;

/**
 * What an SVG logo may not carry. It is served from the dashboard's own
 * origin, so one opened directly would run its scripts there: anything that
 * executes, embeds another document, or declares entities is refused.
 */
const UNSAFE_SVG =
  /<script|<foreignObject|<iframe|<embed|<object|<!ENTITY|\son[a-z]+\s*=|javascript:/i;

/** One accepted image format: its extension, and how its bytes are recognized. */
interface LogoFormat {
  extension: string;
  matches: (bytes: Buffer) => boolean;
}

function startsWith(bytes: Buffer, signature: Buffer, offset = 0): boolean {
  return bytes.subarray(offset, offset + signature.length).equals(signature);
}

function isSvg(bytes: Buffer): boolean {
  return SVG_ROOT.test(bytes.toString("utf8"));
}

function isWebp(bytes: Buffer): boolean {
  return (
    startsWith(bytes, RIFF_SIGNATURE) &&
    startsWith(bytes, WEBP_SIGNATURE, WEBP_SIGNATURE_OFFSET)
  );
}

function isIcon(bytes: Buffer): boolean {
  return startsWith(bytes, ICO_SIGNATURE);
}

const LOGO_FORMATS: Record<string, LogoFormat> = {
  "image/svg+xml": { extension: "svg", matches: isSvg },
  "image/png": {
    extension: "png",
    matches: (bytes) => startsWith(bytes, PNG_SIGNATURE),
  },
  "image/webp": { extension: "webp", matches: isWebp },
  "image/x-icon": { extension: "ico", matches: isIcon },
  "image/vnd.microsoft.icon": { extension: "ico", matches: isIcon },
};

const EXTENSIONS = [
  ...new Set(Object.values(LOGO_FORMATS).map((format) => format.extension)),
];

/**
 * The public paths the builder names its own uploads with. A logo it replaces
 * is deleted only when its path has this form: a file the author put in
 * `public/` by hand is never the builder's to remove.
 */
const OWNED_ASSET = new RegExp(
  `^/${ASSETS_DIRECTORY}/(?:${LOGO_SLOTS.join("|")})-(?:${THEME_MODES.join("|")})-[0-9a-f]{${HASH_LENGTH}}\\.(?:${EXTENSIONS.join("|")})$`,
);

/** A logo file checked and named, ready to be written. */
export interface StagedLogo {
  upload: LogoUpload;
  publicPath: string;
  filePath: string;
  bytes: Buffer;
}

/** The uploads of a draft, each either staged or refused. */
export interface StagedLogos {
  staged: StagedLogo[];
  issues: ValidationIssue[];
}

function uploadProblem(upload: LogoUpload, bytes: Buffer): string | undefined {
  const format = LOGO_FORMATS[upload.contentType];
  if (!format) {
    return `${upload.contentType} is not an accepted logo format (SVG, PNG, WebP or ICO)`;
  }
  if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES) {
    return `a logo must hold between 1 byte and ${MAX_LOGO_BYTES / 1024} KiB`;
  }
  if (!format.matches(bytes)) {
    return `the file is not a ${format.extension.toUpperCase()} image`;
  }
  return format.extension === "svg" && UNSAFE_SVG.test(bytes.toString("utf8"))
    ? "the SVG holds scripts, event handlers or embedded documents"
    : undefined;
}

function slotProblem(upload: LogoUpload): string | undefined {
  const knownSlot = LOGO_SLOTS.some((slot) => slot === upload.slot);
  const knownMode = THEME_MODES.some((mode) => mode === upload.mode);
  return knownSlot && knownMode
    ? undefined
    : `${upload.slot} ${upload.mode} is not a logo slot and mode`;
}

function stageLogo(layer: ThemeLayer, upload: LogoUpload): StagedLogo {
  const bytes = Buffer.from(upload.data, "base64");
  const hash = createHash("sha256").update(bytes).digest("hex");
  const extension = LOGO_FORMATS[upload.contentType]?.extension ?? "";
  const name = `${upload.slot}-${upload.mode}-${hash.slice(0, HASH_LENGTH)}.${extension}`;
  return {
    upload,
    publicPath: `/${ASSETS_DIRECTORY}/${name}`,
    filePath: path.join(
      layer.sourcePath,
      PUBLIC_DIRECTORY,
      ASSETS_DIRECTORY,
      name,
    ),
    bytes,
  };
}

/**
 * Check every upload and name its file after its content, so a new logo is a
 * new URL: no browser or CDN can keep serving the old one under the path the
 * app config now points at.
 */
export function stageLogos(
  layer: ThemeLayer,
  uploads: LogoUpload[],
): StagedLogos {
  const result: StagedLogos = { staged: [], issues: [] };
  uploads.forEach((upload, index) => {
    const logo = stageLogo(layer, upload);
    const problem = slotProblem(upload) ?? uploadProblem(upload, logo.bytes);
    if (problem) {
      result.issues.push({ pointer: `/uploads/${index}`, message: problem });
      return;
    }
    result.staged.push(logo);
  });
  return result;
}

/** The draft's logos, each upload in place of what the draft said for its slot and mode. */
export function withUploads(
  logos: ThemeLogos,
  staged: StagedLogo[],
): ThemeLogos {
  const merged: ThemeLogos = structuredClone(logos);
  for (const logo of staged) {
    const { slot, mode } = logo.upload;
    merged[slot] = { ...merged[slot], [mode]: logo.publicPath };
  }
  return merged;
}

/** The files of the builder's own logos the new theme no longer points at. */
export function orphanedAssets(
  layer: ThemeLayer,
  previous: ThemeLogos,
  next: ThemeLogos,
): string[] {
  const kept = new Set(logoPaths(next));
  return [...new Set(logoPaths(previous))]
    .filter(
      (publicPath) => OWNED_ASSET.test(publicPath) && !kept.has(publicPath),
    )
    .map((publicPath) =>
      path.join(layer.sourcePath, PUBLIC_DIRECTORY, publicPath),
    );
}
