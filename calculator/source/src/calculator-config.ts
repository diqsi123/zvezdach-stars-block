// The rate agreed for this calculator; update when the selling rate changes.
export const PRICE_PER_STAR = 1.7;
export type PaymentMethod = 'sbp' | 'card' | 'crypto';
export const formatNumber = (value: number, decimals = 2) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: decimals }).format(value);
