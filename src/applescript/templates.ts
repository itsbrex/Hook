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
  const b = hook.bookmarkFrom(targetPath);
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
 * Wraps lookup in try/catch so a missing bookmark yields `false`
 * rather than a non-zero exit.
 */
export const TEMPLATE_EXISTS_BOOKMARK = `
function run(argv) {
  try {
    Application("Hookmark").bookmarkFrom(argv[0]);
    return JSON.stringify(true);
  } catch (e) {
    return JSON.stringify(false);
  }
}
`.trim();
