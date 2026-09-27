import type { FormatOptions, LanguageId } from "../analysis/types";
import { validateOutput } from "../validation/validator";
import type { FormattingBackend } from "./formattingBackend";

export type RouteResult =
  | { kind: "formatted"; text: string }
  | { kind: "unchanged" | "unavailable" | "failed" };
export class FormattingRouter {
  constructor(private readonly backends: readonly FormattingBackend[]) {}
  async format(
    source: string,
    language: LanguageId,
    options: FormatOptions,
    cancelled = (): boolean => false,
  ): Promise<RouteResult> {
    let failed = false;
    for (const backend of this.backends) {
      if (cancelled()) return { kind: "failed" };
      try {
        const result = await backend.format(source, language, options);
        if (cancelled()) return { kind: "failed" };
        if (result.kind === "unavailable") continue;
        if (!validateOutput(source, result.text, language)) {
          failed = true;
          continue;
        }
        if (result.text === source) return { kind: "unchanged" };
        return result;
      } catch {
        failed = true;
      }
    }
    return { kind: failed ? "failed" : "unavailable" };
  }
}
