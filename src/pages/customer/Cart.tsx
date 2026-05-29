import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2, Plus, Minus, ShoppingCart, ArrowLeft, CheckCircle, CreditCard, Clock, AlertCircle, MapPin } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import AddressForm from '../../components/AddressForm';
import type { PortalSettings, CustomerAddress } from '../../lib/database.types';

function fmt(n: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n);
}

export default function Cart() {
  const { items, updateItem, removeItem, clearCart, total } = useCart();
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [poNumber, setPoNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'net30' | 'upfront'>('net30');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<PortalSettings | null>(null);

  // Address management
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);

  useEffect(() => {
    supabase.from('portal_settings').select('*').eq('id', 'global').maybeSingle()
      .then(({ data }) => {
        setSettings(data);
        // Auto-select correct default payment method based on rules
        if (data && profile) {
          const mustPayUpfront = profile.require_upfront ||
            !data.net30_enabled ||
            total < data.net30_min_order ||
            total > profile.net30_limit;
          setPaymentMethod(mustPayUpfront ? 'upfront' : 'net30');
        }
      });
  }, [profile, total]);

  // Fetch customer addresses
  useEffect(() => {
    if (user) {
      supabase
        .from('customer_addresses')
        .select('*')
        .eq('profile_id', user.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false })
        .then(({ data }) => {
          setAddresses(data || []);
          // Auto-select default address
          const defaultAddr = data?.find(a => a.is_default);
          if (defaultAddr) setSelectedAddressId(defaultAddr.id);
        });
    }
  }, [user]);

  // Derive payment rules from settings + profile
  const net30Enabled = settings?.net30_enabled ?? true;
  const belowMinOrder = settings ? total < settings.net30_min_order : false;
  const exceedsNet30Limit = profile ? total > profile.net30_limit : false;
  const requireUpfront = profile?.require_upfront ?? false;

  const canUseNet30 = net30Enabled && !belowMinOrder && !exceedsNet30Limit && !requireUpfront && profile?.status === 'active';

  // Keep payment method in sync if rules change
  useEffect(() => {
    if (!canUseNet30) setPaymentMethod('upfront');
  }, [canUseNet30]);

  function net30BlockReason(): string | null {
    if (!net30Enabled) return 'Net-30 terms are currently disabled by the administrator.';
    if (requireUpfront) return 'Your account is set to require upfront payment for all orders.';
    if (belowMinOrder && settings) return `Orders under ${fmt(settings.net30_min_order)} require upfront payment.`;
    if (exceedsNet30Limit && profile) return `This order exceeds your net-30 limit of ${fmt(profile.net30_limit)}. Please pay upfront or split your order.`;
    if (profile?.status !== 'active') return 'Your account must be active to use net-30 terms.';
    return null;
  }

  async function saveAddressDuringCheckout(formData: Partial<CustomerAddress>) {
    setSavingAddress(true);
    try {
      const { data: newAddress, error } = await supabase
        .from('customer_addresses')
        .insert({
          profile_id: user?.id,
          ...formData,
        })
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!newAddress) throw new Error('Failed to save address');

      // If setting as default, unset others
      if (formData.is_default) {
        await supabase
          .from('customer_addresses')
          .update({ is_default: false })
          .eq('profile_id', user?.id)
          .neq('id', newAddress.id);
      }

      setAddresses([newAddress, ...addresses.map(a => ({ ...a, is_default: false }))]);
      setSelectedAddressId(newAddress.id);
      setShowAddressForm(false);
    } catch (err) {
      console.error('Error saving address:', err);
      setError('Failed to save address. Please try again.');
    } finally {
      setSavingAddress(false);
    }
  }

  async function placeOrder() {
    if (!user || items.length === 0) return;

    // Check if address is selected or they have addresses
    if (!selectedAddressId && addresses.length > 0) {
      setError('Please select a delivery address');
      return;
    }

    if (addresses.length === 0) {
      setError('Please add a delivery address before placing an order');
      return;
    }

    setError('');
    setLoading(true);
    try {
      // Get selected address
      const selectedAddr = addresses.find(a => a.id === selectedAddressId);
      if (!selectedAddr) throw new Error('Selected address not found');

      // ── VALIDATION: Check inventory for all items ──
      for (const item of items) {
        if (item.quantity > item.product.stock_qty) {
          throw new Error(
            `${item.product.name}: Only ${item.product.stock_qty} in stock, but you ordered ${item.quantity}`
          );
        }
      }

      // ── VALIDATION: Check credit limit for Net-30 orders ──
      if (paymentMethod === 'net30' && profile) {
        const currentBalance = profile.current_balance || 0;
        const creditLimit = profile.credit_limit || 0;
        const availableCredit = creditLimit - currentBalance;
        console.log('💳 Credit check:', { currentBalance, creditLimit, availableCredit, orderTotal: total });
        if (total > availableCredit) {
          throw new Error(
            `Insufficient credit. Order total: £${total.toLocaleString()} | Available credit: £${availableCredit.toLocaleString()} | Credit limit: £${creditLimit.toLocaleString()}`
          );
        }
      }

      // 1. Create order with status 'processing'
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          profile_id: user.id,
          status: 'processing',
          payment_method: paymentMethod,
          payment_status: paymentMethod === 'upfront' ? 'pending_payment' : 'unpaid',
          subtotal: total,
          shipping: 0,
          tax: 0,
          total,
          notes: [poNumber ? `PO: ${poNumber}` : '', notes].filter(Boolean).join(' | '),
          // Populate shipping address from selected address
          shipping_name: profile?.contact_name || '',
          shipping_company: selectedAddr.company || '',
          shipping_address: selectedAddr.street1,
          shipping_city: selectedAddr.city,
          shipping_state: selectedAddr.state || '',
          shipping_postcode: selectedAddr.zip,
          shipping_country: selectedAddr.country,
        })
        .select()
        .maybeSingle();
      if (orderErr) throw orderErr;
      if (!order) throw new Error('Order was not created. Please try again.');

      // 2. Create order items
      const { error: itemsErr } = await supabase.from('order_items').insert(
        items.map(i => ({
          order_id: order.id,
          product_id: i.product.id,
          sku: i.product.sku,
          name: i.product.name,
          quantity: i.quantity,
          unit_price: i.product.wholesale_price,
          total: i.product.wholesale_price * i.quantity,
        }))
      );
      if (itemsErr) throw itemsErr;

      // 2.5 Deduct from credit limit if Net-30 order
      if (paymentMethod === 'net30' && profile) {
        const newBalance = (profile.current_balance || 0) + total;
        console.log('📊 Updating credit balance:', {
          currentBalance: profile.current_balance,
          orderTotal: total,
          newBalance: newBalance,
          creditLimit: profile.credit_limit,
          userId: user.id
        });
        const { data, error: balanceErr } = await supabase
          .from('profiles')
          .update({ current_balance: newBalance })
          .eq('id', user.id)
          .select();
        if (balanceErr) {
          console.error('❌ Credit balance update failed:', balanceErr);
          throw new Error(`Failed to update credit balance: ${balanceErr.message}`);
        }
        console.log('✅ Credit balance updated successfully:', data);
      }

      // 3. Auto-push to ShipStation + deduct inventory (fire and forget — don't block checkout)
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (token) {
        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
        fetch(`${SUPABASE_URL}/functions/v1/shipstation-sync/auto-order`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ orderId: order.id }),
        }).catch(() => {
          // Don't block the user — order is already placed
          console.warn('ShipStation auto-push failed, admin can sync manually');
        });
      }

      clearCart();

      // Refresh profile to update dashboard with new balance
      await refreshProfile();

      const successParams = new URLSearchParams();
      successParams.set('success', '1');
      if (paymentMethod === 'net30') {
        const newBalance = (profile?.current_balance || 0) + total;
        successParams.set('creditDeducted', 'true');
        successParams.set('newBalance', newBalance.toString());
      }
      navigate(`/orders/${order.id}?${successParams.toString()}`);
    } catch (e: unknown) {
      const err = e as { message?: string; code?: string; details?: string; hint?: string };
      const msg = [err.message, err.details, err.hint].filter(Boolean).join(' — ');
      setError(msg || 'Failed to place order. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="p-6 lg:p-8 max-w-3xl mx-auto">
        <div className="text-center py-20">
          <ShoppingCart size={48} className="text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Your cart is empty</h2>
          <p className="text-gray-500 text-sm mb-6">Add items from the product catalog to get started.</p>
          <Link to="/products" className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 px-5 rounded-xl transition-colors text-sm">
            <ArrowLeft size={14} /> Browse Products
          </Link>
        </div>
      </div>
    );
  }

  const blockReason = net30BlockReason();

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/products" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <h2 className="text-2xl font-bold text-gray-900">Your Cart</h2>
        <span className="text-sm text-gray-400">{items.length} item{items.length !== 1 ? 's' : ''}</span>
      </div>

      {profile?.status === 'pending' && (
        <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          Your account is pending approval. Orders will be held until your account is activated.
        </div>
      )}
      {error && <div className="mb-5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Delivery Address Section (Full Width) */}
        <div className="lg:col-span-3">
          {showAddressForm ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Delivery Address</h3>
              <AddressForm
                onSave={saveAddressDuringCheckout}
                onCancel={() => setShowAddressForm(false)}
                loading={savingAddress}
              />
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <MapPin size={18} /> Delivery Address
                </h3>
              </div>

              {addresses.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-4">No saved addresses yet</p>
                  <button
                    onClick={() => setShowAddressForm(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <Plus size={16} /> Add Address
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    {addresses.map(address => (
                      <button
                        key={address.id}
                        onClick={() => setSelectedAddressId(address.id)}
                        className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                          selectedAddressId === address.id
                            ? 'border-brand-500 bg-brand-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            {address.company && <p className="font-medium text-gray-900">{address.company}</p>}
                            <p className="text-sm text-gray-700">{address.street1}</p>
                            {address.street2 && <p className="text-sm text-gray-700">{address.street2}</p>}
                            <p className="text-sm text-gray-700">
                              {address.city}
                              {address.state && `, ${address.state}`} {address.zip}
                            </p>
                          </div>
                          {address.is_default && (
                            <div className="ml-3 px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded">
                              Default
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowAddressForm(true)}
                    className="w-full py-2 text-center text-sm text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors font-medium"
                  >
                    + Add New Address
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        {/* Items list */}
        <div className="lg:col-span-2 space-y-3">
          {items.map(({ product, quantity }) => (
            <div key={product.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex gap-4">
              <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-50 flex-shrink-0">
                {product.image_url && <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{product.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">SKU: {product.sku}</p>
                  </div>
                  <button onClick={() => removeItem(product.id)} className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0">
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateItem(product.id, Math.max(1, quantity - 1))} className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
                        <Minus size={12} />
                      </button>
                      <input
                        type="number"
                        min="1"
                        max={product.stock_qty}
                        value={quantity}
                        onChange={e => { const n = parseInt(e.target.value, 10); if (!isNaN(n) && n >= 1) updateItem(product.id, Math.min(n, product.stock_qty)); }}
                        className="w-10 text-center text-xs font-semibold text-gray-900 border border-gray-200 rounded py-1 focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button
                        onClick={() => updateItem(product.id, Math.min(product.stock_qty, quantity + 1))}
                        disabled={quantity >= product.stock_qty}
                        className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                    {quantity >= product.stock_qty && (
                      <span className="text-[10px] text-amber-600 font-medium">Max stock ({product.stock_qty})</span>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900">{fmt(product.wholesale_price * quantity)}</p>
                    <p className="text-xs text-gray-400">{fmt(product.wholesale_price)} ea.</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Order summary + payment */}
        <div className="space-y-4">
          {/* Payment method selector */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-semibold text-gray-900 mb-3 text-sm">Payment Method</h3>

            <div className="space-y-2">
              {/* Net-30 option */}
              <button
                type="button"
                disabled={!canUseNet30}
                onClick={() => canUseNet30 && setPaymentMethod('net30')}
                className={`w-full flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition-all
                  ${paymentMethod === 'net30' && canUseNet30
                    ? 'border-brand-500 bg-brand-50'
                    : !canUseNet30
                      ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 flex items-center justify-center
                  ${paymentMethod === 'net30' && canUseNet30 ? 'border-brand-600' : 'border-gray-300'}`}>
                  {paymentMethod === 'net30' && canUseNet30 && <div className="w-2 h-2 rounded-full bg-brand-600" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-brand-600" />
                    <span className="text-sm font-semibold text-gray-900">Net-{profile?.net_terms || 30} Terms</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">Pay within {profile?.net_terms || 30} days of invoice</p>
                  {profile && <p className="text-xs text-brand-600 mt-0.5">Limit: {fmt(profile.net30_limit)} per order</p>}
                </div>
              </button>

              {/* Upfront option */}
              <button
                type="button"
                onClick={() => setPaymentMethod('upfront')}
                className={`w-full flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition-all
                  ${paymentMethod === 'upfront' ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 flex items-center justify-center
                  ${paymentMethod === 'upfront' ? 'border-brand-600' : 'border-gray-300'}`}>
                  {paymentMethod === 'upfront' && <div className="w-2 h-2 rounded-full bg-brand-600" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CreditCard size={14} className="text-emerald-600" />
                    <span className="text-sm font-semibold text-gray-900">Pay Upfront</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">Full payment required before shipment</p>
                </div>
              </button>
            </div>

            {blockReason && (
              <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-100 px-3 py-2.5 rounded-lg text-xs text-amber-800">
                <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                {blockReason}
              </div>
            )}
          </div>

          {/* Order details + summary */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h3 className="font-semibold text-gray-900 text-sm">Order Details</h3>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">PO Number (optional)</label>
              <input type="text" value={poNumber} onChange={e => setPoNumber(e.target.value)} placeholder="Your PO #"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Order Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Special instructions..." rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
            </div>
            <div className="border-t border-gray-100 pt-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-medium text-gray-900">{fmt(total)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Shipping</span>
                <span className="text-gray-500">TBD</span>
              </div>
            </div>
            <div className="border-t border-gray-200 pt-3">
              <div className="flex justify-between mb-1">
                <span className="font-semibold text-gray-900">Order Total</span>
                <span className="text-xl font-bold text-brand-600">{fmt(total)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                {paymentMethod === 'net30' ? (
                  <><Clock size={11} className="text-brand-500" /><span className="text-brand-600 font-medium">Net-{profile?.net_terms || 30} — invoice on shipment</span></>
                ) : (
                  <><CreditCard size={11} className="text-emerald-500" /><span className="text-emerald-600 font-medium">Upfront — payment required before shipment</span></>
                )}
              </div>
            </div>
            <button onClick={placeOrder} disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors text-sm">
              <CheckCircle size={16} />
              {loading ? 'Placing Order...' : 'Place Order'}
            </button>
            <button onClick={clearCart} className="w-full text-center text-xs text-gray-400 hover:text-red-500 transition-colors">
              Clear cart
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
