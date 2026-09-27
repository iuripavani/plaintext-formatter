import * as vscode from "vscode";
import type { FormatOptions, LanguageId } from "../analysis/types";
import type { BackendResult, FormattingBackend } from "./formattingBackend";
import { applyOffsetEdits } from "./formattingEdits";

const PROVIDER_TIMEOUT_MS = 5_000;
const BUILTIN_EXTENSIONS: Partial<Record<LanguageId, string>> = {
  json: "vscode.json-language-features",
  jsonc: "vscode.json-language-features",
  css: "vscode.css-language-features",
  html: "vscode.html-language-features",
  javascript: "vscode.typescript-language-features",
  typescript: "vscode.typescript-language-features",
};

export class VSCodeFormattingBackend implements FormattingBackend {
  async format(
    text: string,
    language: LanguageId,
    options: FormatOptions,
  ): Promise<BackendResult> {
    const document = await vscode.workspace.openTextDocument({
      language,
      content: text,
    });
    const snapshot = document.getText();
    const version = document.version;
    const requestEdits = async (): Promise<vscode.TextEdit[] | undefined> => {
      const builtinId = BUILTIN_EXTENSIONS[language];
      // Opening a document triggers activation, but the provider command can race
      // registration. Await known built-ins through the public extension API.
      if (builtinId)
        await vscode.extensions.getExtension(builtinId)?.activate();
      const edits = await vscode.commands.executeCommand<
        vscode.TextEdit[] | undefined
      >("vscode.executeFormatDocumentProvider", document.uri, options);
      if (edits?.length) return edits;
      // Some native formatters (including CSS) expose only a range provider.
      return vscode.commands.executeCommand<vscode.TextEdit[] | undefined>(
        "vscode.executeFormatRangeProvider",
        document.uri,
        new vscode.Range(
          document.positionAt(0),
          document.positionAt(snapshot.length),
        ),
        options,
      );
    };
    // The API has no provider enumeration/selection or cancellation argument.
    // A timeout bounds our wait, but cannot stop another extension's execution.
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const edits = await Promise.race([
        requestEdits(),
        new Promise<undefined>((resolve) => {
          timer = setTimeout(() => resolve(undefined), PROVIDER_TIMEOUT_MS);
        }),
      ]);
      if (!edits?.length) return { kind: "unavailable" };
      if (document.version !== version || document.isClosed)
        throw new Error("Virtual document changed during formatting");
      const offsets = edits.map((edit) => {
        if (!document.validateRange(edit.range).isEqual(edit.range))
          throw new Error("Provider returned an invalid range");
        return {
          start: document.offsetAt(edit.range.start),
          end: document.offsetAt(edit.range.end),
          text: edit.newText,
        };
      });
      return { kind: "formatted", text: applyOffsetEdits(snapshot, offsets) };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
