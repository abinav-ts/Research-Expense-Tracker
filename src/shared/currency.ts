// ISO 4217 minor-unit exponents (REQ-SET-06). Anything not listed has 2 decimals.

const ZERO_DECIMAL = ['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'XAF', 'XOF', 'XPF', 'PYG', 'RWF', 'DJF', 'GNF', 'KMF', 'VUV'];
const THREE_DECIMAL = ['KWD', 'BHD', 'OMR', 'JOD', 'TND', 'LYD', 'IQD'];

export const COMMON_CURRENCIES = [
  'INR', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'SGD', 'AED', 'CNY', 'KRW', 'SEK', 'NOK', 'DKK', 'NZD', 'THB', 'MYR', 'HKD', 'ZAR',
];

export function currencyExponent(code: string): number {
  const c = code.toUpperCase();
  if (ZERO_DECIMAL.includes(c)) return 0;
  if (THREE_DECIMAL.includes(c)) return 3;
  return 2;
}

export const isCurrencyCode = (code: string): boolean => /^[A-Za-z]{3}$/.test(code);
