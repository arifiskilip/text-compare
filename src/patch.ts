import { createTwoFilesPatch } from 'diff';

function safeName(name: string, fallback: string): string {
  return name.replace(/[\r\n\t]/g, ' ').trim() || fallback;
}

/** A standard unified patch, including markers for missing final newlines. */
export function createUnifiedPatch(
  original: string,
  modified: string,
  originalName = 'orijinal.txt',
  modifiedName = 'degistirilmis.txt',
): string {
  return createTwoFilesPatch(
    safeName(originalName, 'orijinal.txt'),
    safeName(modifiedName, 'degistirilmis.txt'),
    original,
    modified,
    undefined,
    undefined,
    { context: 3 },
  );
}
