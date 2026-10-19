import type { ValidationIssue } from "@antelopejs/interface-dms-builder";
import { VARIABLE_SET_NAMES } from "./theme-stylesheet";
import { isPlainObject } from "./value";

const UPLOAD_STRING_FIELDS = ["slot", "mode", "contentType", "base64Content"];

/**
 * Issues for each non-string entry, or one issue when `value` is not an
 * object.
 */
function stringRecordIssues(
  value: unknown,
  pointer: string,
): ValidationIssue[] {
  if (!isPlainObject(value)) {
    return [{ pointer, message: "is not an object" }];
  }
  return Object.entries(value)
    .filter(([, entry]) => typeof entry !== "string")
    .map(([key]) => ({
      pointer: `${pointer}/${key}`,
      message: `${key} is not a string`,
    }));
}

function variablesIssues(variables: unknown): ValidationIssue[] {
  if (!isPlainObject(variables)) {
    return [
      {
        pointer: "/variables",
        message: "is not an object of shared, light and dark variables",
      },
    ];
  }
  return VARIABLE_SET_NAMES.flatMap((setName) =>
    variables[setName] === undefined
      ? []
      : stringRecordIssues(variables[setName], `/variables/${setName}`),
  );
}

function logosIssues(logos: unknown): ValidationIssue[] {
  if (!isPlainObject(logos)) {
    return [{ pointer: "/logos", message: "is not an object of logo slots" }];
  }
  return Object.entries(logos).flatMap(([slot, pathsByMode]) =>
    stringRecordIssues(pathsByMode, `/logos/${slot}`),
  );
}

function uploadsIssues(uploads: unknown): ValidationIssue[] {
  if (!Array.isArray(uploads)) {
    return [{ pointer: "/uploads", message: "is not a list of uploads" }];
  }
  return uploads.flatMap((upload: unknown, index) => {
    const pointer = `/uploads/${index}`;
    if (!isPlainObject(upload)) {
      return [{ pointer, message: "is not an upload" }];
    }
    return UPLOAD_STRING_FIELDS.filter(
      (field) => typeof upload[field] !== "string",
    ).map((field) => ({
      pointer: `${pointer}/${field}`,
      message: `${field} is not a string`,
    }));
  });
}

/**
 * Issues where the draft does not match `ThemeDraft`: one sent over HTTP is
 * arbitrary JSON, and a wrong type would otherwise fail deep in the write as
 * a server error. `colors`, `logos` and `uploads` may be absent here.
 */
export function draftShapeIssues(draft: unknown): ValidationIssue[] {
  if (!isPlainObject(draft)) {
    return [
      {
        pointer: "",
        message: "the theme is not an object of variables, colors and logos",
      },
    ];
  }
  return [
    ...variablesIssues(draft.variables),
    ...(draft.colors === undefined
      ? []
      : stringRecordIssues(draft.colors, "/colors")),
    ...(draft.logos === undefined ? [] : logosIssues(draft.logos)),
    ...(draft.uploads === undefined ? [] : uploadsIssues(draft.uploads)),
  ];
}
