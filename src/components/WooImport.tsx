import { useState, useRef, useCallback } from 'react';
import { Upload, X, AlertCircle, CheckCircle, FileText, ChevronDown, ChevronUp, RefreshCw, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

// ---------------------------------------------------------------------------
// WooCommerce CSV column → internal field mapping
// Matches the standard WooCommerce product export format exactly.
// ---------------------------------------------------------------------------
const WOO_COLUMNS = {
  ID: 'woo_id',
  Type: 'type',
  SKU: 'sku',
  Name: 'name',
  Published: 'published',
  'Short description': 'short_description',
  Description: 'description',
  'Regular price': 'regular_price',
  'Sale price': 'sale_price',
  Categories: 'categories_raw',
  Tags: 'tags',
  Images: 'images_raw',
  'In stock?': 'in_stock_raw',
  Stock: 'stock_qty_raw',
  'Parent (SKU of the parent product)': 'parent_sku',
  'Attribute 1 name': 'attr1_name',
  'Attribute 1 value(s)': 'attr1_values',
  'Attribute 2 name': 'attr2_name',
  'Attribute 2 value(s)': 'attr2_values',
  'Attribute 3 name': 'attr3_name',
  'Attribute 3 value(s)': 'attr3_values',
  'Attribute 4 name': 'attr4_name',
  'Attribute 4 value(s)': 'attr4_values',
  'Attribute 5 name': 'attr5_name',
  'Attribute 5 value(s)': 'attr5_values',
  'Attribute 6 name': 'attr6_name',
  'Attribute 6 value(s)': 'attr6_values',
  'Attribute 7 name': 'attr7_name',
  'Attribute 7 value(s)': 'attr7_values',
  'Attribute 8 name': 'attr8_name',
  'Attribute 8 value(s)': 'attr8_values',
} as const;

// Known WooCommerce attribute names → DB columns
const ATTR_MAP: Record<string, string> = {
  brand: 'brand',
  'nicotine mg': 'nicotine_mg',
  'e-liquid style': 'e_liquid_style',
  'eliquid style': 'e_liquid_style',
  colour: 'colour',
  color: 'colour',
  ohm: 'ohm',
  'pack size': 'pack_size',
  ml: 'ml',
  flavour: 'flavour',
  flavor: 'flavour',
};

// Get all category levels from a WooCommerce category string
// "Classic Vaping > E-Liquids > Nicofresh E-Liquid" → ["Classic Vaping", "Classic Vaping > E-Liquids", "Classic Vaping > E-Liquids > Nicofresh E-Liquid"]
function getCategoryPath(raw: string): string[] {
  if (!raw) return [];
  const categories = raw.split(',').map(s => s.trim());
  const paths: string[] = [];

  for (const cat of categories) {
    const parts = cat.split('>').map(p => p.trim());
    let path = '';
    for (const part of parts) {
      path = path ? `${path} > ${part}` : part;
      if (!paths.includes(path)) {
        paths.push(path);
      }
    }
  }

  return paths;
}

// Top-level category from a WooCommerce category string like "Disposables > Sub"
function topCategory(raw: string): string {
  if (!raw) return '';
  return raw.split(',')[0].split('>')[0].trim();
}

// Build a hierarchical category tree from all products
interface CategoryNode {
  [key: string]: {
    count: number;
    selected: number;
    children?: CategoryNode;
    path: string; // Full path to this node (e.g., "Classic Vaping > E-Liquids > Nicofresh E-Liquid")
  };
}

function buildCategoryTree(products: ImportRow[], selectedIndices: Set<number>): CategoryNode {
  const tree: CategoryNode = {};
  const allPaths = new Set<string>();

  // Collect all unique category paths from all products
  for (const product of products) {
    const paths = getCategoryPath(product.categories_raw);
    for (const path of paths) {
      allPaths.add(path);
    }
  }

  // Build tree structure and count products
  for (const fullPath of Array.from(allPaths).sort()) {
    const parts = fullPath.split('>').map(p => p.trim());
    let current = tree;

    // Build the tree hierarchy
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const currentPath = parts.slice(0, i + 1).join(' > ');

      if (!current[part]) {
        current[part] = {
          count: 0,
          selected: 0,
          path: currentPath,
          children: {}
        };
      }

      // At the leaf node, count products that have this exact full path
      if (i === parts.length - 1) {
        for (let j = 0; j < products.length; j++) {
          const productFullPath = getCategoryPath(products[j].categories_raw)[
            getCategoryPath(products[j].categories_raw).length - 1
          ];
          if (productFullPath === currentPath) {
            current[part].count++;
            if (selectedIndices.has(j)) {
              current[part].selected++;
            }
          }
        }
      }

      current = current[part].children!;
    }
  }

  return tree;
}

