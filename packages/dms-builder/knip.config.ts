import { antelopeKnipConfig } from "@antelopejs/tooling-configs/knip";

export default antelopeKnipConfig({
  // The front end is a nested package with its own manifest and its own test
  // runner; its dependencies are checked from there.
  ignore: ["frontend-vue/**"],
});
