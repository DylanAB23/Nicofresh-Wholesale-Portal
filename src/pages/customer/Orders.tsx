import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, CheckCircle, Clock, CreditCard, ChevronRight, X, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Order, OrderItem, Product } from '../../lib/database.types';
import StatusBadge from '../../components/StatusBadge';
import PaymentModal from '../../components/PaymentModal';

function fmt(n: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n);
}

type OrderItemWithProduct = OrderItem & { products: Product };

function PaymentBadge({ method, status }: { method: string; status: string }) {
  const isPaid = status === 'paid';
  const isOverdue = status === 'overdue';
  const isPartial = status === 'partial';

  if (isPaid) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
        <CheckCircle size={10} />
        Paid
      </span>
    );
  }
  if (isOverdue) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">
        <Clock size={10} />
        Overdue
      </span>
    );
  }
  if (isPartial) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
        <CreditCard size={10} />
        Partial
      </span>
    );
  }
  const isNet30 = method === 'net30';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
      ${isNet30 ? 'bg-brand-50 text-brand-700' : 'bg-amber-50 text-amber-700'}`}>
      {isNet30 ? <Clock size={10} /> : <CreditCard size={10} />}
      {isNet30 ? 'Net-30' : 'Payment Due'}
    </span>
  );
}

function OrderDetail({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItemWithProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [justPaid, setJustPaid] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const justPlaced = searchParams.get('success') === '1';
  const creditDeducted = searchParams.get('creditDeducted') === 'true';
  const newBalance = searchParams.get('newBalance') ? parseFloat(searchParams.get('newBalance')!) : null;

  async function load() {
    const [orderRes, itemsRes] = await Promise.all([
      supabase.from('orders').select('*').eq('id', orderId).maybeSingle(),
      supabase.from('order_items').select('*, products(*)').eq('order_id', orderId),
    ]);
    setOrder(orderRes.data);
    setItems((itemsRes.data as OrderItemWithProduct[]) || []);
    setLoading(false);
  }

  async function handleCancelOrder() {
    if (!order) return;
    setCancelling(true);
    setCancelError('');

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/shipstation-sync/cancel-order`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId: order.id }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Failed to cancel order (HTTP ${res.status})`);
      }

      // Refresh the order to show cancelled status
      await load();
      setCancelOpen(false);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to cancel order';
      setCancelError(errMsg);
      console.error('Cancel order error:', err);
    } finally {
      setCancelling(false);
    }
  }

  useEffect(() => { load(); }, [orderId]);

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-4">
        {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    );
  }
  if (!order) return <div className="p-6 text-center text-gray-500">Order not found.</div>;

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/orders" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"><ArrowLeft size={18} /></Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold text-gray-900">{order.order_number}</h2>
            <StatusBadge status={order.status} />
            <PaymentBadge method={order.payment_method} status={order.payment_status} />
            {/* Cancel Order Button - only for Net-30 orders that haven't shipped */}
            {order.payment_method === 'net30' && order.status !== 'shipped' && order.status !== 'cancelled' && (
              <button
                onClick={() => setCancelOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
              >
                <X size={12} />
                Cancel Order
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            Placed {new Date(order.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      {justPlaced && (
        <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-5 text-sm text-emerald-800">
          <CheckCircle size={16} className="flex-shrink-0 text-emerald-600 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Order placed successfully!</p>
            {order.payment_method === 'net30' ? (
              <div className="text-xs mt-0.5 space-y-1">
                <p>An invoice will be issued within 1 business day with your net-30 due date.</p>
                {creditDeducted && newBalance !== null && (
                  <p className="font-medium text-emerald-700">
                    ✓ Credit deducted: {fmt(order.total)} | New balance: {fmt(newBalance)}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs mt-0.5">Our team will contact you with payment instructions before your order ships.</p>
            )}
          </div>
        </div>
      )}

      {justPaid && (
        <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-5 text-sm text-emerald-800">
          <CheckCircle size={16} className="flex-shrink-0 text-emerald-600 mt-0.5" />
          <div>
            <p className="font-semibold">Payment confirmed!</p>
            <p className="text-xs mt-0.5">Your payment of {fmt(order.total)} has been successfully processed. Your order is now being prepared.</p>
          </div>
        </div>
      )}

      {/* Payment instructions banner for upfront orders */}
      {order.payment_method === 'upfront' && order.payment_status !== 'paid' && !justPlaced && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 text-sm text-amber-800">
          <CreditCard size={16} className="flex-shrink-0 text-amber-600 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Payment Required Before Shipment</p>
            <p className="text-xs mt-0.5">This order requires upfront payment to proceed.</p>
          </div>
          <button
            onClick={() => setPaymentOpen(true)}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <CreditCard size={12} />
            Pay Now
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Line items */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-sm font-semibold text-gray-700">Items Ordered</p>
          </div>
          <div className="divide-y divide-gray-50">
            {items.map(item => (
              <div key={item.id} className="flex items-center gap-4 px-5 py-4">
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-50 flex-shrink-0">
                  {item.products?.image_url && <img src={item.products.image_url} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{item.products?.name}</p>
                  <p className="text-xs text-gray-400">SKU: {item.products?.sku} &bull; {fmt(item.unit_price)} each</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-gray-900">{fmt(item.total)}</p>
                  <p className="text-xs text-gray-400">Qty: {item.quantity}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Summary panel */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
            <h3 className="font-semibold text-gray-900 text-sm">Order Summary</h3>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotal</span><span className="font-medium">{fmt(order.subtotal)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Shipping</span><span className="font-medium">{order.shipping > 0 ? fmt(order.shipping) : 'TBD'}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Tax</span><span className="font-medium">{fmt(order.tax)}</span></div>
            <div className="border-t border-gray-100 pt-3 flex justify-between">
              <span className="font-semibold text-gray-900">Total</span>
              <span className="text-lg font-bold text-brand-600">{fmt(order.total)}</span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-2">
            <h3 className="font-semibold text-gray-900 text-sm mb-2">Payment</h3>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Method</span>
              <PaymentBadge method={order.payment_method} status={order.payment_status} />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Status</span>
              <StatusBadge status={order.payment_status === 'pending_payment' ? 'pending' : order.payment_status} />
            </div>
          </div>

          {order.notes && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs font-medium text-gray-500 mb-1">Order Notes</p>
              <p className="text-sm text-gray-700">{order.notes}</p>
            </div>
          )}

          {/* Pay button in sidebar for upfront unpaid orders */}
          {order.payment_method === 'upfront' && order.payment_status !== 'paid' && (
            <button
              onClick={() => setPaymentOpen(true)}
              className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
            >
              <CreditCard size={15} />
              Pay {fmt(order.total)} Now
            </button>
          )}
        </div>
      </div>

      {paymentOpen && (
        <PaymentModal
          open={paymentOpen}
          onClose={() => setPaymentOpen(false)}
          onSuccess={() => { setPaymentOpen(false); setJustPaid(true); load(); }}
          amountPence={Math.round(order.total * 100)}
          description={`Order ${order.order_number}`}
          orderId={order.id}
        />
      )}

      {/* Cancel Order Confirmation Modal */}
      {cancelOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-sm w-full">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Cancel Order</h3>
              <button
                onClick={() => { setCancelOpen(false); setCancelError(''); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <AlertCircle size={16} className="flex-shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-900">Are you sure you want to cancel this order?</p>
                  <p className="text-xs text-amber-800 mt-1">
                    Your credit of <strong>{fmt(order.total)}</strong> will be restored to your account.
                  </p>
                </div>
              </div>

              {cancelError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {cancelError}
                </div>
              )}

              <div className="space-y-2">
                <button
                  onClick={handleCancelOrder}
                  disabled={cancelling}
                  className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors"
                >
                  {cancelling ? 'Cancelling...' : 'Cancel Order'}
                </button>
                <button
                  onClick={() => { setCancelOpen(false); setCancelError(''); }}
                  disabled={cancelling}
                  className="w-full border border-gray-200 text-gray-700 font-semibold py-2.5 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Keep Order
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Orders() {
  const { id } = useParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (id) return;
    supabase.from('orders').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setOrders(data || []); setLoading(false); });
  }, [id]);

  if (id) return <OrderDetail orderId={id} />;

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);

  // Stats
  const totalSpend = orders.reduce((s, o) => s + o.total, 0);
  const pendingCount = orders.filter(o => ['pending', 'approved', 'processing'].includes(o.status)).length;

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Order History</h2>
        <p className="text-gray-500 text-sm mt-0.5">All orders placed on your account</p>
      </div>

      {/* Summary cards */}
      {orders.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{orders.length}</p>
            <p className="text-xs text-gray-500 mt-0.5">Total Orders</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{pendingCount}</p>
            <p className="text-xs text-gray-500 mt-0.5">In Progress</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
            <p className="text-xl font-bold text-brand-600">{fmt(totalSpend)}</p>
            <p className="text-xs text-gray-500 mt-0.5">Total Purchased</p>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-5 overflow-x-auto">
        {['all', 'pending', 'approved', 'processing', 'shipped', 'delivered', 'cancelled'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize whitespace-nowrap transition-colors ${filter === f ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Package size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm mb-4">{filter !== 'all' ? `No ${filter} orders found.` : 'No orders yet.'}</p>
          {filter === 'all' && (
            <Link to="/products" className="inline-block bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 px-5 rounded-lg transition-colors text-sm">
              Start Shopping
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">Order #</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden sm:table-cell">Date</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">Payment</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">PO #</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">Total</th>
                <th className="px-5 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(order => (
                <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <Link to={`/orders/${order.id}`} className="text-sm font-semibold text-brand-600 hover:text-brand-700">{order.order_number}</Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 hidden sm:table-cell">{new Date(order.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <PaymentBadge method={order.payment_method} status={order.payment_status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">—</td>
                  <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">{fmt(order.total)}</td>
                  <td className="px-5 py-3">
                    <Link to={`/orders/${order.id}`} className="text-gray-300 hover:text-gray-500 transition-colors">
                      <ChevronRight size={16} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
