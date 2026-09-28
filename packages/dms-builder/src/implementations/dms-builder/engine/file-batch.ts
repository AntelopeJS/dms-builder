import fs from "node:fs";
import path from "node:path";
import type { FileChange } from "@antelopejs/interface-dms-builder";
import { diffText } from "./writable";

/** What a file is written with: text, or the bytes of a binary asset. */
type FileContent = string | Buffer;

/** A file as it stood before the batch touched it, to put back on failure. */
interface FileSnapshot {
  path: string;
  before: Buffer | undefined;
}

function readBytes(filePath: string): Buffer | undefined {
  try {
    return fs.readFileSync(filePath);
  } catch {
    return undefined;
  }
}

function toBytes(content: FileContent): Buffer {
  return typeof content === "string" ? Buffer.from(content, "utf8") : content;
}

function restore(snapshot: FileSnapshot): void {
  if (snapshot.before === undefined) {
    fs.rmSync(snapshot.path, { force: true });
    return;
  }
  fs.writeFileSync(snapshot.path, snapshot.before);
}

function describeChange(
  filePath: string,
  before: Buffer | undefined,
  content: FileContent | null,
): FileChange {
  const kind = content === null ? "delete" : before ? "modify" : "create";
  if (content === null) {
    return { path: filePath, kind, diff: "" };
  }
  const diff =
    typeof content === "string"
      ? diffText(before?.toString("utf8") ?? "", content)
      : `binary file, ${content.length} bytes`;
  return { path: filePath, kind, diff };
}

/**
 * Files written together or not at all: text and binary alike, outside the
 * TypeScript project a `Transaction` stages. Nothing touches the disk until
 * `flush`, a file whose content would not change is left alone, and a write
 * that fails part way puts back every file the batch had already written.
 */
export class FileBatch {
  private readonly staged = new Map<string, FileContent | null>();

  public write(filePath: string, content: FileContent): void {
    this.staged.set(filePath, content);
  }

  public remove(filePath: string): void {
    this.staged.set(filePath, null);
  }

  public flush(): FileChange[] {
    const written: FileSnapshot[] = [];
    const changes: FileChange[] = [];
    try {
      for (const [filePath, content] of this.staged) {
        const change = this.apply(filePath, content, written);
        if (change) {
          changes.push(change);
        }
      }
    } catch (error) {
      written.reverse().forEach(restore);
      throw error;
    }
    return changes;
  }

  private apply(
    filePath: string,
    content: FileContent | null,
    written: FileSnapshot[],
  ): FileChange | undefined {
    const before = readBytes(filePath);
    const unchanged =
      content === null
        ? before === undefined
        : before?.equals(toBytes(content));
    if (unchanged) {
      return undefined;
    }
    written.push({ path: filePath, before });
    if (content === null) {
      fs.rmSync(filePath, { force: true });
    } else {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, toBytes(content));
    }
    return describeChange(filePath, before, content);
  }
}
