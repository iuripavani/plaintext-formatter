import { analyzeDocument } from "../analysis/analyzeDocument";
import {
  MAX_DOCUMENT_LENGTH,
  type FormatOptions,
  type LanguageId,
  type OffsetEdit,
} from "../analysis/types";
import type { FormattingPhase, FormattingRouter } from "./formattingRouter";
import type { DocumentAnalysis } from "../analysis/types";

export type FormattingStage =
  | { phase: "detected"; analysis: DocumentAnalysis }
  | {
      phase: FormattingPhase;
      language: LanguageId;
      regionIndex: number;
      regionCount: number;
    };
import { validateOutput } from "../validation/validator";

export interface FormatPlan {
  edits: OffsetEdit[];
  message: string;
  languageId?: LanguageId;
}
export class FormattingService {
  constructor(private readonly router: FormattingRouter) {}

  async plan(
    source: string,
    options: FormatOptions,
    blocks = false,
    threshold = 0.9,
    cancelled = (): boolean => false,
    onStage?: (stage: FormattingStage) => void | Promise<void>,
  ): Promise<FormatPlan> {
    if (source.length > MAX_DOCUMENT_LENGTH)
      return {
        edits: [],
        message:
          "Document exceeds the 200,000-character safety limit. Format a smaller selection.",
      };
    const analysis = analyzeDocument(source, threshold);
    await onStage?.({ phase: "detected", analysis });
    if (cancelled()) return { edits: [], message: "Formatting cancelled." };
    if (analysis.kind === "plaintext")
      return {
        edits: [],
        message: "No confidently detected code. Text left unchanged.",
      };
    if (analysis.kind === "mixed" && !blocks)
      return {
        edits: [],
        message:
          "Mixed content: use Format Selection or Format Detected Code Blocks.",
      };
    const regions =
      analysis.kind === "single-language"
        ? [{ ...analysis, start: 0, end: source.length }]
        : analysis.regions;
    const edits: OffsetEdit[] = [];
    let failures = 0;
    for (const [regionIndex, region] of regions.entries()) {
      const original = source.slice(region.start, region.end);
      const result = await this.router.format(
        original,
        region.languageId,
        options,
        cancelled,
        (phase, language) =>
          onStage?.({
            phase,
            language,
            regionIndex,
            regionCount: regions.length,
          }),
      );
      if (cancelled()) return { edits: [], message: "Formatting cancelled." };
      if (result.kind === "formatted") {
        // Preserve the region's newline boundary, especially the newline before a closing fence.
        const suffix = original.match(/(?:\r?\n)$/)?.[0] ?? "";
        const text = result.text.replace(/(?:\r?\n)+$/, "") + suffix;
        if (
          text !== original &&
          validateOutput(original, text, region.languageId)
        )
          edits.push({ start: region.start, end: region.end, text });
      } else if (result.kind !== "unchanged") failures++;
    }
    return {
      edits,
      languageId:
        analysis.kind === "single-language" ? analysis.languageId : undefined,
      message: edits.length
        ? `${analysis.kind === "single-language" ? analysis.languageId.toUpperCase() : `${edits.length} code block(s)`} formatted${failures ? `; ${failures} unsupported or invalid block(s) left unchanged` : ""}.`
        : failures
          ? "No validated formatter result. Text left unchanged."
          : "Already formatted.",
    };
  }
}
