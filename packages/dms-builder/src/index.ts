import { ImplementInterface } from "@antelopejs/interface-core";
import { AddFrontendModule } from "@antelopejs/interface-dms/page";
import {
  type DmsBuilderConfig,
  getModuleConfig,
  isBuilderEnabled,
  setModuleConfig,
} from "./config";
import { GetRuntimeInfo } from "@antelopejs/interface-core/runtime";
import { frontendModule } from "./frontend-module";

export type { BuilderApiConfig, DmsBuilderConfig } from "./config";

export async function construct(config?: DmsBuilderConfig): Promise<void> {
  setModuleConfig(config);
  void ImplementInterface(
    await import("@antelopejs/interface-dms-builder"),
    await import("./implementations/dms-builder"),
  );
  if (await isBuilderEnabled()) {
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
  const { dev } = await GetRuntimeInfo();
  const registration = frontendModule(getModuleConfig(), { dev });
  if (registration) await AddFrontendModule(registration);
}
