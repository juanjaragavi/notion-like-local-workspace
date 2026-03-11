import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

let _turndown: TurndownService | null = null;

function getTurndown(): TurndownService {
  if (_turndown) return _turndown;

  _turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
    strongDelimiter: "**",
    hr: "---",
  });

  _turndown.use(gfm);

  // Underline → rendered as plain text in Markdown (no standard syntax)
  _turndown.addRule("underline", {
    filter: ["u"],
    replacement(content) {
      return content;
    },
  });

  // Ensure <code> inside <pre> blocks preserves language attribute
  _turndown.addRule("fencedCodeBlock", {
    filter(node) {
      return (
        node.nodeName === "PRE" &&
        node.firstChild !== null &&
        node.firstChild.nodeName === "CODE"
      );
    },
    replacement(_content, node) {
      const codeEl = node.firstChild as HTMLElement;
      const className = codeEl.getAttribute("class") || "";
      const langMatch = className.match(/language-(\S+)/);
      const lang = langMatch ? langMatch[1] : "";
      const code = codeEl.textContent || "";
      // Remove trailing newline if present to avoid extra blank line
      const trimmed = code.endsWith("\n") ? code.slice(0, -1) : code;
      return `\n\n\`\`\`${lang}\n${trimmed}\n\`\`\`\n\n`;
    },
  });

  return _turndown;
}

export function htmlToMarkdown(html: string): string {
  if (!html || html === "<p></p>") return "";
  return getTurndown().turndown(html).trim();
}
