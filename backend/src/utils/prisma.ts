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
    return parseFloat(value);
  }

  return value.toNumber();
}
