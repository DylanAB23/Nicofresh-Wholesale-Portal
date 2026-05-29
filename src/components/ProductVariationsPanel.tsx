import { X, Edit2 } from 'lucide-react';
import { useState } from 'react';
import type { Product } from '../lib/database.types';
import { supabase } from '../lib/supabase';

function fmt(n: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n);
}

export default function ProductVariationsPanel({
  parentProduct,
  variations,
  onClose,
  onVariationUpdated,
}: {
  parentProduct: Product;
  variations: Product[];
  onClose: () => void;
  onVariationUpdated: (updatedVariation: Product) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingStock, setEditingStock] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  async function updateStock() {
    if (!editingId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('products')
        .update({ stock_qty: editingStock })
        .eq('id', editingId);

      if (!error) {
        const updated = variations.find(v => v.id === editingId);
        if (updated) {
          onVariationUpdated({ ...updated, stock_qty: editingStock });
        }
        setEditingId(null);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-900">Variations</h2>
            <p className="text-xs text-gray-500 mt-0.5">{parentProduct.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-3">
          {variations.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No variations found.</p>
          ) : (
            variations.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{v.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">SKU: {v.sku}</p>
                  <p className="text-xs text-gray-400 mt-1">£{v.wholesale_price.toFixed(2)}</p>
                </div>

                <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                  {editingId === v.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={editingStock}
                        onChange={(e) => setEditingStock(parseInt(e.target.value) || 0)}
                        className="w-16 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                      <button
                        onClick={updateStock}
                        disabled={saving}
                        className="px-2 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded font-medium transition-colors"
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="text-right">
                        <p className={`text-sm font-medium ${
                          v.stock_qty === 0 ? 'text-red-600' :
                          v.stock_qty < 20 ? 'text-amber-600' :
                          'text-gray-900'
                        }`}>
                          {v.stock_qty}
                        </p>
                        <p className="text-xs text-gray-500">stock</p>
                      </div>
                      <button
                        onClick={() => {
                          setEditingId(v.id);
                          setEditingStock(v.stock_qty);
                        }}
                        className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50 transition-colors"
                      >
                        <Edit2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
