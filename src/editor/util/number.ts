export const clampNumber = (value: number, min?: number, max?: number) =>
  Math.min(
    max ?? Number.POSITIVE_INFINITY,
    Math.max(min ?? Number.NEGATIVE_INFINITY, value),
  );

const getDecimalPrecision = (value: number) => {
  const [coefficient, exponentText] = String(value).toLowerCase().split('e');
  const fractionalDigits = coefficient?.split('.')[1]?.length ?? 0;
  const exponent = Number(exponentText ?? 0);
  return Math.max(0, fractionalDigits - exponent);
};

export const addDecimalStep = (
  value: number,
  step: number,
  direction: 1 | -1,
) => {
  const precision = Math.max(
    getDecimalPrecision(value),
    getDecimalPrecision(step),
  );
  const scale = 10 ** precision;
  const scaledValue = Math.round(value * scale);
  const scaledStep = Math.round(step * scale);
  if (!Number.isSafeInteger(scaledValue) || !Number.isSafeInteger(scaledStep)) {
    return value + step * direction;
  }
  return (scaledValue + scaledStep * direction) / scale;
};

export const isPositiveFiniteNumber = (
  value: number | undefined,
): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

export const isNonNegativeFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

export const normalizeNonNegativeFiniteNumber = (value: number) =>
  isNonNegativeFiniteNumber(value) ? value : 0;
