import { useEffect, useState } from 'react';
import { Search, CreditCard, Plus, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Payment, Profile, Invoice } from '../../lib/database.types';

function fmt(n: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n);
}

type PaymentFull = Payment & {
  invoices: Pick<Invoice, 'invoice_number' | 'amount_due' | 'amount_paid'> | null;
  profiles: Pick<Profile, 'store_name'> | null;
};

type UnpaidInvoice = Invoice & { profiles: Pick<Profile, 'store_name'> | null };

export default function AdminPayments() {
  const [payments, setPayments] = useState<PaymentFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [unpaidInvoices, setUnpaidInvoices] = useState<UnpaidInvoice[]>([]);
  const [createForm, setCreateForm] = useState({ invoice_id: '', amount: '', method: 'check', reference: '', notes: '' });
  const [creating, setCreating] = useState(false);

  async function load() {
    const { data } = await supabase.from('payments').select('*, invoices(invoice_number, amount_due, amount_paid), profiles(store_name)').order('paid_at', { ascending: false });
    setPayments((data as PaymentFull[]) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function openCreate() {
    const { data } = await supabase.from('invoices').select('*, profiles(store_name)').in('status', ['unpaid', 'partial', 'overdue']).order('due_date');
    setUnpaidInvoices((data as UnpaidInvoice[]) || []);
    setShowCreate(true);
  }

  async function recordPayment() {
    if (!createForm.invoice_id || !createForm.amount) return;
    setCreating(true);
    const invoice = unpaidInvoices.find(i => i.id === createForm.invoice_id);
    if (!invoice) { setCreating(false); return; }
    const amount = parseFloat(createForm.amount);
    const newPaid = invoice.amount_paid + amount;
    const newStatus = newPaid >= invoice.amount_due ? 'paid' : 'partial';
    await supabase.from('payments').insert({
      invoice_id: createForm.invoice_id, profile_id: invoice.profile_id, amount,
      method: createForm.method, reference: createForm.reference, notes: createForm.notes, paid_at: new Date().toISOString(),
    });
    await supabase.from('invoices').update({ amount_paid: newPaid, status: newStatus }).eq('id', createForm.invoice_id);
    setCreating(false);
    setShowCreate(false);
    setCreateForm({ invoice_id: '', amount: '', method: 'check', reference: '', notes: '' });
    await load();
  }

  const filtered = payments.filter(p =>
    (p.invoices?.invoice_number || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.profiles?.store_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.reference || '').toLowerCase().includes(search.toLowerCase())
  );

  const totalReceived = payments.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Payments</h2>
          <p className="text-gray-500 text-sm mt-0.5">
            {payments.length} recorded &bull; <span className="text-emerald-600 font-medium">{fmt(totalReceived)} total received</span>
          </p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm">
          <Plus size={15} /> Record Payment
        </button>
      </div>

      <div className="relative mb-5">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder="Search by invoice, store, or reference..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16"><CreditCard size={40} className="text-gray-300 mx-auto mb-3" /><p className="text-gray-500 text-sm">No payments found.</p></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">Invoice</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden sm:table-cell">Customer</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Date</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">Method</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">Reference</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-5 py-3">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 text-sm font-semibold text-gray-900">{p.invoices?.invoice_number || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell">{p.profiles?.store_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{new Date(p.paid_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 capitalize hidden md:table-cell">{p.method}</td>
                  <td className="px-4 py-3 text-sm text-gray-400 hidden lg:table-cell">{p.reference || '—'}</td>
                  <td className="px-5 py-3 text-right"><span className="text-sm font-bold text-emerald-600">{fmt(p.amount)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-900">Record Payment</h3>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Invoice *</label>
                <select value={createForm.invoice_id} onChange={e => {
                  const inv = unpaidInvoices.find(i => i.id === e.target.value);
                  setCreateForm(f => ({ ...f, invoice_id: e.target.value, amount: inv ? (inv.amount_due - inv.amount_paid).toFixed(2) : f.amount }));
                }} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="">Select invoice...</option>
                  {unpaidInvoices.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.invoice_number} — {i.profiles?.store_name} ({fmt(i.amount_due - i.amount_paid)} due)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Amount (£) *</label>
                <input type="number" step="0.01" value={createForm.amount} onChange={e => setCreateForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Payment Method</label>
                <select value={createForm.method} onChange={e => setCreateForm(f => ({ ...f, method: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                  {['check', 'ach', 'wire', 'credit_card', 'cash', 'other'].map(m => (
                    <option key={m} value={m} className="capitalize">{m.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Reference / Check #</label>
                <input type="text" value={createForm.reference} onChange={e => setCreateForm(f => ({ ...f, reference: e.target.value }))} placeholder="e.g. Check #1042"
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
              <button onClick={recordPayment} disabled={creating || !createForm.invoice_id || !createForm.amount}
                className="flex-1 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-semibold">
                {creating ? 'Recording...' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
