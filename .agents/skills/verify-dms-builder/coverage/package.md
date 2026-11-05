# Coverage: package

Docs: `2.installation.md`, `1.introduction.md`. Journeys: `journeys/package.mjs`.

| Source | Documented behaviour | Journey | Check / Not driven |
| --- | --- | --- | --- |
| dms-builder/docs/2.installation.md:7 | ajs project modules add installs the module |  -  | Not driven: a registry install is developer tooling |
| packages/dms-builder/package.json | the module ships its build, frontend layer, skill, README and licence and not its tests | the-module-and-the-interface-tarballs-hold-what-their-manifests-name | npm pack file list |
| packages/interface-dms-builder/package.json | the interface ships its build and docs; the module depends on it within the compatibility range | same | docs count; no src; range >=0.3.0 <0.4.0 |
| dms-builder/docs/5.extending.md:117 | the skill declared under antelopeJs.skills | the-skill-cases-name-existing-skills | manifest, frontmatter, unique case ids |
