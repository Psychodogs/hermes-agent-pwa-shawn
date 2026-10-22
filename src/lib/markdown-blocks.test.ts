import { describe, expect, it } from "vitest";
import { parseBlocks } from "./markdown-blocks";

describe("parseBlocks", () => {
  it("splits headings, prose and rules", () => {
    expect(parseBlocks("## Summary\nAll good.\nSecond line.\n\n---\n#### Deep")).toEqual([
      { type: "heading", level: 2, text: "Summary" },
      { type: "paragraph", text: "All good.\nSecond line." },
      { type: "rule" },
      { type: "heading", level: 3, text: "Deep" },
    ]);
  });

  it("keeps a numbered list together across blank lines", () => {
    expect(parseBlocks("1. one\n\n2. two\n3. three")).toEqual([
      {
        type: "list",
        ordered: true,
        start: 1,
        items: [{ text: "one" }, { text: "two" }, { text: "three" }],
      },
    ]);
  });

  it("nests one level and reads task items", () => {
    const [list] = parseBlocks("- [x] done\n  - child\n    continued\n- [ ] todo");
    expect(list).toEqual({
      type: "list",
      ordered: false,
      start: 1,
      items: [
        {
          text: "done",
          checked: true,
          children: {
            type: "list",
            ordered: false,
            start: 1,
            items: [{ text: "child\ncontinued" }],
          },
        },
        { text: "todo", checked: false },
      ],
    });
  });

  it("ends a list at prose that follows a blank line", () => {
    expect(parseBlocks("- a\n- b\n\nAfter.").map((b) => b.type)).toEqual([
      "list",
      "paragraph",
    ]);
  });

  it("reads pipe tables with alignment and pads ragged rows", () => {
    expect(parseBlocks("| A | B |\n|:--|--:|\n| 1 | 2 |\n| 3 |")).toEqual([
      {
        type: "table",
        header: ["A", "B"],
        align: ["left", "right"],
        rows: [
          ["1", "2"],
          ["3", ""],
        ],
      },
    ]);
  });

  it("leaves a half-streamed table as prose", () => {
    expect(parseBlocks("| A | B |")).toEqual([{ type: "paragraph", text: "| A | B |" }]);
  });

  it("parses quotes recursively", () => {
    expect(parseBlocks("> **Note**\n> - a")).toEqual([
      {
        type: "quote",
        blocks: [
          { type: "paragraph", text: "**Note**" },
          { type: "list", ordered: false, start: 1, items: [{ text: "a" }] },
        ],
      },
    ]);
  });

  it("never treats markup as anything but text", () => {
    expect(parseBlocks("<script>alert(1)</script>")).toEqual([
      { type: "paragraph", text: "<script>alert(1)</script>" },
    ]);
  });
});
