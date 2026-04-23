/**
 * JXA (JavaScript for Automation) source templates for querying Hookmark.
 *
 * Each template is a string that can be passed to `osascript -l JavaScript`.
 * All templates end by returning a `JSON.stringify(...)` result so the caller
 * can `JSON.parse(stdout)` without any hand-rolled parser.
 *
 * JXA accesses Hookmark's scripting dictionary via `Application("Hookmark")`.
 * Property accessors require function invocation (e.g. `b.name()`, not `b.name`).
 *
 * Templates that require arguments use a `run(argv)` entry point; osascript
 * invokes `run()` automatically when defined, passing CLI args as `argv`.
 */

/**
 * Enumerate every bookmark in Hookmark.
 *
 * Returns (JSON): Array<{ name, path, address, tags, hookedCount }>
 */
export const TEMPLATE_ALL_BOOKMARKS = `
(() => {
  const hook = Application("Hookmark");
  const out = hook.bookmarks().map((b) => ({
    name: b.name(),
    path: b.path(),
    address: b.address(),
    tags: b.tags(),
    hookedCount: b.hookedBookmarks().length,
  }));
  return JSON.stringify(out);
})();
`.trim();

/**
 * Fetch a single bookmark by its file path (argv[0]).
 *
 * Returns (JSON): { name, path, address, tags, hookedCount }
 *
 * Throws (non-zero exit) if the path is not a known bookmark.
 */
export const TEMPLATE_BOOKMARK_BY_PATH = `
function run(argv) {
  const targetPath = argv[0];
  const hook = Application("Hookmark");
  const matches = hook.bookmarks.whose({path: targetPath})();
  if (matches.length === 0) {
    throw new Error("No bookmark found for path: " + targetPath);
  }
  const b = matches[0];
  return JSON.stringify({
    name: b.name(),
    path: b.path(),
    address: b.address(),
    tags: b.tags(),
    hookedCount: b.hookedBookmarks().length,
  });
}
`.trim();

/**
 * Count all bookmarks.
 *
 * Returns (JSON): number
 */
export const TEMPLATE_COUNT_BOOKMARKS = `
(() => {
  return JSON.stringify(Application("Hookmark").bookmarks().length);
})();
`.trim();

/**
 * Check whether a bookmark exists for a given path (argv[0]).
 *
 * Returns (JSON): boolean
 *
 * Uses JXA's `whose` filter — returns `true` iff Hookmark has at
 * least one bookmark matching the given path.
 */
export const TEMPLATE_EXISTS_BOOKMARK = `
function run(argv) {
  const matches = Application("Hookmark").bookmarks.whose({path: argv[0]})();
  return JSON.stringify(matches.length > 0);
}
`.trim();

/**
 * Get the tags for a bookmark identified by its file path (argv[0]).
 *
 * Returns (JSON): string[]
 *
 * Throws (non-zero exit) if the path is not a known bookmark.
 */
export const TEMPLATE_GET_TAGS = `
function run(argv) {
  const targetPath = argv[0];
  const hook = Application("Hookmark");
  const matches = hook.bookmarks.whose({path: targetPath})();
  if (matches.length === 0) {
    throw new Error("No bookmark found for path: " + targetPath);
  }
  return JSON.stringify(matches[0].tags());
}
`.trim();

/**
 * Replace the tags on a bookmark (argv[0]=path, argv[1]=csv of tags).
 *
 * Returns (JSON): string[] — the new tag array after the replacement.
 *
 * Throws (non-zero exit) if the path is not a known bookmark.
 *
 * JXA write pattern: `b.tags = [...]` (property assignment, no parens).
 */
export const TEMPLATE_SET_TAGS = `
function run(argv) {
  const targetPath = argv[0];
  const newTags = argv[1].split(",").map((t) => t.trim()).filter((t) => t.length > 0);
  const hook = Application("Hookmark");
  const matches = hook.bookmarks.whose({path: targetPath})();
  if (matches.length === 0) {
    throw new Error("No bookmark found for path: " + targetPath);
  }
  const b = matches[0];
  b.tags = newTags;
  return JSON.stringify(b.tags());
}
`.trim();

/**
 * Add tags to a bookmark (argv[0]=path, argv[1]=csv of tags to add).
 * Existing tags are preserved; duplicate tags are silently skipped.
 *
 * Returns (JSON): string[] — the new tag array after the union-merge.
 *
 * Throws (non-zero exit) if the path is not a known bookmark.
 */
