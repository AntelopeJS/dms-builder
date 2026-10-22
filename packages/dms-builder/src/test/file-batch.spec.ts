import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import {
  FileBatch,
  type ErrorWithRollbackErrors,
} from "../implementations/dms-builder/engine/file-batch";

const BEFORE = "before\n";

let directory: string;

function at(relative: string): string {
  return path.join(directory, relative);
}

/** Every file and directory under the test directory, relative to it. */
function tree(): string[] {
  return fs
    .readdirSync(directory, { recursive: true, encoding: "utf8" })
    .sort();
}

/**
 * Run `body` with `fs.renameSync` throwing on the calls `fails` picks, by the
 * path renamed to and how many times that path was renamed to before.
 */
function withFailingRenames(
  fails: (target: string, attempt: number) => Error | undefined,
  body: () => void,
): void {
  const renameSync = fs.renameSync;
  const attempts = new Map<string, number>();
  Object.assign(fs, {
    renameSync: (from: fs.PathLike, to: fs.PathLike) => {
      const target = String(to);
      const attempt = attempts.get(target) ?? 0;
      attempts.set(target, attempt + 1);
      const failure = fails(target, attempt);
      if (failure) {
        throw failure;
      }
      renameSync(from, to);
    },
  });
  try {
    body();
  } finally {
    Object.assign(fs, { renameSync });
  }
}

function thrown(body: () => void): unknown {
  try {
    body();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
}

describe("file batch", () => {
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "file-batch-"));
    fs.writeFileSync(at("kept.txt"), BEFORE);
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("writes every file whole, leaving nothing else behind", () => {
    const batch = new FileBatch();
    batch.stageWrite(at("new/deep/a.txt"), "a");
    batch.stageWrite(at("kept.txt"), "after\n");
    expect(batch.flush().map((change) => change.kind)).to.deep.equal([
      "create",
      "modify",
    ]);
    expect(tree()).to.deep.equal([
      "kept.txt",
      "new",
      "new/deep",
      "new/deep/a.txt",
    ]);
    expect(fs.readFileSync(at("kept.txt"), "utf8")).to.equal("after\n");
  });

  it("puts back what it wrote and removes the directories it made when a write fails", () => {
    const batch = new FileBatch();
    batch.stageWrite(at("new/deep/a.txt"), "a");
    batch.stageWrite(at("kept.txt"), "after\n");
    batch.stageWrite(at("kept.txt/under/c.txt"), "c");
    const error = thrown(() => batch.flush());
    expect((error as NodeJS.ErrnoException).code).to.equal("ENOTDIR");
    expect(tree()).to.deep.equal(["kept.txt"]);
    expect(fs.readFileSync(at("kept.txt"), "utf8")).to.equal(BEFORE);
  });

  it("puts back every file it can, and throws the write's own error with what it could not", () => {
    const writeFailure = new Error("write failed");
    const restoreFailure = new Error("restore failed");
    const batch = new FileBatch();
    batch.stageWrite(at("new/a.txt"), "a");
    batch.stageWrite(at("kept.txt"), "after\n");
    batch.stageWrite(at("b.txt"), "b");
    let error: unknown;
    withFailingRenames(
      (target, attempt) => {
        if (target === at("b.txt")) {
          return writeFailure;
        }
        return target === at("kept.txt") && attempt === 1
          ? restoreFailure
          : undefined;
      },
      () => {
        error = thrown(() => batch.flush());
      },
    );
    expect(error).to.equal(writeFailure);
    expect((error as ErrorWithRollbackErrors).rollbackErrors).to.deep.equal([
      restoreFailure,
    ]);
    expect(fs.existsSync(at("new"))).to.equal(false);
    expect(tree().filter((name) => name.endsWith(".tmp"))).to.deep.equal([]);
  });

  it("puts back a flushed batch when its caller's next step fails", () => {
    const batch = new FileBatch();
    batch.stageWrite(at("new/a.txt"), "a");
    batch.stageRemoval(at("kept.txt"));
    batch.flush();
    expect(fs.existsSync(at("kept.txt"))).to.equal(false);
    expect(batch.rollback()).to.deep.equal([]);
    expect(tree()).to.deep.equal(["kept.txt"]);
    expect(fs.readFileSync(at("kept.txt"), "utf8")).to.equal(BEFORE);
  });
});
