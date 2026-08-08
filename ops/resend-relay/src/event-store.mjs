import { createHash } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { join } from "node:path";

export class FileEventStore {
  constructor(directory) {
    this.directory = directory;
  }

  async initialize() {
    await mkdir(this.directory, { recursive: true, mode: 0o750 });
  }

  async has(eventId) {
    try {
      await readFile(this.path(eventId), "utf8");
      return true;
    } catch (error) {
      if (error?.code === "ENOENT") return false;
      throw error;
    }
  }

  async mark(eventId, details) {
    const handle = await open(this.path(eventId), "wx", 0o640).catch((error) => {
      if (error?.code === "EEXIST") return null;
      throw error;
    });
    if (!handle) return;
    try {
      await handle.writeFile(`${JSON.stringify(details)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  path(eventId) {
    const digest = createHash("sha256").update(eventId).digest("hex");
    return join(this.directory, `${digest}.json`);
  }
}
