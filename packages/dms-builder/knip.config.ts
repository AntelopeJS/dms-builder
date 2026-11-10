import { antelopeKnipConfig } from "@antelopejs/tooling-configs/knip";
import type { KnipConfig } from "knip";

const config: KnipConfig = antelopeKnipConfig({
  /**
   * The front end is a nested package with its own manifest and its own test
   * runner; its dependencies are checked from there.
   */
  ignore: ["frontend-vue/**"],
});

export default config;
