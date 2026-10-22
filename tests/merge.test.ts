import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLineChange } from '../src/merge.ts';
import type { LineChange } from '../src/merge.ts';

const change = (os: number, oe: number, ms: number, me: number): LineChange => ({
  originalStartLineNumber: os,
  originalEndLineNumber: oe,
  modifiedStartLineNumber: ms,
  modifiedEndLineNumber: me,
});

test('a changed hunk can be copied in either direction without altering other changes', () => {
  const original = 'başlık\neski\nortak\nsol değişiklik\n';
  const modified = 'başlık\nyeni\nortak\nsağ değişiklik\n';
  const hunk = change(2, 2, 2, 2);
  assert.equal(applyLineChange(original, modified, hunk, 'right'),
    'başlık\neski\nortak\nsağ değişiklik\n');
  assert.equal(applyLineChange(original, modified, hunk, 'left'),
    'başlık\nyeni\nortak\nsol değişiklik\n');
});

test('insertions and deletions work before first line, between lines and at EOF', () => {
  const cases: [string, string, LineChange][] = [
    ['a\nb', 'x\na\nb', change(0, 0, 1, 1)],
    ['a\nb', 'a\nx\nb', change(1, 0, 2, 2)],
    ['a\nb', 'a\nb\nx', change(2, 0, 3, 3)],
    ['a\nb\n', 'x\na\nb\n', change(0, 0, 1, 1)],
    ['a\nb\n', 'a\nx\nb\n', change(1, 0, 2, 2)],
    ['a\nb\n', 'a\nb\nx\n', change(2, 0, 3, 3)],
    ['a\nb', 'a\nx\ny\nb', change(1, 0, 2, 3)],
  ];
  for (const [original, modified, hunk] of cases) {
    assert.equal(applyLineChange(original, modified, hunk, 'right'), original);
    assert.equal(applyLineChange(original, modified, hunk, 'left'), modified);
    const reversed = change(hunk.modifiedStartLineNumber, hunk.modifiedEndLineNumber,
      hunk.originalStartLineNumber, hunk.originalEndLineNumber);
    assert.equal(applyLineChange(modified, original, reversed, 'right'), modified);
    assert.equal(applyLineChange(modified, original, reversed, 'left'), original);
  }
});

test('the final empty line represents adding or removing the final newline', () => {
  const hunk = change(1, 0, 2, 2);
  assert.equal(applyLineChange('satır', 'satır\n', hunk, 'right'), 'satır');
  assert.equal(applyLineChange('satır', 'satır\n', hunk, 'left'), 'satır\n');
  assert.equal(applyLineChange('satır\r\n', 'satır', change(2, 2, 1, 0), 'right'), 'satır\n');
});

test('empty entire documents, blank-only documents and full replacements work', () => {
  const cases: [string, string, LineChange][] = [
    ['', 'x', change(1, 1, 1, 1)],
    ['', 'x\n', change(1, 1, 1, 2)],
    ['', 'x\ny', change(1, 1, 1, 2)],
    ['', '\n', change(1, 1, 1, 2)],
    ['\n', '\n\n', change(1, 0, 2, 2)],
    ['ilk\nson', 'yeni\nsonuç\n', change(1, 2, 1, 3)],
    ['', '', change(1, 1, 1, 1)],
  ];
  for (const [original, modified, hunk] of cases) {
    assert.equal(applyLineChange(original, modified, hunk, 'right'), original);
    assert.equal(applyLineChange(original, modified, hunk, 'left'), modified);
  }
});

test('source lines adopt the target EOL without altering target trailing-newline state', () => {
  const original = 'başlık\neski\nson\n';
  const modified = 'başlık\r\nyeni\r\nson\r\n';
  const hunk = change(2, 2, 2, 2);
  assert.equal(applyLineChange(original, modified, hunk, 'right'), 'başlık\r\neski\r\nson\r\n');
  assert.equal(applyLineChange(original, modified, hunk, 'left'), 'başlık\nyeni\nson\n');
});

test('invalid or outdated ranges leave target text intact', () => {
  for (const hunk of [change(-1, 1, 1, 1), change(1, 10, 1, 1),
    change(1, 1, 0, 1), change(1, 1, 2, 1), change(NaN, 0, 1, 1)]) {
    assert.equal(applyLineChange('sol', 'sağ', hunk, 'right'), 'sağ');
    assert.equal(applyLineChange('sol', 'sağ', hunk, 'left'), 'sol');
  }
});

test('large inserted hunks do not exceed JavaScript function argument limits', () => {
  const original = 'ortak';
  const added = Array.from({ length: 150_000 }, (_, index) => `satır ${index}`).join('\n');
  const modified = `${added}\nortak`;
  const hunk = change(0, 0, 1, 150_000);
  assert.equal(applyLineChange(original, modified, hunk, 'right'), original);
  assert.equal(applyLineChange(original, modified, hunk, 'left'), modified);
});
