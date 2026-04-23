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
