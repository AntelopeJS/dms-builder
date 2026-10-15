import createDOMPurify, { type DOMPurify } from "dompurify";
import { JSDOM } from "jsdom";

/** What the sanitizer kept of an SVG, and whether it had to take anything out. */
export interface SanitizedSvg {
  svg: string;
  /** Whether scripts, handlers, outside references or the like were removed. */
  stripped: boolean;
}

const HREF_ATTRIBUTE = /^(?:xlink:)?href$/;
const INTERNAL_REFERENCE = "#";

/**
 * What the HTML parser wraps a lone SVG in, or drops on the way, and the
 * sanitizer reports as removed: the document around it, a comment, an XML
 * declaration. None of it is content the logo loses.
 */
const WRAPPING_NODES = new Set(["HTML", "HEAD", "BODY", "#comment"]);

/**
 * An HTML serializer writes a no-break space as `&nbsp;`, an entity an SVG
 * file, read as XML, does not declare: the image would fail to load.
 */
const NAMED_NO_BREAK_SPACE = /&nbsp;/g;
const NUMERIC_NO_BREAK_SPACE = "&#160;";

let purifier: DOMPurify | undefined;

/**
 * The sanitizer, made on first use: a DOM to parse with is a heavy thing to
 * build for a process that may never see a logo.
 *
 * `<use>` is allowed, as logo exports lean on it to reuse a shape, but only
 * pointing inside the file: a reference to another document is a resource
 * fetched from elsewhere, which a logo has no need of.
 */
function svgPurifier(): DOMPurify {
  if (purifier) {
    return purifier;
  }
  const created = createDOMPurify(new JSDOM("").window);
  created.addHook("uponSanitizeAttribute", (node, data) => {
    if (
      node.nodeName.toLowerCase() === "use" &&
      HREF_ATTRIBUTE.test(data.attrName) &&
      !data.attrValue.startsWith(INTERNAL_REFERENCE)
    ) {
      data.keepAttr = false;
    }
  });
  purifier = created;
  return created;
}

function removedContent(removed: DOMPurify["removed"]): boolean {
  return removed.some((entry) =>
    "element" in entry ? !WRAPPING_NODES.has(entry.element.nodeName) : true,
  );
}

/**
 * An SVG logo with everything that could run or fetch taken out: scripts,
 * event handlers, `javascript:` links, embedded documents, references to
 * other files. It is served from the dashboard's own origin, so one opened
 * directly would otherwise run there.
 */
export function sanitizeSvg(text: string): SanitizedSvg {
  const purify = svgPurifier();
  const svg = purify
    .sanitize(text, {
      USE_PROFILES: { svg: true, svgFilters: true },
      ADD_TAGS: ["use"],
    })
    .replace(NAMED_NO_BREAK_SPACE, NUMERIC_NO_BREAK_SPACE);
  return { svg, stripped: removedContent(purify.removed) };
}
