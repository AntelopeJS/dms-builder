import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import { FRONTEND_LOADER_RANGE } from "../constants/routes";
import { GetTheme, SetTheme } from "../implementations/dms-builder";
import { scaffoldThemeLayer } from "../implementations/dms-builder/engine/theme-scaffold";
import { destroyFixture, expectOk, type Fixture } from "./harness";
import {
  APP_CONFIG_SOURCE,
  brandingFiles,
  createThemeFixture,
  draft,
  layerPath,
  OP_TIMEOUT,
  PNG_LOGO,
  readLayerFile,
  upload,
  writeLayerFile,
} from "./theme-harness";

const LOADER_PACKAGE = "@antelopejs/dms-frontend";

/** The builder's own frontend module, whose manifest ships in this package. */
const FRONTEND_MANIFEST = path.join(
  __dirname,
  "..",
  "..",
  "frontend-vue",
  "package.json",
);

/** The engines a manifest declares, by package. */
function engines(manifest: string): Record<string, string> {
  return (
    (JSON.parse(manifest) as { engines?: Record<string, string> }).engines ?? {}
  );
}

describe("theme in a layer split into layers", function () {
  this.timeout(OP_TIMEOUT);

  beforeEach(() => {
    createThemeFixture();
  });

  afterEach(() => {
    destroyFixture();
  });

  it("writes to the last layer by name, the one the loader lets win", async () => {
    fs.mkdirSync(layerPath("layers/brand"), { recursive: true });
    fs.mkdirSync(layerPath("layers/core"), { recursive: true });
    writeLayerFile("layers/zz-notes.md", "Not a layer.\n");
    expectOk(
      await SetTheme(
        draft({ uploads: [upload("default", "light", PNG_LOGO, "image/png")] }),
      ),
      "SetTheme",
    );
    const theme = expectOk(await GetTheme(), "GetTheme");
    expect(theme.files).to.deep.equal({
      stylesheetPath: "layers/core/app/assets/css/theme.css",
      appConfigPath: "layers/core/app/app.config.ts",
      entryPath: "dms.frontend.ts",
      assetsDirectory: "layers/core/public/branding",
    });
    expect(theme.stylesheetImported).to.equal(true);
    expect(theme.colors).to.deep.equal({ primary: "violet" });
    expect(readLayerFile("dms.frontend.ts")).to.contain(
      'import "./layers/core/app/assets/css/theme.css";',
    );
    expect(readLayerFile("layers/core/app/assets/css/theme.css")).to.contain(
      "--ui-bg: #fafafa;",
    );
    expect(brandingFiles("layers/core/public/branding")).to.have.length(1);
    expect(theme.logos.default?.light).to.match(/^\/branding\/default-light-/);
    expect(readLayerFile("app/app.config.ts")).to.equal(APP_CONFIG_SOURCE);
    expect(fs.existsSync(layerPath("public"))).to.equal(false);
  });

  it("refuses a layers directory with no layer in it, which the loader reads alone", async () => {
    fs.mkdirSync(layerPath("layers"));
    const result = await GetTheme();
    expect(!result.ok && result.error.code).to.equal("unsupported");
  });
});

describe("theme layer creation", function () {
  this.timeout(OP_TIMEOUT);
  let app: Fixture;

  beforeEach(() => {
    app = createThemeFixture({ withLayer: false });
  });

  afterEach(() => {
    destroyFixture();
  });

  it("declares the loader releases the builder's own frontend module declares", () => {
    expect(
      engines(fs.readFileSync(FRONTEND_MANIFEST, "utf8"))[LOADER_PACKAGE],
    ).to.equal(FRONTEND_LOADER_RANGE);
    expectOk(scaffoldThemeLayer(), "scaffoldThemeLayer");
    expect(engines(readLayerFile("package.json"))).to.deep.equal({
      [LOADER_PACKAGE]: FRONTEND_LOADER_RANGE,
    });
  });

  it("takes the layer's files back when its registration cannot be written", () => {
    const entry = app.read("index.ts");
    const barrel = path.join(app.root, "src", "index.ts");
    const failure = new Error("disk full");
    const writeFileSync = fs.writeFileSync;
    Object.assign(fs, {
      writeFileSync: (...args: Parameters<typeof fs.writeFileSync>) => {
        if (args[0] === barrel) {
          throw failure;
        }
        writeFileSync(...args);
      },
    });
    try {
      expect(() => scaffoldThemeLayer()).to.throw(failure.message);
    } finally {
      Object.assign(fs, { writeFileSync });
    }
    expect(fs.existsSync(layerPath(""))).to.equal(false);
    expect(app.read("index.ts")).to.equal(entry);
  });
});
