import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, FileText, CreditCard, TrendingUp, Clock, AlertCircle, ArrowRight, Package } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import type { Order, Invoice } from '../../lib/database.types';
import StatusBadge from '../../components/StatusBadge';

function fmt(n: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n);
}

export default function CustomerDashboard() {
  const { profile } = useAuth();
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [overdueInvoices, setOverdueInvoices] = useState<Invoice[]>([]);
  const [stats, setStats] = useState({ totalOrders: 0, totalSpend: 0, openInvoices: 0, openBalance: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [ordersRes, invoicesRes] = await Promise.all([
        supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(5),
        supabase.from('invoices').select('*').in('status', ['unpaid', 'overdue', 'partial']).order('due_date'),
      ]);
      const orders = ordersRes.data || [];
      const invoices = invoicesRes.data || [];
      setRecentOrders(orders);
      setOverdueInvoices(invoices.filter(i => i.status === 'overdue').slice(0, 3));
      setStats({
        totalOrders: orders.length,
        totalSpend: orders.reduce((s, o) => s + o.total, 0),
        openInvoices: invoices.length,
        openBalance: invoices.reduce((s, i) => s + (i.amount_due - i.amount_paid), 0),
      });
      setLoading(false);
    }
    load();
  }, []);

  const creditUsed = profile ? (profile.current_balance / profile.credit_limit) * 100 : 0;
  const availableCredit = profile ? profile.credit_limit - profile.current_balance : 0;

  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-4">
        {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          Welcome back, {profile?.contact_name || profile?.store_name}
        </h2>
        <p className="text-gray-500 text-sm mt-0.5">{profile?.store_name} &mdash; Net {profile?.net_terms} Account</p>
      </div>

      {/* Alerts */}
      {profile?.status === 'pending' && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 px-4 py-3.5 rounded-xl text-sm text-amber-800">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          Your account is pending approval. You can browse products but orders will be held until approved.
        </div>
      )}
      {overdueInvoices.length > 0 && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 px-4 py-3.5 rounded-xl text-sm text-red-800">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">You have {overdueInvoices.length} overdue invoice{overdueInvoices.length > 1 ? 's' : ''}</p>
            <p className="text-xs mt-0.5">Please remit payment to avoid service interruption. <Link to="/invoices" className="font-semibold underline">View invoices</Link></p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Orders', value: stats.totalOrders.toString(), icon: ShoppingCart, link: '/orders', accent: 'bg-brand-600' },
          { label: 'Total Purchased', value: fmt(stats.totalSpend), icon: TrendingUp, link: '/orders', accent: 'bg-emerald-600' },
          { label: 'Open Invoices', value: stats.openInvoices.toString(), icon: FileText, link: '/invoices', accent: 'bg-amber-500' },
          { label: 'Balance Due', value: fmt(stats.openBalance), icon: CreditCard, link: '/invoices', accent: stats.openBalance > 0 ? 'bg-red-500' : 'bg-emerald-600' },
        ].map(({ label, value, icon: Icon, link, accent }) => (
          <Link key={label} to={link} className="bg-white rounded-2xl p-5 border border-gray-100 hover:border-brand-200 hover:shadow-md transition-all group">
            <div className={`w-9 h-9 ${accent} rounded-xl flex items-center justify-center mb-3`}>
              <Icon size={17} className="text-white" />
            </div>
            <p className="text-xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5 flex items-center justify-between">
              {label}
              <ArrowRight size={12} className="text-gray-300 group-hover:text-brand-500 transition-colors" />
            </p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Credit account */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100">
          <h3 className="font-semibold text-gray-900 mb-4 text-sm">Credit Account</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Credit Limit</span>
              <span className="font-semibold text-gray-900">{fmt(profile?.credit_limit || 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Used</span>
              <span className="font-semibold text-gray-900">{fmt(profile?.current_balance || 0)}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full transition-all ${creditUsed > 80 ? 'bg-red-500' : creditUsed > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.min(creditUsed, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>{creditUsed.toFixed(0)}% used</span>
              <span className="font-medium text-gray-700">{fmt(availableCredit)} available</span>
            </div>
            <div className="pt-2 border-t border-gray-100 flex items-center gap-1.5 text-xs text-gray-500">
              <Clock size={11} />
              <span>Net {profile?.net_terms || 30} payment terms</span>
            </div>
          </div>
        </div>

        {/* Recent Orders */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900 text-sm">Recent Orders</h3>
            <Link to="/orders" className="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1">
              View all <ArrowRight size={11} />
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Package size={32} className="text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No orders yet.</p>
              <Link to="/products" className="text-brand-600 hover:text-brand-700 text-sm font-semibold mt-1 inline-block">Browse products</Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {recentOrders.map(order => (
                <Link key={order.id} to={`/orders/${order.id}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{order.order_number}</p>
                    <p className="text-xs text-gray-400">{new Date(order.created_at).toLocaleDateString('en-GB')}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={order.status} />
                    <span className="text-sm font-bold text-gray-900 w-20 text-right">{fmt(order.total)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Browse Products', desc: 'View the wholesale catalogue', path: '/products', icon: Package },
          { label: 'View Invoices', desc: 'Check outstanding balances', path: '/invoices', icon: FileText },
          { label: 'Order History', desc: 'Track all your orders', path: '/orders', icon: ShoppingCart },
        ].map(({ label, desc, path, icon: Icon }) => (
          <Link key={path} to={path} className="group bg-white rounded-2xl p-5 border border-gray-100 hover:border-brand-200 hover:shadow-md transition-all flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-brand-50 group-hover:bg-brand-100 flex items-center justify-center transition-colors flex-shrink-0">
              <Icon size={18} className="text-brand-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
            </div>
            <ArrowRight size={15} className="text-gray-300 group-hover:text-brand-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
