import type { FormatOptions, LanguageId } from "../analysis/types";
export type BackendResult =
  { kind: "formatted"; text: string } | { kind: "unavailable" };
export interface FormattingBackend {
  format(
    text: string,
    language: LanguageId,
    options: FormatOptions,
  ): Promise<BackendResult>;
}
