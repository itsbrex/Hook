/**
 * Virtual subcommands backed by JXA (osascript -l JavaScript) templates.
 *
 * Each entry describes a Hookmark operation that is dispatched via
 * `osascript` rather than the `hook` CLI. The dispatcher in Phase 3.2
 * invokes the template and then `JSON.parse(stdout)` — no bespoke parser
 * is required, so `appleScriptParser` is intentionally omitted.
 */

import type { HookSubcommand } from "../specTypes.js";
import {
  TEMPLATE_ALL_BOOKMARKS,
  TEMPLATE_BOOKMARK_BY_PATH,
  TEMPLATE_COUNT_BOOKMARKS,
  TEMPLATE_EXISTS_BOOKMARK,
  TEMPLATE_GET_TAGS,
  TEMPLATE_SET_TAGS,
  TEMPLATE_ADD_TAGS,
  TEMPLATE_REMOVE_TAGS,
  TEMPLATE_BOOKMARKS_WITH_TAGS,
  TEMPLATE_RENAME_BOOKMARK,
  TEMPLATE_MAKE_BOOKMARK,
  TEMPLATE_HOOK_BOOKMARKS,
  TEMPLATE_UNHOOK_BOOKMARKS,
  TEMPLATE_FROM_ACTIVE_WINDOW,
  TEMPLATE_BY_REQUEST_HANDLE,
} from "./templates.js";

function sub(
  name: string,
  usage: string,
  description: string,
  template: string,
): HookSubcommand {
  return {
    name,
    usage,
    description,
    options: [],
    source: "osascript",
    appleScriptSource: template,
  };
}

export function buildAppleScriptSubcommands(): HookSubcommand[] {
  return [
    sub(
      "all_bookmarks",
      "hookmark all bookmarks",
      "Return every bookmark in Hookmark (JXA).",
      TEMPLATE_ALL_BOOKMARKS,
    ),
    sub(
      "bookmark",
      "hookmark bookmark FILE_OR_URL",
      "Look up a single bookmark by path/URL and return name/path/address (JXA).",
      TEMPLATE_BOOKMARK_BY_PATH,
    ),
    sub(
      "count_bookmarks",
      "hookmark count bookmarks",
      "Return the total count of bookmarks (JXA).",
      TEMPLATE_COUNT_BOOKMARKS,
    ),
    sub(
      "exists_bookmark",
      "hookmark exists bookmark FILE_OR_URL",
      "Return whether Hookmark knows about a bookmark at the given path/URL (JXA).",
      TEMPLATE_EXISTS_BOOKMARK,
    ),
    sub(
      "get_tags",
      "hookmark get tags FILE_OR_URL",
      "Return the tags array for a bookmark (JXA).",
      TEMPLATE_GET_TAGS,
    ),
    sub(
      "set_tags",
      "hookmark set tags FILE_OR_URL TAGS",
      "Replace tags for a bookmark. TAGS is a comma-separated list (JXA).",
      TEMPLATE_SET_TAGS,
    ),
    sub(
      "add_tags",
      "hookmark add tags FILE_OR_URL TAGS",
      "Add tags to a bookmark (union with existing). TAGS is comma-separated (JXA).",
      TEMPLATE_ADD_TAGS,
    ),
    sub(
      "remove_tags",
      "hookmark remove tags FILE_OR_URL TAGS",
      "Remove tags from a bookmark. TAGS is comma-separated (JXA).",
      TEMPLATE_REMOVE_TAGS,
    ),
    sub(
      "bookmarks_with_tags",
      "hookmark bookmarks with tags TAGS",
      "Return bookmarks that carry all of the given tags. TAGS is comma-separated (JXA).",
      TEMPLATE_BOOKMARKS_WITH_TAGS,
    ),
    sub(
      "rename_bookmark",
      "hookmark rename bookmark FILE_OR_URL NEW_NAME",
      "Rename a bookmark (sets name property) (JXA).",
      TEMPLATE_RENAME_BOOKMARK,
    ),
    sub(
      "make_bookmark",
      "hookmark make bookmark NAME ADDRESS [TAGS]",
      "Create a new bookmark with name+address and optional comma-separated TAGS (JXA).",
      TEMPLATE_MAKE_BOOKMARK,
    ),
    sub(
      "hook_bookmarks",
      "hookmark hook FILE_OR_URL_A FILE_OR_URL_B",
      "Hook two items by path/URL (JXA).",
      TEMPLATE_HOOK_BOOKMARKS,
    ),
    sub(
      "unhook_bookmarks",
      "hookmark unhook FILE_OR_URL_A FILE_OR_URL_B",
      "Unhook two items by path/URL (JXA).",
      TEMPLATE_UNHOOK_BOOKMARKS,
    ),
    sub(
      "from_active_window",
      "hookmark from active window",
      "Return a bookmark for the currently active window — or a request handle for x-callback apps (JXA).",
      TEMPLATE_FROM_ACTIVE_WINDOW,
    ),
    sub(
      "by_request_handle",
      "hookmark by request handle HANDLE_ID",
      "Resolve an async request handle returned by `from_active_window` (JXA).",
      TEMPLATE_BY_REQUEST_HANDLE,
    ),
  ];
}
