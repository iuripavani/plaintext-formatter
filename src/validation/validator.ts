import { isDeepStrictEqual } from "node:util";
import { createScanner, SyntaxKind } from "jsonc-parser";
import { visit } from "yaml";
import type { LanguageId } from "../analysis/types";
import {
  canonicalAst,
  cssAst,
  jsonValue,
  scriptAst,
  sqlAst,
  xmlSignature,
  yamlDocument,
} from "../detection/parsers";

function jsonTokens(text: string): unknown[] {
  const scanner = createScanner(text, false);
  const tokens: unknown[] = [];
  for (
    let kind = scanner.scan();
    kind !== SyntaxKind.EOF;
    kind = scanner.scan()
  ) {
    if (kind !== SyntaxKind.Trivia && kind !== SyntaxKind.LineBreakTrivia)
      tokens.push([
        kind,
        text.slice(
          scanner.getTokenOffset(),
          scanner.getTokenOffset() + scanner.getTokenLength(),
        ),
      ]);
  }
  return tokens;
}

function yamlSignature(text: string): unknown {
  const doc = yamlDocument(text);
  const metadata: unknown[] = [doc.commentBefore, doc.comment];
  visit(doc, (_, node) => {
    if (node && typeof node === "object") {
      const info = node as {
        comment?: string;
        commentBefore?: string;
        tag?: string;
        anchor?: string;
      };
      if (info.comment || info.commentBefore || info.tag || info.anchor)
        metadata.push([
          info.comment,
          info.commentBefore,
          info.tag,
          info.anchor,
        ]);
    }
  });
  return [doc.toJS({ maxAliasCount: 50, mapAsMap: true }), metadata];
}

/** Lexical guard retains strings, comments, punctuation and identifier case. */
function sqlTokens(text: string): string[] {
  return (
    text.match(
      /--[^\r\n]*|\/\*[^]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|\[[^\]]*\]|\$[\w]*\$[^]*?\$[\w]*\$|[\w$]+|[^\s]/g,
    ) ?? []
  );
}

function pythonSignature(text: string): unknown {
  // Without a bundled Python parser, accept spacing changes only on the same logical lines.
  // Quoted strings/comments remain intact; indentation relationships must be identical.
  if (/'''|"""|\\\r?\n/.test(text))
    throw new Error("Unsupported Python literal");
  const levels: number[] = [0];
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      const indent = line.match(/^[ \t]*/)![0];
      if (indent.includes("\t"))
        throw new Error("Ambiguous Python indentation");
      while (levels.at(-1)! > indent.length) levels.pop();
      if (levels.at(-1)! < indent.length) levels.push(indent.length);
      return [
        levels.length,
        line
          .trim()
          .match(/#[^]*|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\w+|[^\s]/g),
      ];
    });
}

export function validateOutput(
  source: string,
  output: string,
  language: LanguageId,
): boolean {
  if (!output.trim() || output.length > Math.max(source.length * 10, 20_000))
    return false;
  try {
    switch (language) {
      case "json":
      case "jsonc":
        jsonValue(source, language === "jsonc");
        jsonValue(output, language === "jsonc");
        return isDeepStrictEqual(jsonTokens(source), jsonTokens(output));
      case "xml":
      case "html":
        if (/xml:space\s*=\s*['"]preserve['"]/.test(source))
          return source === output;
        return xmlSignature(source) === xmlSignature(output);
      case "yaml":
        return isDeepStrictEqual(yamlSignature(source), yamlSignature(output));
      case "sql":
        return (
          isDeepStrictEqual(sqlAst(source), sqlAst(output)) &&
          isDeepStrictEqual(sqlTokens(source), sqlTokens(output))
        );
      case "javascript":
      case "typescript":
        return isDeepStrictEqual(
          canonicalAst(scriptAst(source, language === "typescript")),
          canonicalAst(scriptAst(output, language === "typescript")),
        );
      case "css": {
        const signature = (text: string): unknown => {
          const clean = (value: unknown): unknown => {
            if (Array.isArray(value)) return value.map(clean);
            if (value && typeof value === "object")
              return Object.fromEntries(
                Object.entries(value)
                  .filter(
                    ([key]) => !["raws", "source", "inputs"].includes(key),
                  )
                  .map(([key, entry]) => [key, clean(entry)]),
              );
            return value;
          };
          return clean(cssAst(text).toJSON());
        };
        return isDeepStrictEqual(signature(source), signature(output));
      }
      case "python":
        return isDeepStrictEqual(
          pythonSignature(source),
          pythonSignature(output),
        );
    }
  } catch {
    return false;
  }
}
