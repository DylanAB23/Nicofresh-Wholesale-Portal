import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { CheckCircle } from 'lucide-react';

function fmt(n: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n);
}

export default function Account() {
  const { profile, refreshProfile } = useAuth();
  const [form, setForm] = useState({ store_name: profile?.store_name || '', contact_name: profile?.contact_name || '', phone: profile?.phone || '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  function update(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    const { error } = await supabase.from('profiles').update(form).eq('id', profile!.id);
    setSaving(false);
    if (error) { setError('Failed to save changes.'); }
    else { await refreshProfile(); setSaved(true); setTimeout(() => setSaved(false), 2500); }
  }

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Account Settings</h2>
        <p className="text-gray-500 text-sm mt-0.5">Manage your store profile</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4 pb-5 border-b border-gray-100">
          {[
            { label: 'Account Status', value: profile?.status || '' },
            { label: 'Net Terms', value: `Net ${profile?.net_terms || 30}` },
            { label: 'Credit Limit', value: fmt(profile?.credit_limit || 0) },
            { label: 'Email', value: profile?.email || '' },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs text-gray-400 mb-0.5">{label}</p>
              <p className="text-sm font-medium text-gray-900 capitalize">{value}</p>
            </div>
          ))}
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {saved && (
            <div className="flex items-center gap-2 text-emerald-700 text-sm">
              <CheckCircle size={14} /> Changes saved successfully.
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Store / Business Name</label>
            <input type="text" value={form.store_name} onChange={update('store_name')} required
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Contact Name</label>
            <input type="text" value={form.contact_name} onChange={update('contact_name')} required
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
            <input type="tel" value={form.phone} onChange={update('phone')} placeholder="(555) 000-0000"
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <button type="submit" disabled={saving}
            className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold py-2.5 px-5 rounded-lg transition-colors text-sm">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}
