import { DomainError } from './domain-error.js';

declare const moneyAmountBrand: unique symbol;
declare const currencyCodeBrand: unique symbol;

export type MoneyAmount = string & {
  readonly [moneyAmountBrand]: 'MoneyAmount';
};

export type CurrencyCode = string & {
  readonly [currencyCodeBrand]: 'CurrencyCode';
};

const MONEY_PATTERN = /^(0|[1-9]\d{0,15})(?:\.(\d{1,2}))?$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export function asMoneyAmount(value: string): MoneyAmount {
  const normalized = value.trim();
  const match = MONEY_PATTERN.exec(normalized);
  if (!match) {
    throw new DomainError(
      'INVALID_MONEY_AMOUNT',
      'Money amount must be a non-negative decimal with at most two decimal places.',
    );
  }

  const whole = match[1]!;
  const fraction = (match[2] ?? '').padEnd(2, '0');
  return `${whole}.${fraction}` as MoneyAmount;
}

export function asCurrencyCode(value: string): CurrencyCode {
  const normalized = value.trim().toUpperCase();
  if (!CURRENCY_PATTERN.test(normalized)) {
    throw new DomainError(
      'INVALID_CURRENCY_CODE',
      'Currency must be a three-letter currency code.',
    );
  }

  return normalized as CurrencyCode;
}