// Parse a CSV line respecting quoted fields (handles commas and newlines inside quotes)
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { field += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  result.push(field);
  return result;
}

// Full CSV parser — handles multi-line quoted fields
function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let current = '';
  let inQuotes = false;
  const lines: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; current += ch; }
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      lines.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) lines.push(current);

  for (const line of lines) {
    if (line.trim()) rows.push(parseCSVLine(line));
  }

  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(cells => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (cells[i] ?? '').trim(); });
    return obj;
  });
}

type ImportRow = {
  sku: string;
  woo_id: number | null;
  type: string;
  name: string;
  published: boolean;
  description: string;
  short_description: string;
  regular_price: number;
  sale_price: number | null;
  wholesale_price: number;
  msrp: number;
  categories_raw: string;
  tags: string;
  image_url: string;
  gallery_urls: string[];
  in_stock: boolean;
  stock_quantity: number;
  parent_sku: string;
  parent_id: string | null;
  is_active: boolean;
  brand: string;
  nicotine_mg: string;
  e_liquid_style: string;
  colour: string;
  ohm: string;
  pack_size: string;
  ml: string;
  flavour: string;
};

function wooRowToImportRow(raw: Record<string, string>): ImportRow | null {
  const sku = raw['SKU']?.trim();
  if (!sku) return null;

  // Resolve attribute columns dynamically
  const attrs: Record<string, string> = {};
  for (let i = 1; i <= 8; i++) {
    const nameKey = `Attribute ${i} name`;
    const valKey = `Attribute ${i} value(s)`;
    const attrName = (raw[nameKey] ?? '').toLowerCase().trim();
    const attrVal = (raw[valKey] ?? '').trim();
    if (attrName && attrVal) {
      const mapped = ATTR_MAP[attrName];
      if (mapped) attrs[mapped] = attrVal;
    }
  }

  const images = (raw['Images'] ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const regularPrice = parseFloat(raw['Regular price'] ?? '0') || 0;

  // Try both parent column names - WooCommerce exports can vary
  const parentSku = (raw['Parent (SKU of the parent product)'] ?? raw['Parent'] ?? '').trim();

  return {
    sku,
    woo_id: parseInt(raw['ID'] ?? '') || null,
    type: raw['Type']?.trim() || 'simple',
    name: raw['Name']?.trim() || sku,
    published: raw['Published'] === '1',
    description: raw['Description']?.trim() || '',
    short_description: raw['Short description']?.trim() || '',
    regular_price: regularPrice,
    sale_price: parseFloat(raw['Sale price'] ?? '') || null,
    wholesale_price: regularPrice,
    msrp: regularPrice,
    categories_raw: raw['Categories']?.trim() || '',
    tags: raw['Tags']?.trim() || '',
    image_url: images[0] ?? '',
    gallery_urls: images.slice(1),
    in_stock: raw['In stock?'] === '1',
    stock_quantity: parseInt(raw['Stock'] ?? '0') || 0,
    parent_sku: parentSku,
    parent_id: null,
    is_active: raw['Published'] === '1',
    brand: attrs['brand'] ?? '',
    nicotine_mg: attrs['nicotine_mg'] ?? '',
    e_liquid_style: attrs['e_liquid_style'] ?? '',
    colour: attrs['colour'] ?? '',
    ohm: attrs['ohm'] ?? '',
    pack_size: attrs['pack_size'] ?? '',
    ml: attrs['ml'] ?? '',
    flavour: attrs['flavour'] ?? '',
  };
}

type ImportStats = {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
};

type Props = { onDone: () => void; onClose: () => void };

// Category tree node component for hierarchical display
function CategoryTreeNode({
  tree,
  preview,
  selected,
  onSelectionChange,
  depth,
}: {
  tree: CategoryNode;
  preview: ImportRow[];
  selected: Set<number>;
  onSelectionChange: (s: Set<number>) => void;
  depth: number;
}) {
  const entries = Object.entries(tree).sort();

  if (entries.length === 0) {
    return <p className="text-xs text-gray-400 ml-2">No categories found</p>;
  }

  return (
    <div className="space-y-0.5">
      {entries.map(([name, node]) => {
        // Count selected products that match this node's path or its children
        let countMatchingSelected = 0;
        let countMatchingTotal = 0;

        for (let i = 0; i < preview.length; i++) {
          const productPaths = getCategoryPath(preview[i].categories_raw);
          // A product matches if one of its category paths starts with this node's path (meaning it's in this category or a subcategory)
          const matches = productPaths.some(p => {
            // Check if product's path starts with this node's path
            // "Classic Vaping > E-Liquids > Nicofresh" matches "Classic Vaping" or "Classic Vaping > E-Liquids"
            return p === node.path || p.startsWith(node.path + ' > ');
          });

          if (matches) {
            countMatchingTotal++;
            if (selected.has(i)) {
              countMatchingSelected++;
            }
          }
        }

        const isFullySelected = countMatchingTotal > 0 && countMatchingSelected === countMatchingTotal;
        const isPartiallySelected = countMatchingSelected > 0 && countMatchingSelected < countMatchingTotal;

        return (
          <div key={node.path}>
            <button
              onClick={() => {
                const newSelected = new Set(selected);
                for (let i = 0; i < preview.length; i++) {
                  const productPaths = getCategoryPath(preview[i].categories_raw);
                  const matches = productPaths.some(p => {
                    return p === node.path || p.startsWith(node.path + ' > ');
                  });

                  if (matches) {
                    if (isFullySelected) {
                      newSelected.delete(i);
                    } else {
                      newSelected.add(i);
                    }
                  }
                }
                onSelectionChange(newSelected);
              }}
              style={{ paddingLeft: `${depth * 14}px` }}
              className={`w-full text-left px-2 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-2 whitespace-nowrap hover:shadow-sm ${
                isFullySelected
                  ? 'bg-brand-100 text-brand-700 hover:bg-brand-200'
                  : isPartiallySelected
                  ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Check size={13} className={`flex-shrink-0 transition-opacity ${isFullySelected ? 'opacity-100' : 'opacity-0'}`} />
              <span className="flex-1 text-left truncate">{name}</span>
              <span className="text-[10px] opacity-70 flex-shrink-0">({countMatchingSelected}/{countMatchingTotal})</span>
            </button>

            {node.children && Object.keys(node.children).length > 0 && (
              <CategoryTreeNode
                tree={node.children}
                preview={preview}
                selected={selected}
                onSelectionChange={onSelectionChange}
                depth={depth + 1}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function WooImport({ onDone, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showPreview, setShowPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [parseError, setParseError] = useState('');

  const processFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) {
      setParseError('Please upload a .csv file.');
      return;
    }
    setFileName(file.name);
    setParseError('');
    setStats(null);
    setSelected(new Set());

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length === 0) { setParseError('No rows found in the CSV.'); return; }

      // Validate it looks like a WooCommerce export
      if (!rows[0]['SKU'] && !rows[0]['ID']) {
        setParseError('This does not look like a WooCommerce product export. Expected columns: ID, SKU, Type, Name, etc.');
        return;
      }

      const parsed = rows.map(wooRowToImportRow).filter(Boolean) as ImportRow[];
      setPreview(parsed);
      // Auto-select all products by default
      setSelected(new Set(Array.from({ length: parsed.length }, (_, i) => i)));
    };
    reader.readAsText(file);
  }, []);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) processFile(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  }

  async function runImport() {
    if (!preview.length || selected.size === 0) return;
    setImporting(true);
    setStats(null);

    // Filter to only selected products
    const productsToImport = preview.filter((_, idx) => selected.has(idx));
    const stats: ImportStats = { total: productsToImport.length, inserted: 0, updated: 0, skipped: 0, errors: [] };

    // Fetch categories to map names → ids (by full path)
    const { data: cats } = await supabase.from('categories').select('id, name');
    const catMap: Record<string, string> = {};
    for (const c of cats ?? []) catMap[c.name.toLowerCase()] = c.id;

    // Create a parent map to resolve categories for variations
    const parentMap: Record<string, ImportRow> = {};
    for (const product of productsToImport) {
      if (!product.parent_sku) {
        parentMap[product.sku] = product;
      }
    }

    // Process in batches of 50
    const BATCH = 50;
    for (let i = 0; i < productsToImport.length; i += BATCH) {
      const batch = productsToImport.slice(i, i + BATCH);
      const upsertRows = batch.map(row => {
        // Get category: from product or from parent if it's a variation
        let categoryRaw = row.categories_raw;
        if (!categoryRaw && row.parent_sku) {
          // This is a variation without a category, get it from parent
          const parent = parentMap[row.parent_sku];
          if (parent) {
            categoryRaw = parent.categories_raw;
          }
        }

        // Map to category ID using full path (hierarchical)
        let category_id = null;
        if (categoryRaw) {
          // Try full path first, then progressively shorter paths
          const paths = getCategoryPath(categoryRaw);
          for (const path of paths.reverse()) {
            const key = path.toLowerCase();
            if (catMap[key]) {
              category_id = catMap[key];
              break;
            }
          }
        }

        return {
          sku: row.sku,
          woo_id: row.woo_id,
          type: row.type,
          name: row.name,
          published: row.published,
          description: row.description,
          short_description: row.short_description,
          regular_price: row.regular_price,
          sale_price: row.sale_price,
          wholesale_price: row.wholesale_price,
          msrp: row.msrp,
          categories_raw: categoryRaw,
          category_id,
          tags: row.tags,
          image_url: row.image_url,
          gallery_urls: row.gallery_urls,
          in_stock: row.in_stock,
          stock_qty: row.stock_quantity,
          parent_sku: row.parent_sku,
          parent_id: row.parent_id,
          is_active: row.is_active,
          brand: row.brand,
          nicotine_mg: row.nicotine_mg,
          e_liquid_style: row.e_liquid_style,
          colour: row.colour,
          ohm: row.ohm,
          pack_size: row.pack_size,
          ml: row.ml,
          flavour: row.flavour,
        };
      });

      const { error } = await supabase
        .from('products')
        .upsert(upsertRows, { onConflict: 'sku', ignoreDuplicates: false });

      if (error) {
        stats.errors.push(`Batch ${Math.floor(i / BATCH) + 1}: ${error.message}`);
        stats.skipped += batch.length;
      } else {
        stats.inserted += batch.length;
      }
    }

    // Second pass: resolve parent_sku -> parent_id relationships
    const variationsToUpdate = productsToImport.filter(r => r.parent_sku);
    if (variationsToUpdate.length > 0) {
      // Fetch all parent products by their SKU
      const parentSkus = [...new Set(variationsToUpdate.map(r => r.parent_sku))];
      const res = await supabase
        .from('products')
        .select('id, sku')
        .in('sku', parentSkus);

      const parents = res.data as Array<{ id: string; sku: string }> | null;

      const parentMap: Record<string, string> = {};
      for (const p of parents ?? []) {
        parentMap[p.sku] = p.id;
      }

      // Update variations with their parent_id
      const updateBatch = 50;
      for (let i = 0; i < variationsToUpdate.length; i += updateBatch) {
        const batch = variationsToUpdate.slice(i, i + updateBatch);
        const skusToUpdate = batch
          .filter(r => parentMap[r.parent_sku])
          .map(r => ({ sku: r.sku, parentId: parentMap[r.parent_sku] }));

        if (skusToUpdate.length > 0) {
          // Use UPDATE instead of UPSERT to only modify parent_id
          for (const item of skusToUpdate) {
            const { error } = await supabase
              .from('products')
              .update({ parent_id: item.parentId })
              .eq('sku', item.sku);

            if (error) {
              stats.errors.push(`Parent-child link for ${item.sku}: ${error.message}`);
              break;
            }
          }
        }
      }
    }

    setStats(stats);
    setImporting(false);
    if (stats.errors.length === 0) onDone();
  }

  const simpleCount = preview.filter(r => r.type === 'simple').length;
  const variableCount = preview.filter(r => r.type === 'variable').length;
  const variationCount = preview.filter(r => r.type === 'variation').length;

  // Build parent SKU → category lookup so variations inherit their parent's category
  const parentCategoryMap: Record<string, string> = {};
  for (const product of preview) {
    if (product.categories_raw && !product.parent_sku) {
      parentCategoryMap[product.sku] = product.categories_raw;
    }
  }

  // Resolve effective category for any product (own category or parent's)
  function getEffectiveCategory(product: ImportRow): string {
    if (product.categories_raw) return product.categories_raw;
    if (product.parent_sku && parentCategoryMap[product.parent_sku]) {
      return parentCategoryMap[product.parent_sku];
    }
    return '';
  }

  // Get all category paths (using effective categories so variations are counted)
  const allCategoryPaths = new Set<string>();
  for (const product of preview) {
    const effectiveCat = getEffectiveCategory(product);
    const paths = getCategoryPath(effectiveCat);
    for (const path of paths) {
      allCategoryPaths.add(path);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900 text-lg">Import from WooCommerce</h3>
            <p className="text-xs text-gray-500 mt-0.5">Upload a WooCommerce product CSV export</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Drop zone */}
          {!preview.length && (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors select-none
                ${dragging ? 'border-brand-400 bg-brand-50' : 'border-gray-200 hover:border-brand-300 hover:bg-gray-50'}`}
            >
              <Upload size={32} className={`mx-auto mb-3 ${dragging ? 'text-brand-600' : 'text-gray-300'}`} />
              <p className="text-sm font-semibold text-gray-700">Drop your WooCommerce CSV here</p>
              <p className="text-xs text-gray-400 mt-1">or click to browse — exported from WooCommerce &rarr; Products &rarr; Export</p>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
            </div>
          )}

          {/* Parse error */}
          {parseError && (
            <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{parseError}</span>
            </div>
          )}

          {/* Preview panel */}
          {preview.length > 0 && !stats && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 px-4 py-3 bg-brand-50 border border-brand-200 rounded-lg">
                <FileText size={18} className="text-brand-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{fileName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {preview.length} products parsed
                    {simpleCount > 0 && ` · ${simpleCount} simple`}
                    {variableCount > 0 && ` · ${variableCount} variable`}
                    {variationCount > 0 && ` · ${variationCount} variations`}
                  </p>
                </div>
                <button
                  onClick={() => { setPreview([]); setFileName(''); if (fileRef.current) fileRef.current.value = ''; }}
                  className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Selection controls */}
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-gray-700">{selected.size} of {preview.length} selected</span>
                <button
                  onClick={() => setSelected(new Set(Array.from({ length: preview.length }, (_, i) => i)))}
                  className="text-brand-600 hover:text-brand-700 font-medium"
                >
                  Select All
                </button>
                <button
                  onClick={() => setSelected(new Set())}
                  className="text-gray-500 hover:text-gray-700 font-medium"
                >
                  Clear
                </button>
              </div>

              {/* Category filter — always visible */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600">
                  Select by Category
                </div>
                <div className="px-4 py-3 max-h-52 overflow-y-auto">
                  {allCategoryPaths.size === 0 ? (
                    <p className="text-xs text-gray-400">No categories found in CSV</p>
                  ) : (
                    <div className="space-y-0.5">
                      {Array.from(allCategoryPaths)
                        .sort()
                        .map((categoryPath) => {
                          let countMatchingSelected = 0;
                          let countMatchingTotal = 0;

                          for (let i = 0; i < preview.length; i++) {
                            const effectiveCat = getEffectiveCategory(preview[i]);
                            const productPaths = getCategoryPath(effectiveCat);
                            const matches = productPaths.some(p => p === categoryPath || p.startsWith(categoryPath + ' > '));
                            if (matches) {
                              countMatchingTotal++;
                              if (selected.has(i)) countMatchingSelected++;
                            }
                          }

                          if (countMatchingTotal === 0) return null;

                          const isFullySelected = countMatchingSelected === countMatchingTotal;
                          const isPartiallySelected = countMatchingSelected > 0 && !isFullySelected;
                          const depth = (categoryPath.match(/>/g) || []).length;

                          return (
                            <button
                              key={categoryPath}
                              onClick={() => {
                                const newSelected = new Set(selected);
                                for (let i = 0; i < preview.length; i++) {
                                  const effectiveCat = getEffectiveCategory(preview[i]);
                                  const productPaths = getCategoryPath(effectiveCat);
                                  const matches = productPaths.some(p => p === categoryPath || p.startsWith(categoryPath + ' > '));
                                  if (matches) {
                                    if (isFullySelected) newSelected.delete(i);
                                    else newSelected.add(i);
                                  }
                                }
                                setSelected(newSelected);
                              }}
                              style={{ paddingLeft: `${12 + depth * 16}px` }}
                              className={`w-full text-left py-1.5 pr-3 rounded text-xs font-medium transition-colors flex items-center gap-2 ${
                                isFullySelected
                                  ? 'bg-brand-100 text-brand-700'
                                  : isPartiallySelected
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                                isFullySelected ? 'bg-brand-600 border-brand-600' : isPartiallySelected ? 'bg-amber-400 border-amber-400' : 'border-gray-300'
                              }`}>
                                {(isFullySelected || isPartiallySelected) && <Check size={10} className="text-white" />}
                              </span>
                              <span className="flex-1 text-left truncate">{categoryPath.split(' > ').pop()}</span>
                              <span className="text-[10px] opacity-60 flex-shrink-0">{countMatchingTotal}</span>
                            </button>
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>

              {/* Product list — collapsible */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowPreview(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors border-b border-gray-200"
                >
                  <span>Product List</span>
                  {showPreview ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {showPreview && (
                  <div className="overflow-y-auto max-h-72">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-white border-b border-gray-100 z-10">
                        <tr>
                          <th className="px-3 py-2 w-8">
                            <input
                              type="checkbox"
                              checked={selected.size === preview.length && preview.length > 0}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelected(new Set(Array.from({ length: preview.length }, (_, i) => i)));
                                } else {
                                  setSelected(new Set());
                                }
                              }}
                              className="rounded border-gray-300"
                            />
                          </th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">SKU</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">Name</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">Type</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">Category</th>
                          <th className="text-right px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {preview.map((r, i) => {
                          let displayCategory = r.categories_raw;
                          if (!displayCategory && r.parent_sku) {
                            const parent = preview.find(p => p.sku === r.parent_sku);
                            if (parent) displayCategory = parent.categories_raw;
                          }

                          return (
                            <tr key={i} className={`hover:bg-gray-50 ${selected.has(i) ? 'bg-brand-50/50' : ''}`}>
                              <td className="px-3 py-2 w-8">
                                <input
                                  type="checkbox"
                                  checked={selected.has(i)}
                                  onChange={(e) => {
                                    const newSelected = new Set(selected);
                                    if (e.target.checked) newSelected.add(i);
                                    else newSelected.delete(i);
                                    setSelected(newSelected);
                                  }}
                                  className="rounded border-gray-300"
                                />
                              </td>
                              <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">{r.sku}</td>
                              <td className="px-3 py-2 text-gray-700 max-w-[200px] truncate">{r.name}</td>
                              <td className="px-3 py-2">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap
                                  ${r.type === 'simple' ? 'bg-emerald-50 text-emerald-700'
                                    : r.type === 'variable' ? 'bg-brand-50 text-brand-700'
                                    : 'bg-amber-50 text-amber-700'}`}>
                                  {r.type}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-gray-500 max-w-[140px] truncate" title={displayCategory || ''}>
                                {displayCategory ? topCategory(displayCategory) : <span className="text-red-400 text-[10px]">—</span>}
                              </td>
                              <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">
                                {r.regular_price > 0 ? `£${r.regular_price.toFixed(2)}` : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Import notes */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800 space-y-1">
                <p className="font-semibold">Before you import:</p>
                <ul className="list-disc list-inside space-y-0.5 text-amber-700">
                  <li>Existing products with matching SKUs will be <strong>updated</strong>, not duplicated.</li>
                  <li>Wholesale price defaults to the WooCommerce regular price — edit individually after import.</li>
                  <li>Categories are matched by name (Disposables, E-Liquids, Devices, Replacements).</li>
                  <li>Variable parent products and their variations are all imported.</li>
                </ul>
              </div>
            </div>
          )}

          {/* Result panel */}
          {stats && (
            <div className="space-y-3">
              <div className={`flex items-start gap-3 px-4 py-4 rounded-xl border ${stats.errors.length === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                {stats.errors.length === 0
                  ? <CheckCircle size={20} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                  : <AlertCircle size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />}
                <div>
                  <p className={`font-semibold text-sm ${stats.errors.length === 0 ? 'text-emerald-800' : 'text-amber-800'}`}>
                    {stats.errors.length === 0 ? 'Import complete!' : 'Import finished with some errors'}
                  </p>
                  <p className="text-xs mt-1 text-gray-600">
                    {stats.inserted} imported &nbsp;·&nbsp; {stats.skipped} skipped
                  </p>
                </div>
              </div>

              {stats.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 space-y-1">
                  {stats.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-700">{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          {stats ? (
            <button onClick={onClose} className="flex-1 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition-colors">
              Done
            </button>
          ) : (
            <>
              <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={runImport}
                disabled={!preview.length || importing || selected.size === 0}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
              >
                {importing ? <><RefreshCw size={14} className="animate-spin" /> Importing...</> : `Import ${selected.size} of ${preview.length} Products`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
