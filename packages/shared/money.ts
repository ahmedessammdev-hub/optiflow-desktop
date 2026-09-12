export function minor(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) throw new Error('Enter a nonnegative amount with at most two decimals');
  const [whole, fraction = ''] = value.trim().split('.');
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (result > 1_000_000_000_000n) throw new Error('Amount is too large');
  return Number(result);
}
export function checked(value: number): number {
  if (!Number.isSafeInteger(value) || Math.abs(value) > 1_000_000_000_000) throw new Error('Invalid money amount');
  return value;
}
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) return weights.map(() => 0);
  const parts = weights.map(w => Number(BigInt(total) * BigInt(w) / BigInt(sum)));
  let remainder = total - parts.reduce((a, b) => a + b, 0);
  for (let i = 0; remainder > 0; i = (i + 1) % parts.length) { parts[i]++; remainder--; }
  return parts;
}
export function totals(lines: { quantity: number; unit_price: number }[], discount: number, tax: number) {
  const subtotal = checked(lines.reduce((sum, l) => sum + checked(l.quantity * l.unit_price), 0));
  if (discount < 0 || discount > subtotal || tax < 0) throw new Error('Invalid discount or tax');
  return { subtotal, discount, tax, total: checked(subtotal - discount + tax) };
}
export function formatCurrency(amount: number, currency = 'EGP', language = 'en') {
  return new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en-GB', { style: 'currency', currency }).format(amount / 100);
}
export function growth(current: number, previous: number): number | null {
  return previous === 0 ? (current === 0 ? 0 : null) : (current - previous) / Math.abs(previous) * 100;
}
