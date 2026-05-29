import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ShoppingCart, X } from 'lucide-react';
import { useCart } from '../context/CartContext';

function fmt(n: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n);
}

export default function CartToast() {
  const { lastAdded, clearLastAdded, itemCount, total } = useCart();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!lastAdded) return;
    setVisible(true);
    const hideTimer = setTimeout(() => setVisible(false), 4000);
    const clearTimer = setTimeout(() => clearLastAdded(), 4300);
    return () => {
      clearTimeout(hideTimer);
      clearTimeout(clearTimer);
    };
  }, [lastAdded, clearLastAdded]);

  if (!lastAdded) return null;

  return (
    <div
      className={`fixed bottom-4 right-4 z-[60] w-80 max-w-[calc(100vw-2rem)] transition-all duration-300 ease-out
        ${visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'}`}
    >
      <div className="bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border-b border-emerald-100">
          <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
            <Check size={12} className="text-white" />
          </div>
          <span className="text-sm font-semibold text-emerald-800 flex-1">Added to cart</span>
          <button
            onClick={() => setVisible(false)}
            className="text-emerald-400 hover:text-emerald-600 p-0.5"
          >
            <X size={14} />
          </button>
        </div>

        {/* Product details */}
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
            {lastAdded.product.image_url ? (
              <img src={lastAdded.product.image_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ShoppingCart size={18} className="text-gray-300" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{lastAdded.product.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Qty: {lastAdded.quantity} × {fmt(lastAdded.product.wholesale_price)}
            </p>
          </div>
        </div>

        {/* Footer with cart summary + view cart */}
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
          <div className="text-xs text-gray-500">
            <span className="font-semibold text-gray-900">{itemCount}</span> item{itemCount !== 1 ? 's' : ''} · {fmt(total)}
          </div>
          <Link
            to="/cart"
            onClick={() => setVisible(false)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <ShoppingCart size={12} />
            View Cart
          </Link>
        </div>
      </div>
    </div>
  );
}
