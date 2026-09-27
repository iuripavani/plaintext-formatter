import { isMap, isSeq } from "yaml";
import {
  MAX_DOCUMENT_LENGTH,
  type DetectionResult,
  type LanguageId,
} from "../analysis/types";
import {
  cssAst,
  jsonValue,
  scriptAst,
  sqlAst,
  xmlSignature,
  yamlDocument,
} from "./parsers";

function result(
  languageId: LanguageId,
  confidence: number,
  ...evidence: string[]
): DetectionResult {
  return { languageId, confidence, evidence };
}

export function detectLanguage(source: string): DetectionResult | undefined {
  const text = source.trim();
  if (!text || source.length > MAX_DOCUMENT_LENGTH) return;
  if (/^[{[]/.test(text)) {
    try {
      jsonValue(text);
      return result(
        "json",
        1,
        "JSON.parse accepted a complete object or array",
      );
    } catch {
      /* More evidence needed. */
    }
    try {
      jsonValue(text, true);
      return result(
        "jsonc",
        0.99,
        "JSONC parser accepted a complete collection",
      );
    } catch {
      /* Continue. */
    }
    // Broken JSON must not be reinterpreted as YAML or JavaScript.
    return;
  }
  if (text.startsWith("<")) {
    try {
      xmlSignature(text);
      const html =
        /^<(?:html|div|section|article|main|p|ul|ol|table|form|header|footer|span|button|a|h[1-6])(?:\s|>)/i.test(
          text,
        );
      return result(
        html ? "html" : "xml",
        0.98,
        "Well-formed XML tree",
        html ? "Known HTML root" : "XML root structure",
      );
    } catch {
      return;
    }
  }
  if (
    /^(?:select|insert|update|delete|merge|with|create|alter)\b/i.test(text)
  ) {
    try {
      if (/^select\s+(?:from|where|join|order|group)\b/i.test(text)) return;
      sqlAst(text);
      // A bare SELECT phrase can still be valid SQL through implicit aliases.
      if (!/[;*=(),]|\b(?:where|join|values|set|table|into|as)\b/i.test(text))
        return;
      return result(
        "sql",
        0.97,
        "Complete SQL grammar parse",
        "Independent SQL punctuation or clause evidence",
      );
    } catch {
      return;
    }
  }
  if (
    /^(?:(?:export\s+)?(?:const|let|var|function|class|interface|type)\s|import\s)/.test(
      text,
    )
  ) {
    for (const typescript of [false, true]) {
      try {
        scriptAst(text, typescript);
        return result(
          typescript ? "typescript" : "javascript",
          0.96,
          "Complete script parse",
          "Declaration or import syntax",
        );
      } catch {
        /* Try TypeScript. */
      }
    }
    return;
  }
  if (/[{}]/.test(text) && /[\w-]+\s*:\s*[^{}]+/.test(text)) {
    try {
      const ast = cssAst(text);
      let rules = 0;
      let declarations = 0;
      let invalid = false;
      ast.walkRules((rule) => {
        rules++;
        if (!rule.selector.trim()) invalid = true;
      });
      ast.walkDecls((decl) => {
        declarations++;
        if (decl.parent?.type !== "rule" && decl.parent?.type !== "atrule")
          invalid = true;
      });
      if (
        rules &&
        declarations &&
        !invalid &&
        ast.nodes.every(
          (n) =>
            n.type === "rule" || n.type === "atrule" || n.type === "comment",
        )
      )
        return result(
          "css",
          0.94,
          "CSS parser accepted rules and declarations",
        );
    } catch {
      /* Continue. */
    }
  }
  if (
    /^(?:def\s+\w+\([^\n]*\)|class\s+\w+(?:\([^\n]*\))?)\s*:\s*\r?\n[ \t]+\S/.test(
      text,
    )
  ) {
    const lines = text
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trimStart().startsWith("#"));
    if (
      lines
        .slice(1)
        .every((line) =>
          /^\s+(?:return\b|pass\b|raise\b|print\(|self\.|\w+\s*=)/.test(line),
        )
    )
      return result(
        "python",
        0.91,
        "Function or class header",
        "Indented code statements",
      );
  }
  if (/^(?:---\s*\r?\n|[\w.-]+\s*:|[-]\s)/.test(text) && !/[{}]/.test(text)) {
    try {
      const doc = yamlDocument(text);
      const mappings = text.match(/^[ \t]*[\w.-]+\s*:\s*(?:\S|$)/gm) ?? [];
      const sequences = text.match(/^[ \t]*-\s+\S/gm) ?? [];
      const nested = /\n[ \t]+(?:[\w.-]+\s*:|-\s)/.test(text);
      if (
        (isMap(doc.contents) &&
          mappings.length + sequences.length >= 2 &&
          (nested || /:\s*(?:true|false|null|-?\d+)(?:\s|$)/m.test(text))) ||
        (isSeq(doc.contents) &&
          sequences.length >= 2 &&
          /^(?:---\s*\r?\n)|^-\s+(?:\d+|true|false|[\w.-]+:)/m.test(text))
      ) {
        return result(
          "yaml",
          0.95,
          "YAML collection parsed",
          "Multiple entries and typed or nested structure",
        );
      }
    } catch {
      /* Ordinary or malformed text. */
    }
  }
  return;
}
