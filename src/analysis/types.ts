export const LANGUAGES = [
  "json",
  "jsonc",
  "xml",
  "yaml",
  "sql",
  "html",
  "javascript",
  "typescript",
  "css",
  "python",
] as const;
export type LanguageId = (typeof LANGUAGES)[number];
export interface DetectionResult {
  languageId: LanguageId;
  confidence: number;
  evidence: string[];
}
export interface DetectedRegion extends DetectionResult {
  start: number;
  end: number;
  source: "fence" | "parser" | "heuristic";
}
export type DocumentAnalysis =
  | ({ kind: "single-language" } & DetectionResult)
  | { kind: "mixed"; regions: DetectedRegion[] }
  | { kind: "plaintext" };
export interface FormatOptions {
  tabSize: number;
  insertSpaces: boolean;
}
export interface OffsetEdit {
  start: number;
  end: number;
  text: string;
}
export const MAX_DOCUMENT_LENGTH = 200_000;
export const MAX_REGIONS = 100;
