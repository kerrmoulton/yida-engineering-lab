export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 409,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function requiredText(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim())
    throw new DomainError('INVALID_INPUT', `${label}不能为空`, 400);
  return value.trim();
}

export function requiredNumber(
  value: unknown,
  label: string,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new DomainError('INVALID_INPUT', `${label}必须是 ${minimum} 到 ${maximum} 之间的数字`, 400);
  }
  return value;
}

export function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
