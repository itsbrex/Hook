// tests/changelog.test.ts
import { describe, expect, it, vi } from "vitest";
import { diffSpecs, renderChangelogHtml, openInBrowser } from "../src/changelog";
import type { HookCliSpec } from "../src/specTypes";

const BASE: HookCliSpec = {
  generatedAt: "2026-04-20T00:00:00.000Z",
  hookVersion: "2.1.3",
  subcommands: [
    { name: "clip", usage: "hook clip ITEM", description: "Old desc", options: [] },
  ],
};

const NEXT: HookCliSpec = {
  ...BASE,
  generatedAt: "2026-04-21T00:00:00.000Z",
  subcommands: [
    { name: "clip", usage: "hook clip ITEM", description: "New desc", options: [{ short: "-m", long: "--markdown", description: "Md link" }] },
    { name: "pin",  usage: "hook pin ITEM",  description: "Pin ITEM.", options: [] },
  ],
};

describe("diffSpecs", () => {
  it("detects added subcommands, added options, and description changes", () => {
    const diff = diffSpecs(BASE, NEXT);
    expect(diff.addedSubcommands).toEqual(["pin"]);
    expect(diff.removedSubcommands).toEqual([]);
    expect(diff.changedSubcommands).toEqual([
      { name: "clip", addedOptions: ["--markdown"], removedOptions: [], descriptionChanged: true },
    ]);
    expect(diff.hasChanges).toBe(true);
  });
});

describe("renderChangelogHtml", () => {
  it("produces HTML containing the diff summary", () => {
    const html = renderChangelogHtml(diffSpecs(BASE, NEXT), NEXT);
    expect(html).toContain("<html");
    expect(html).toContain("pin");
    expect(html).toContain("--markdown");
  });
});

describe("openInBrowser", () => {
  it("does nothing when autoOpen is false", async () => {
    const spawn = vi.fn();
    await openInBrowser("http://127.0.0.1:3801/changelog", { autoOpen: false, spawn });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("spawns `open` on darwin when autoOpen is true", async () => {
    const spawn = vi.fn();
    await openInBrowser("http://127.0.0.1:3801/changelog", { autoOpen: true, spawn, platform: "darwin" });
    expect(spawn).toHaveBeenCalledWith("open", ["http://127.0.0.1:3801/changelog"]);
  });
});
