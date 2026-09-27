import { test } from "node:test";
import assert from "node:assert/strict";
import { FormattingRouter } from "../../src/formatting/formattingRouter";
import { FormattingService } from "../../src/formatting/formattingService";
import { InternalFormattingBackend } from "../../src/formatting/internalFormattingBackend";
import { applyOffsetEdits } from "../../src/formatting/formattingEdits";
import { validateOutput } from "../../src/validation/validator";
import type { FormattingBackend } from "../../src/formatting/formattingBackend";
import type { LanguageId } from "../../src/analysis/types";
const options = { tabSize: 2, insertSpaces: true };
const fallback = new InternalFormattingBackend();
const service = new FormattingService(new FormattingRouter([fallback]));
const provider = (text: string): FormattingBackend => ({
  format: async () => ({ kind: "formatted", text }),
});

test("JSONC comment token boundaries ignore formatting whitespace", () => {
  assert.ok(
    validateOutput('{/*keep*/"a":1}', '{ /*keep*/\n  "a": 1\n}', "jsonc"),
  );
});

for (const [language, source] of [
  ["json", '{"a":1,"b":[1,2,3]}'],
  ["json", '{"large":9007199254740993,"a":1,"a":2}'],
  ["xml", '<root><child id="1">text</child><other/></root>'],
  ["yaml", "user:\n    name: John\n    active: true\n"],
  ["sql", "select id,name from users where active=1;"],
  [
    "sql",
    "MERGE INTO target AS t USING source AS s ON t.id=s.id WHEN MATCHED THEN UPDATE SET name=s.name;",
  ],
] satisfies [LanguageId, string][]) {
  test(`validated fallback for ${language}: ${source.slice(0, 30)}`, async () => {
    const result = await fallback.format(source, language, options);
    assert.equal(result.kind, "formatted");
    if (result.kind === "formatted") {
      assert.notEqual(result.text, source);
      assert.ok(validateOutput(source, result.text, language));
    }
  });
}
test("provider takes precedence over fallback", async () => {
  const router = new FormattingRouter([
    provider('{ "a": 1 }'),
    {
      format: async () => {
        throw new Error("Should not run");
      },
    },
  ]);
  assert.deepEqual(await router.format('{"a":1}', "json", options), {
    kind: "formatted",
    text: '{ "a": 1 }',
  });
});
for (const [name, backend] of [
  ["unavailable", { format: async () => ({ kind: "unavailable" as const }) }],
  [
    "throws",
    {
      format: async () => {
        throw new Error("Provider failed");
      },
    },
  ],
  ["invalid", provider("broken")],
  ["changes values", provider('{"a":2}')],
] satisfies [string, FormattingBackend][]) {
  test(`provider ${name} uses validated fallback`, async () =>
    assert.equal(
      (
        await new FormattingRouter([backend, fallback]).format(
          '{"a":1}',
          "json",
          options,
        )
      ).kind,
      "formatted",
    ));
}
test("missing opportunistic provider leaves content alone", async () =>
  assert.equal(
    (
      await new FormattingRouter([fallback]).format(
        "def f():\n    pass",
        "python",
        options,
      )
    ).kind,
    "unavailable",
  ));
test("identical output does not count as a format", async () =>
  assert.equal(
    (
      await new FormattingRouter([provider('{"a":1}')]).format(
        '{"a":1}',
        "json",
        options,
      )
    ).kind,
    "unchanged",
  ));
test("cancellation discards output", async () =>
  assert.equal(
    (
      await new FormattingRouter([fallback]).format(
        '{"a":1}',
        "json",
        options,
        () => true,
      )
    ).kind,
    "failed",
  ));
test("edits reconstructed against original offsets", () =>
  assert.equal(
    applyOffsetEdits("abcdef", [
      { start: 4, end: 6, text: "Z" },
      { start: 0, end: 1, text: "LONG" },
    ]),
    "LONGbcdZ",
  ));
