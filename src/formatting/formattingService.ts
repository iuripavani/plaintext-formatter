import { analyzeDocument } from "../analysis/analyzeDocument";
import {
  MAX_DOCUMENT_LENGTH,
  type FormatOptions,
  type OffsetEdit,
} from "../analysis/types";
import type { FormattingRouter } from "./formattingRouter";
import { validateOutput } from "../validation/validator";

export interface FormatPlan {
  edits: OffsetEdit[];
  message: string;
}
export class FormattingService {
  constructor(private readonly router: FormattingRouter) {}

  async plan(
    source: string,
    options: FormatOptions,
    blocks = false,
    threshold = 0.9,
    cancelled = (): boolean => false,
  ): Promise<FormatPlan> {
    if (source.length > MAX_DOCUMENT_LENGTH)
      return {
        edits: [],
        message:
          "Document exceeds the 200,000-character safety limit. Format a smaller selection.",
      };
    const analysis = analyzeDocument(source, threshold);
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
    for (const region of regions) {
      const original = source.slice(region.start, region.end);
      const result = await this.router.format(
        original,
        region.languageId,
        options,
        cancelled,
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
      message: edits.length
        ? `${analysis.kind === "single-language" ? analysis.languageId.toUpperCase() : `${edits.length} code block(s)`} formatted${failures ? `; ${failures} unsupported or invalid block(s) left unchanged` : ""}.`
        : failures
          ? "No validated formatter result. Text left unchanged."
          : "Already formatted.",
    };
  }
}
