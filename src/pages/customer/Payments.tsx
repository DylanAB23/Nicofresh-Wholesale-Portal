import { useEffect, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Payment, Invoice } from '../../lib/database.types';

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

type PaymentWithInvoice = Payment & { invoices: Pick<Invoice, 'invoice_number'> | null };

export default function Payments() {
  const [payments, setPayments] = useState<PaymentWithInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('payments').select('*, invoices(invoice_number)').order('paid_at', { ascending: false })
      .then(({ data }) => { setPayments((data as PaymentWithInvoice[]) || []); setLoading(false); });
  }, []);

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Payment History</h2>
        <p className="text-gray-500 text-sm mt-0.5">All payments recorded on your account</p>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : payments.length === 0 ? (
        <div className="text-center py-16"><CreditCard size={40} className="text-gray-300 mx-auto mb-3" /><p className="text-gray-500 text-sm">No payments recorded yet.</p></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">Invoice</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Date</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden sm:table-cell">Method</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">Reference</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-5 py-3">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {payments.map(p => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 text-sm font-semibold text-gray-900">{p.invoices?.invoice_number || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{new Date(p.paid_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 capitalize hidden sm:table-cell">{p.method}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">{p.reference || '—'}</td>
                  <td className="px-5 py-3 text-right"><span className="text-sm font-bold text-emerald-600">{fmt(p.amount)}</span></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50">
                <td colSpan={4} className="px-5 py-3 text-sm font-semibold text-gray-700 hidden sm:table-cell">Total Paid</td>
                <td colSpan={2} className="px-5 py-3 text-sm font-semibold text-gray-700 sm:hidden">Total Paid</td>
                <td className="px-5 py-3 text-right text-sm font-bold text-emerald-600">
                  {fmt(payments.reduce((s, p) => s + p.amount, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
