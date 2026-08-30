import assert from 'node:assert/strict';
import test from 'node:test';
import { triggerFilePicker } from '../src/file-picker.ts';

test('custom browser control triggers a hidden file input', () => {
  const clicks: string[] = [];
  const result = triggerFilePicker({
    querySelector: (selector: string) =>
      selector === 'input[type="file"]' ? { click: () => clicks.push('file-input') } : null,
  });

  assert.deepEqual(result, { opened: true, triggerKind: 'file-input' });
  assert.deepEqual(clicks, ['file-input']);
});

test('native attachment host falls back to its scoped clickable control', () => {
  const clicks: string[] = [];
  const result = triggerFilePicker({
    querySelector: (selector: string) =>
      selector === 'button,[role="button"]' ? { click: () => clicks.push('native-control') } : null,
  });

  assert.deepEqual(result, { opened: true, triggerKind: 'native-control' });
  assert.deepEqual(clicks, ['native-control']);
});

test('missing native trigger returns an observable deterministic result', () => {
  assert.deepEqual(triggerFilePicker({ querySelector: () => null }), {
    opened: false,
    code: 'FILE_PICKER_TRIGGER_NOT_FOUND',
  });
});
