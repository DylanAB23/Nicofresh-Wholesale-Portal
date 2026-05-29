import { useState } from 'react';
import { X, Package, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ImportResponse {
  success: boolean;
  summary: {
    fetched: number;
    imported: number;
    updated: number;
    skipped: number;
    products_with_images?: number;
    parent_products_created?: number;
    variations_linked?: number;
  };
  skipped_details?: Array<{ sku: string; reason: string }>;
  debug?: {
    sample_products: Array<any>;
    total_products_checked: number;
    total_with_images: number;
  };
  note?: string;
  error?: string;
}

export default function ShipStationImport({
  onDone,
  onClose,
}: {
  onDone: () => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'initial' | 'importing' | 'complete'>('initial');
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    setStep('importing');
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setError('Not authenticated');
        setStep('initial');
        return;
      }

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

      const res = await fetch(`${SUPABASE_URL}/functions/v1/shipstation-sync/import`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        let errorMessage = `HTTP ${res.status}: `;
        const contentType = res.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          try {
            const data = await res.json();
            errorMessage += data.error || 'Unknown error';
          } catch {
            errorMessage += await res.text() || 'No response body';
          }
        } else {
          errorMessage += await res.text() || 'No response body';
        }
        setError(errorMessage);
        setStep('initial');
        return;
      }

      let data: ImportResponse;
      try {
        data = (await res.json()) as ImportResponse;
      } catch (parseErr) {
        setError(`Failed to parse response: ${parseErr instanceof Error ? parseErr.message : 'Unknown error'}`);
        setStep('initial');
        return;
      }

      if (!data.success) {
        setError(data.error || 'Import failed');
        setStep('initial');
        return;
      }

      setResult(data);
      setStep('complete');
    } catch (err) {
      setError(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setStep('initial');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-900">Import from ShipStation</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {step === 'initial' ? 'Ready to fetch and import products' :
               step === 'importing' ? 'Importing products...' :
               'Import complete'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex gap-3">
              <AlertCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          {step === 'initial' && (
            <>
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="text-sm font-semibold text-blue-900 mb-2">How this works:</h3>
                <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
                  <li>Fetches all products from your ShipStation account</li>
                  <li>Creates or updates products by SKU</li>
                  <li>Leaves pricing fields empty (you fill in after)</li>
                  <li>Sets initial stock to 0 (use "Sync Inventory" after to populate)</li>
                </ul>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
                >
                  Start Import
                </button>
              </div>
            </>
          )}

          {step === 'importing' && (
            <div className="text-center py-12">
              <div className="inline-block">
                <Package size={32} className="text-blue-600 mb-4 animate-bounce" />
              </div>
              <p className="text-sm font-medium text-gray-900">Importing products...</p>
              <p className="text-xs text-gray-500 mt-2">This may take a moment</p>
            </div>
          )}

          {step === 'complete' && result && (
            <>
              <div className="mb-6 space-y-3">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex gap-3">
                  <CheckCircle size={20} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-900">Import successful!</p>
                    <p className="text-xs text-emerald-800 mt-1">
                      {result.summary.imported} products imported, {result.summary.skipped} skipped
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-xs text-gray-500">Fetched from ShipStation</p>
                    <p className="text-lg font-bold text-gray-900">{result.summary.fetched}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-xs text-gray-500">Successfully imported</p>
                    <p className="text-lg font-bold text-gray-900">{result.summary.imported}</p>
                  </div>
                  {result.summary.parent_products_created !== undefined && (
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-xs text-blue-600">Parent products created</p>
                      <p className="text-lg font-bold text-blue-900">{result.summary.parent_products_created}</p>
                    </div>
                  )}
                  {result.summary.variations_linked !== undefined && (
                    <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                      <p className="text-xs text-purple-600">Variations linked</p>
                      <p className="text-lg font-bold text-purple-900">{result.summary.variations_linked}</p>
                    </div>
                  )}
                </div>

                {result.summary.products_with_images !== undefined && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-xs font-semibold text-blue-900">Image Status</p>
                    <p className="text-sm text-blue-800 mt-1">
                      {result.summary.products_with_images} products with images imported
                    </p>
                    {result.note && (
                      <p className="text-xs text-blue-700 mt-1 font-mono">{result.note}</p>
                    )}
                  </div>
                )}

                {result.skipped_details && result.skipped_details.length > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs font-semibold text-amber-900 mb-2">Skipped ({result.skipped_details.length})</p>
                    <div className="space-y-1">
                      {result.skipped_details.slice(0, 5).map((item, idx) => (
                        <p key={idx} className="text-xs text-amber-800">
                          <span className="font-medium">{item.sku}:</span> {item.reason}
                        </p>
                      ))}
                      {result.skipped_details.length > 5 && (
                        <p className="text-xs text-amber-700 font-medium">
                          +{result.skipped_details.length - 5} more skipped
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                  <p className="font-semibold mb-1">Next steps:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>Edit products to add pricing (wholesale_price, msrp)</li>
                    <li>Click "Sync Inventory" to populate stock levels</li>
                  </ul>
                </div>

                {result.debug && (
                  <details className="p-3 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer">
                    <summary className="text-xs font-semibold text-gray-600 select-none">
                      Debug Info ({result.debug.total_with_images} / {result.debug.total_products_checked} products with images)
                    </summary>
                    <div className="mt-2 text-xs text-gray-500 space-y-2 font-mono">
                      {result.debug.sample_products.map((product, idx) => (
                        <div key={idx} className="p-2 bg-white rounded border border-gray-200">
                          <p className="font-semibold text-gray-900">{product.sku}</p>
                          <p className="mt-1">Has image field: {product.has_image_field ? 'Yes' : 'No'}</p>
                          {product.has_image_field && (
                            <p>Image type: {product.image_type}</p>
                          )}
                          <p>Has images field: {product.has_images_field ? 'Yes' : 'No'}</p>
                          {product.images_length !== null && (
                            <p>Images count: {product.images_length}</p>
                          )}
                          <p className="mt-1 text-gray-600">All fields in product:</p>
                          <p className="break-words text-gray-700">[{product.all_product_keys.join(', ')}]</p>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors font-medium"
                >
                  Close
                </button>
                <button
                  onClick={() => { onClose(); onDone(); }}
                  className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
                >
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
