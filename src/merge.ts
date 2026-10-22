/** The line ranges returned by Monaco's diff editor getLineChanges(). */
export interface LineChange {
  originalStartLineNumber: number;
  originalEndLineNumber: number;
  modifiedStartLineNumber: number;
  modifiedEndLineNumber: number;
}

interface LineSlice {
  start: number;
  end: number;
}

function lineSlice(startLine: number, endLine: number, lineCount: number): LineSlice | null {
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine)
    || startLine < 0 || endLine < 0) return null;
  // For insertion/deletion anchors, Monaco uses the previous line, starting at 0.
  if (endLine === 0) {
    return startLine <= lineCount ? { start: startLine, end: startLine } : null;
  }
  if (startLine < 1 || endLine < startLine || endLine > lineCount) return null;
  return { start: startLine - 1, end: endLine };
}

/**
 * Copies one current Monaco diff hunk into the opposite text.
 * `right` returns the updated modified text; `left` returns the updated original.
 * A trailing empty logical line must remain in the arrays: it represents the
 * final newline and can itself be the changed line. EOLs follow the target text.
 * Invalid/out-of-bounds ranges leave the target unchanged.
 */
export function applyLineChange(
  original: string,
  modified: string,
  change: LineChange,
  direction: 'left' | 'right',
): string {
  const originalLines = original.split(/\r\n|\n|\r/);
  const modifiedLines = modified.split(/\r\n|\n|\r/);
  const originalSlice = lineSlice(
    change.originalStartLineNumber, change.originalEndLineNumber, originalLines.length,
  );
  const modifiedSlice = lineSlice(
    change.modifiedStartLineNumber, change.modifiedEndLineNumber, modifiedLines.length,
  );
  const targetText = direction === 'right' ? modified : original;
  if (!originalSlice || !modifiedSlice) return targetText;

  const [source, sourceSlice, target, targetSlice] = direction === 'right'
    ? [originalLines, originalSlice, modifiedLines, modifiedSlice] as const
    : [modifiedLines, modifiedSlice, originalLines, originalSlice] as const;
  const eol = targetText.includes('\r\n') ? '\r\n'
    : targetText.includes('\r') ? '\r' : '\n';

  // Array spread avoids splice's argument-count limit for large inserted hunks.
  return [
    ...target.slice(0, targetSlice.start),
    ...source.slice(sourceSlice.start, sourceSlice.end),
    ...target.slice(targetSlice.end),
  ].join(eol);
}
