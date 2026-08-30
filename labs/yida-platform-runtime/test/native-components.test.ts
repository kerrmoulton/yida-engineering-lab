import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeNativeControlledValue, resolveNativeComponent } from '../src/native-components.ts';

test('native resolver prefers Deep direct components', () => {
  function EmployeeField() {}
  const result = resolveNativeComponent({ Deep: { EmployeeField } }, 'EmployeeField');
  assert.equal(result.source, 'Deep');
  assert.equal(result.component, EmployeeField);
});

test('native resolver supports DeepYida default and array registries', () => {
  function SelectField() {}
  function DepartmentField() {}
  assert.equal(
    resolveNativeComponent({ DeepYida: { default: { SelectField } } }, 'SelectField').component,
    SelectField,
  );
  assert.equal(
    resolveNativeComponent(
      { DeepYida: [{ displayName: 'DepartmentField', component: DepartmentField }] },
      'DepartmentField',
    ).component,
    DepartmentField,
  );
});

test('native resolver reports missing components without calling candidates', () => {
  let calls = 0;
  function EmployeeField() {
    calls += 1;
  }
  const result = resolveNativeComponent({ Deep: { EmployeeField } }, 'DepartmentField');
  assert.equal(result.source, 'none');
  assert.equal(result.component, null);
  assert.equal(calls, 0);
});

test('department output is normalized before controlled refill', () => {
  const raw = { value: 'dept-id', text: 'department-name' };
  assert.equal(normalizeNativeControlledValue('DepartmentField', raw), 'dept-id');
  assert.equal(normalizeNativeControlledValue('DepartmentField', [raw]), 'dept-id');
  assert.equal(normalizeNativeControlledValue('EmployeeField', raw), raw);
});

test('upload component change envelopes are normalized to controlled arrays', () => {
  const files = [{ name: 'probe.txt', status: 'selected' }];
  assert.equal(normalizeNativeControlledValue('AttachmentField', { value: files }), files);
  assert.equal(normalizeNativeControlledValue('ImageField', { value: files }), files);
});