export const TEMPLATE_ADD_TAGS = `
function run(argv) {
  const targetPath = argv[0];
  const toAdd = argv[1].split(",").map((t) => t.trim()).filter((t) => t.length > 0);
  const hook = Application("Hookmark");
  const matches = hook.bookmarks.whose({path: targetPath})();
  if (matches.length === 0) {
    throw new Error("No bookmark found for path: " + targetPath);
  }
  const b = matches[0];
  const current = b.tags();
  const merged = current.concat(toAdd.filter((t) => !current.includes(t)));
  b.tags = merged;
  return JSON.stringify(b.tags());
}
`.trim();

/**
 * Remove tags from a bookmark (argv[0]=path, argv[1]=csv of tags to remove).
 * Tags not present on the bookmark are silently ignored.
 * Empty tokens in the CSV are silently ignored.
 *
 * Returns (JSON): string[] — the new tag array after the removal.
 *
 * Throws (non-zero exit) if the path is not a known bookmark.
 */
export const TEMPLATE_REMOVE_TAGS = `
function run(argv) {
  const targetPath = argv[0];
  const toRemove = argv[1].split(",").map((t) => t.trim()).filter((t) => t.length > 0);
  const hook = Application("Hookmark");
  const matches = hook.bookmarks.whose({path: targetPath})();
  if (matches.length === 0) {
    throw new Error("No bookmark found for path: " + targetPath);
  }
  const b = matches[0];
  const updated = b.tags().filter((t) => !toRemove.includes(t));
  b.tags = updated;
  return JSON.stringify(b.tags());
}
`.trim();

/**
 * Rename a bookmark identified by path (argv[0]=path, argv[1]=newName).
 *
 * Returns (JSON): { name, path, address } — post-rename values.
 *
 * Throws (non-zero exit) if the path is not a known bookmark.
 *
 * JXA write pattern: `b.name = "new"` (property assignment, no parens).
 */
export const TEMPLATE_RENAME_BOOKMARK = `
function run(argv) {
  const targetPath = argv[0];
  const newName = argv[1];
  const hook = Application("Hookmark");
  const matches = hook.bookmarks.whose({path: targetPath})();
  if (matches.length === 0) {
    throw new Error("No bookmark found for path: " + targetPath);
  }
  const b = matches[0];
  b.name = newName;
  return JSON.stringify({
    name: b.name(),
    path: b.path(),
    address: b.address(),
  });
}
`.trim();

/**
 * Create a new bookmark (argv[0]=name, argv[1]=address, argv[2]=optional csv tags).
 *
 * Returns (JSON): { name, path, address }
 *
 * Calls \`hook.make({ new: "bookmark", withProperties: { address } })\` and
 * captures the returned bookmark object. Hookmark IGNORES \`name\` and \`tags\`
 * passed via \`withProperties\` — it derives the name from the file and applies
 * no tags — so we apply them afterwards via property assignment on the
 * returned bookmark. The file at \`address\` must already exist on disk.
 *
 * JXA write pattern: \`b.name = "..."\` and \`b.tags = [...]\` (no parens).
 */
export const TEMPLATE_MAKE_BOOKMARK = `
function run(argv) {
  const name = argv[0];
  const address = argv[1];
  const tagsCsv = argv[2];
  const hook = Application("Hookmark");
  const b = hook.make({ new: "bookmark", withProperties: { address: address } });
  if (name && name.length > 0) {
    b.name = name;
  }
  if (tagsCsv && tagsCsv.length > 0) {
    const parsedTags = tagsCsv.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
    if (parsedTags.length > 0) {
      b.tags = parsedTags;
    }
  }
  return JSON.stringify({
    name: b.name(),
    path: b.path(),
    address: b.address(),
  });
}
`.trim();

/**
 * Hook (link) two bookmarks by their paths (argv[0]=pathA, argv[1]=pathB).
 *
 * Returns (JSON): "ok"
 *
 * Throws (non-zero exit) if either path is not a known bookmark.
 *
 * Uses JXA shape \`hook.hook(bA, { and: bB })\` where both bookmarks are
 * resolved via \`whose({path})()\`.
 */
