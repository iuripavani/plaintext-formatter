import * as vscode from "vscode";
import type { DocumentAnalysis, LanguageId } from "../analysis/types";
import type { FormattingStage } from "../formatting/formattingService";

/** A deliberately short pause makes each native progress update perceptible. */
export const VISIBLE_PROGRESS_STEP_MS = 350;

export interface ProgressReporter {
  start(): Promise<void>;
  stage(stage: FormattingStage): Promise<void>;
  finish(message: string): Promise<void>;
}

export async function withFormattingProgress<T>(
  operation: (reporter: ProgressReporter) => Promise<T>,
  delay: (milliseconds: number) => Promise<void> = wait,
): Promise<T> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Plaintext Formatter",
      cancellable: false,
    },
    async (progress) => {
      let lastPercent = 0;
      let lastMessage = "";
      const report = async (message: string, percent: number) => {
        const nextPercent = Math.max(lastPercent, Math.min(100, percent));
        if (message === lastMessage && nextPercent === lastPercent) return;
        progress.report({
          message,
          increment: nextPercent - lastPercent,
        });
        lastMessage = message;
        lastPercent = nextPercent;
        await delay(VISIBLE_PROGRESS_STEP_MS);
      };
      const reporter: ProgressReporter = {
        start: () => report("Detecting language…", 8),
        stage: (stage) => {
          if (stage.phase === "detected")
            return report(detectionMessage(stage.analysis), 24);
          const position = (stage.regionIndex + 1) / stage.regionCount;
          const percent =
            stage.phase === "formatting"
              ? 30 + Math.round(position * 35)
              : 70 + Math.round(position * 20);
          const label = stage.language.toUpperCase();
          const message =
            stage.phase === "formatting"
              ? `Formatting ${label}${regionSuffix(stage.regionIndex, stage.regionCount)}…`
              : `Validating ${label}${regionSuffix(stage.regionIndex, stage.regionCount)}…`;
          return report(message, percent);
        },
        finish: (message) => report(message, 100),
      };
      await reporter.start();
      return operation(reporter);
    },
  );
}

function regionSuffix(index: number, total: number): string {
  return total > 1 ? ` (block ${index + 1} of ${total})` : "";
}

function detectionMessage(analysis: DocumentAnalysis): string {
  if (analysis.kind === "single-language")
    return `${analysis.languageId.toUpperCase()} detected (${Math.round(analysis.confidence * 100)}%)`;
  if (analysis.kind === "mixed")
    return `${analysis.regions.length} code block(s) detected`;
  return "No confident code detected";
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function completionMessage(
  message: string,
  language?: LanguageId,
): string {
  if (language && message.startsWith(`${language.toUpperCase()} formatted`))
    return `${language.toUpperCase()} formatted`;
  if (message.startsWith("Already formatted")) return "Already formatted";
  if (message.startsWith("No confidently detected"))
    return "No code detected; text left unchanged";
  if (message.startsWith("Mixed content"))
    return "Mixed content; text left unchanged";
  if (message.startsWith("Formatting cancelled")) return "Formatting cancelled";
  if (message.startsWith("No validated")) return "No valid formatter result";
  if (message.startsWith("Document exceeds")) return "Document is too large";
  return message;
}
