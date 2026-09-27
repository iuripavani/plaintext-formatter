import { test } from "node:test";
import assert from "node:assert/strict";
import { detectLanguage } from "../../src/detection/detectionEngine";
import { analyzeDocument } from "../../src/analysis/analyzeDocument";
import {
  detectRegions,
  resolveOverlaps,
} from "../../src/regions/regionDetector";
import { MAX_DOCUMENT_LENGTH, type LanguageId } from "../../src/analysis/types";

const positives: [LanguageId, string][] = [
  ["json", '{"a":1}'],
  ["json", '[1,{"a":[true,null]}]'],
  ["json", '{"xml":"<root/>"}'],
  ["json", "[".repeat(60) + "1" + "]".repeat(60)],
  ["jsonc", '{"a":1, // note\n}'],
  ["xml", "<root/>"],
  ["xml", '<root id="1"><child>hi</child></root>'],
  ["xml", '<ns:root xmlns:ns="urn:test"><ns:child/></ns:root>'],
  ["xml", '<?xml version="1.0"?><root><!-- keep --><![CDATA[a < b]]></root>'],
  ["yaml", "user:\n  name: John\n  active: true"],
  ["yaml", "items:\n  - one\n  - two"],
  ["yaml", "name: John\nactive: true"],
  ["yaml", "- 1\n- 2"],
  ["yaml", "user:\n  description: |\n    Hello world\n  active: true\n"],
  ["sql", "select id,name from users where active=1;"],
  ["sql", "SELECT * FROM users;"],
  ["sql", "INSERT INTO users (id,name) VALUES (1,'John');"],
  ["sql", "UPDATE users SET active=1 WHERE id=2;"],
  ["sql", "DELETE FROM users WHERE id=2;"],
  ["sql", "WITH ids AS (SELECT id FROM users) SELECT * FROM ids;"],
  ["sql", "CREATE TABLE users (id INT, name VARCHAR(100));"],
  ["sql", "ALTER TABLE users ADD active INT;"],
  ["sql", "SELECT id,\nname FROM users\nWHERE active = 1;"],
  [
    "sql",
    "MERGE INTO target AS t USING source AS s ON t.id=s.id WHEN MATCHED THEN UPDATE SET name=s.name;",
  ],
  [
    "sql",
    "MERGE INTO target AS t USING source AS s ON t.id=s.id WHEN MATCHED THEN DELETE;",
  ],
  ["html", "<div><p>Hello</p></div>"],
  ["javascript", "const answer={a:1};"],
  ["javascript", 'function greet(name){return "hi "+name;}'],
  ["typescript", "const answer: number=42;"],
  ["typescript", "interface User { name: string; }"],
  ["css", "body{color:red;margin:0}"],
  ["python", 'def greet(name):\n    return "hi " + name'],
];
for (const [language, source] of positives)
  test(`detect ${language}: ${source.slice(0, 55)}`, () =>
    assert.equal(detectLanguage(source)?.languageId, language));

const negatives = [
  "",
  "  \n\t",
  "hello world",
  "hello {world}",
  "42",
  "true",
  '"hello"',
  "null",
  '{"a":}',
  '{"a":1',
  "[1,2",
  "Meeting tomorrow at 10.\nRemember to call John.",
  "Note: call John",
  "name: John\ncity: London",
  "- remember the milk\n- call John",
  "user:\n  name: [broken\n  active: true",
  "a: 1\na: 2",
  "<root><child></root>",
  "<tag>",
  "<root/> prose",
  "<hello>world",
  "<root/><other/>",
  "select the best option from the list",
  "select the best option from the list;",
  "select option from menu",
  "UPDATE your settings today",
  "SELECT FROM;",
  "MERGE INTO target USING source ON nonsense WHEN MATCHED THEN UPDATE SET;",
  "Here is SQL:\nselect id from users;",
  "const idea is to do something;",
  "function works better this way",
  "if you can: please do",
  "definitely: a good idea",
  "def greet(name):\n    Remember to call John.",
  "body { this is prose }",
  '<!DOCTYPE root [<!ENTITY x SYSTEM "file:///secret">]><root>&x;</root>',
];
for (const source of negatives)
  test(`reject ambiguity: ${source.slice(0, 55)}`, () =>
    assert.equal(detectLanguage(source), undefined));

test("large input is bounded", () =>
  assert.equal(
    analyzeDocument("a".repeat(MAX_DOCUMENT_LENGTH + 1)).kind,
    "plaintext",
  ));
test("confidence threshold can only narrow accepted results", () =>
  assert.equal(analyzeDocument("body{color:red}", 1).kind, "plaintext"));
for (const code of [
  '{"a":1}',
  "<root><a/></root>",
  "select id from users;",
  "user:\n  name: John\n  active: true",
]) {
  test(`mixed prose + ${code.slice(0, 20)}`, () => {
    const analysis = analyzeDocument(
      `Here is the example:\n\n${code}\n\nAnd this is the explanation.`,
    );
    assert.equal(analysis.kind, "mixed");
    if (analysis.kind === "mixed") assert.equal(analysis.regions.length, 1);
  });
}
test("adjacent language regions and nested JSON do not overlap", () => {
  const source = '{"a":{"b":1}}\nselect * from users;\n<root/>';
  const regions = detectRegions(source);
  assert.deepEqual(
    regions.map((r) => r.languageId),
    ["json", "sql", "xml"],
  );
  regions
    .slice(1)
    .forEach((region, index) => assert.ok(region.start >= regions[index]!.end));
});
test("fences preserve exact content ranges", () => {
  const source = 'Example:\r\n```json\r\n{"a":1}\r\n```\r\nEnd.';
  const regions = detectRegions(source);
  assert.equal(regions.length, 1);
  assert.equal(source.slice(regions[0]!.start, regions[0]!.end), '{"a":1}\r\n');
  assert.equal(regions[0]!.source, "fence");
});
for (const source of [
  '```unknown\n{"a":1}\n```',
  '```sql\n{"a":1}\n```',
  '```json\n{"a":1}',
  '````text\n```json\n{"a":1}\n```\n````',
]) {
  test(`unsupported, mismatched or nested fences protected: ${source.slice(0, 15)}`, () =>
    assert.deepEqual(detectRegions(source), []));
}
test("explicit regions outrank conflicting heuristics", () => {
  const base = { languageId: "json" as const, confidence: 1, evidence: [] };
  assert.deepEqual(
    resolveOverlaps([
      { ...base, start: 0, end: 50, source: "heuristic" },
      { ...base, start: 10, end: 20, source: "fence" },
    ]).map((r) => r.source),
    ["fence"],
  );
});
