import { antelopeKnipConfig } from "@antelopejs/tooling-configs/knip";

export default antelopeKnipConfig({
  // Registers the built-in query templates (`count`, `aggregate`) as a side
  // effect of being loaded, so no import binding reaches it. It is not dead
  // code: the helpers it pulls from `query-chain` and `query-template` only
  // have this module as a consumer.
  entry: ["src/implementations/dms-builder/engine/query-template-emit.ts"],
  // The front end is a nested package with its own manifest and its own test
  // runner; its dependencies are checked from there.
  ignore: ["frontend-vue/**"],
});
