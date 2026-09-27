import * as vscode from "vscode";
import { analyzeDocument } from "./analysis/analyzeDocument";
import type { FormatOptions } from "./analysis/types";
import { FormattingService } from "./formatting/formattingService";
import { FormattingRouter } from "./formatting/formattingRouter";
import { InternalFormattingBackend } from "./formatting/internalFormattingBackend";
import { VSCodeFormattingBackend } from "./formatting/vscodeFormattingBackend";
import { FormattingFeedback } from "./ui/formattingFeedback";

export function activate(context: vscode.ExtensionContext): void {
  const service = new FormattingService(
    new FormattingRouter([
      new VSCodeFormattingBackend(),
      new InternalFormattingBackend(),
    ]),
  );
  const feedback = new FormattingFeedback(context);
  const threshold = (document: vscode.TextDocument): number =>
    vscode.workspace
      .getConfiguration("plaintextFormatter", document.uri)
      .get("minimumConfidence", 0.9);
  const safeOptions = (options: FormatOptions): FormatOptions => ({
    tabSize: Math.max(1, Math.min(8, Math.floor(options.tabSize) || 2)),
    insertSpaces: options.insertSpaces,
  });

  async function provide(
    document: vscode.TextDocument,
    range: vscode.Range,
    options: vscode.FormattingOptions,
    token: vscode.CancellationToken,
  ): Promise<vscode.TextEdit[]> {
    const version = document.version;
    feedback.show("Detecting and formatting…");
    try {
      const plan = await service.plan(
        document.getText(range),
        safeOptions(options),
        false,
        threshold(document),
        () =>
          token.isCancellationRequested ||
          document.version !== version ||
          document.isClosed,
      );
      if (
        token.isCancellationRequested ||
        document.version !== version ||
        document.isClosed
      )
        return [];
      const edits = plan.edits.map((edit) =>
        vscode.TextEdit.replace(
          new vscode.Range(
            document.positionAt(document.offsetAt(range.start) + edit.start),
            document.positionAt(document.offsetAt(range.start) + edit.end),
          ),
          edit.text,
        ),
      );
      if (edits.length) feedback.success(plan.message);
      else feedback.show(plan.message);
      return edits;
    } catch {
      feedback.show("Formatting failed safely. Text left unchanged.");
      return [];
    }
  }

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider("plaintext", {
      provideDocumentFormattingEdits: (document, options, token) =>
        provide(
          document,
          new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length),
          ),
          options,
          token,
        ),
    }),
    vscode.languages.registerDocumentRangeFormattingEditProvider("plaintext", {
      provideDocumentRangeFormattingEdits: provide,
    }),
    vscode.commands.registerCommand("plaintextFormatter.detectLanguage", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== "plaintext") return;
      const source = editor.selection.isEmpty
        ? editor.document.getText()
        : editor.document.getText(editor.selection);
      const analysis = analyzeDocument(source, threshold(editor.document));
      feedback.show(
        analysis.kind === "single-language"
          ? `${analysis.languageId.toUpperCase()} detected (${Math.round(analysis.confidence * 100)}%).`
          : analysis.kind === "mixed"
            ? `Mixed content: ${analysis.regions.length} code block(s) detected.`
            : "Plain text: no confident language detected.",
      );
    }),
    vscode.commands.registerCommand(
      "plaintextFormatter.formatDetectedBlocks",
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== "plaintext") return;
        const document = editor.document;
        const version = document.version;
        const source = document.getText();
        feedback.show("Detecting code blocks…");
        try {
          const options = safeOptions({
            tabSize:
              typeof editor.options.tabSize === "number"
                ? editor.options.tabSize
                : 2,
            insertSpaces: editor.options.insertSpaces !== false,
          });
          const plan = await service.plan(
            source,
            options,
            true,
            threshold(document),
            () => document.version !== version || document.isClosed,
          );
          if (document.version !== version || document.isClosed) {
            feedback.show("Document changed. Run formatting again.");
            return;
          }
          if (!plan.edits.length) {
            feedback.show(plan.message);
            return;
          }
          // TextEditor.edit performs a version-checked, single undoable transaction.
          const applied = await editor.edit((builder) => {
            for (const edit of plan.edits)
              builder.replace(
                new vscode.Range(
                  document.positionAt(edit.start),
                  document.positionAt(edit.end),
                ),
                edit.text,
              );
          });
          if (applied) feedback.success(plan.message);
          else feedback.show("Document changed. No edits applied.");
        } catch {
          feedback.show("Formatting failed safely. Text left unchanged.");
        }
      },
    ),
  );
}
