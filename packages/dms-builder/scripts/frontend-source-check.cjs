const fs = require("node:fs");
const path = require("node:path");
const { isDeepStrictEqual } = require("node:util");

const frontend = path.resolve(__dirname, "../frontend-vue");
const app = path.join(frontend, "app");

const NAMESPACE_DECLARATION = /^export const I18N_NAMESPACE = '([\w-]+)'$/m;

/**
 * The surfaces whose every text goes through the catalog: the entry point the
 * DMS header draws, the editor's bar and the strips over the page. A literal
 * written there again would be shown in English whatever the language.
 */
const TRANSLATED_COMPONENTS = ["components/Bar.vue", "components/Banners.vue"];

/** The attributes a person reads or hears: labels, titles, descriptions. */
const READ_ATTRIBUTES =
  /(?:^|\s)(label|aria-label|title|description|placeholder|text)="([^"]*)"/g;

/**
 * The components that read a page's display name for a heading. Each draws it
 * through `displayText`, or `$demo.nav.home` reaches the screen.
 */
const PAGE_TITLE_COMPONENTS = [
  "Bar",
  "Banners",
  "Canvas",
  "Inspector",
  "Layers",
];
const PAGE_TITLE_THROUGH_LOCALE = /displayText\(\s*\(?(patch|draft|session)/;

function readText(relative) {
  return fs.readFileSync(path.join(frontend, relative), "utf8");
}

function flatten(messages, prefix = "") {
  const entries = new Map();
  for (const [key, value] of Object.entries(messages)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (value instanceof Object) {
      for (const [nested, text] of flatten(value, name)) {
        entries.set(nested, text);
      }
    } else {
      entries.set(name, value);
    }
  }
  return entries;
}

function placeholders(message) {
  return [
    ...new Set([...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1])),
  ].sort((a, b) => a.localeCompare(b));
}

function sources() {
  return fs
    .readdirSync(app, { recursive: true, encoding: "utf8" })
    .filter((name) => /\.(ts|vue)$/.test(name))
    .map((name) => ({
      name,
      text: fs.readFileSync(path.join(app, name), "utf8"),
    }));
}

/** A template's text, its tags, comments and interpolations taken out. */
function templateText(source) {
  const template = source.match(/<template>([\s\S]*)<\/template>/)?.[1] ?? "";
  return template
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\{\{[\s\S]*?\}\}/g, " ")
    .replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, " ");
}

const namespace = NAMESPACE_DECLARATION.exec(
  readText("app/runtime/i18n.ts"),
)?.[1];
const english = JSON.parse(readText("i18n/locales/builder-en-GB.json"));
const french = JSON.parse(readText("i18n/locales/builder-fr-FR.json"));
const en = flatten(english);
const fr = flatten(french);

function catalogsUseTheNamespace() {
  if (namespace === undefined) {
    return ["app/runtime/i18n.ts declares no I18N_NAMESPACE literal"];
  }
  return [
    ["builder-en-GB.json", english],
    ["builder-fr-FR.json", french],
  ]
    .filter(
      ([, catalog]) => !isDeepStrictEqual(Object.keys(catalog), [namespace]),
    )
    .map(
      ([file, catalog]) =>
        `${file} holds ${JSON.stringify(Object.keys(catalog))}, not only ${namespace}`,
    );
}

/**
 * The builder speaks the author's language: every English message has a
 * French one with the same placeholders, and French has no message English
 * lacks.
 */
function catalogsAreInStep() {
  const failures = [];
  for (const key of en.keys()) {
    if (!fr.has(key)) failures.push(`French lacks ${key}`);
  }
  for (const key of fr.keys()) {
    if (!en.has(key)) failures.push(`English lacks ${key}`);
  }
  for (const [key, message] of en) {
    const expected = placeholders(message);
    const actual = placeholders(fr.get(key) ?? "");
    if (!isDeepStrictEqual(actual, expected)) {
      failures.push(
        `${key} has placeholders ${JSON.stringify(actual)} in French, ${JSON.stringify(expected)} in English`,
      );
    }
  }
  return failures;
}

/** `@` starts a linked message and breaks the compile of the whole text. */
function messagesHaveNoLinkSyntax() {
  return [...en, ...fr]
    .filter(([, message]) => /@/.test(message))
    .map(([key, message]) => `${key} holds @: ${message}`);
}

function codeReadsOnlyCatalogKeys() {
  const missing = [];
  for (const { name, text } of sources()) {
    for (const match of text.matchAll(/\b(?:t|displayKey)\(\s*'([\w.]+)'/g)) {
      if (!en.has(`${namespace}.${match[1]}`)) {
        missing.push(`${name}: ${match[1]}`);
      }
    }
    for (const match of text.matchAll(/\bt\(\s*`([\w.]+)\$\{/g)) {
      const prefix = `${namespace}.${match[1]}`;
      if (![...en.keys()].some((key) => key.startsWith(prefix))) {
        missing.push(`${name}: ${match[1]}…`);
      }
    }
  }
  return missing.map((site) => `the catalog lacks the key read at ${site}`);
}

function toastsAreTranslated() {
  const literal = [];
  for (const { name, text } of sources()) {
    for (const match of text.matchAll(/\bnotify\(\s*(['"`])/g)) {
      literal.push(`${name}: ${text.slice(match.index, match.index + 60)}`);
    }
  }
  return literal.map((site) => `a toast says a literal at ${site}`);
}

function translatedComponentsHaveNoLiteralText() {
  const failures = [];
  for (const component of TRANSLATED_COMPONENTS) {
    const source = fs.readFileSync(path.join(app, component), "utf8");
    for (const match of source.matchAll(READ_ATTRIBUTES)) {
      if (/[A-Za-z]/.test(match[2])) {
        failures.push(`${component} writes ${match[1]}="${match[2]}"`);
      }
    }
    for (const text of templateText(source).match(/[A-Za-z][^<]*/g) ?? []) {
      failures.push(
        `${component} writes the text ${JSON.stringify(text.trim())}`,
      );
    }
  }
  return failures;
}

function editorDrawsPageTitlesThroughTheLocale() {
  return PAGE_TITLE_COMPONENTS.filter(
    (name) =>
      !PAGE_TITLE_THROUGH_LOCALE.test(
        fs.readFileSync(path.join(app, `components/${name}.vue`), "utf8"),
      ),
  ).map(
    (name) => `components/${name}.vue draws no page title through displayText`,
  );
}

const failures = [
  catalogsUseTheNamespace,
  catalogsAreInStep,
  messagesHaveNoLinkSyntax,
  codeReadsOnlyCatalogKeys,
  toastsAreTranslated,
  translatedComponentsHaveNoLiteralText,
  editorDrawsPageTitlesThroughTheLocale,
].flatMap((check) => check().map((failure) => `${check.name}: ${failure}`));

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}
