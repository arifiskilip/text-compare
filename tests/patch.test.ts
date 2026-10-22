import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPatch, parsePatch } from 'diff';
import { createUnifiedPatch } from '../src/patch.ts';

test('unified patches round trip additions, deletions, Unicode and empty text', () => {
  const cases = [
    ['', 'Yeni dosya\n'],
    ['Silinen metin\n', ''],
    ['aynı\neski\nson\n', 'aynı\nyeni\nson\n'],
    ['İstanbul: ğüşiöç\n🌿\n', 'İstanbul: ĞÜŞİÖÇ\n🌳\n'],
    ['', ''],
    ['aynı\n', 'aynı\n'],
  ];
  for (const [original, modified] of cases) {
    const patch = createUnifiedPatch(original, modified, 'önce.txt', 'sonra.txt');
    assert.equal(applyPatch(original, patch), modified);
    const parsed = parsePatch(patch);
    assert.equal(parsed[0].oldFileName, 'önce.txt');
    assert.equal(parsed[0].newFileName, 'sonra.txt');
  }
});

test('unified patches preserve final-newline changes and CRLF line endings', () => {
  for (const [original, modified] of [
    ['satır', 'satır\n'],
    ['satır\n', 'satır'],
    ['ilk\r\neski\r\nson\r\n', 'ilk\r\nyeni\r\nson\r\n'],
    ['önce', 'sonra'],
  ]) {
    const patch = createUnifiedPatch(original, modified);
    assert.equal(applyPatch(original, patch), modified);
  }
});

test('file names cannot inject additional patch headers', () => {
  const patch = createUnifiedPatch('a\n', 'b\n', 'old\n@@ injected', 'new\tfile');
  assert.equal(parsePatch(patch).length, 1);
  assert.equal(applyPatch('a\n', patch), 'b\n');
  assert.equal(parsePatch(patch)[0].newFileName, 'new file');
});
