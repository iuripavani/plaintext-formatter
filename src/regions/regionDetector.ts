import { MAX_REGIONS, type DetectedRegion } from "../analysis/types";
import { detectLanguage } from "../detection/detectionEngine";

interface Span {
  start: number;
  end: number;
}
const overlaps = (a: Span, b: Span): boolean =>
  a.start < b.end && b.start < a.end;

export function resolveOverlaps(regions: DetectedRegion[]): DetectedRegion[] {
  const rank = { fence: 3, parser: 2, heuristic: 1 };
  const selected: DetectedRegion[] = [];
  for (const region of [...regions].sort(
    (a, b) =>
      rank[b.source] - rank[a.source] ||
      b.confidence - a.confidence ||
      b.end - b.start - (a.end - a.start),
  )) {
    if (!selected.some((other) => overlaps(region, other)))
      selected.push(region);
  }
  return selected.sort((a, b) => a.start - b.start).slice(0, MAX_REGIONS);
}

export function detectRegions(text: string, threshold = 0.9): DetectedRegion[] {
  const candidates: DetectedRegion[] = [];
  const protectedSpans: Span[] = [];
  const lines = [...text.matchAll(/[^\n]*(?:\n|$)/g)].filter(
    (match) => match[0],
  );
  const aliases: Record<string, string> = {
    js: "javascript",
    ts: "typescript",
    yml: "yaml",
    py: "python",
    xml: "xml",
    html: "html",
    json: "json",
    jsonc: "jsonc",
    sql: "sql",
    yaml: "yaml",
    javascript: "javascript",
    typescript: "typescript",
    css: "css",
    python: "python",
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const opening = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)\r?\n?$/.exec(line[0]);
    if (!opening) continue;
    const marker = opening[1]!;
    const label = opening[2]!.trim().toLowerCase();
    let close = i + 1;
    while (
      close < lines.length &&
      !new RegExp(
        `^ {0,3}${marker[0]}{${marker.length},}[ \\t]*\\r?\\n?$`,
      ).test(lines[close]![0])
    )
      close++;
    const end = close < lines.length ? lines[close]!.index : text.length;
    protectedSpans.push({
      start: line.index,
      end: close < lines.length ? end + lines[close]![0].length : end,
    });
    if (close < lines.length) {
      const start = line.index + line[0].length;
      const detection = detectLanguage(text.slice(start, end));
      // Fences establish boundaries, never bypass content validation or force an unknown language.
      if (
        detection &&
        detection.confidence >= threshold &&
        (!label || aliases[label] === detection.languageId)
      )
        candidates.push({ ...detection, start, end, source: "fence" });
    }
    i = close;
  }
  const add = (start: number, end: number): boolean => {
    if (
      candidates.length >= MAX_REGIONS ||
      protectedSpans.some((span) => overlaps(span, { start, end }))
    )
      return false;
    const detection = detectLanguage(text.slice(start, end));
    if (!detection || detection.confidence < threshold) return false;
    candidates.push({
      ...detection,
      start,
      end,
      source: detection.languageId === "python" ? "heuristic" : "parser",
    });
    return true;
  };
  // Blank-separated paragraphs support coherent multiline YAML, SQL, and XML blocks.
  for (const paragraph of text.matchAll(/\S[^]*?(?=\r?\n[ \t]*\r?\n|$)/g)) {
    const raw = paragraph[0];
    add(paragraph.index, paragraph.index + raw.trimEnd().length);
  }
  // Bounded line-boundary scans also handle prose immediately adjacent to code.
  let budget = 250_000;
  for (
    let i = 0;
    i < lines.length && candidates.length < MAX_REGIONS && budget > 0;
    i++
  ) {
    const line = lines[i]!;
    if (
      protectedSpans.some(
        (span) => line.index >= span.start && line.index < span.end,
      )
    )
      continue;
    if (
      !/^\s*(?:[[{<]|select\b|insert\b|update\b|delete\b|merge\b|with\b|create\b|alter\b)/i.test(
        line[0],
      )
    )
      continue;
    const start = line.index + line[0].search(/\S/);
    for (let j = i; j < Math.min(lines.length, i + 150); j++) {
      const last = lines[j]!;
      const end = last.index + last[0].trimEnd().length;
      budget -= end - start;
      if (budget < 0) break;
      if (add(start, end)) {
        i = j;
        break;
      }
    }
  }
  return resolveOverlaps(candidates);
}
