import { antelopeKnipConfig } from "@antelopejs/tooling-configs/knip";

export default antelopeKnipConfig({
  // The front end is a nested package with its own manifest and its own test
  // runner; its dependencies are checked from there.
  ignore: ["frontend-vue/**"],
  // The preset's entry points cover `*.test.ts`, the suites the Antelope CLI
  // runs inside a live module. The engine needs no runtime to be driven, so its
  // suites are plain mocha specs — and a spec Knip cannot see makes its own
  // test dependencies read as unused.
  entry: ["src/test/**/*.spec.ts"],
});
