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
 *
 * Returns (JSON): string[] — the new tag array after the removal.
 *
 * Throws (non-zero exit) if the path is not a known bookmark.
 */
export const TEMPLATE_REMOVE_TAGS = `
function run(argv) {
  const targetPath = argv[0];
  const toRemove = argv[1].split(",").map((t) => t.trim());
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
