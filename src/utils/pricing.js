export const GST_RATE = 8;

export function roundPrice(value) {
  return Math.round(Number(value || 0));
}

export function formatPrice(value) {
  return `MVR ${roundPrice(value)}`;
}

// Menu prices are customer-facing gross prices: GST is already included.
export function calculateIncludedGST(grossAmount, rate = GST_RATE) {
  const gross = Number(grossAmount || 0);
  const taxRate = Number(rate || GST_RATE);
  if (!taxRate) return 0;
  return Math.round(gross * taxRate / (100 + taxRate));
}

export function calculateGrossTotal(items = [], deliveryFee = 0) {
  const itemTotal = items.reduce(
    (sum, item) => sum + roundPrice(item.price) * Math.max(0, Number(item.quantity || 0)),
    0,
  );
  return roundPrice(itemTotal + Number(deliveryFee || 0));
}
