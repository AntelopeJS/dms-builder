import type { DmsFrontendModule } from "#dms/frontend-module";

/**
 * The playground's own frontend layer. It registers nothing yet: it is where
 * the builder's theme editor writes the project's theme, as it would in any
 * project that ships a layer of its own.
 */
const playgroundFrontend: DmsFrontendModule = {
  setup() {},
};

export default playgroundFrontend;
