import { useEffect, useState } from 'react';
import { Search, FileText, Plus, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Invoice, Profile, Order } from '../../lib/database.types';
import StatusBadge from '../../components/StatusBadge';

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

type InvoiceWithProfile = Invoice & { profiles: Pick<Profile, 'store_name'> | null };

export default function AdminInvoices() {
  const [invoices, setInvoices] = useState<InvoiceWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [customers, setCustomers] = useState<Profile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [createForm, setCreateForm] = useState({ profile_id: '', order_id: '', amount_due: '', notes: '', due_days: '30' });
  const [creating, setCreating] = useState(false);

  async function load() {
    const { data } = await supabase.from('invoices').select('*, profiles(store_name)').order('issued_date', { ascending: false });
    setInvoices((data as InvoiceWithProfile[]) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function openCreate() {
    const [custsRes, ordersRes] = await Promise.all([
      supabase.from('profiles').select('*').neq('role', 'admin').eq('status', 'active'),
      supabase.from('orders').select('id, order_number, total, profile_id').eq('status', 'approved'),
    ]);
    setCustomers(custsRes.data || []);
    setOrders(ordersRes.data || []);
    setShowCreate(true);
  }

  async function createInvoice() {
    if (!createForm.profile_id || !createForm.amount_due) return;
    setCreating(true);
    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + parseInt(createForm.due_days));
    await supabase.from('invoices').insert({
      invoice_number: invoiceNumber,
      profile_id: createForm.profile_id,
      order_id: createForm.order_id || null,
      amount_due: parseFloat(createForm.amount_due),
      amount_paid: 0,
      status: 'unpaid',
      due_date: dueDate.toISOString(),
      issued_date: new Date().toISOString(),
      notes: createForm.notes,
    });
    setCreating(false);
    setShowCreate(false);
    setCreateForm({ profile_id: '', order_id: '', amount_due: '', notes: '', due_days: '30' });
    await load();
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from('invoices').update({ status }).eq('id', id);
    await load();
  }

  const filtered = invoices.filter(i => {
    const matchSearch = i.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
      (i.profiles?.store_name || '').toLowerCase().includes(search.toLowerCase());
    return matchSearch && (filter === 'all' || i.status === filter);
  });

  const totalOutstanding = invoices.filter(i => ['unpaid', 'overdue', 'partial'].includes(i.status))
    .reduce((s, i) => s + (i.amount_due - i.amount_paid), 0);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Invoices</h2>
          <p className="text-gray-500 text-sm mt-0.5">
            {invoices.length} invoices &bull; <span className="text-red-600 font-medium">{fmt(totalOutstanding)} outstanding</span>
          </p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm">
          <Plus size={15} /> Create Invoice
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search invoices..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {['all', 'unpaid', 'overdue', 'partial', 'paid'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${filter === f ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16"><FileText size={40} className="text-gray-300 mx-auto mb-3" /><p className="text-gray-500 text-sm">No invoices found.</p></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">Invoice #</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden sm:table-cell">Customer</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">Issued</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Due Date</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Status</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">Amount</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-5 py-3">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(inv => {
                const balance = inv.amount_due - inv.amount_paid;
                const isOverdue = new Date(inv.due_date) < new Date() && inv.status !== 'paid';
                return (
                  <tr key={inv.id} className={`hover:bg-gray-50 transition-colors ${isOverdue ? 'bg-red-50/20' : ''}`}>
                    <td className="px-5 py-3 text-sm font-semibold text-gray-900">{inv.invoice_number}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell">{inv.profiles?.store_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">{new Date(inv.issued_date).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{new Date(inv.due_date).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <select value={isOverdue && inv.status !== 'paid' ? 'overdue' : inv.status} onChange={e => updateStatus(inv.id, e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                        {['unpaid', 'partial', 'paid', 'overdue'].map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">{fmt(inv.amount_due)}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={`text-sm font-bold ${balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{balance > 0 ? fmt(balance) : 'Paid'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-900">Create Invoice</h3>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Customer *</label>
                <select value={createForm.profile_id} onChange={e => setCreateForm(f => ({ ...f, profile_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="">Select customer...</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.store_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Linked Order (optional)</label>
                <select value={createForm.order_id} onChange={e => {
                  const order = orders.find(o => o.id === e.target.value);
                  setCreateForm(f => ({ ...f, order_id: e.target.value, amount_due: order ? order.total.toString() : f.amount_due }));
                }} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="">No linked order</option>
                  {orders.map(o => <option key={o.id} value={o.id}>{o.order_number} — {fmt(o.total)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Amount Due ($) *</label>
                <input type="number" step="0.01" value={createForm.amount_due} onChange={e => setCreateForm(f => ({ ...f, amount_due: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Due In (days)</label>
                <input type="number" value={createForm.due_days} onChange={e => setCreateForm(f => ({ ...f, due_days: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Notes</label>
                <textarea value={createForm.notes} onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={createInvoice} disabled={creating || !createForm.profile_id || !createForm.amount_due}
                className="flex-1 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-semibold">
                {creating ? 'Creating...' : 'Create Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
