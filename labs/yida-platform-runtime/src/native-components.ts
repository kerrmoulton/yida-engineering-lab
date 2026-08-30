import type React from 'react';

export type NativeComponentName =
  'EmployeeField' | 'DepartmentField' | 'SelectField' | 'AttachmentField' | 'ImageField' | 'DataManageViews';

export interface NativeComponentResolution {
  name: NativeComponentName;
  source: 'Deep' | 'DeepYida' | 'YidaNativeComponents' | 'none';
  component: React.ElementType | null;
}

function renderable(value: unknown): React.ElementType | null {
  if (typeof value === 'function') return value as React.ElementType;
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.render === 'function') return value as React.ElementType;
  for (const key of ['component', 'Component', 'default']) {
    if (typeof candidate[key] === 'function') return candidate[key] as React.ElementType;
  }
  return null;
}

export function resolveNativeComponent(
  root: Record<string, unknown>,
  name: NativeComponentName,
): NativeComponentResolution {
  const sources: Array<[NativeComponentResolution['source'], unknown]> = [
    ['Deep', root.Deep],
    ['DeepYida', root.DeepYida],
    ['YidaNativeComponents', root.YidaNativeComponents],
  ];
  for (const [source, raw] of sources) {
    if (!raw) continue;
    const sourceValue =
      source === 'DeepYida' && typeof raw === 'object' && raw !== null
        ? (raw as Record<string, unknown>).default || raw
        : raw;
    const direct =
      sourceValue && (typeof sourceValue === 'object' || typeof sourceValue === 'function')
        ? renderable((sourceValue as Record<string, unknown>)[name])
        : null;
    if (direct) return { name, source, component: direct };
    if (Array.isArray(sourceValue)) {
      const item = sourceValue.find((entry) => {
        if (!entry || typeof entry !== 'object') return false;
        const value = entry as Record<string, unknown>;
        return value.displayName === name || value.name === name;
      });
      const component = renderable(item);
      if (component) return { name, source, component };
    }
  }
  return { name, source: 'none', component: null };
}

export function normalizeNativeControlledValue(name: NativeComponentName, value: unknown) {
  if (
    (name === 'AttachmentField' || name === 'ImageField') &&
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {
    const candidate = value as Record<string, unknown>;
    if (Array.isArray(candidate.value)) return candidate.value;
  }
  if (name !== 'DepartmentField' || !value || typeof value !== 'object') return value;
  const item = Array.isArray(value) ? value[0] : value;
  if (!item || typeof item !== 'object') return value;
  const candidate = item as Record<string, unknown>;
  return candidate.value ?? candidate.deptId ?? value;
}
