import { useEffect, useState, useMemo } from 'react';
import { Search, ShoppingCart, Package, ChevronDown, ChevronUp } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { useCart } from '../../context/CartContext';
import type { Product } from '../../lib/database.types';

function fmt(n: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n);
}

const CATEGORY_ORDER = ['Disposables', 'E-Liquids', 'Devices', 'Replacements'];

const CATEGORY_META: Record<string, { description: string; color: string }> = {
  Disposables: { description: 'Ready-to-use disposables, cigars and pre-filled pods', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  'E-Liquids':  { description: 'Nicotine salts, shortfills and nic shots', color: 'bg-brand-50 text-brand-700 border-brand-200' },
  Devices:      { description: 'Pod kits, starter kits and vape mods', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  Replacements: { description: 'Coils, pods, tanks, batteries and accessories', color: 'bg-amber-50 text-amber-700 border-amber-200' },
};

type ProductWithCategory = Product & { category: string };

function StockPill({ qty }: { qty: number }) {
  if (qty === 0) return <span className="text-xs font-medium text-red-500">Out of stock</span>;
  if (qty <= 20) return <span className="text-xs font-medium text-amber-600">{qty} left</span>;
  return <span className="text-xs font-medium text-emerald-600">In stock</span>;
}

function ProductRow({ product, onAdd, added, inCartQty, variations }: {
  product: ProductWithCategory;
  onAdd: (product: Product, qty: number) => void;
  added: boolean;
  inCartQty: number;
  variations?: ProductWithCategory[];
}) {
  const min = product.min_order_quantity || 1;
  const [qty, setQty] = useState(min);
  const [selectedVariation, setSelectedVariation] = useState<ProductWithCategory | null>(null);

  const isVariable = product.type === 'variable' && variations && variations.length > 0;
  const effectiveProduct = selectedVariation || product;
  const outOfStock = effectiveProduct.stock_qty === 0;

  // Maximum quantity that can still be added (stock minus what's already in cart)
  const maxAddable = Math.max(0, effectiveProduct.stock_qty - inCartQty);
  const atMax = qty >= maxAddable;

  // Clamp the selected quantity if it exceeds what's still addable (e.g. after adding to cart)
  useEffect(() => {
    if (maxAddable > 0 && qty > maxAddable) setQty(maxAddable);
  }, [maxAddable, qty]);

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/70 transition-colors border-b border-gray-100 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-gray-900 leading-tight">{product.name}</p>
          {min > 1 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
              Min. {min}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-0.5">SKU: {effectiveProduct.sku}</p>

        {isVariable && (
          <div className="mt-2 flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600">Choose variant:</label>
            <div className="flex flex-wrap gap-2">
              {variations?.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVariation(v)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border
                    ${selectedVariation?.id === v.id
                      ? 'bg-brand-600 text-white border-brand-600'
                      : v.stock_qty === 0
                      ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
                      : 'bg-white text-gray-900 border-gray-200 hover:border-brand-400'
                    }`}
                  disabled={v.stock_qty === 0}
                >
                  <div className="text-left">
                    <div>{v.name}</div>
                    <div className={`text-xs mt-0.5 ${selectedVariation?.id === v.id ? 'text-brand-100' : 'text-gray-500'}`}>
                      {fmt(v.wholesale_price)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="hidden sm:flex flex-col items-end w-24 flex-shrink-0">
        <span className="text-sm font-bold text-brand-600">{fmt(effectiveProduct.wholesale_price)}</span>
        <span className="text-xs text-gray-400">MSRP {fmt(effectiveProduct.msrp)}</span>
      </div>

      <div className="hidden md:flex justify-end w-20 flex-shrink-0">
        {isVariable && !selectedVariation ? (
          <span className="text-xs font-medium text-gray-400">Select option</span>
        ) : (
          <StockPill qty={effectiveProduct.stock_qty} />
        )}
      </div>

      {!outOfStock && (!isVariable || selectedVariation) && (
        <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setQty(q => Math.max(min, q - 1))}
              className="px-2 py-1.5 text-gray-500 hover:bg-gray-100 transition-colors text-sm font-medium leading-none"
            >−</button>
            <input
              type="number"
              min={min}
              max={maxAddable}
              value={qty}
              onChange={e => {
                const n = parseInt(e.target.value, 10);
                if (!isNaN(n) && n >= min) setQty(Math.min(n, maxAddable));
              }}
              className="w-10 text-center text-xs font-semibold text-gray-900 border-x border-gray-200 py-1.5 focus:outline-none bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              onClick={() => setQty(q => Math.min(maxAddable, q + 1))}
              disabled={atMax}
              className="px-2 py-1.5 text-gray-500 hover:bg-gray-100 transition-colors text-sm font-medium leading-none disabled:opacity-30 disabled:cursor-not-allowed"
            >+</button>
          </div>
          {atMax && maxAddable > 0 && (
            <span className="text-[10px] text-amber-600 font-medium">Max {maxAddable}</span>
          )}
        </div>
      )}

      <div className="flex-shrink-0">
        <button
          onClick={() => onAdd(effectiveProduct, qty)}
          disabled={outOfStock || (isVariable && !selectedVariation) || maxAddable === 0}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap
            ${added
              ? 'bg-emerald-500 text-white'
              : outOfStock || (isVariable && !selectedVariation) || maxAddable === 0
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-brand-600 hover:bg-brand-700 text-white'}`}
        >
          <ShoppingCart size={12} />
          {added
            ? 'Added!'
            : isVariable && !selectedVariation
            ? 'Select variant'
            : maxAddable === 0 && inCartQty > 0
            ? `Max in cart (${inCartQty})`
            : inCartQty > 0
            ? `In cart (${inCartQty})`
            : 'Add'}
        </button>
      </div>
    </div>
  );
}

function CategorySection({ category, products, allProducts, addedIds, cartItems, onAdd }: {
  category: string;
  products: ProductWithCategory[];
  allProducts: ProductWithCategory[];
  addedIds: Set<string>;
  cartItems: { product: Product; quantity: number }[];
  onAdd: (product: Product, qty: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const meta = CATEGORY_META[category] ?? { description: '', color: 'bg-gray-50 text-gray-700 border-gray-200' };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-4">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border flex-shrink-0 ${meta.color}`}>
            {category}
          </span>
          <span className="text-xs text-gray-400 hidden sm:inline truncate">{meta.description}</span>
          <span className="text-xs font-medium text-gray-500 flex-shrink-0">{products.length} products</span>
        </div>
        {collapsed
          ? <ChevronDown size={15} className="text-gray-400 flex-shrink-0 ml-2" />
          : <ChevronUp size={15} className="text-gray-400 flex-shrink-0 ml-2" />}
      </button>

      {!collapsed && (
        <div className="border-t border-gray-100">
          <div className="hidden sm:flex items-center gap-4 px-4 py-2 bg-gray-50 border-b border-gray-100">
            <div className="flex-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">Product</div>
            <div className="w-24 text-right text-xs font-semibold text-gray-400 uppercase tracking-wide">Price</div>
            <div className="hidden md:block w-20 text-right text-xs font-semibold text-gray-400 uppercase tracking-wide">Stock</div>
            <div className="flex-shrink-0 w-16" />
          </div>
          {products.map(product => {
            const variations = allProducts.filter(p => p.parent_id === product.id);
            return (
              <ProductRow
                key={product.id}
                product={product}
                added={addedIds.has(product.id)}
                inCartQty={cartItems.find(i => i.product.id === product.id)?.quantity ?? 0}
                onAdd={onAdd}
                variations={variations.length > 0 ? variations : undefined}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Products() {
  const { addItem, items } = useCart();
  const [allProducts, setAllProducts] = useState<ProductWithCategory[]>([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase.from('products').select('*').eq('is_active', true).order('name').then(({ data }) => {
      setAllProducts((data as ProductWithCategory[]) || []);
      setLoading(false);
    });
  }, []);

  function handleAdd(product: Product, qty: number) {
    addItem(product, qty);
    setAddedIds(prev => new Set([...prev, product.id]));
    setTimeout(() => setAddedIds(prev => { const n = new Set(prev); n.delete(product.id); return n; }), 1500);
  }

  // Filter out variations (products with parent_id) from display
  const products = useMemo(() => allProducts.filter(p => !p.parent_id), [allProducts]);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const cat of CATEGORY_ORDER) {
      if (products.some(p => p.category === cat)) { seen.add(cat); result.push(cat); }
    }
    for (const p of products) {
      if (p.category && !seen.has(p.category)) { seen.add(p.category); result.push(p.category); }
    }
    return result;
  }, [products]);

  const filtered = useMemo(() => products.filter(p => {
    const q = search.toLowerCase();
    if (!q) return activeCategory === 'all' || p.category === activeCategory;

    // Check parent product match
    const matchParent = p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);

    // Check variation SKU match if product is variable
    let matchVariation = false;
    if (p.type === 'variable') {
      matchVariation = allProducts.some(v => v.parent_id === p.id && v.sku.toLowerCase().includes(q));
    }

    const matchSearch = matchParent || matchVariation;
    const matchCat = activeCategory === 'all' || p.category === activeCategory;
    return matchSearch && matchCat;
  }), [products, allProducts, search, activeCategory]);

  const grouped = useMemo(() => {
    const map = new Map<string, ProductWithCategory[]>();
    for (const p of filtered) {
      const key = p.category || 'Other';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    const ordered: [string, ProductWithCategory[]][] = [];
    for (const cat of CATEGORY_ORDER) {
      if (map.has(cat)) ordered.push([cat, map.get(cat)!]);
    }
    for (const [k, v] of map) {
      if (!CATEGORY_ORDER.includes(k)) ordered.push([k, v]);
    }
    return ordered;
  }, [filtered]);

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Product Catalogue</h2>
        <p className="text-gray-500 text-sm mt-0.5">Wholesale pricing — all prices ex. VAT</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
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
            onClick={() => setActiveCategory('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${activeCategory === 'all' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >All</button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${activeCategory === cat ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >{cat}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="h-12 bg-gray-50 animate-pulse" />
              {[...Array(4)].map((_, j) => <div key={j} className="h-14 border-t border-gray-100 animate-pulse" />)}
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Package size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No products found.</p>
        </div>
      ) : (
        grouped.map(([category, prods]) => (
          <CategorySection
            key={category}
            category={category}
            products={prods}
            allProducts={allProducts}
            addedIds={addedIds}
            cartItems={items}
            onAdd={handleAdd}
          />
        ))
      )}
    </div>
  );
}
