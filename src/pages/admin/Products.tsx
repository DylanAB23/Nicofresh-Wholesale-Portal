import { useEffect, useState } from 'react';
import { Search, Package, Plus, X, CreditCard as Edit2, ToggleLeft, ToggleRight, RefreshCw, Upload, Trash2, AlertTriangle, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import WooImport from '../../components/WooImport';
import ShipStationImport from '../../components/ShipStationImport';
import ProductVariationsPanel from '../../components/ProductVariationsPanel';
import type { Product, Category } from '../../lib/database.types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function fmt(n: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n);
}

const BLANK = {
  sku: '', name: '', description: '', image_url: '', wholesale_price: '',
  msrp: '', case_quantity: '1', min_order_quantity: '1', stock_quantity: '0',
  category_id: '', is_active: true,
};

export default function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<typeof BLANK>({ ...BLANK });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ShipStation product import
  const [showShipStationImport, setShowShipStationImport] = useState(false);

  // Multi-select delete
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Delete all products
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  // Variations panel
  const [showVariationsPanel, setShowVariationsPanel] = useState(false);
  const [selectedParentProduct, setSelectedParentProduct] = useState<Product | null>(null);
  const [parentVariations, setParentVariations] = useState<Product[]>([]);

  async function syncInventory() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setSyncMessage({ type: 'error', text: 'Not authenticated' });
        return;
      }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/shipstation-sync/inventory`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json();

      if (!res.ok) {
        setSyncMessage({ type: 'error', text: data.error || 'Sync failed' });
        return;
      }

      const { summary } = data;
      setSyncMessage({
        type: 'success',
        text: `✓ Synced: ${summary.updated} updated, ${summary.skipped} skipped out of ${summary.shipstation_items} ShipStation items`,
      });

      await load();
    } catch (err) {
      setSyncMessage({ type: 'error', text: `Sync failed: ${err instanceof Error ? err.message : 'Unknown error'}` });
    } finally {
      setSyncing(false);
    }
  }

  async function load() {
    const [prodsRes, catsRes] = await Promise.all([
      supabase.from('products').select('*').order('name'),
      supabase.from('categories').select('*').order('sort_order'),
    ]);
    setProducts(prodsRes.data || []);
    setCategories(catsRes.data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openCreate() { setEditId(null); setForm({ ...BLANK }); setShowModal(true); }

  async function openEdit(p: Product) {
    setEditId(p.id);
    setForm({
      sku: p.sku,
      name: p.name,
      description: p.description,
      image_url: p.image_url,
      wholesale_price: p.wholesale_price.toString(),
      msrp: p.msrp.toString(),
      case_quantity: p.case_quantity.toString(),
      min_order_quantity: p.min_order_quantity.toString(),
      stock_quantity: p.stock_qty.toString(),
      category_id: p.category_id || '',
      is_active: p.is_active,
    });

    setShowModal(true);
  }

  async function save() {
    setSaving(true);
    const payload = {
      sku: form.sku,
      name: form.name,
      description: form.description,
      image_url: form.image_url,
      wholesale_price: parseFloat(form.wholesale_price) || 0,
      msrp: parseFloat(form.msrp) || 0,
      regular_price: parseFloat(form.msrp) || 0,
      case_quantity: parseInt(form.case_quantity) || 1,
      min_order_quantity: parseInt(form.min_order_quantity) || 1,
      stock_qty: parseInt(form.stock_quantity) || 0,
      category_id: form.category_id || null,
      is_active: form.is_active,
    };
    if (editId) {
      await supabase.from('products').update(payload).eq('id', editId);
    } else {
      await supabase.from('products').insert(payload);
    }
    setSaving(false);
    setShowModal(false);
    await load();
  }

  async function toggleActive(p: Product) {
    await supabase.from('products').update({ is_active: !p.is_active }).eq('id', p.id);
    await load();
  }

  function update(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }));
  }

  // Selection helpers
  const filteredIds = filtered().map(p => p.id);
  const allSelected = filteredIds.length > 0 && filteredIds.every(id => selected.has(id));
  const someSelected = filteredIds.some(id => selected.has(id));

  function toggleRow(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(prev => { const next = new Set(prev); filteredIds.forEach(id => next.delete(id)); return next; });
    } else {
      setSelected(prev => new Set([...prev, ...filteredIds]));
    }
  }

  async function deleteSelected() {
    setDeleting(true);
    const ids = [...selected];
    await supabase.from('products').delete().in('id', ids);
    setSelected(new Set());
    setShowDeleteConfirm(false);
    setDeleting(false);
    await load();
  }

  async function deleteAllProducts() {
    setDeletingAll(true);
    await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    setShowDeleteAllConfirm(false);
    setDeletingAll(false);
    await load();
  }

  async function openVariationsPanel(product: Product) {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('parent_id', product.id)
      .order('name');

    setSelectedParentProduct(product);
    setParentVariations(data || []);
    setShowVariationsPanel(true);
  }

  function handleVariationUpdated(updatedVariation: Product) {
    setProducts(prods =>
      prods.map(p => p.id === updatedVariation.id ? updatedVariation : p)
    );
    setParentVariations(vars =>
      vars.map(v => v.id === updatedVariation.id ? updatedVariation : v)
    );
  }

  function filtered() {
    return products.filter(p => {
      // Hide variations - only show parent/simple products
      if (p.parent_id) return false;

      const q = search.toLowerCase();
      // Check parent product match
      const matchParent = p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);

      // Check variation SKU match if product is variable
      let matchVariation = false;
      if (p.type === 'variable' && q) {
        matchVariation = products.some(v => v.parent_id === p.id && v.sku.toLowerCase().includes(q));
      }

      const matchSearch = !q || matchParent || matchVariation;
      return matchSearch && (catFilter === 'all' || p.category_id === catFilter);
    });
  }

  const rows = filtered();
  const selectedCount = selected.size;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Products</h2>
          <p className="text-gray-500 text-sm mt-0.5">{products.length} products in catalog</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={syncInventory}
            disabled={syncing}
            className="flex items-center gap-2 bg-slate-700 hover:bg-slate-800 disabled:opacity-60 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
          >
            <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'Sync Inventory'}
          </button>
          <button
            onClick={() => setShowShipStationImport(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
          >
            <Upload size={15} /> Import ShipStation
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
          >
            <Upload size={15} /> Import CSV
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
          >
            <Plus size={15} /> Add Product
          </button>
          <button
            onClick={() => setShowDeleteAllConfirm(true)}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
          >
            <Trash2 size={15} /> Delete All
          </button>
        </div>
      </div>

      {syncMessage && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium flex items-center justify-between
          ${syncMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          <span>{syncMessage.text}</span>
          <button onClick={() => setSyncMessage(null)} className="ml-3 opacity-60 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or SKU..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg overflow-x-auto">
          <button
            onClick={() => setCatFilter('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${catFilter === 'all' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >All</button>
          {categories.map(c => (
            <button
              key={c.id}
              onClick={() => setCatFilter(c.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${catFilter === c.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >{c.name}</button>
          ))}
        </div>
      </div>

      {/* Bulk action bar — slides in when items are selected */}
      {selectedCount > 0 && (
        <div className="mb-4 flex items-center justify-between px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm font-semibold text-red-700">
            {selectedCount} product{selectedCount !== 1 ? 's' : ''} selected
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs text-red-500 hover:text-red-700 font-medium px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors"
            >
              Clear selection
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors"
            >
              <Trash2 size={13} /> Delete {selectedCount}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[...Array(6)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-20">
          <Package size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No products found.</p>
          {products.length === 0 && (
            <button
              onClick={() => setShowImport(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors"
            >
              <Upload size={15} /> Import from WooCommerce
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded accent-brand-600 cursor-pointer"
                  />
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Product</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">SKU</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Category</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">Wholesale</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">Stock</th>
                <th className="text-center text-xs font-semibold text-gray-500 px-4 py-3">Active</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(p => {
                const cat = categories.find(c => c.id === p.category_id);
                const isSelected = selected.has(p.id);
                return (
                  <tr
                    key={p.id}
                    className={`transition-colors ${isSelected ? 'bg-red-50/60' : 'hover:bg-gray-50'}`}
                  >
                    <td className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(p.id)}
                        className="w-4 h-4 rounded accent-brand-600 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => p.type === 'variable' ? openVariationsPanel(p) : openEdit(p)}
                        className="flex items-center gap-3 hover:bg-gray-100/50 px-2 py-1 rounded-lg transition-colors w-full"
                      >
                        <div className="w-9 h-9 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                          {p.image_url && <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />}
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 line-clamp-1">{p.name}</p>
                          {p.type === 'variable' && (
                            <span className="inline-flex items-center gap-1 text-xs text-brand-600 font-medium mt-0.5">
                              (Variations) <ChevronRight size={12} />
                            </span>
                          )}
                        </div>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="group relative inline-block">
                        <p className="text-xs text-gray-600 font-mono cursor-help">{p.sku}</p>
                        {p.type === 'variable' && (function() {
                          const variations = products.filter(v => v.parent_id === p.id);
                          return (
                            <div className="absolute bottom-full left-0 mb-2 bg-gray-900 text-white text-xs px-3 py-2 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
                              {variations.length > 0 ? (
                                <>
                                  <p className="font-semibold">Variations:</p>
                                  <p>{variations.map(v => v.sku).join(', ')}</p>
                                </>
                              ) : (
                                <p>No variations</p>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{cat?.name || '—'}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-brand-600 text-right">{fmt(p.wholesale_price)}</td>
                    <td className="px-4 py-3 text-sm text-right">
                      {p.type === 'variable' ? (
                        <span className="text-xs font-medium text-gray-400">—</span>
                      ) : (
                        <span className={p.stock_qty === 0 ? 'text-red-600 font-medium' : p.stock_qty < 20 ? 'text-amber-600 font-medium' : 'text-gray-900'}>
                          {p.stock_qty}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleActive(p)}
                        className={`transition-colors ${p.is_active ? 'text-emerald-500 hover:text-emerald-600' : 'text-gray-300 hover:text-gray-500'}`}
                      >
                        {p.is_active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50 transition-colors">
                        <Edit2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit / Add modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 my-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-900">{editId ? 'Edit Product' : 'Add Product'}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Product Name *</label>
                <input type="text" value={form.name} onChange={update('name')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">SKU *</label>
                <input type="text" value={form.sku} onChange={update('sku')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Category</label>
                <select value={form.category_id} onChange={update('category_id')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="">No category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Wholesale Price (£) *</label>
                <input type="number" step="0.01" value={form.wholesale_price} onChange={update('wholesale_price')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">MSRP (£)</label>
                <input type="number" step="0.01" value={form.msrp} onChange={update('msrp')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Case Qty</label>
                <input type="number" value={form.case_quantity} onChange={update('case_quantity')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Min. Order Qty</label>
                <input type="number" value={form.min_order_quantity} onChange={update('min_order_quantity')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Stock Qty</label>
                <input type="number" value={form.stock_quantity} onChange={update('stock_quantity')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Image URL</label>
                <input type="text" value={form.image_url} onChange={update('image_url')} placeholder="https://..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Description</label>
                <textarea value={form.description} onChange={update('description')} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4 accent-brand-600" />
                <label htmlFor="is_active" className="text-sm text-gray-700">Active (visible to customers)</label>
              </div>
            </div>

            {/* Variations note for parent products */}
            {editId && (function() {
              const currentProduct = products.find(p => p.id === editId);
              return currentProduct?.type === 'variable' && (
                <div className="mt-6 pt-6 border-t border-gray-200 bg-brand-50 border-brand-200 rounded-lg p-4">
                  <p className="text-sm text-brand-900 font-medium">This is a parent product with variations.</p>
                  <p className="text-xs text-brand-700 mt-1">Edit variation stock from the product table by clicking on "(Variations)".</p>
                </div>
              );
            })()}

            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button
                onClick={save}
                disabled={saving || !form.name || !form.sku || !form.wholesale_price}
                className="flex-1 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-semibold"
              >
                {saving ? 'Saving...' : editId ? 'Save Changes' : 'Add Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={18} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Delete {selectedCount} product{selectedCount !== 1 ? 's' : ''}?</h3>
                <p className="text-xs text-gray-500 mt-0.5">This cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={deleteSelected}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
              >
                {deleting ? 'Deleting...' : `Delete ${selectedCount}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteAllConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={18} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Delete ALL products?</h3>
                <p className="text-xs text-gray-500 mt-0.5">This will permanently delete all {products.length} products. This cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowDeleteAllConfirm(false)}
                className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={deleteAllProducts}
                disabled={deletingAll}
                className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
              >
                {deletingAll ? 'Deleting...' : 'Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Variations Panel */}
      {showVariationsPanel && selectedParentProduct && (
        <ProductVariationsPanel
          parentProduct={selectedParentProduct}
          variations={parentVariations}
          onClose={() => setShowVariationsPanel(false)}
          onVariationUpdated={handleVariationUpdated}
        />
      )}

      {/* ShipStation product import modal */}
      {showShipStationImport && (
        <ShipStationImport
          onDone={() => { setShowShipStationImport(false); load(); }}
          onClose={() => setShowShipStationImport(false)}
        />
      )}

      {/* WooCommerce CSV import modal */}
      {showImport && (
        <WooImport
          onDone={() => { setShowImport(false); load(); }}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}
