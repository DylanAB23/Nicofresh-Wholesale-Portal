import { useEffect, useState } from 'react';
import { X, Download, CreditCard, Package, Loader } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { supabase } from '../lib/supabase';
import type { Invoice } from '../lib/database.types';
import StatusBadge from './StatusBadge';
import PaymentModal from './PaymentModal';

interface OrderItem {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface Payment {
  id: string;
  amount: number;
  paid_at: string;
  reference?: string;
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n);
}

export default function InvoiceDetailModal({
  invoice,
  onClose,
  onRefresh,
}: {
  invoice: Invoice;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [items, setItems] = useState<OrderItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // Fetch order items if invoice is linked to order
        if (invoice.order_id) {
          const { data: orderItems } = await supabase
            .from('order_items')
            .select('id, sku, name, quantity, unit_price, total')
            .eq('order_id', invoice.order_id);
          if (orderItems) setItems(orderItems);
        }

        // Fetch payment history
        const { data: paymentHistory } = await supabase
          .from('payments')
          .select('id, amount, paid_at, reference')
          .eq('invoice_id', invoice.id)
          .order('paid_at', { ascending: false });
        if (paymentHistory) setPayments(paymentHistory);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [invoice]);

  const balance = invoice.amount_due - invoice.amount_paid;
  const canPay = ['unpaid', 'partial', 'overdue'].includes(invoice.status) && balance > 0;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{invoice.invoice_number}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Issued {new Date(invoice.issued_date).toLocaleDateString()} • Due{' '}
                {new Date(invoice.due_date).toLocaleDateString()}
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
          <div className="p-6 space-y-6">
            {/* Status and Amount Summary */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="bg-gray-50 rounded-lg px-4 py-3">
                <p className="text-xs font-medium text-gray-500 mb-1">Status</p>
                <StatusBadge status={invoice.status} />
              </div>
              <div className="bg-gray-50 rounded-lg px-4 py-3">
                <p className="text-xs font-medium text-gray-500 mb-1">Amount Due</p>
                <p className="text-lg font-bold text-gray-900">{fmt(invoice.amount_due)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg px-4 py-3">
                <p className="text-xs font-medium text-gray-500 mb-1">Paid</p>
                <p className="text-lg font-bold text-emerald-600">{fmt(invoice.amount_paid)}</p>
              </div>
              <div
                className={`rounded-lg px-4 py-3 ${
                  balance > 0 ? 'bg-red-50' : 'bg-emerald-50'
                }`}
              >
                <p className={`text-xs font-medium mb-1 ${
                  balance > 0 ? 'text-red-600' : 'text-emerald-600'
                }`}>
                  Balance
                </p>
                <p
                  className={`text-lg font-bold ${
                    balance > 0 ? 'text-red-700' : 'text-emerald-700'
                  }`}
                >
                  {fmt(balance)}
                </p>
              </div>
            </div>

            {/* Hidden printable invoice for PDF */}
            <div id={`invoice-pdf-${invoice.id}`} style={{ display: 'none' }}>
              <InvoicePrintTemplate invoice={invoice} items={items} payments={payments} />
            </div>

            {/* Order Items */}
            {items.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Package size={16} /> Line Items
                </h3>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left text-xs font-semibold text-gray-600 px-4 py-2">
                          SKU
                        </th>
                        <th className="text-left text-xs font-semibold text-gray-600 px-4 py-2">
                          Product
                        </th>
                        <th className="text-center text-xs font-semibold text-gray-600 px-4 py-2">
                          Qty
                        </th>
                        <th className="text-right text-xs font-semibold text-gray-600 px-4 py-2">
                          Unit Price
                        </th>
                        <th className="text-right text-xs font-semibold text-gray-600 px-4 py-2">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id} className="border-b border-gray-100 last:border-0">
                          <td className="px-4 py-2 text-xs font-mono text-gray-600">{item.sku}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">{item.name}</td>
                          <td className="px-4 py-2 text-sm text-gray-700 text-center">
                            {item.quantity}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900 text-right">
                            {fmt(item.unit_price)}
                          </td>
                          <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">
                            {fmt(item.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Payment History */}
            {payments.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <CreditCard size={16} /> Payment History
                </h3>
                <div className="space-y-2">
                  {payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-100 rounded-lg"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {fmt(payment.amount)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(payment.paid_at).toLocaleDateString()} at{' '}
                          {new Date(payment.paid_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      {payment.reference && (
                        <p className="text-xs font-mono text-gray-500">{payment.reference}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {invoice.notes && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Notes</h3>
                <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                  {invoice.notes}
                </p>
              </div>
            )}
          </div>

          {/* Actions Footer */}
          <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
            <button
              onClick={() => downloadInvoicePDF(
                invoice,
                items,
                payments,
                () => setDownloadingPDF(true),
                () => setDownloadingPDF(false)
              )}
              disabled={downloadingPDF}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-60"
            >
              {downloadingPDF ? (
                <Loader size={16} className="animate-spin" />
              ) : (
                <Download size={16} />
              )}
              {downloadingPDF ? 'Generating...' : 'Download PDF'}
            </button>
            {canPay && (
              <button
                onClick={() => setShowPaymentModal(true)}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-lg transition-colors"
              >
                <CreditCard size={16} />
                Pay Now
              </button>
            )}
          </div>
        </div>
      </div>

      {showPaymentModal && (
        <PaymentModal
          open={true}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={() => {
            setShowPaymentModal(false);
            onRefresh();
          }}
          amountPence={Math.round(balance * 100)}
          description={`Invoice ${invoice.invoice_number}`}
          invoiceId={invoice.id}
          invoiceNumber={invoice.invoice_number}
        />
      )}
    </>
  );
}

function InvoicePrintTemplate({
  invoice,
  items,
  payments,
}: {
  invoice: Invoice;
  items: OrderItem[];
  payments: Payment[];
}) {
  const balance = invoice.amount_due - invoice.amount_paid;

  return (
    <div style={{
      fontFamily: 'Arial, sans-serif',
      maxWidth: '800px',
      color: '#333',
      lineHeight: '1.6',
    }}>
      <div style={{ paddingBottom: '20px', borderBottom: '3px solid #3b82f6', marginBottom: '40px', display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '32px', color: '#111' }}>INVOICE</h1>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: 0, color: '#666' }}>Invoice No.</p>
          <p style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>{invoice.invoice_number}</p>
          <span style={{
            display: 'inline-block',
            padding: '4px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: '600',
            textTransform: 'uppercase',
            marginTop: '8px',
            backgroundColor: invoice.status === 'paid' ? '#dcfce7' : '#fecdd3',
            color: invoice.status === 'paid' ? '#166534' : '#991b1b',
          }}>
            {invoice.status}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginBottom: '40px' }}>
        <div>
          <h3 style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', margin: '0 0 8px 0' }}>Bill To</h3>
          <p style={{ margin: '4px 0' }}>Customer</p>
        </div>
        <div>
          <h3 style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', margin: '0 0 8px 0' }}>Invoice Details</h3>
          <p style={{ margin: '4px 0' }}><strong>Issued:</strong> {new Date(invoice.issued_date).toLocaleDateString()}</p>
          <p style={{ margin: '4px 0' }}><strong>Due:</strong> {new Date(invoice.due_date).toLocaleDateString()}</p>
          <p style={{ margin: '4px 0' }}><strong>Amount Due:</strong> <span style={{ fontWeight: 'bold', color: '#3b82f6' }}>{fmt(invoice.amount_due)}</span></p>
        </div>
      </div>

      {items.length > 0 && (
        <>
          <h3 style={{ marginTop: '40px', marginBottom: '16px' }}>Line Items</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '12px 8px', textAlign: 'left', fontWeight: '600', fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>SKU</th>
                <th style={{ padding: '12px 8px', textAlign: 'left', fontWeight: '600', fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>Product</th>
                <th style={{ padding: '12px 8px', textAlign: 'center', fontWeight: '600', fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>Qty</th>
                <th style={{ padding: '12px 8px', textAlign: 'right', fontWeight: '600', fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>Unit Price</th>
                <th style={{ padding: '12px 8px', textAlign: 'right', fontWeight: '600', fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '8px' }}>{item.sku}</td>
                  <td style={{ padding: '8px' }}>{item.name}</td>
                  <td style={{ padding: '8px', textAlign: 'center' }}>{item.quantity}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{fmt(item.unit_price)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>{fmt(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '40px 0' }}>
        <div style={{ width: '300px', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid #f3f4f6' }}>
            <span style={{ color: '#666' }}>Subtotal</span>
            <span style={{ fontWeight: '600' }}>{fmt(invoice.amount_due)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid #f3f4f6' }}>
            <span style={{ color: '#666' }}>Already Paid</span>
            <span style={{ fontWeight: '600' }}>{fmt(invoice.amount_paid)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '16px' }}>
            <span>Outstanding Balance</span>
            <span style={{ color: balance > 0 ? '#dc2626' : '#059669' }}>{fmt(balance)}</span>
          </div>
        </div>
      </div>

      {invoice.notes && (
        <div style={{ backgroundColor: '#f9fafb', padding: '16px', borderRadius: '8px', marginTop: '40px', fontSize: '12px', color: '#666' }}>
          <strong>Notes:</strong><br />
          {invoice.notes}
        </div>
      )}
    </div>
  );
}

async function downloadInvoicePDF(
  invoice: Invoice,
  items: OrderItem[],
  payments: Payment[],
  onStart: () => void,
  onEnd: () => void
) {
  onStart();
  try {
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    let yPos = 20;
    const lineHeight = 7;
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;

    // Helper function to add text with wrapping
    const addText = (text: string, x: number, size: number, weight: 'normal' | 'bold' = 'normal') => {
      pdf.setFontSize(size);
      pdf.setFont(undefined, weight === 'bold' ? 'bold' : 'normal');
      const lines = pdf.splitTextToSize(text, contentWidth - x + margin);
      pdf.text(lines, x, yPos);
      yPos += lineHeight * lines.length + 2;
      return lines.length;
    };

    // Header
    addText('INVOICE', margin, 24, 'bold');
    yPos -= 5;
    pdf.setTextColor(52, 73, 94);
    addText(`#${invoice.invoice_number}`, margin, 14, 'bold');
    pdf.setTextColor(0, 0, 0);

    // Status badge area
    yPos += 2;
    pdf.setFontSize(10);
    const statusText = invoice.status.toUpperCase();
    const statusColors: Record<string, [number, number, number]> = {
      'PAID': [22, 163, 74],
      'UNPAID': [220, 38, 38],
      'PARTIAL': [234, 88, 12],
      'OVERDUE': [220, 38, 38],
    };
    const statusColor = statusColors[statusText] || [100, 100, 100];
    pdf.setFillColor(...statusColor);
    pdf.setTextColor(255, 255, 255);
    pdf.rect(pageWidth - margin - 30, yPos - 5, 28, 8, 'F');
    pdf.text(statusText, pageWidth - margin - 15, yPos, { align: 'center' });
    pdf.setTextColor(0, 0, 0);

    yPos += 15;

    // Invoice details grid
    pdf.setFontSize(9);
    pdf.setFont(undefined, 'bold');
    pdf.text('Issued:', margin, yPos);
    pdf.setFont(undefined, 'normal');
    pdf.text(new Date(invoice.issued_date).toLocaleDateString(), margin + 30, yPos);

    pdf.setFont(undefined, 'bold');
    pdf.text('Due:', margin + 70, yPos);
    pdf.setFont(undefined, 'normal');
    pdf.text(new Date(invoice.due_date).toLocaleDateString(), margin + 90, yPos);

    yPos += 15;

    // Amount summary
    pdf.setFontSize(11);
    pdf.setFont(undefined, 'bold');
    pdf.text('Amount Due:', margin, yPos);
    pdf.setFont(undefined, 'normal');
    pdf.text(fmt(invoice.amount_due), pageWidth - margin, yPos, { align: 'right' });

    yPos += 7;
    pdf.setFont(undefined, 'bold');
    pdf.text('Amount Paid:', margin, yPos);
    pdf.setFont(undefined, 'normal');
    pdf.text(fmt(invoice.amount_paid), pageWidth - margin, yPos, { align: 'right' });

    const balance = invoice.amount_due - invoice.amount_paid;
    yPos += 10;
    pdf.setFont(undefined, 'bold');
    pdf.setTextColor(balance > 0 ? 220 : 34, balance > 0 ? 38 : 197, balance > 0 ? 38 : 94);
    pdf.text('Outstanding Balance:', margin, yPos);
    pdf.text(fmt(balance), pageWidth - margin, yPos, { align: 'right' });
    pdf.setTextColor(0, 0, 0);

    yPos += 20;

    // Line items table
    if (items.length > 0) {
      pdf.setFont(undefined, 'bold');
      pdf.setFontSize(10);
      pdf.text('Line Items', margin, yPos);
      yPos += 8;

      // Table headers
      pdf.setFontSize(9);
      pdf.setFillColor(243, 244, 246);
      pdf.rect(margin, yPos - 5, contentWidth, 6, 'F');
      pdf.text('SKU', margin + 2, yPos);
      pdf.text('Product', margin + 25, yPos);
      pdf.text('Qty', margin + 80, yPos);
      pdf.text('Unit Price', margin + 95, yPos);
      pdf.text('Total', pageWidth - margin - 5, yPos, { align: 'right' });

      yPos += 8;

      // Table rows
      pdf.setFont(undefined, 'normal');
      items.forEach((item) => {
        if (yPos > 250) {
          pdf.addPage();
          yPos = 20;
        }
        pdf.text(item.sku, margin + 2, yPos);
        const productLines = pdf.splitTextToSize(item.name, 50);
        pdf.text(productLines, margin + 25, yPos);
        pdf.text(item.quantity.toString(), margin + 80, yPos);
        pdf.text(fmt(item.unit_price), margin + 95, yPos);
        pdf.text(fmt(item.total), pageWidth - margin - 5, yPos, { align: 'right' });
        yPos += lineHeight * productLines.length + 2;
      });

      yPos += 5;
    }

    // Footer
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.text(`Generated on ${new Date().toLocaleDateString()}`, margin, pdf.internal.pageSize.getHeight() - 10);

    pdf.save(`${invoice.invoice_number}.pdf`);
  } catch (error) {
    console.error('Error generating PDF:', error);
    alert('Failed to generate PDF. Please try again.');
  } finally {
    onEnd();
  }
}
