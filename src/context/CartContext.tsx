import { createContext, useContext, useState, ReactNode } from 'react';
import type { CartItem, Product } from '../lib/database.types';

export type LastAdded = { product: Product; quantity: number; timestamp: number };

interface CartContextType {
  items: CartItem[];
  addItem: (product: Product, quantity: number) => void;
  updateItem: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
  total: number;
  itemCount: number;
  hasItems: boolean;
  lastAdded: LastAdded | null;
  clearLastAdded: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [lastAdded, setLastAdded] = useState<LastAdded | null>(null);

  function addItem(product: Product, quantity: number) {
    setItems(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) {
        return prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + quantity } : i);
      }
      return [...prev, { product, quantity }];
    });
    setLastAdded({ product, quantity, timestamp: Date.now() });
  }

  function clearLastAdded() { setLastAdded(null); }

  function updateItem(productId: string, quantity: number) {
    if (quantity <= 0) { removeItem(productId); return; }
    setItems(prev => prev.map(i => i.product.id === productId ? { ...i, quantity } : i));
  }

  function removeItem(productId: string) {
    setItems(prev => prev.filter(i => i.product.id !== productId));
  }

  function clearCart() { setItems([]); }

  const total = items.reduce((sum, i) => sum + i.product.wholesale_price * i.quantity, 0);
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const hasItems = items.length > 0;

  return (
    <CartContext.Provider value={{ items, addItem, updateItem, removeItem, clearCart, total, itemCount, hasItems, lastAdded, clearLastAdded }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
