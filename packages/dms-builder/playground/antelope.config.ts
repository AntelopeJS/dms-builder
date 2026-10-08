import { defineConfig } from "@antelopejs/interface-core/config";

const API_PORT = process.env.DMS_API_PORT ?? "5010";
const CLIENT_URL = process.env.DMS_CLIENT_BASE_URL ?? "http://localhost:3001";

/**
 * A local checkout of `AntelopeJS/dms` to load instead of the published
 * package, for trying the builder against DMS changes that are not released
 * yet.
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
      installCommand: ["pnpm exec tsc", "pnpm exec tsc-alias"],
    }
  : {
      type: "package" as const,
      package: "@antelopejs/dms",
      // Capped below the next minor: a cold start fetches the newest release
      // in range, and each DMS minor needs its own `@antelopejs/dms-frontend`
      // (0.6 ↔ 0.5), pinned in package.json.
      version: ">=0.6.0 <0.7.0",
    };

export default defineConfig({
  name: "playground",
  logging: {
    channelFilter: {
      "*": "trace",
    },
  },
  modules: {
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
        reloadCommand: ["pnpm exec tsc"],
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
        version: "^1.4.2",
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
        version: "^1.3.1",
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
        version: ">=0.1.4 <1.0.0",
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
        version: ">=0.0.5 <1.0.0",
      },
      config: {
        ethereal: true,
      },
    },
  },
});
