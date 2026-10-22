/**
 * Block structure for generated Markdown: headings, lists, quotes, rules and
 * pipe tables.
 *
 * This is a tokenizer, not a renderer, and it never produces markup — the
 * thread turns these blocks into React elements and every text field still
 * goes through the inline-span renderer, so agent output cannot inject HTML.
 * Fenced code is split out before this runs (`splitFences` in Message.tsx).
 *
 * It is deliberately forgiving rather than CommonMark-exact. The input is a
 * chat reply that may still be streaming, so anything half-written — a table
 * with no separator row yet, a lone `#` — falls through to a paragraph and
 * snaps into shape once the rest arrives.
 */

export type Align = "left" | "center" | "right" | null;

export interface ListItem {
  text: string;
  /** set for `- [ ]` / `- [x]` task items */
  checked?: boolean;
  /** one level of nesting; anything deeper is flattened into it */
  children?: ListBlock;
}

export interface ListBlock {
  type: "list";
  ordered: boolean;
  start: number;
  items: ListItem[];
}

export type Block =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | ListBlock
  | { type: "quote"; blocks: Block[] }
  | { type: "rule" }
  | { type: "table"; header: string[]; align: Align[]; rows: string[][] };

const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const BULLET = /^(\s*)([-*+])\s+(.*)$/;
const ORDERED = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
const RULE = /^ {0,3}([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const TASK = /^\[([ xX])\]\s+(.*)$/;

interface Marker {
  indent: number;
  ordered: boolean;
  number: number;
  text: string;
}

function listMarker(line: string): Marker | null {
  const bullet = BULLET.exec(line);
  if (bullet) {
    return { indent: bullet[1].length, ordered: false, number: 1, text: bullet[3] };
  }
  const ordered = ORDERED.exec(line);
  if (ordered) {
    return {
      indent: ordered[1].length,
      ordered: true,
      number: Number(ordered[2]),
      text: ordered[3],
    };
  }
  return null;
}

function item(text: string): ListItem {
  const task = TASK.exec(text);
  if (task) return { text: task[2], checked: task[1] !== " " };
  return { text };
}

function splitRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|") && !row.endsWith("\\|")) row = row.slice(0, -1);
  // `\|` is a literal pipe inside a cell
  return row.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function alignment(cell: string): Align {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

function isTableStart(lines: string[], i: number): boolean {
  return (
    lines[i].includes("|") &&
    i + 1 < lines.length &&
    lines[i + 1].includes("-") &&
    TABLE_SEPARATOR.test(lines[i + 1])
  );
}

/** Whether `line` would open a block of its own rather than continue prose. */
function startsBlock(lines: string[], i: number): boolean {
  const line = lines[i];
  return (
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    listMarker(line) !== null ||
    isTableStart(lines, i)
  );
}

export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    // A rule is checked before lists: `* * *` and `- - -` are rules.
    if (RULE.test(line)) {
      blocks.push({ type: "rule" });
      i += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
      blocks.push({ type: "heading", level, text: heading[2] });
      i += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        inner.push(QUOTE.exec(lines[i])![1]);
        i += 1;
      }
      blocks.push({ type: "quote", blocks: parseBlocks(inner.join("\n")) });
      continue;
    }

    if (isTableStart(lines, i)) {
      const header = splitRow(line);
      const align = splitRow(lines[i + 1]).map(alignment);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        const cells = splitRow(lines[i]);
        // pad or trim to the header's width, so a ragged row can't skew columns
        rows.push(header.map((_, c) => cells[c] ?? ""));
        i += 1;
      }
      blocks.push({ type: "table", header, align, rows });
      continue;
    }

    const first = listMarker(line);
    if (first) {
      const list: ListBlock = {
        type: "list",
        ordered: first.ordered,
        start: first.number,
        items: [],
      };
      const base = first.indent;
      while (i < lines.length) {
        const current = lines[i];

        if (current.trim() === "") {
          // A blank line ends the list unless the next item carries on — models
          // often write "1. a\n\n2. b" and mean one list.
          let j = i + 1;
          while (j < lines.length && lines[j].trim() === "") j += 1;
          const next = j < lines.length ? listMarker(lines[j]) : null;
          if (next && (next.indent > base || next.ordered === list.ordered)) {
            i = j;
            continue;
          }
          break;
        }

        const marker = listMarker(current);
        if (marker && marker.indent > base && list.items.length > 0) {
          const parent = list.items[list.items.length - 1];
          parent.children ??= {
            type: "list",
            ordered: marker.ordered,
            start: marker.number,
            items: [],
          };
          parent.children.items.push(item(marker.text));
          i += 1;
          continue;
        }
        if (marker) {
          if (marker.ordered !== list.ordered) break;
          list.items.push(item(marker.text));
          i += 1;
          continue;
        }

        // An indented line continues the item above it; anything else that
        // isn't a new block is a lazy continuation of the same item.
        if (list.items.length > 0 && !startsBlock(lines, i)) {
          const last = list.items[list.items.length - 1];
          const target = last.children
            ? last.children.items[last.children.items.length - 1]
            : last;
          target.text += `\n${current.trim()}`;
          i += 1;
          continue;
        }
        break;
      }
      blocks.push(list);
      continue;
    }

    // Prose runs until a blank line or the start of another block. Single
    // newlines are kept — chat replies use them as line breaks.
    const paragraph: string[] = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() !== "" && !startsBlock(lines, i)) {
      paragraph.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join("\n").trim() });
  }

  return blocks;
}