export const TEMPLATE_HOOK_BOOKMARKS = `
function run(argv) {
  const pathA = argv[0];
  const pathB = argv[1];
  const hook = Application("Hookmark");
  const matchesA = hook.bookmarks.whose({path: pathA})();
  if (matchesA.length === 0) {
    throw new Error("No bookmark found for path: " + pathA);
  }
  const matchesB = hook.bookmarks.whose({path: pathB})();
  if (matchesB.length === 0) {
    throw new Error("No bookmark found for path: " + pathB);
  }
  const bA = matchesA[0];
  const bB = matchesB[0];
  hook.hook(bA, { and: bB });
  return JSON.stringify("ok");
}
`.trim();

/**
 * Unhook (unlink) two bookmarks by their paths (argv[0]=pathA, argv[1]=pathB).
 *
 * Returns (JSON): "ok"
 *
 * Throws (non-zero exit) if either path is not a known bookmark.
 *
 * Uses JXA shape \`hook.unhook(bA, { and: bB })\` where both bookmarks are
 * resolved via \`whose({path})()\`.
 */
export const TEMPLATE_UNHOOK_BOOKMARKS = `
function run(argv) {
  const pathA = argv[0];
  const pathB = argv[1];
  const hook = Application("Hookmark");
  const matchesA = hook.bookmarks.whose({path: pathA})();
  if (matchesA.length === 0) {
    throw new Error("No bookmark found for path: " + pathA);
  }
  const matchesB = hook.bookmarks.whose({path: pathB})();
  if (matchesB.length === 0) {
    throw new Error("No bookmark found for path: " + pathB);
  }
  const bA = matchesA[0];
  const bB = matchesB[0];
  hook.unhook(bA, { and: bB });
  return JSON.stringify("ok");
}
`.trim();

/**
 * Get a bookmark representing the frontmost window's current item.
 *
 * Returns (JSON):
 *   - { kind: "bookmark", name, path, address } when the frontmost app
 *     exposes a bookmark synchronously.
 *   - { kind: "request_handle", handle } when the frontmost app is an
 *     x-callback app (e.g. Mail, DEVONthink) and Hookmark returns a
 *     string handle that must be resolved later via
 *     \`bookmarkByRequestHandle\`.
 *   - { kind: "unknown" } if the return value can't be read as either.
 *
 * The async-handle return type is a documented Hookmark behavior: for some
 * frontmost apps the bookmark isn't available synchronously and Hookmark
 * returns a string request handle instead of a bookmark object. We use
 * \`typeof result === "string"\` to distinguish.
 */
export const TEMPLATE_FROM_ACTIVE_WINDOW = `
(() => {
  const hook = Application("Hookmark");
  const result = hook.bookmarkFromActiveWindow();
  if (typeof result === "string") {
    return JSON.stringify({ kind: "request_handle", handle: result });
  }
  try {
    return JSON.stringify({
      kind: "bookmark",
      name: result.name(),
      path: result.path(),
      address: result.address(),
    });
  } catch (e) {
    return JSON.stringify({ kind: "unknown" });
  }
})();
`.trim();

/**
 * Resolve a bookmark previously returned as a string request handle by
 * \`bookmarkFromActiveWindow\` (argv[0]=handleId).
 *
 * Returns (JSON): { name, path, address }
 *
 * Throws (non-zero exit) if Hookmark can't resolve the handle.
 *
 * JXA mapping: AppleScript's \`bookmark by request handle X\` becomes
 * \`hook.bookmarkByRequestHandle(x)\`.
 */
export const TEMPLATE_BY_REQUEST_HANDLE = `
function run(argv) {
  const handleId = argv[0];
  const hook = Application("Hookmark");
  const b = hook.bookmarkByRequestHandle(handleId);
  return JSON.stringify({
    name: b.name(),
    path: b.path(),
    address: b.address(),
  });
}
`.trim();

/**
 * Find all bookmarks that have ALL of the given tags (argv[0]=csv of tags).
 *
 * Uses `hook.bookmarksWithTags([...])` with a positional array argument —
 * the only verified-working form. The `whose` filter with tag arrays is
 * known to throw "Illegal comparison" and must not be used.
 *
 * Returns (JSON): Array<{ name, path, address }>
 */
export const TEMPLATE_BOOKMARKS_WITH_TAGS = `
function run(argv) {
  const tags = argv[0].split(",").map((t) => t.trim()).filter((t) => t.length > 0);
  const hook = Application("Hookmark");
  const results = hook.bookmarksWithTags(tags);
  const out = results.map((b) => ({
    name: b.name(),
    path: b.path(),
    address: b.address(),
  }));
  return JSON.stringify(out);
}
`.trim();
