export interface VerboseBookmark {
  name: string | null;
  address: string | null;
  path: string | null;
  hooked: string[];
}

export function parseVerboseListing(raw: string): VerboseBookmark[] {
  const lines = raw.split("\n");
  const blocks: string[][] = [[]];
  for (const line of lines) {
    if (line.trim() === "") {
      if (blocks[blocks.length - 1].length > 0) blocks.push([]);
    } else {
      blocks[blocks.length - 1].push(line);
    }
  }
  return blocks.filter((b) => b.length > 0).map((block) => parseBlock(block));
}

/**
 * Parse `hook find --output_format=verbose QUERY` output.
 *
 * find's verbose format differs from list's: it uses a "Search results for: X"
 * header, dashed separators, and Title: field names (instead of blank-line
 * separators and Name: field names).
 *
 * Records are separated by lines of 3+ dashes. The header line and the opening
 * short separator after it are skipped.
 *
 * Returns [] for empty input or input with only the header/no records.
 *
 * Hooked: section is not emitted by find, so hooked[] is always empty.
 */
export function parseVerboseFindListing(raw: string): VerboseBookmark[] {
  const lines = raw.split("\n");
  const records: VerboseBookmark[] = [];
  let current: Partial<VerboseBookmark> | null = null;

  for (const line of lines) {
    // Skip blank lines, the "Search results for:" header, and any dashed separator
    if (/^\s*$/.test(line)) continue;
    if (/^Search results for:/i.test(line)) continue;
    if (/^-{3,}\s*$/.test(line)) {
      // Separator — finalize current record if any, start a new one
      if (current && (current.name || current.address || current.path)) {
        records.push({
          name: current.name ?? null,
          address: current.address ?? null,
          path: current.path ?? null,
          hooked: [],
        });
      }
      current = null;
      continue;
    }
    if (!current) current = { name: null, address: null, path: null };
    const m = line.match(/^(Title|Name|Address|Path):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const value = m[2].trim() || null;
    if (key === "Title" || key === "Name") current.name = value;
    else if (key === "Address") current.address = value;
    else if (key === "Path") current.path = value;
  }
  // Flush any trailing record with no terminal separator
  if (current && (current.name || current.address || current.path)) {
    records.push({
      name: current.name ?? null,
      address: current.address ?? null,
      path: current.path ?? null,
      hooked: [],
    });
  }
  return records;
}

function parseBlock(block: string[]): VerboseBookmark {
  const out: VerboseBookmark = {
    name: null,
    address: null,
    path: null,
    hooked: [],
  };
  let inHooked = false;
  for (const line of block) {
    if (inHooked) {
      const m = line.match(/^\s*-\s*(\S.*)$/);
      if (m) {
        out.hooked.push(m[1].trim());
        continue;
      }
    }
    const h = line.match(/^(Name|Address|Path|Hooked):\s*(.*)$/);
    if (!h) continue;
    const key = h[1];
    const value = h[2].trim();
    if (key === "Name") out.name = value || null;
    else if (key === "Address") out.address = value || null;
    else if (key === "Path") out.path = value || null;
    else if (key === "Hooked") inHooked = true;
  }
  return out;
}
