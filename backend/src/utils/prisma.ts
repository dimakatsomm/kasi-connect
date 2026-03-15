import { Prisma } from '@prisma/client';

export function decimalToNumber(
  value: Prisma.Decimal | number | string | null | undefined,
  fallback = 0
): number {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return value.toNumber();
}
