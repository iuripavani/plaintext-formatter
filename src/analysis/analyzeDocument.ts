import { MAX_DOCUMENT_LENGTH, type DocumentAnalysis } from "./types";
import { detectLanguage } from "../detection/detectionEngine";
import { detectRegions } from "../regions/regionDetector";

export function analyzeDocument(
  text: string,
  threshold = 0.9,
): DocumentAnalysis {
  if (!text.trim() || text.length > MAX_DOCUMENT_LENGTH)
    return { kind: "plaintext" };
  const detection = detectLanguage(text);
  if (detection && detection.confidence >= threshold)
    return { kind: "single-language", ...detection };
  const regions = detectRegions(text, threshold);
  return regions.length ? { kind: "mixed", regions } : { kind: "plaintext" };
}
