import type { List, PhrasingContent, Root, RootContent, Table } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { ParsedBlock, ParsedDocument } from "../types";

/** Markdown → blocks via remark/unified AST walk. */
export function parseMarkdown(markdown: string, fallbackTitle: string): ParsedDocument {
  const tree: Root = unified().use(remarkParse).parse(markdown);
  const blocks: ParsedBlock[] = [];
  for (const node of tree.children) {
    collectBlocks(node, blocks);
  }
  const firstH1 = blocks.find((b) => b.type === "heading" && b.headingLevel === 1);
  return { title: firstH1?.text ?? fallbackTitle, blocks };
}

function collectBlocks(node: RootContent, blocks: ParsedBlock[]): void {
  switch (node.type) {
    case "heading": {
      const text = phrasingText(node.children);
      if (text) blocks.push({ type: "heading", text, headingLevel: node.depth });
      return;
    }
    case "paragraph": {
      const text = phrasingText(node.children);
      if (text) blocks.push({ type: "paragraph", text });
      return;
    }
    case "code": {
      const text = node.value.trim();
      if (text) blocks.push({ type: "code", text });
      return;
    }
    case "list": {
      const text = listText(node, 0);
      if (text) blocks.push({ type: "list", text });
      return;
    }
    case "table": {
      const text = tableText(node);
      if (text) blocks.push({ type: "table", text });
      return;
    }
    case "blockquote": {
      for (const child of node.children) collectBlocks(child, blocks);
      return;
    }
    default:
      // thematicBreak, html, definitions, footnotes, etc. carry no prose we chunk.
      return;
  }
}

function phrasingText(nodes: PhrasingContent[]): string {
  return nodes.map(inlineText).join("").replace(/\s+/g, " ").trim();
}

function inlineText(node: PhrasingContent): string {
  switch (node.type) {
    case "text":
    case "inlineCode":
      return node.value;
    case "break":
      return "\n";
    case "image":
      return node.alt ?? "";
    case "emphasis":
    case "strong":
    case "delete":
    case "link":
      return node.children.map(inlineText).join("");
    default:
      return "";
  }
}

function listText(list: List, depth: number): string {
  const indent = "  ".repeat(depth);
  const lines: string[] = [];
  for (const item of list.children) {
    const itemParts: string[] = [];
    for (const child of item.children) {
      if (child.type === "paragraph") {
        itemParts.push(phrasingText(child.children));
      } else if (child.type === "list") {
        const nested = listText(child, depth + 1);
        if (nested) itemParts.push(`\n${nested}`);
      } else if (child.type === "code") {
        itemParts.push(child.value.trim());
      }
    }
    const text = itemParts.join(" ").trimEnd();
    if (text) lines.push(`${indent}- ${text}`);
  }
  return lines.join("\n");
}

function tableText(table: Table): string {
  return table.children
    .map((row) => row.children.map((cell) => phrasingText(cell.children)).join(" | "))
    .join("\n");
}
