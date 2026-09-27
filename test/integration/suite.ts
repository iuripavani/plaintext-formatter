import assert from "node:assert/strict";
import * as vscode from "vscode";
import { VSCodeFormattingBackend } from "../../src/formatting/vscodeFormattingBackend";

const options = { tabSize: 2, insertSpaces: true };
export async function run(): Promise<void> {
  await vscode.workspace
    .getConfiguration("files")
    .update("eol", "\n", vscode.ConfigurationTarget.Global);
  await vscode.workspace
    .getConfiguration("plaintextFormatter")
    .update("starPrompts", false, vscode.ConfigurationTarget.Global);
  const extension = vscode.extensions.getExtension(
    "iuripavani.plaintext-formatter",
  );
  assert.ok(extension);
  await extension.activate();
  let count = 0;
  async function check(name: string, fn: () => Promise<void>): Promise<void> {
    await fn();
    count++;
    console.log(`PASS: ${name}`);
  }
  async function document(text: string): Promise<vscode.TextDocument> {
    return vscode.workspace.openTextDocument({
      language: "plaintext",
      content: text,
    });
  }
  async function edits(doc: vscode.TextDocument): Promise<vscode.TextEdit[]> {
    return (
      (await vscode.commands.executeCommand<vscode.TextEdit[]>(
        "vscode.executeFormatDocumentProvider",
        doc.uri,
        options,
      )) ?? []
    );
  }
  async function apply(
    doc: vscode.TextDocument,
    changes: vscode.TextEdit[],
  ): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    edit.set(doc.uri, changes);
    assert.ok(await vscode.workspace.applyEdit(edit));
  }

  for (const [language, source] of [
    ["JSON", '{"a":1,"b":[1,2,3]}'],
    ["XML", "<root><child>yes</child><other/></root>"],
    ["YAML", "user:\n    name: John\n    active: true"],
    ["SQL", "select id,name from users where active=1;"],
  ])
    await check(`native unsaved ${language} formatting`, async () => {
      const doc = await document(source!);
      const changes = await edits(doc);
      assert.ok(changes.length, `Expected built-in formatting for ${source}`);
      await apply(doc, changes);
      assert.notEqual(doc.getText(), source);
      assert.equal(doc.languageId, "plaintext");
      assert.ok(doc.isUntitled);
    });
  await check("native Format Document command and undo", async () => {
    const source = '{"a":1}';
    const doc = await document(source);
    await vscode.window.showTextDocument(doc);
    const startedAt = Date.now();
    await vscode.commands.executeCommand("editor.action.formatDocument");
    assert.ok(
      Date.now() - startedAt >= 1_400,
      "Expected detection, formatting, validation and completion to remain visible",
    );
    assert.match(doc.getText(), /\n/);
    await vscode.commands.executeCommand("undo");
    assert.equal(doc.getText(), source);
  });
  for (const source of ["Call John tomorrow.", 'Payload:\n{"a":1}\nEnd.'])
    await check("ordinary/mixed text is unchanged", async () =>
      assert.deepEqual(await edits(await document(source)), []),
    );
  await check("native range formatting preserves outside text", async () => {
    const doc = await document('Before: {"a":1,"b":2} After.');
    const range = new vscode.Range(doc.positionAt(8), doc.positionAt(21));
    const changes = await vscode.commands.executeCommand<vscode.TextEdit[]>(
      "vscode.executeFormatRangeProvider",
      doc.uri,
      range,
      options,
    );
    assert.ok(changes?.length);
    await apply(doc, changes);
    assert.ok(doc.getText().startsWith("Before: {\n"));
    assert.ok(doc.getText().endsWith("} After."));
  });
  await check(
    "block command preserves prose, formats two blocks and has one undo",
    async () => {
      const source =
        'Intro  \n```json\n{"a":1}\n```\nMiddle\n```sql\nselect id,name from users;\n```\nEnd.  ';
      const doc = await document(source);
      await vscode.window.showTextDocument(doc);
      await vscode.commands.executeCommand(
        "plaintextFormatter.formatDetectedBlocks",
      );
      assert.ok(doc.getText().startsWith("Intro  \n```json\n{\n"));
      assert.ok(doc.getText().includes("\n```\nMiddle\n```sql\n"));
      assert.ok(doc.getText().endsWith("\n```\nEnd.  "));
      await vscode.commands.executeCommand("undo");
      assert.equal(doc.getText(), source);
    },
  );
  await check(
    "delegates to a registered Python provider without opening another tab",
    async () => {
      let called = false;
      const registered =
        vscode.languages.registerDocumentFormattingEditProvider(
          { language: "python", scheme: "untitled" },
          {
            provideDocumentFormattingEdits(doc) {
              called = true;
              return [
                vscode.TextEdit.replace(
                  new vscode.Range(
                    doc.positionAt(0),
                    doc.positionAt(doc.getText().length),
                  ),
                  "def f():\n    return 1 + 2",
                ),
              ];
            },
          },
        );
      try {
        const doc = await document("def f():\n    return 1+2");
        await vscode.window.showTextDocument(doc);
        const tabs = vscode.window.tabGroups.all.flatMap(
          (group) => group.tabs,
        ).length;
        const changes = await edits(doc);
        assert.ok(called);
        assert.ok(changes.length > 0);
        await apply(doc, changes);
        assert.equal(doc.languageId, "plaintext");
        assert.equal(
          vscode.window.tabGroups.all.flatMap((group) => group.tabs).length,
          tabs,
        );
      } finally {
        registered.dispose();
      }
    },
  );
  await check(
    "provider multiple edits are reconstructed from original ranges",
    async () => {
      const registration =
        vscode.languages.registerDocumentFormattingEditProvider(
          { language: "python", scheme: "untitled" },
          {
            provideDocumentFormattingEdits() {
              return [
                vscode.TextEdit.insert(new vscode.Position(1, 12), " "),
                vscode.TextEdit.insert(new vscode.Position(1, 13), " "),
              ];
            },
          },
        );
      try {
        const result = await new VSCodeFormattingBackend().format(
          "def f():\n    return 1+2",
          "python",
          options,
        );
        assert.deepEqual(result, {
          kind: "formatted",
          text: "def f():\n    return 1 + 2",
        });
      } finally {
        registration.dispose();
      }
    },
  );
  for (const behavior of ["invalid", "throws", "empty"] as const)
    await check(
      `provider ${behavior} leaves unsupported Python intact`,
      async () => {
        const registration =
          vscode.languages.registerDocumentFormattingEditProvider(
            { language: "python", scheme: "untitled" },
            {
              provideDocumentFormattingEdits(doc) {
                if (behavior === "throws")
                  throw new Error("Intentional provider failure");
                if (behavior === "empty") return [];
                return [
                  vscode.TextEdit.replace(
                    new vscode.Range(
                      doc.positionAt(0),
                      doc.positionAt(doc.getText().length),
                    ),
                    "destroyed",
                  ),
                ];
              },
            },
          );
        try {
          assert.deepEqual(
            await edits(await document("def f():\n    return 1+2")),
            [],
          );
        } finally {
          registration.dispose();
        }
      },
    );
  await check(
    "changes made during delegation invalidate the formatting plan",
    async () => {
      const doc = await document("def f():\n    return 1+2");
      const registration =
        vscode.languages.registerDocumentFormattingEditProvider(
          { language: "python", scheme: "untitled" },
          {
            async provideDocumentFormattingEdits(virtual) {
              const change = new vscode.WorkspaceEdit();
              change.insert(doc.uri, new vscode.Position(0, 0), "# changed\n");
              await vscode.workspace.applyEdit(change);
              return [
                vscode.TextEdit.replace(
                  new vscode.Range(
                    virtual.positionAt(0),
                    virtual.positionAt(virtual.getText().length),
                  ),
                  "def f():\n    return 1 + 2",
                ),
              ];
            },
          },
        );
      try {
        assert.deepEqual(await edits(doc), []);
        assert.ok(doc.getText().startsWith("# changed"));
      } finally {
        registration.dispose();
      }
    },
  );
  await check("CRLF code blocks preserve surrounding bytes", async () => {
    const source = 'Before  \r\n```json\r\n{"a":1}\r\n```\r\nAfter  ';
    const doc = await document(source);
    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand(
      "plaintextFormatter.formatDetectedBlocks",
    );
    assert.ok(doc.getText().startsWith("Before  \r\n```json\r\n"));
    assert.ok(doc.getText().endsWith("\r\n```\r\nAfter  "));
    assert.notEqual(doc.getText(), source);
  });
  for (const source of [
    "const x={a:1,b:2};",
    "const x: number=1;",
    "body{color:red;margin:0}",
    '{/*keep*/"a":1,"b":2}',
    "<div><p>Hello</p><p>world</p></div>",
  ]) {
    await check(`built-in provider for ${source.slice(0, 20)}`, async () => {
      const doc = await document(source);
      const changes = await edits(doc);
      assert.ok(changes.length);
      await apply(doc, changes);
      assert.notEqual(doc.getText(), source);
      assert.equal(doc.languageId, "plaintext");
    });
  }
  console.log(`${count} extension-host checks passed.`);
}
