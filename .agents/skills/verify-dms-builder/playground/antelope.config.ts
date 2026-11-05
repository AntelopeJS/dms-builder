import { defineConfig } from "@antelopejs/interface-core/config";

const apiPort = process.env.PORT ?? "5010";
const dmsClientUrl = process.env.DMS_CLIENT_BASE_URL;

/**
 * `VERIFY_BUILDER_API` is `on` (the default, so a started build serves the
 * builder), `off`, or `follow-dev` for the module's own default.
 */
function builderApi(): { enabled: boolean } | undefined {
  const mode = process.env.VERIFY_BUILDER_API ?? "on";
  if (mode === "follow-dev") return undefined;
  return { enabled: mode !== "off" };
}

/**
 * The folder the builder edits: the playground itself, or the path
 * `VERIFY_BUILDER_PROJECT_ROOT` names (resolved by the module against the
 * process working directory when relative).
 */
function projectRoot(): string {
  return process.env.VERIFY_BUILDER_PROJECT_ROOT ?? __dirname;
}

/**
 * The repository's playground with the ports, origins, secrets and mail
 * `dms-control` sets for a run, the module under verification built from the
 * checkout, and a fixture module (`playground`) that forwards trusted calls to
 * the builder's interface.
 */
export default defineConfig({
  name: "verify-dms-builder",
  modules: {
    playground: {
      source: { type: "local", path: "." },
    },
    "dms-builder": {
      source: { type: "local", path: "../../../../packages/dms-builder" },
      config: { projectRoot: projectRoot(), api: builderApi() },
    },
    dms: {
      source: {
        type: "package",
        package: "@antelopejs/dms",
        version: ">=0.11.0 <1.0.0",
      },
      config: {
        apiBaseUrl: "${@api.API_PUBLIC_BASE_URL}",
        clientBaseUrl: dmsClientUrl,
        homepage: "/shop/board",
        meta: { title: "DMS Builder", description: "Builder verification" },
        auth: {
          jwtSecret: process.env.DMS_JWT_SECRET ?? "dev",
          signInCountry: { database: false },
        },
        htmlRender: {
          serviceSecret: process.env.DMS_HTML_RENDER_SECRET ?? "dev",
          renderEndpoint: dmsClientUrl && `${dmsClientUrl}/api/html/render`,
        },
        frontend: { bootstrapSecret: process.env.DMS_BOOTSTRAP_SECRET },
        docsPreview: true,
      },
    },
    mongodb: {
      source: {
        type: "package",
        package: "@antelopejs/mongodb",
        version: "^1.5.0",
      },
      config: {
        url: process.env.MONGO_URL ?? "mongodb://localhost:27017",
        database: process.env.MONGO_DATABASE ?? "verify_dms_builder",
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
      config: { secret: process.env.AUTH_JWT_SECRET ?? "dev" },
    },
    api: {
      source: {
        type: "package",
        package: "@antelopejs/api",
        version: "^1.5.0",
      },
      config: {
        servers: [{ protocol: "http", port: apiPort }],
        publicBaseUrl: dmsClientUrl,
        cors: { allowedOrigins: [dmsClientUrl ?? "http://localhost:3001"] },
      },
    },
    "file-storage-local": {
      source: {
        type: "package",
        package: "@antelopejs/file-storage-local",
        version: ">=0.1.13 <1.0.0",
      },
      config: {
        storagePath: ".antelope/file-storage",
        baseUrl: `http://127.0.0.1:${apiPort}`,
        defaultVisibility: "private",
      },
    },
    nodemailer: {
      source: {
        type: "package",
        package: "@antelopejs/nodemailer",
        version: ">=0.0.6 <1.0.0",
      },
      config: {
        host: "127.0.0.1",
        port: Number(process.env.DMS_SMTP_PORT ?? "9"),
      },
    },
  },
});
