import fs from "node:fs";
import path from "node:path";
import type { LogoUpload, ThemeDraft } from "@antelopejs/interface-dms-builder";
import { expect } from "chai";
import { setModuleConfig } from "../config";
import { GetTheme, SetTheme } from "../implementations/dms-builder";
import {
  emitStylesheet,
  parseStylesheet,
} from "../implementations/dms-builder/engine/theme-stylesheet";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const LAYER = "frontend-vue";
const OP_TIMEOUT = 30_000;

const ENTRY_SOURCE = `import type { DmsFrontendModule } from "#dms/frontend-module";

const projectFrontend: DmsFrontendModule = {
  setup(sdk) {
    sdk.registerComponent("Hello", {});
  },
};

export default projectFrontend;
`;

const APP_CONFIG_SOURCE = `export default {
  ui: { colors: { primary: "violet" } },
};
`;

const SVG_LOGO =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8"/></svg>';
const PNG_LOGO = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13,
]);

let app: Fixture;

function layerPath(relative: string): string {
  return path.join(app.root, LAYER, relative);
}

function writeLayerFile(relative: string, content: string): void {
  fs.mkdirSync(path.dirname(layerPath(relative)), { recursive: true });
  fs.writeFileSync(layerPath(relative), content);
}

function readLayerFile(relative: string): string {
  return fs.readFileSync(layerPath(relative), "utf8");
}

function upload(
  slot: LogoUpload["slot"],
  mode: LogoUpload["mode"],
  content: string | Buffer,
  contentType: string,
): LogoUpload {
  return {
    slot,
    mode,
    contentType,
    data: Buffer.from(content).toString("base64"),
  };
}

function draft(overrides: Partial<ThemeDraft> = {}): ThemeDraft {
  return {
    variables: {
      light: { "--ui-primary": "#7c3aed" },
      dark: { "--ui-primary": "#a78bfa" },
    },
    logos: {},
    ...overrides,
  };
}

describe("theme stylesheet", () => {
  it("writes one rule per mode, its declarations sorted", () => {
    const text = emitStylesheet({
      light: { "--ui-radius": "0.5rem", "--ui-primary": "#7c3aed" },
      dark: { "--ui-primary": "#a78bfa" },
    });
    expect(text).to.equal(
      ":root:not(.dark) {\n  --ui-primary: #7c3aed;\n  --ui-radius: 0.5rem;\n}\n\n.dark {\n  --ui-primary: #a78bfa;\n}\n",
    );
    expect(parseStylesheet(text).variables).to.deep.equal({
      light: { "--ui-primary": "#7c3aed", "--ui-radius": "0.5rem" },
      dark: { "--ui-primary": "#a78bfa" },
    });
  });

  it("reads a file with another rule as opaque rather than dropping it", () => {
    const parsed = parseStylesheet(
      ":root { --a: 1px; }\nbody { color: red; }\n",
    );
    expect(parsed.variables).to.equal(undefined);
    expect(parsed.opaque).to.be.a("string");
  });

  it("writes nothing for a theme without overrides", () => {
    expect(emitStylesheet({ light: {}, dark: {} })).to.equal("");
  });

  it("keeps a value set for light alone out of dark mode", () => {
    // Unlayered, a bare `:root` would also match the dark page and win over
    // the DMS's layered dark default.
    expect(emitStylesheet({ light: { "--ui-bg": "snow" }, dark: {} })).to.equal(
      ":root:not(.dark) {\n  --ui-bg: snow;\n}\n",
    );
  });

  it("reads a hand-written :root rule as a value of both modes", () => {
    const parsed = parseStylesheet(
      ":root {\n  --font-sans: Inter;\n  --ui-bg: white;\n}\n.dark {\n  --ui-bg: black;\n}\n",
    );
    expect(parsed.variables).to.deep.equal({
      light: { "--font-sans": "Inter", "--ui-bg": "white" },
      dark: { "--font-sans": "Inter", "--ui-bg": "black" },
    });
  });

  it("reads each mode the way the cascade picks its values", () => {
    const parsed = parseStylesheet(
      ":root:not(.dark) { --a: light; }\n.dark { --b: dark; }\n:root { --a: both; --b: both; }\n",
    );
    expect(parsed.variables).to.deep.equal({
      light: { "--a": "light", "--b": "both" },
      dark: { "--a": "both", "--b": "both" },
    });
  });
});

