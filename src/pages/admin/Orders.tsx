import { useEffect, useState } from 'react';
import { Search, ShoppingCart, ChevronDown, CheckCircle, CreditCard, Clock, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import type { Order, Profile, OrderItem, Product } from '../../lib/database.types';
import StatusBadge from '../../components/StatusBadge';

function fmt(n: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n);
}

type OrderWithProfile = Order & {
  profiles: Pick<Profile, 'store_name' | 'email'> | null;
  shipstation_order_id?: string | null;
};
type OrderItemWithProduct = OrderItem & { products: Product };

const STATUS_OPTIONS = ['pending', 'approved', 'processing', 'shipped', 'delivered', 'cancelled'];

function PaymentStatusBadge({ status }: { status: string }) {
  const configs: Record<string, { bg: string; text: string; label: string; icon: React.ReactNode }> = {
    paid:            { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Paid',        icon: <CheckCircle size={10} /> },
    pending_payment: { bg: 'bg-amber-50',   text: 'text-amber-700',   label: 'Awaiting',    icon: <Clock size={10} /> },
    unpaid:          { bg: 'bg-amber-50',   text: 'text-amber-700',   label: 'Unpaid',      icon: <Clock size={10} /> },
    partial:         { bg: 'bg-blue-50',    text: 'text-blue-700',    label: 'Partial',     icon: <CreditCard size={10} /> },
    overdue:         { bg: 'bg-red-50',     text: 'text-red-700',     label: 'Overdue',     icon: <Clock size={10} /> },
  };
  const cfg = configs[status] ?? { bg: 'bg-gray-100', text: 'text-gray-600', label: status, icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

export default function AdminOrders() {
  useAuth();
  const [orders, setOrders] = useState<OrderWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<OrderItemWithProduct[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  async function load() {
    const { data } = await supabase
      .from('orders')
      .select('*, profiles(store_name, email), shipstation_order_id')
      .order('created_at', { ascending: false });
    setOrders((data as OrderWithProfile[]) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function toggleExpand(orderId: string) {
    if (expandedId === orderId) { setExpandedId(null); return; }
    setExpandedId(orderId);
    const { data } = await supabase.from('order_items').select('*, products(*)').eq('order_id', orderId);
    setExpandedItems((data as OrderItemWithProduct[]) || []);
  }

  async function updateStatus(orderId: string, status: string) {
    setUpdatingId(orderId);
    await supabase.from('orders').update({ status }).eq('id', orderId);
    setUpdatingId(null);
    await load();
  }

  async function syncOrderStatuses() {
    setSyncing(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const endpoint = `${SUPABASE_URL}/functions/v1/shipstation-sync/status-sync`;

      console.log('🔄 Starting sync request to:', endpoint);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('📊 Response status:', res.status, res.statusText);

      const responseText = await res.text();
      console.log('📦 Response body:', responseText);

      if (!res.ok) {
        console.error('❌ Sync failed:', responseText);
        alert(`Sync failed: ${res.status} ${res.statusText}\n${responseText}`);
      } else {
        const data = JSON.parse(responseText);
        console.log('✅ Sync successful:', data);
        alert(`✅ Sync complete!\nChecked: ${data.summary?.checked}\nUpdated: ${data.summary?.updated}`);
        await load();
      }
    } catch (err) {
      console.error('❌ Sync error:', err);
      alert(`Sync error: ${String(err)}`);
    } finally {
      setSyncing(false);
    }
  }

  const filtered = orders.filter(o => {
    const matchSearch = o.order_number.toLowerCase().includes(search.toLowerCase()) ||
      o.profiles?.store_name?.toLowerCase().includes(search.toLowerCase());
    return matchSearch && (filter === 'all' || o.status === filter);
  });

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Orders</h2>
        <p className="text-gray-500 text-sm mt-0.5">{orders.length} total orders</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search by order #, store, or PO..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <button onClick={syncOrderStatuses} disabled={syncing}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg transition-colors text-sm">
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing...' : 'Sync Status'}
        </button>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg overflow-x-auto">
          {['all', ...STATUS_OPTIONS].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize whitespace-nowrap transition-colors ${filter === f ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16"><ShoppingCart size={40} className="text-gray-300 mx-auto mb-3" /><p className="text-gray-500 text-sm">No orders found.</p></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="w-8 px-3 py-3"></th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Order #</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden sm:table-cell">Customer</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">Date</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">Payment</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden xl:table-cell">Pay Status</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">Total</th>
                <th className="text-right text-xs font-semibold text-gray-500 px-5 py-3 hidden xl:table-cell">ShipStation</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(order => {
                const synced = !!order.shipstation_order_id;

                return (
                  <>
                    <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => toggleExpand(order.id)}>
                      <td className="px-3 py-3">
                        <ChevronDown size={14} className={`text-gray-400 transition-transform ${expandedId === order.id ? 'rotate-180' : ''}`} />
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-gray-900">{order.order_number}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell">
                        <p>{order.profiles?.store_name}</p>
                        <p className="text-xs text-gray-400">{order.profiles?.email}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">{new Date(order.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <select value={order.status} onChange={e => updateStatus(order.id, e.target.value)} disabled={updatingId === order.id}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                          {STATUS_OPTIONS.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
                          ${order.payment_method === 'net30' ? 'bg-brand-50 text-brand-700' : 'bg-emerald-50 text-emerald-700'}`}>
                          {order.payment_method === 'net30' ? <Clock size={10} /> : <CreditCard size={10} />}
                          {order.payment_method === 'net30' ? 'Net-30' : 'Upfront'}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell">
                        <PaymentStatusBadge status={order.payment_status} />
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">{fmt(order.total)}</td>
                      <td className="px-5 py-3 text-right hidden xl:table-cell">
                        {synced ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                            <CheckCircle size={13} />
                            Synced
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">Pending</span>
                        )}
                      </td>
                    </tr>
                    {expandedId === order.id && (
                      <tr key={`${order.id}-expanded`} className="bg-gray-50/50">
                        <td colSpan={9} className="px-5 py-3">
                          <div className="space-y-2">
                            {expandedItems.map(item => (
                              <div key={item.id} className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded overflow-hidden bg-gray-100 flex-shrink-0">
                                  {item.products?.image_url && <img src={item.products.image_url} alt="" className="w-full h-full object-cover" />}
                                </div>
                                <div className="flex-1 text-xs">
                                  <span className="font-medium text-gray-800">{item.products?.name}</span>
                                  <span className="text-gray-400 ml-2">SKU: {item.products?.sku}</span>
                                </div>
                                <div className="text-xs text-gray-500">Qty: {item.quantity}</div>
                                <div className="text-xs font-semibold text-gray-900">{fmt(item.total)}</div>
                              </div>
                            ))}
                            <div className="border-t border-gray-100 pt-2 mt-2">
                              <div className="text-xs font-medium text-gray-600 mb-1.5">Ship To Address</div>
                              <div className="text-xs text-gray-700 space-y-0.5">
                                <div className="font-medium">{order.shipping_name}{order.shipping_company ? ` (${order.shipping_company})` : ''}</div>
                                <div>{order.shipping_address}</div>
                                <div>{order.shipping_city}{order.shipping_state ? `, ${order.shipping_state}` : ''} {order.shipping_postcode}</div>
                                <div>{order.shipping_country}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 border-t border-gray-100 pt-2 mt-2 flex-wrap">
                              <span className="text-xs text-gray-500 font-medium">Payment:</span>
                              <PaymentStatusBadge status={order.payment_status} />
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
                                ${order.payment_method === 'net30' ? 'bg-brand-50 text-brand-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                {order.payment_method === 'net30' ? 'Net-30' : 'Upfront'}
                              </span>
                            </div>
                            {order.notes && <p className="text-xs text-gray-500 border-t border-gray-100 pt-2 mt-2">Notes: {order.notes}</p>}
                            <div className="flex items-center gap-2 border-t border-gray-100 pt-2 mt-2">
                              {synced ? (
                                <>
                                  <CheckCircle size={12} className="text-emerald-500" />
                                  <p className="text-xs text-emerald-700 font-medium">
                                    Synced to ShipStation
                                    {order.shipstation_order_id && ` (ID: ${order.shipstation_order_id})`}
                                  </p>
                                </>
                              ) : (
                                <p className="text-xs text-gray-400">Not yet synced to ShipStation</p>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
