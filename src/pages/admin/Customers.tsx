import { useEffect, useState } from 'react';
import { Users, Search, CheckCircle, XCircle, X, Plus, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Profile, PortalSettings } from '../../lib/database.types';
import StatusBadge from '../../components/StatusBadge';

function fmt(n: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n);
}

const BLANK_CREATE = {
  store_name: '', contact_name: '', email: '', password: '',
  phone: '', net_terms: '30', credit_limit: '5000', net30_limit: '1000',
  status: 'active', require_upfront: false, notes: '',
};

export default function AdminCustomers() {
  const [customers, setCustomers] = useState<Profile[]>([]);
  const [settings, setSettings] = useState<PortalSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  // Edit modal
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Profile & { net30_limit: number; require_upfront: boolean }>>({});
  const [saving, setSaving] = useState(false);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ ...BLANK_CREATE });
  const [showPassword, setShowPassword] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  async function load() {
    const [custsRes, settingsRes] = await Promise.all([
      supabase.from('profiles').select('*').neq('role', 'admin').order('created_at', { ascending: false }),
      supabase.from('portal_settings').select('*').eq('id', 'global').maybeSingle(),
    ]);
    setCustomers(custsRes.data || []);
    setSettings(settingsRes.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = customers.filter(c => {
    const matchSearch = c.store_name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.contact_name.toLowerCase().includes(search.toLowerCase());
    return matchSearch && (filter === 'all' || c.status === filter);
  });

  function openEdit(c: Profile) {
    setEditId(c.id);
    setEditForm({
      status: c.status,
      credit_limit: c.credit_limit,
      net_terms: c.net_terms,
      net30_limit: c.net30_limit,
      require_upfront: c.require_upfront,
      notes: c.notes || '',
    });
  }

  async function saveEdit() {
    if (!editId) return;
    setSaving(true);
    await supabase.from('profiles').update(editForm).eq('id', editId);
    setSaving(false);
    setEditId(null);
    await load();
  }

  async function quickApprove(c: Profile) {
    await supabase.from('profiles').update({
      status: 'active',
      net_terms: settings?.default_net_terms ?? 30,
      credit_limit: settings?.default_credit_limit ?? 5000,
      net30_limit: settings?.default_net30_limit ?? 1000,
    }).eq('id', c.id);
    await load();
  }

  async function quickSuspend(id: string) {
    await supabase.from('profiles').update({ status: 'suspended' }).eq('id', id);
    await load();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');
    if (createForm.password.length < 8) { setCreateError('Password must be at least 8 characters.'); return; }
    setCreating(true);

    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          email: createForm.email,
          password: createForm.password,
          store_name: createForm.store_name,
          contact_name: createForm.contact_name,
          phone: createForm.phone,
          status: createForm.status,
          net_terms: createForm.net_terms,
          credit_limit: createForm.credit_limit,
          net30_limit: createForm.net30_limit,
          require_upfront: createForm.require_upfront,
          notes: createForm.notes,
        }),
      }
    );

    const result = await res.json();
    if (!res.ok || result.error) {
      setCreateError(result.error || 'Failed to create account.');
      setCreating(false);
      return;
    }

    setCreating(false);
    setShowCreate(false);
    setCreateForm({ ...BLANK_CREATE });
    await load();
  }

  function updateCreate(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setCreateForm(f => ({ ...f, [field]: e.target.value }));
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Customers</h2>
          <p className="text-gray-500 text-sm mt-0.5">{customers.length} wholesale accounts</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm">
          <Plus size={15} /> Create Account
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search by store, contact, or email..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {['all', 'pending', 'active', 'suspended'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${filter === f ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16"><Users size={40} className="text-gray-300 mx-auto mb-3" /><p className="text-gray-500 text-sm">No customers found.</p></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">Store</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">Contact</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Status</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">Credit Limit</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">Net-30 Limit</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden xl:table-cell">Payment</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <p className="text-sm font-semibold text-gray-900">{c.store_name}</p>
                    <p className="text-xs text-gray-400">{c.email}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">{c.contact_name}</td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-right hidden lg:table-cell">{fmt(c.credit_limit)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-right hidden lg:table-cell">{fmt(c.net30_limit)}</td>
                  <td className="px-4 py-3 hidden xl:table-cell">
                    {c.require_upfront ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">Upfront Only</span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700">Net-30 Eligible</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {c.status === 'pending' && (
                        <button onClick={() => quickApprove(c)} title="Approve" className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors">
                          <CheckCircle size={15} />
                        </button>
                      )}
                      {c.status === 'active' && (
                        <button onClick={() => quickSuspend(c.id)} title="Suspend" className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors">
                          <XCircle size={15} />
                        </button>
                      )}
                      <button onClick={() => openEdit(c)} className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-brand-600 hover:bg-brand-50 transition-colors border border-brand-100">
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit modal */}
      {editId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-900">Edit Customer Account</h3>
              <button onClick={() => setEditId(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Account Status</label>
                <select value={editForm.status || ''} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="pending">Pending</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Credit Limit (£)</label>
                  <input type="number" value={editForm.credit_limit || ''} onChange={e => setEditForm(f => ({ ...f, credit_limit: parseFloat(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Net Terms (days)</label>
                  <input type="number" value={editForm.net_terms || 30} onChange={e => setEditForm(f => ({ ...f, net_terms: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Net-30 Order Limit (£)</label>
                <p className="text-xs text-gray-400 mb-1.5">Orders above this amount require upfront payment</p>
                <input type="number" value={editForm.net30_limit || ''} onChange={e => setEditForm(f => ({ ...f, net30_limit: parseFloat(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <input type="checkbox" id="require_upfront" checked={!!editForm.require_upfront}
                  onChange={e => setEditForm(f => ({ ...f, require_upfront: e.target.checked }))}
                  className="mt-0.5 w-4 h-4 accent-brand-600" />
                <div>
                  <label htmlFor="require_upfront" className="text-sm font-medium text-gray-700 cursor-pointer">Require Upfront Payment</label>
                  <p className="text-xs text-gray-400 mt-0.5">Force this customer to pay upfront for all orders regardless of amount</p>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Internal Notes</label>
                <textarea value={editForm.notes || ''} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditId(null)} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={saveEdit} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-semibold">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create account modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 my-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-900">Create Customer Account</h3>
              <button onClick={() => { setShowCreate(false); setCreateError(''); }} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            {createError && (
              <div className="mb-4 flex items-center gap-2 bg-red-50 text-red-700 px-3 py-2.5 rounded-lg text-sm">
                <XCircle size={14} className="flex-shrink-0" /> {createError}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Store / Business Name *</label>
                  <input type="text" value={createForm.store_name} onChange={updateCreate('store_name')} required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Contact Name *</label>
                  <input type="text" value={createForm.contact_name} onChange={updateCreate('contact_name')} required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Phone</label>
                  <input type="tel" value={createForm.phone} onChange={updateCreate('phone')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Email Address *</label>
                  <input type="email" value={createForm.email} onChange={updateCreate('email')} required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Password *</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} value={createForm.password} onChange={updateCreate('password')} required
                      placeholder="Min. 8 characters"
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Account Terms</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Status</label>
                    <select value={createForm.status} onChange={updateCreate('status')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                      <option value="active">Active</option>
                      <option value="pending">Pending</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Net Terms (days)</label>
                    <input type="number" value={createForm.net_terms} onChange={updateCreate('net_terms')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Credit Limit (£)</label>
                    <input type="number" value={createForm.credit_limit} onChange={updateCreate('credit_limit')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Net-30 Order Limit (£)</label>
                  <input type="number" value={createForm.net30_limit} onChange={updateCreate('net30_limit')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div className="mt-3 flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <input type="checkbox" id="create_require_upfront" checked={createForm.require_upfront}
                    onChange={e => setCreateForm(f => ({ ...f, require_upfront: e.target.checked }))}
                    className="w-4 h-4 accent-brand-600" />
                  <label htmlFor="create_require_upfront" className="text-sm text-gray-700 cursor-pointer">Require upfront payment for all orders</label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Internal Notes</label>
                <textarea value={createForm.notes} onChange={updateCreate('notes')} rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setShowCreate(false); setCreateError(''); }} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={creating} className="flex-1 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-semibold">
                  {creating ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
