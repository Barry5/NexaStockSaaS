export interface CartLine {
  product: { id: string; name: string; quantity: number; sellPrice: number };
  quantity: number;
  negotiatedPrice: number;
  lineDiscount: number;
}

export interface CheckoutTotals {
  cartSubtotal: number;
  subtotalDiscount: number;
  computedTax: number;
  orderTotal: number;
  remainingBalance: number;
  changeReturned: number;
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

export function calculateCheckoutTotals(
  cart: CartLine[],
  globalDiscount: number,
  globalDiscountType: 'fixed' | 'percent',
  taxRate: number,
  extraFees: number,
  paymentMethod: string,
  amountPaid: number,
): CheckoutTotals {
  const cartSubtotal = roundCurrency(cart.reduce((sum, item) => {
    const discountedPrice = Math.max(0, item.negotiatedPrice - item.lineDiscount);
    return sum + discountedPrice * item.quantity;
  }, 0));

  const subtotalDiscount = roundCurrency(globalDiscountType === 'percent'
    ? (cartSubtotal * globalDiscount) / 100
    : Math.min(globalDiscount, cartSubtotal));

  const computedTax = roundCurrency(taxRate === 0 ? 0 : Math.max(0, cartSubtotal - subtotalDiscount) * (taxRate / 100));
  const orderTotal = roundCurrency(Math.max(0, cartSubtotal - subtotalDiscount + computedTax + Number(extraFees)));
  const remainingBalance = roundCurrency(paymentMethod === 'credit' ? Math.max(0, orderTotal - amountPaid) : 0);
  const changeReturned = roundCurrency(paymentMethod !== 'credit' && amountPaid > orderTotal ? amountPaid - orderTotal : 0);

  return {
    cartSubtotal,
    subtotalDiscount,
    computedTax,
    orderTotal,
    remainingBalance,
    changeReturned,
  };
}

export function buildSaleItems(cart: CartLine[], isBrouillon: boolean, checkoutDeliveryStatus: 'livre_total' | 'non_livre') {
  return cart.map(item => {
    const qtyDeliv = isBrouillon ? 0 : (checkoutDeliveryStatus === 'livre_total' ? item.quantity : 0);
    return {
      productId: item.product.id,
      productName: item.product.name,
      quantity: item.quantity,
      price: item.negotiatedPrice,
      total: item.negotiatedPrice * item.quantity,
      qtyDelivered: qtyDeliv,
      qtyRemaining: Math.max(0, item.quantity - qtyDeliv),
      qtyReturned: 0,
    };
  });
}

export function createInstallments(remainingBalance: number, installmentsCount: number, creditDueDate: string) {
  const installments: Array<{ id: string; amount: number; dueDate: string; status: string }> = [];
  if (remainingBalance <= 0 || installmentsCount <= 0) return installments;

  const partAmount = Math.round(remainingBalance / installmentsCount);
  const d = new Date(creditDueDate);

  for (let i = 0; i < installmentsCount; i++) {
    const installmentDate = new Date(d);
    installmentDate.setDate(installmentDate.getDate() + (i * 30));
    installments.push({
      id: `inst-${Date.now()}-${i}`,
      amount: i === installmentsCount - 1 ? (remainingBalance - (partAmount * (installmentsCount - 1))) : partAmount,
      dueDate: installmentDate.toISOString().split('T')[0],
      status: 'En attente',
    });
  }

  return installments;
}