describe("theme", function () {
  this.timeout(OP_TIMEOUT);

  beforeEach(() => {
    app = createFixture();
    setModuleConfig({ projectRoot: app.root, theme: { layer: LAYER } });
    writeLayerFile("dms.frontend.ts", ENTRY_SOURCE);
    writeLayerFile("app/app.config.ts", APP_CONFIG_SOURCE);
  });

  afterEach(() => {
    destroyFixture();
  });

  it("reads a layer that has no theme yet as an empty one", async () => {
    const theme = expectOk(await GetTheme(), "GetTheme");
    expect(theme.variables).to.deep.equal({ light: {}, dark: {} });
    expect(theme.logos).to.deep.equal({});
    expect(theme.applied).to.equal(false);
    expect(theme.layer.sourcePath).to.equal(path.join(app.root, LAYER));
  });

  it("writes the stylesheet, the applier and the entry's call to it", async () => {
    const result = await SetTheme(draft());
    expectOk(result, "SetTheme");
    expect(readLayerFile("app/assets/css/theme.css")).to.equal(
      ":root:not(.dark) {\n  --ui-primary: #7c3aed;\n}\n\n.dark {\n  --ui-primary: #a78bfa;\n}\n",
    );
    expect(readLayerFile("app/theme.ts")).to.contain(
      'import "./assets/css/theme.css";',
    );
    const entry = readLayerFile("dms.frontend.ts");
    expect(entry).to.contain('import { applyTheme } from "./app/theme";');
    expect(entry).to.match(
      /setup\(sdk\) \{\n\s+applyTheme\(\);\n\s+sdk\.registerComponent/,
    );
    const theme = expectOk(await GetTheme(), "GetTheme");
    expect(theme.applied).to.equal(true);
    expect(theme.variables.dark).to.deep.equal({ "--ui-primary": "#a78bfa" });
  });

  it("writes the app config it creates for a theme without logos as {}", async () => {
    fs.rmSync(layerPath("app/app.config.ts"));
    expectOk(await SetTheme(draft()), "SetTheme");
    expect(readLayerFile("app/app.config.ts")).to.equal("export default {};\n");
  });

  it("puts the call on a line of its own in an empty setup", async () => {
    writeLayerFile(
      "dms.frontend.ts",
      "const layer = {\n  setup() {},\n};\n\nexport default layer;\n",
    );
    expectOk(await SetTheme(draft()), "SetTheme");
    expect(readLayerFile("dms.frontend.ts")).to.equal(
      'import { applyTheme } from "./app/theme";\n\nconst layer = {\n  setup() {\n    applyTheme();\n  },\n};\n\nexport default layer;\n',
    );
  });

  it("writes a logo under public/branding and points the app config at it", async () => {
    const result = expectOk(
      await SetTheme(
        draft({
          uploads: [
            upload("default", "light", SVG_LOGO, "image/svg+xml"),
            upload("default", "dark", PNG_LOGO, "image/png"),
          ],
        }),
      ),
      "SetTheme",
    );
    const theme = expectOk(await GetTheme(), "GetTheme");
    expect(theme.version).to.equal(result.version);
    const light = theme.logos.default?.light ?? "";
    const dark = theme.logos.default?.dark ?? "";
    expect(light).to.match(/^\/branding\/default-light-[0-9a-f]{8}\.svg$/);
    expect(dark).to.match(/^\/branding\/default-dark-[0-9a-f]{8}\.png$/);
    expect(
      fs.readFileSync(path.join(app.root, LAYER, "public", light), "utf8"),
    ).to.equal(SVG_LOGO);
    expect(readLayerFile("app/app.config.ts")).to.contain('primary: "violet"');
  });

  it("deletes the builder's own logo once nothing points at it", async () => {
    expectOk(
      await SetTheme(
        draft({
          uploads: [upload("collapsed", "light", SVG_LOGO, "image/svg+xml")],
        }),
      ),
      "SetTheme",
    );
    const first = expectOk(await GetTheme(), "GetTheme");
    const written = first.logos.collapsed?.light ?? "";
    expectOk(
      await SetTheme(draft({ logos: {} }), { expectedVersion: first.version }),
      "SetTheme",
    );
    expect(
      fs.existsSync(path.join(app.root, LAYER, "public", written)),
    ).to.equal(false);
    expect(readLayerFile("app/app.config.ts")).not.to.contain("branding");
  });

  it("refuses an SVG that carries a script, and writes nothing", async () => {
    const unsafe =
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
    const result = await SetTheme(
      draft({ uploads: [upload("default", "light", unsafe, "image/svg+xml")] }),
    );
    expect(result.ok).to.equal(false);
    expect(!result.ok && result.error.code).to.equal("invalid_config");
    expect(fs.existsSync(layerPath("app/assets/css/theme.css"))).to.equal(
      false,
    );
  });

  it("refuses a value that would end the declaration", async () => {
    const result = await SetTheme(
      draft({
        variables: {
          light: { "--ui-bg": "red; } body { color: red" },
          dark: {},
        },
      }),
    );
    expect(!result.ok && result.error.code).to.equal("invalid_config");
  });

  it("answers stale when the theme changed on disk since it was read", async () => {
    const theme = expectOk(await GetTheme(), "GetTheme");
    writeLayerFile(
      "app/assets/css/theme.css",
      ":root {\n  --ui-radius: 1rem;\n}\n",
    );
    const result = await SetTheme(draft(), { expectedVersion: theme.version });
    expect(!result.ok && result.error.code).to.equal("stale");
  });

  it("will not rewrite a stylesheet holding rules it did not write", async () => {
    writeLayerFile("app/assets/css/theme.css", "body { margin: 0; }\n");
    const result = await SetTheme(draft());
    expect(!result.ok && result.error.code).to.equal("unsupported");
    expect(readLayerFile("app/assets/css/theme.css")).to.equal(
      "body { margin: 0; }\n",
    );
  });
});
