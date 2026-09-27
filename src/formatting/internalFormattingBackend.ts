import { applyEdits, format as formatJson } from "jsonc-parser";
import formatXml from "xml-formatter";
import { format as formatSql } from "sql-formatter";
import type { FormatOptions, LanguageId } from "../analysis/types";
import { yamlDocument } from "../detection/parsers";
import type { BackendResult, FormattingBackend } from "./formattingBackend";

export class InternalFormattingBackend implements FormattingBackend {
  async format(
    text: string,
    language: LanguageId,
    options: FormatOptions,
  ): Promise<BackendResult> {
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    const indentation = options.insertSpaces
      ? " ".repeat(options.tabSize)
      : "\t";
    let output: string;
    switch (language) {
      case "json":
        output = applyEdits(
          text,
          formatJson(text, undefined, { ...options, eol }),
        );
        break;
      case "xml":
        output = formatXml(text, {
          indentation,
          lineSeparator: eol,
          collapseContent: true,
          strictMode: true,
        });
        break;
      case "yaml":
        output = yamlDocument(text)
          .toString({ indent: options.tabSize, lineWidth: 0 })
          .replace(/\n/g, eol);
        break;
      case "sql":
        output = formatSql(text, {
          language: "sql",
          tabWidth: options.tabSize,
          useTabs: !options.insertSpaces,
          keywordCase: "preserve",
        }).replace(/\n/g, eol);
        break;
      default:
        return { kind: "unavailable" };
    }
    return { kind: "formatted", text: output };
  }
}
