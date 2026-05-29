import { useEffect, useState } from 'react';
import { FileText, AlertCircle, Download } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Invoice } from '../../lib/database.types';
import StatusBadge from '../../components/StatusBadge';
import InvoiceDetailModal from '../../components/InvoiceDetailModal';

function fmt(n: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n);
}

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  async function load() {
    supabase.from('invoices').select('*').order('issued_date', { ascending: false })
      .then(({ data }) => { setInvoices(data || []); setLoading(false); });
  }

  useEffect(() => { load(); }, []);

  const filtered = filter === 'all' ? invoices : invoices.filter(i => i.status === filter);
  const totalDue = invoices.filter(i => ['unpaid', 'partial', 'overdue'].includes(i.status))
    .reduce((s, i) => s + (i.amount_due - i.amount_paid), 0);

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Invoices</h2>
          <p className="text-gray-500 text-sm mt-0.5">Your billing history and outstanding balances</p>
        </div>
        {totalDue > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 px-4 py-2 rounded-xl">
            <AlertCircle size={14} className="text-amber-600" />
            <div>
              <p className="text-xs font-semibold text-amber-800">Outstanding Balance</p>
              <p className="text-lg font-bold text-amber-700">{fmt(totalDue)}</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-6 overflow-x-auto">
        {['all', 'unpaid', 'overdue', 'partial', 'paid'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors whitespace-nowrap ${filter === f ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-40 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <FileText size={48} className="text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No invoices found</h3>
          <p className="text-gray-500 text-sm">
            {filter === 'all' ? 'You have no invoices yet.' : `No ${filter} invoices.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(invoice => {
            const balance = invoice.amount_due - invoice.amount_paid;
            const days = Math.ceil((new Date(invoice.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            const isOverdue = invoice.status === 'overdue' || (days < 0 && invoice.status !== 'paid');

            return (
              <button
                key={invoice.id}
                onClick={() => setSelectedInvoice(invoice)}
                className={`text-left rounded-xl border shadow-sm transition-all hover:shadow-md p-5 ${
                  isOverdue && invoice.status !== 'paid'
                    ? 'bg-red-50 border-red-100'
                    : 'bg-white border-gray-100 hover:border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-900">{invoice.invoice_number}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Issued {new Date(invoice.issued_date).toLocaleDateString()}
                    </p>
                  </div>
                  <StatusBadge status={isOverdue && invoice.status !== 'paid' ? 'overdue' : invoice.status} />
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Amount Due</span>
                    <span className="text-lg font-bold text-gray-900">{fmt(invoice.amount_due)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Balance</span>
                    <span className={`font-bold ${
                      balance > 0 ? 'text-red-600' : 'text-emerald-600'
                    }`}>
                      {balance > 0 ? fmt(balance) : 'Paid'}
                    </span>
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-3 mb-4">
                  <p className="text-xs text-gray-500 mb-1">Due Date</p>
                  <p className={`font-medium ${
                    isOverdue && invoice.status !== 'paid'
                      ? 'text-red-600'
                      : days <= 7 && invoice.status !== 'paid'
                      ? 'text-amber-600'
                      : 'text-gray-900'
                  }`}>
                    {new Date(invoice.due_date).toLocaleDateString()}
                    {invoice.status !== 'paid' && (
                      <span className="block text-xs mt-1">
                        {isOverdue ? `${Math.abs(days)}d overdue` : `${days}d left`}
                      </span>
                    )}
                  </p>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedInvoice(invoice);
                  }}
                  className="w-full px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  View & Download
                </button>
              </button>
            );
          })}
        </div>
      )}

      {selectedInvoice && (
        <InvoiceDetailModal
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          onRefresh={load}
        />
      )}
    </div>
  );
}

