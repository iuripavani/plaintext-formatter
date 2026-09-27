import { parse as parseScript } from "@babel/parser";
import { parse as parseJson, type ParseError } from "jsonc-parser";
import { parse as parseCss } from "postcss";
import { SaxesParser } from "saxes";
import { isMap, isSeq, parseDocument } from "yaml";
import { Parser as PostgresParser } from "node-sql-parser/build/postgresql";

export function jsonValue(text: string, comments = false): unknown {
  if (!comments) return JSON.parse(text) as unknown;
  const errors: ParseError[] = [];
  const value: unknown = parseJson(text, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (errors.length) throw new Error("Invalid JSONC");
  return value;
}

/** Parse without entity expansion, DTDs, remote resources, or recovery. */
export function xmlSignature(text: string): string {
  if (/<!DOCTYPE/i.test(text)) throw new Error("DTD is not supported");
  const parser = new SaxesParser({ xmlns: true });
  const events: unknown[] = [];
  interface Element {
    name: string;
    attributes: string[][];
    children: unknown[];
  }
  const stack: Element[] = [];
  const append = (value: unknown): void => {
    (stack.at(-1)?.children ?? events).push(value);
  };
  parser.on("error", () => {
    throw new Error("Invalid XML");
  });
  parser.on("opentag", (tag) =>
    stack.push({
      name: tag.name,
      attributes: Object.values(tag.attributes)
        .map((a) => [a.name, a.value])
        .sort(),
      children: [],
    }),
  );
  parser.on("closetag", () => {
    const node = stack.pop()!;
    const hasElements = node.children.some(
      (child) => child && typeof child === "object" && !Array.isArray(child),
    );
    const hasText = node.children.some(
      (child) => typeof child === "string" && child.trim(),
    );
    if (hasElements && !hasText)
      node.children = node.children.filter(
        (child) =>
          typeof child !== "string" || child.trim() || !child.includes("\n"),
      );
    append(node);
  });
  parser.on("text", (value) => {
    if (stack.length) append(value);
  });
  parser.on("cdata", (value) => append(["cdata", value]));
  parser.on("comment", (value) => append(["comment", value]));
  parser.on("processinginstruction", (value) => append(["pi", value]));
  parser.on("xmldecl", (value) => events.push(["declaration", value]));
  parser.write(text).close();
  return JSON.stringify(events);
}

export function yamlDocument(text: string) {
  const doc = parseDocument(text, {
    uniqueKeys: true,
    strict: true,
    keepSourceTokens: true,
  });
  if (
    doc.errors.length ||
    doc.warnings.length ||
    (!isMap(doc.contents) && !isSeq(doc.contents))
  )
    throw new Error("Not a YAML collection");
  // Limit alias expansion, including when checking semantic equivalence later.
  doc.toJS({ maxAliasCount: 50, mapAsMap: true });
  return doc;
}

export function scriptAst(text: string, typescript = false): unknown {
  return parseScript(text, {
    sourceType: "unambiguous",
    plugins: typescript ? ["typescript"] : [],
    attachComment: true,
  });
}

export function cssAst(text: string) {
  return parseCss(text);
}

export function sqlAst(text: string): unknown {
  if (/^\s*merge\b/i.test(text)) return mergeAst(text);
  const ast = new PostgresParser().astify(text);
  const statements = Array.isArray(ast) ? ast : [ast];
  if (
    !statements.length ||
    statements.some(
      (statement) =>
        !["select", "insert", "update", "delete", "create", "alter"].includes(
          statement.type,
        ),
    )
  )
    throw new Error("Unsupported SQL statement");
  return ast;
}

/** The SQL parser lacks MERGE. Recognize a deliberately bounded common subset,
 * then grammar-validate its join, assignments and optional insert independently. */
function mergeAst(text: string): unknown {
  const identifier = "[A-Za-z_][A-Za-z0-9_]*";
  const table = `${identifier}(?:\\.${identifier})?(?:\\s+(?:AS\\s+)?${identifier})?`;
  const match = new RegExp(
    `^\\s*MERGE\\s+INTO\\s+(${table})\\s+USING\\s+(${table})\\s+ON\\s+([^]+?)\\s+WHEN\\s+MATCHED\\s+THEN\\s+(DELETE|UPDATE\\s+SET\\s+[^]+?)(?:\\s+WHEN\\s+NOT\\s+MATCHED\\s+THEN\\s+INSERT\\s+(\\([^]+?\\)\\s+VALUES\\s*\\([^]+?\\)))?\\s*;?\\s*$`,
    "i",
  ).exec(text);
  if (!match) throw new Error("Unsupported MERGE syntax");
  const target = match[1]!;
  const source = match[2]!;
  const condition = match[3]!;
  const action = match[4]!;
  const parser = new PostgresParser();
  const single = (sql: string): unknown => {
    const ast = parser.astify(sql);
    if (Array.isArray(ast) && ast.length !== 1)
      throw new Error("Multiple statements in MERGE clause");
    return ast;
  };
  return {
    type: "merge",
    join: single(`SELECT * FROM ${target} JOIN ${source} ON ${condition}`),
    action: /^DELETE$/i.test(action)
      ? "delete"
      : single(
          `UPDATE ${target} SET ${action.replace(/^UPDATE\s+SET\s+/i, "")}`,
        ),
    insert: match[5]
      ? single(`INSERT INTO ${target.split(/\s+/)[0]} ${match[5]}`)
      : null,
  };
}

/** Drop only parser metadata; retain syntax, values, comments and statement order. */
export function canonicalAst(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalAst);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !["start", "end", "loc", "extra", "tokens", "errors"].includes(key),
        )
        .map(([key, entry]) => [key, canonicalAst(entry)]),
    );
  }
  return value;
}
