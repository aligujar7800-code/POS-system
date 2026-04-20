import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Customer {
  id: number;
  name: string;
  phone: string;
  outstanding_balance: number;
}

export interface CartItem {
  product_id: number;
  variant_id?: number;
  product_name: string;
  barcode?: string;
  quantity: number;
  unit_price: number;
  discount: number;       // absolute amount
  discount_type: 'amount' | 'percent';
  total_price: number;
}

interface CartDiscount {
  type: 'amount' | 'percent';
  value: number;
}

interface CartState {
  items: CartItem[];
  customer: Customer | null;
  cartDiscount: CartDiscount;

  addItem: (item: Omit<CartItem, 'total_price'>) => void;
  removeItem: (index: number) => void;
  updateQty: (index: number, qty: number) => void;
  updateItemDiscount: (index: number, discount: number, type: 'amount' | 'percent') => void;
  setCustomer: (customer: Customer | null) => void;
  setCartDiscount: (discount: CartDiscount) => void;
  clearCart: () => void;

  // Computed
  subtotal: () => number;
  itemDiscount: () => number;
  cartDiscountAmount: () => number;
  totalDiscount: () => number;
  taxAmount: (taxPct: number) => number;
  grandTotal: (taxPct: number) => number;
}

function calcItemTotal(item: Omit<CartItem, 'total_price'>) {
  const gross = item.unit_price * item.quantity;
  const disc = item.discount_type === 'percent'
    ? (gross * item.discount) / 100
    : item.discount;
  return Math.max(0, gross - disc);
}

export const useCartStore = create<CartState>()((set, get) => ({
  items: [],
  customer: null,
  cartDiscount: { type: 'amount', value: 0 },

  addItem: (newItem) => {
    set((state) => {
      const existingIdx = state.items.findIndex(
        (i) => i.product_id === newItem.product_id && i.variant_id === newItem.variant_id
      );
      if (existingIdx >= 0) {
        const updated = [...state.items];
        const existing = { ...updated[existingIdx] };
        existing.quantity += newItem.quantity;
        existing.total_price = calcItemTotal(existing);
        updated[existingIdx] = existing;
        return { items: updated };
      }
      const total_price = calcItemTotal(newItem);
      return { items: [...state.items, { ...newItem, total_price }] };
    });
  },

  removeItem: (index) =>
    set((state) => ({ items: state.items.filter((_, i) => i !== index) })),

  updateQty: (index, qty) =>
    set((state) => {
      const updated = [...state.items];
      const item = { ...updated[index], quantity: Math.max(1, qty) };
      item.total_price = calcItemTotal(item);
      updated[index] = item;
      return { items: updated };
    }),

  updateItemDiscount: (index, discount, type) =>
    set((state) => {
      const updated = [...state.items];
      const item = { ...updated[index], discount, discount_type: type };
      item.total_price = calcItemTotal(item);
      updated[index] = item;
      return { items: updated };
    }),

  setCustomer: (customer) => set({ customer }),
  setCartDiscount: (cartDiscount) => set({ cartDiscount }),
  clearCart: () => set({ items: [], customer: null, cartDiscount: { type: 'amount', value: 0 } }),

  subtotal: () => get().items.reduce((s, i) => s + i.unit_price * i.quantity, 0),
  itemDiscount: () => get().items.reduce((s, i) => {
    const gross = i.unit_price * i.quantity;
    return s + (i.discount_type === 'percent' ? (gross * i.discount) / 100 : i.discount);
  }, 0),
  cartDiscountAmount: () => {
    const { cartDiscount, subtotal, itemDiscount } = get();
    const afterItems = subtotal() - itemDiscount();
    return cartDiscount.type === 'percent'
      ? (afterItems * cartDiscount.value) / 100
      : cartDiscount.value;
  },
  totalDiscount: () => get().itemDiscount() + get().cartDiscountAmount(),
  taxAmount: (taxPct) => {
    const base = get().subtotal() - get().totalDiscount();
    return (base * taxPct) / 100;
  },
  grandTotal: (taxPct) => {
    const base = get().subtotal() - get().totalDiscount();
    return base + get().taxAmount(taxPct);
  },
}));
