import { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Save, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { PortalSettings } from '../../lib/database.types';

export default function AdminSettings() {
  const [settings, setSettings] = useState<PortalSettings | null>(null);
  const [form, setForm] = useState({
    company_name: '',
    net30_enabled: true,
    net30_min_order: '50',
    default_net_terms: '30',
    default_credit_limit: '5000',
    default_net30_limit: '1000',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('portal_settings').select('*').eq('id', 'global').maybeSingle().then(({ data }) => {
      if (data) {
        setSettings(data);
        setForm({
          company_name: data.company_name,
          net30_enabled: data.net30_enabled,
          net30_min_order: data.net30_min_order.toString(),
          default_net_terms: data.default_net_terms.toString(),
          default_credit_limit: data.default_credit_limit.toString(),
          default_net30_limit: data.default_net30_limit.toString(),
        });
      }
      setLoading(false);
    });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    const payload = {
      company_name: form.company_name,
      net30_enabled: form.net30_enabled,
      net30_min_order: parseFloat(form.net30_min_order) || 0,
      default_net_terms: parseInt(form.default_net_terms) || 30,
      default_credit_limit: parseFloat(form.default_credit_limit) || 5000,
      default_net30_limit: parseFloat(form.default_net30_limit) || 1000,
      updated_at: new Date().toISOString(),
    };
    const { error: err } = await supabase.from('portal_settings').upsert({ id: 'global', ...payload });
    setSaving(false);
    if (err) { setError('Failed to save settings.'); }
    else { setSaved(true); setTimeout(() => setSaved(false), 2500); }
  }

  function update(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  if (loading) {
    return <div className="p-6 lg:p-8 space-y-4">{[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Portal Settings</h2>
        <p className="text-gray-500 text-sm mt-0.5">Global configuration for your wholesale portal</p>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            <AlertCircle size={15} className="flex-shrink-0" /> {error}
          </div>
        )}
        {saved && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-sm">
            <CheckCircle size={15} className="flex-shrink-0" /> Settings saved successfully.
          </div>
        )}

        {/* General */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">General</p>
          </div>
          <div className="p-5">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Company Name</label>
            <input type="text" value={form.company_name} onChange={update('company_name')}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
        </div>

        {/* Net 30 Rules */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">Net-30 Payment Rules</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Enable Net-30 Terms</p>
                <p className="text-xs text-gray-400 mt-0.5">Allow approved customers to use net-30 payment terms</p>
              </div>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, net30_enabled: !f.net30_enabled }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none
                  ${form.net30_enabled ? 'bg-brand-600' : 'bg-gray-200'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.net30_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Minimum Order for Net-30 (£)
                </label>
                <p className="text-xs text-gray-400 mb-2">Orders below this amount require upfront payment</p>
                <input type="number" step="0.01" value={form.net30_min_order} onChange={update('net30_min_order')}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Default Net-30 Order Limit (£)
                </label>
                <p className="text-xs text-gray-400 mb-2">Default max order value allowed on net-30 per customer</p>
                <input type="number" step="0.01" value={form.default_net30_limit} onChange={update('default_net30_limit')}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            </div>

            <div className="p-4 bg-brand-50 border border-brand-100 rounded-xl text-xs text-brand-800 leading-relaxed">
              <strong>How net-30 limits work:</strong> Each customer has their own net-30 order limit (set below).
              Orders exceeding that limit must be paid upfront. Orders below the minimum order threshold above
              always require upfront payment regardless of account settings.
            </div>
          </div>
        </div>

        {/* New Account Defaults */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">New Account Defaults</p>
            <p className="text-xs text-gray-400 mt-0.5">Applied automatically when a new customer is approved</p>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Net Terms (days)</label>
              <input type="number" value={form.default_net_terms} onChange={update('default_net_terms')}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Credit Limit ($)</label>
              <input type="number" step="0.01" value={form.default_credit_limit} onChange={update('default_credit_limit')}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Net-30 Order Limit ($)</label>
              <input type="number" step="0.01" value={form.default_net30_limit} onChange={update('default_net30_limit')}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold py-2.5 px-6 rounded-lg transition-colors text-sm">
            <Save size={15} />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
