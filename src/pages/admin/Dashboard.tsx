import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, ShoppingCart, FileText, PoundSterling, ArrowRight, AlertCircle, Clock, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Order, Invoice, Profile } from '../../lib/database.types';
import StatusBadge from '../../components/StatusBadge';

function fmt(n: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n);
}

type OrderWithProfile = Order & { profiles: Pick<Profile, 'store_name'> | null };
type InvoiceWithProfile = Invoice & { profiles: Pick<Profile, 'store_name'> | null };

export default function AdminDashboard() {
  const [stats, setStats] = useState({ totalCustomers: 0, pendingCustomers: 0, totalOrders: 0, pendingOrders: 0, totalInvoiced: 0, totalOutstanding: 0, overdueCount: 0, overdueAmount: 0 });
  const [recentOrders, setRecentOrders] = useState<OrderWithProfile[]>([]);
  const [overdueInvoices, setOverdueInvoices] = useState<InvoiceWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    async function load() {
      const [profilesRes, ordersRes, invoicesRes, settingsRes] = await Promise.all([
        supabase.from('profiles').select('id, status, role'),
        supabase.from('orders').select('*, profiles(store_name)').order('created_at', { ascending: false }).limit(8),
        supabase.from('invoices').select('*, profiles(store_name)').order('due_date'),
        supabase.from('portal_settings').select('updated_at').eq('id', 'global').maybeSingle(),
      ]);

      const profiles = profilesRes.data || [];
      const orders = (ordersRes.data || []) as OrderWithProfile[];
      const invoices = (invoicesRes.data || []) as InvoiceWithProfile[];
      const customers = profiles.filter(p => p.role !== 'admin');
      const unpaid = invoices.filter(i => ['unpaid', 'overdue', 'partial'].includes(i.status));
      const overdue = invoices.filter(i => i.status === 'overdue' || (new Date(i.due_date) < new Date() && i.status !== 'paid'));

      setStats({
        totalCustomers: customers.length,
        pendingCustomers: customers.filter(p => p.status === 'pending').length,
        totalOrders: orders.length,
        pendingOrders: orders.filter(o => o.status === 'pending').length,
        totalInvoiced: invoices.reduce((s, i) => s + i.amount_due, 0),
        totalOutstanding: unpaid.reduce((s, i) => s + (i.amount_due - i.amount_paid), 0),
        overdueCount: overdue.length,
        overdueAmount: overdue.reduce((s, i) => s + (i.amount_due - i.amount_paid), 0),
      });
      setRecentOrders(orders.slice(0, 6));
      setOverdueInvoices(overdue.slice(0, 5));
      setLastSyncAt(settingsRes.data?.updated_at || null);
      setLoading(false);
    }
    load();
  }, []);

  async function handleManualSync() {
    setSyncing(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/shipstation-sync/status-sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error(`Sync failed with status ${res.status}`);
      }

      // Update last sync time
      const now = new Date().toISOString();
      setLastSyncAt(now);
    } catch (err) {
      console.error('Sync error:', err);
      alert('Failed to sync orders. Please try again.');
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-4">
        {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <p className="text-gray-500 text-sm mt-0.5">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Sync Status */}
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm flex items-center gap-3">
          <Clock size={14} className="text-gray-400" />
          <div className="text-right">
            <p className="text-xs text-gray-500">Last sync</p>
            <p className="font-medium text-gray-900">
              {lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'Never'}
            </p>
          </div>
          <button
            onClick={handleManualSync}
            disabled={syncing}
            className="ml-2 p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            title="Sync now"
          >
            <RefreshCw size={14} className={`text-gray-600 ${syncing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Alerts */}
      {(stats.pendingCustomers > 0 || stats.overdueCount > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {stats.pendingCustomers > 0 && (
            <Link to="/admin/customers" className="flex items-center gap-3 bg-amber-50 border border-amber-200 px-4 py-3 rounded-xl text-sm text-amber-800 hover:bg-amber-100 transition-colors">
              <AlertCircle size={15} className="flex-shrink-0" />
              <span><strong>{stats.pendingCustomers}</strong> customer{stats.pendingCustomers > 1 ? 's' : ''} pending approval</span>
              <ArrowRight size={13} className="ml-auto flex-shrink-0" />
            </Link>
          )}
          {stats.overdueCount > 0 && (
            <Link to="/admin/invoices" className="flex items-center gap-3 bg-red-50 border border-red-200 px-4 py-3 rounded-xl text-sm text-red-800 hover:bg-red-100 transition-colors">
              <AlertCircle size={15} className="flex-shrink-0" />
              <span><strong>{stats.overdueCount}</strong> overdue invoice{stats.overdueCount > 1 ? 's' : ''} &mdash; {fmt(stats.overdueAmount)}</span>
              <ArrowRight size={13} className="ml-auto flex-shrink-0" />
            </Link>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Customers', value: stats.totalCustomers, sub: `${stats.pendingCustomers} pending`, icon: Users, accent: 'bg-brand-600', link: '/admin/customers' },
          { label: 'Orders', value: stats.totalOrders, sub: `${stats.pendingOrders} pending`, icon: ShoppingCart, accent: 'bg-emerald-600', link: '/admin/orders' },
          { label: 'Total Invoiced', value: fmt(stats.totalInvoiced), sub: 'all time', icon: FileText, accent: 'bg-amber-500', link: '/admin/invoices' },
          { label: 'Outstanding', value: fmt(stats.totalOutstanding), sub: 'unpaid balance', icon: PoundSterling, accent: stats.totalOutstanding > 0 ? 'bg-red-500' : 'bg-emerald-600', link: '/admin/invoices' },
        ].map(({ label, value, sub, icon: Icon, accent, link }) => (
          <Link key={label} to={link} className="bg-white rounded-2xl p-5 border border-gray-100 hover:border-brand-200 hover:shadow-md transition-all group">
            <div className={`w-9 h-9 ${accent} rounded-xl flex items-center justify-center mb-3`}>
              <Icon size={17} className="text-white" />
            </div>
            <p className="text-xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-600 mt-0.5 font-medium">{label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900 text-sm">Recent Orders</h3>
            <Link to="/admin/orders" className="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1">
              View all <ArrowRight size={11} />
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <div className="px-5 py-10 text-center text-gray-400 text-sm">No orders yet.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {recentOrders.map(order => (
                <div key={order.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{order.order_number}</p>
                    <p className="text-xs text-gray-400">{order.profiles?.store_name}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={order.status} />
                    <span className="text-sm font-bold text-gray-900 w-20 text-right">{fmt(order.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Overdue Invoices */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900 text-sm">Overdue Invoices</h3>
            <Link to="/admin/invoices" className="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1">
              View all <ArrowRight size={11} />
            </Link>
          </div>
          {overdueInvoices.length === 0 ? (
            <div className="px-5 py-10 text-center text-emerald-600 text-sm font-semibold">All invoices are up to date!</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {overdueInvoices.map(inv => {
                const balance = inv.amount_due - inv.amount_paid;
                const daysLate = Math.ceil((Date.now() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24));
                return (
                  <div key={inv.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-red-50/30 transition-colors">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{inv.invoice_number}</p>
                      <p className="text-xs text-gray-400">{inv.profiles?.store_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-red-600">{fmt(balance)}</p>
                      <p className="text-xs text-red-400 flex items-center gap-1 justify-end">
                        <Clock size={10} /> {daysLate}d overdue
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