for (const edits of [
  [
    { start: 0, end: 3, text: "" },
    { start: 2, end: 4, text: "" },
  ],
  [{ start: -1, end: 3, text: "" }],
  [{ start: 0, end: 99, text: "" }],
  [
    { start: 0, end: 0, text: "a" },
    { start: 0, end: 0, text: "b" },
  ],
]) {
  test(`invalid edit ranges rejected ${JSON.stringify(edits)}`, () =>
    assert.throws(() => applyOffsetEdits("abcd", edits)));
}
for (const [language, source, output] of [
  ["json", '{"a":1}', '{"a":2}'],
  ["json", '{"n":9007199254740993}', '{"n":9007199254740992}'],
  ["json", '{"a":1,"a":2}', '{"a":2}'],
  ["jsonc", '{/*keep*/"a":1}', '{"a":1}'],
  ["xml", "<r><a>yes</a></r>", "<r><a>no</a></r>"],
  ["xml", "<r><!--keep--></r>", "<r/>"],
  ["xml", '<r xml:space="preserve"> </r>', '<r xml:space="preserve">  </r>'],
  ["xml", "<r> </r>", "<r/>"],
  [
    "html",
    "<p><span>a</span> <span>b</span></p>",
    "<p><span>a</span><span>b</span></p>",
  ],
  ["yaml", "a: 1\nb: true", "a: 2\nb: true"],
  ["yaml", "# keep\na: 1\nb: true", "a: 1\nb: true"],
  ["sql", "select 'a b' from users;", "select 'ab' from users;"],
  ["sql", "select id from users;", "select name from users;"],
  ["javascript", "function f(){return 1}", "function f(){return\n1}"],
  ["typescript", "const x: number=1;", 'const x: string="1";'],
  ["css", "a{color:red}", "a{color:blue}"],
  ["python", "def f():\n    return 1", "def f():\nreturn 1"],
  ["css", "a{color:red}b{color:blue}", "a{color:red;b{color:blue}}"],
] satisfies [LanguageId, string, string][]) {
  test(`reject changed semantics ${language}: ${source.slice(0, 30)}`, () =>
    assert.equal(validateOutput(source, output, language), false));
}
test("mixed document stays unchanged under Format Document", async () =>
  assert.deepEqual(
    (await service.plan('Payload:\n{"a":1}\nEnd.', options)).edits,
    [],
  ));
test("independent selection excludes surrounding prose", async () => {
  const source = 'Payload: {"a":1} End.';
  const start = source.indexOf("{");
  const end = source.indexOf("}") + 1;
  const plan = await service.plan(source.slice(start, end), options);
  const result = applyOffsetEdits(
    source,
    plan.edits.map((e) => ({
      ...e,
      start: e.start + start,
      end: e.end + start,
    })),
  );
  assert.ok(result.startsWith("Payload: {\n"));
  assert.ok(result.endsWith("} End."));
});
test("prose selection unchanged", async () =>
  assert.deepEqual(
    (await service.plan("Meeting tomorrow.", options)).edits,
    [],
  ));
test("SQL selection formats", async () =>
  assert.equal(
    (await service.plan("select id,name from users;", options)).edits.length,
    1,
  ));
test("multiple blocks preserve prose and fence boundaries byte for byte", async () => {
  const source =
    'Intro  \r\n```json\r\n{"a":1}\r\n```\r\n\r\nQuery:\r\nselect id,name from users;\r\n\r\nEnd.  ';
  const plan = await service.plan(source, options, true);
  assert.equal(plan.edits.length, 2);
  const output = applyOffsetEdits(source, plan.edits);
  assert.ok(output.startsWith("Intro  \r\n```json\r\n"));
  assert.ok(output.includes("\r\n```\r\n\r\nQuery:\r\n"));
  assert.ok(output.endsWith("\r\n\r\nEnd.  "));
  let previous = 0;
  for (const edit of plan.edits) {
    assert.ok(output.includes(source.slice(previous, edit.start)));
    previous = edit.end;
  }
});
test("a failed region stays untouched while other validated regions format", async () => {
  const source = '```python\ndef f():\n    pass\n```\n```json\n{"a":1}\n```';
  const plan = await service.plan(source, options, true);
  assert.equal(plan.edits.length, 1);
  assert.ok(
    applyOffsetEdits(source, plan.edits).startsWith(
      "```python\ndef f():\n    pass\n```",
    ),
  );
});
