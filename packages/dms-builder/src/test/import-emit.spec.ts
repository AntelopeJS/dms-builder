import { expect } from "chai";
import { IndentationText, Project, type SourceFile } from "ts-morph";
import { applyImportRef } from "../implementations/dms-builder/engine/emit";

const MODULE = "@antelopejs/interface-dms/base";

function fileWith(text: string): SourceFile {
  const project = new Project({
    useInMemoryFileSystem: true,
    manipulationSettings: { indentationText: IndentationText.TwoSpaces },
  });
  return project.createSourceFile("page.ts", text);
}

function add(file: SourceFile, ...names: string[]): string {
  for (const name of names) {
    applyImportRef(file, { name, module: MODULE });
  }
  return file.getFullText();
}

/**
 * What the builder leaves behind in an import it had to extend.
 *
 * Generated code lands in the author's own file, beside imports they wrote, and
 * a declaration the builder mangled is a diff they did not ask for — or, worse,
 * a file that no longer parses.
 */
describe("extending an import", () => {
  it("keeps a declaration on one line while it fits", () => {
    const file = fileWith('import { Grid } from "./grid";\n');
    expect(add(file, "chartCardData", "ChartCardData")).to.contain(
      'import { ChartCardData, chartCardData } from "@antelopejs/interface-dms/base";',
    );
  });

  it("lays a grown declaration out again instead of splicing into it", () => {
    // ts-morph adds the name to the line its neighbour sits on, which on a
    // declaration already broken across lines leaves the rest of the list and
    // the `from` clause hanging off the last name.
    const file = fileWith(
      `import {\n  ChartArea,\n  ChartCard,\n  PeriodSelector,\n} from "${MODULE}";\n`,
    );
    const text = add(file, "chartCardData");

    expect(text).to.contain(`\n} from "${MODULE}";`);
    for (const line of text.split("\n")) {
      expect(
        line.length,
        `"${line}" stays inside the line budget`,
      ).to.be.at.most(80);
    }
  });

  it("places a name past the first among several", () => {
    // The position is the name's place among the named imports; counting the
    // specifier's child index counts the commas too, and overruns the list.
    const file = fileWith(
      `import { ChartArea, ChartCard } from "${MODULE}";\n`,
    );
    const text = add(file, "chartCardData", "ChartCardData");

    expect(text).to.contain("ChartCardData");
    expect(text).to.contain("chartCardData");
    expect(text.indexOf("ChartCardData")).to.be.lessThan(
      text.indexOf("chartCardData"),
    );
  });
});
