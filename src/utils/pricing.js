export const GST_RATE = 8;

export function roundPrice(value) {
  return Math.round(Number(value || 0));
}

export function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export function formatPrice(value) {
  return `MVR ${roundPrice(value)}`;
}

export function formatPrice2(value) {
  return `MVR ${roundMoney(value).toFixed(2)}`;
}

// Menu prices are customer-facing gross prices: GST is already included.
// This returns the GST contained inside a gross amount, to 2 decimal places.
export function calculateIncludedGST(grossAmount, rate = GST_RATE) {
  const gross = Number(grossAmount || 0);
  const taxRate = Number(rate || GST_RATE);
  if (!taxRate) return 0;
  return roundMoney(gross * taxRate / (100 + taxRate));
}

// Returns the GST-exclusive amount contained inside a GST-inclusive price.
export function calculateExclusiveAmount(grossAmount, rate = GST_RATE) {
  const gross = Number(grossAmount || 0);
  return roundMoney(gross - calculateIncludedGST(gross, rate));
}

export function calculateGrossTotal(items = [], deliveryFee = 0) {
  const itemTotal = items.reduce(
    (sum, item) => sum + roundPrice(item.price) * Math.max(0, Number(item.quantity || 0)),
    0,
  );
  return roundPrice(itemTotal + Number(deliveryFee || 0));
}
