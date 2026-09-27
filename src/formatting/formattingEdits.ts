import type { OffsetEdit } from "../analysis/types";

export function applyOffsetEdits(source: string, edits: OffsetEdit[]): string {
  const ordered = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
  let end = -1;
  for (const edit of ordered) {
    if (
      !Number.isInteger(edit.start) ||
      !Number.isInteger(edit.end) ||
      edit.start < 0 ||
      edit.end < edit.start ||
      edit.end > source.length ||
      edit.start < end ||
      (edit.start === end && edit.start === edit.end)
    )
      throw new Error("Invalid or overlapping formatter edits");
    end = edit.end;
  }
  let output = source;
  for (const edit of ordered.reverse())
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  return output;
}
