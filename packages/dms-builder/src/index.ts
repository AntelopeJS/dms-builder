import path from "node:path";
import { ImplementInterface } from "@antelopejs/interface-core";
import { AddFrontendModule } from "@antelopejs/interface-dms/page";
import { type DmsBuilderConfig, isApiEnabled, setModuleConfig } from "./config";
import {
  FRONTEND_MODULE_CONFIG_KEY,
  FRONTEND_MODULE_DIR,
  FRONTEND_MODULE_NAME,
  FRONTEND_MODULE_PRIORITY,
} from "./constants/routes";

export type { BuilderApiConfig, DmsBuilderConfig } from "./config";

export async function construct(config?: DmsBuilderConfig): Promise<void> {
  setModuleConfig(config);
  void ImplementInterface(
    await import("@antelopejs/interface-dms-builder"),
    await import("./implementations/dms-builder"),
  );
  if (isApiEnabled()) {
    // The controller registers its routes as it is decorated, so importing it
    // is what mounts the API.
    await import("./routes");
  }
}

/**
 * The builder UI ships as a Vue frontend module. Registering it
 * from `start()` rather than `construct()` waits for the DMS module to be
 * connected, which is what serves the module to the frontend.
 */
export async function start(): Promise<void> {
  if (!isApiEnabled()) {
    return;
  }
  await AddFrontendModule({
    name: FRONTEND_MODULE_NAME,
    sourcePath: path.join(__dirname, FRONTEND_MODULE_DIR),
    renderer: { name: "vue", version: "3" },
    configKey: FRONTEND_MODULE_CONFIG_KEY,
    priority: FRONTEND_MODULE_PRIORITY,
  });
}
