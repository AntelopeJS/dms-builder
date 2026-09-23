import { defineConfig } from "@antelopejs/interface-core/config";

const API_PORT = process.env.DMS_API_PORT ?? "5010";
const CLIENT_URL = process.env.DMS_CLIENT_BASE_URL ?? "http://localhost:3001";

/**
 * A local checkout of `AntelopeJS/dms` to load instead of the published
 * package. The four data blocks only declare `widget: "dataSource"` from
 * AntelopeJS/dms#15 onwards; against a published `@antelopejs/dms` their
 * `fetchUrl` still asks for the old `query` widget, and the source editor this
 * playground exists to exercise never appears. Point `DMS_MODULE_PATH` at that
 * checkout until the PR ships.
 */
const DMS_MODULE_PATH = process.env.DMS_MODULE_PATH;

const dmsSource = DMS_MODULE_PATH
  ? {
      type: "local" as const,
      path: DMS_MODULE_PATH,
      // Not `pnpm build`: it rebuilds `interface-dms` with a `rimraf dist`, and
      // the core loads that interface from the very `dist` being erased — the
      // module then fails to construct on a missing file. Compile in place, and
      // build the interface once beforehand.
      installCommand: [
        "pnpm exec tsc -p tsconfig.build.json",
        "pnpm exec tsc-alias -p tsconfig.build.json",
      ],
    }
  : {
      type: "package" as const,
      // Single-bound on purpose: the CLI passes this range to `npm pack`
      // through a shell without quoting it, so a range containing a space
      // ("\u003e=0.3.5 <1.0.0") is split into two arguments and the module fails
      // to load. Same resolution, one word.
      package: "@antelopejs/dms",
      version: "^0.3.5",
    };

export default defineConfig({
  name: "playground",
  logging: {
    channelFilter: {
      "*": "trace",
    },
  },
  modules: {
    // `dms` before the modules that read its interface: a shared interface
    // package binds to the context of whichever module requires it first, and
    // that binding dies with that module's generation. The module implementing
    // the interface has to come first.
    dms: {
      source: dmsSource,
      config: {
        apiBaseUrl: `http://localhost:${API_PORT}`,
        clientBaseUrl: CLIENT_URL,
        homepage: "/shop/board",
        meta: {
          title: "DMS Builder playground",
          description: "No-code data sources, end to end",
        },
        auth: {
          // Signs the DMS's own internal tokens, and is distinct from the
          // auth-jwt session secret below.
          jwtSecret: "dev",
        },
      },
    },

    // The module under development. `projectRoot` is what the builder rewrites:
    // every page, resource and query it writes lands in this playground's own
    // `src`, which is the point of running it here.
    "dms-builder": {
      source: {
        type: "local",
        path: "..",
        watchDir: ["src"],
        installCommand: ["pnpm build"],
        // Not `pnpm build`: that starts with `rimraf dist`, and the running
        // module is loaded from dist.
        reloadCommand: ["pnpm exec tsc -p tsconfig.build.json"],
      },
      config: {
        projectRoot: __dirname,
      },
    },

    // This playground's own module: the demo resource and the page holding the
    // card to configure (see src/).
    playground: {
      source: {
        type: "local",
        path: ".",
        watchDir: ["src"],
        installCommand: ["pnpm build"],
        reloadCommand: ["pnpm exec tsc -p tsconfig.build.json"],
      },
    },

    mongodb: {
      source: {
        type: "package",
        package: "@antelopejs/mongodb",
        version: "^1.3.0",
      },
      config: {
        url: "mongodb://localhost:27017",
        database: "dms_builder_playground",
      },
      importOverrides: [],
      disabledExports: [],
    },
    "auth-jwt": {
      source: {
        type: "package",
        package: "@antelopejs/auth-jwt",
        version: "^1.0.3",
      },
      config: {
        secret: "dev",
      },
    },
    api: {
      source: {
        type: "package",
        package: "@antelopejs/api",
        // Exact on purpose: 1.3.0 requires `@antelopejs/interface-core` 0.1,
        // and the playground's interfaces are on 0.0.13 — a caret range pulls
        // it in and the core refuses to construct any module. Lift the pin with
        // the move to interface-core 0.1.
        version: "1.2.5",
      },
      config: {
        servers: [{ protocol: "http", port: API_PORT }],
        cors: {
          allowedOrigins: [CLIENT_URL, "http://127.0.0.1:3001"],
        },
      },
    },
    // The DMS serves pages carrying file fields and OAuth flows through the
    // storage and mail modules, and fails on 500 without them.
    "file-storage-local": {
      source: {
        type: "package",
        package: "@antelopejs/file-storage-local",
        version: "^0.1.4",
      },
      config: {
        storagePath: ".antelope/file-storage",
        baseUrl: `http://127.0.0.1:${API_PORT}`,
        defaultVisibility: "private",
      },
    },
    nodemailer: {
      source: {
        type: "package",
        package: "@antelopejs/nodemailer",
        version: "^0.0.5",
      },
      config: {
        ethereal: true,
      },
    },
  },
});
