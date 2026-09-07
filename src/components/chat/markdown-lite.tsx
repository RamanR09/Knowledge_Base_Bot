import * as React from "react";

/**
 * Tiny safe markdown renderer for assistant answers: paragraphs, **bold**,
 * unordered/ordered lists, `inline code` and fenced code blocks. Builds React
 * nodes directly — no HTML strings, no dangerouslySetInnerHTML, no deps.
 */

const INLINE_TOKEN = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g;
const FENCE = /^```/;
const UL_ITEM = /^[-*]\s+/;
const OL_ITEM = /^\d+\.\s+/;
const HEADING = /^#{1,6}\s+/;

function renderInline(text: string): React.ReactNode[] {
  return text.split(INLINE_TOKEN).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={index}
          className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.85em]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function isStructural(line: string): boolean {
  return (
    FENCE.test(line) || UL_ITEM.test(line) || OL_ITEM.test(line) || HEADING.test(line)
  );
}

export function renderMarkdownLite(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (trimmed === "") {
      i += 1;
      continue;
    }

    if (FENCE.test(trimmed)) {
      const buffer: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE.test(lines[i].trim())) {
        buffer.push(lines[i]);
        i += 1;
      }
      i += 1; // skip closing fence (or run past EOF while streaming)
      out.push(
        <pre
          key={key++}
          className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-sm leading-6"
        >
          <code>{buffer.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    if (UL_ITEM.test(trimmed) || OL_ITEM.test(trimmed)) {
      const ordered = OL_ITEM.test(trimmed);
      const marker = ordered ? OL_ITEM : UL_ITEM;
      const items: string[] = [];
      while (i < lines.length && marker.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(marker, ""));
        i += 1;
      }
      const children = items.map((item, j) => <li key={j}>{renderInline(item)}</li>);
      out.push(
        ordered ? (
          <ol key={key++} className="list-decimal space-y-1 pl-6">
            {children}
          </ol>
        ) : (
          <ul key={key++} className="list-disc space-y-1 pl-6">
            {children}
          </ul>
        ),
      );
      continue;
    }

    if (HEADING.test(trimmed)) {
      out.push(
        <p key={key++} className="font-semibold">
          {renderInline(trimmed.replace(HEADING, ""))}
        </p>,
      );
      i += 1;
      continue;
    }

    const buffer: string[] = [lines[i]];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !isStructural(lines[i].trim())
    ) {
      buffer.push(lines[i]);
      i += 1;
    }
    out.push(<p key={key++}>{renderInline(buffer.join(" "))}</p>);
  }

  return out;
}

export function MarkdownLite({ text }: { text: string }) {
  return <div className="space-y-3">{renderMarkdownLite(text)}</div>;
}
