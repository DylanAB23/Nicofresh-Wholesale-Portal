import { useState, useEffect, useRef } from 'react';
import { X, CreditCard, Lock, AlertCircle, CheckCircle, Loader, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Opayo sandbox direct endpoint — only used for card-identifier (card data never leaves browser)
const OPAYO_SANDBOX = 'https://sandbox.opayo.eu.elavon.com/api/v1';

const TEST_CARDS = [
  { label: 'Visa (approved)', number: '4929 0000 0000 6', expiry: '12/26', cvv: '123' },
  { label: 'Mastercard (approved)', number: '5404 0000 0000 0001', expiry: '12/26', cvv: '123' },
  { label: 'Visa (declined)', number: '4929 0000 0000 7', expiry: '12/26', cvv: '123' },
];

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  amountPence: number;
  description: string;
  orderId?: string;
  invoiceId?: string;
  invoiceNumber?: string;
}

function fmt(pence: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}

export default function PaymentModal({
  open, onClose, onSuccess,
  amountPence, description, orderId, invoiceId,
}: PaymentModalProps) {
  useAuth();
  const [step, setStep] = useState<'form' | 'processing' | 'success' | 'error'>('form');
  const [error, setError] = useState('');
  const [showTestCards, setShowTestCards] = useState(false);

  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [billingLine1, setBillingLine1] = useState('');
  const [billingCity, setBillingCity] = useState('');
  const [billingPostcode, setBillingPostcode] = useState('');

  const mskRef = useRef('');

  async function getAccessToken(): Promise<string> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Not authenticated');
    return token;
  }

  async function fetchMsk() {
    const token = await getAccessToken();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/opayo-session`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Apikey': SUPABASE_ANON_KEY,
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.description ?? err.error ?? 'Failed to initialise payment session');
    }
    const data = await res.json();
    if (!data.merchantSessionKey) throw new Error('No session key returned from payment gateway');
    return data as { merchantSessionKey: string; expiry: string };
  }

  // Pre-fetch MSK when modal opens
  useEffect(() => {
    if (!open) return;
    setStep('form');
    setError('');
    mskRef.current = '';
    fetchMsk()
      .then(d => { mskRef.current = d.merchantSessionKey; })
      .catch(err => setError(err.message));
  }, [open]);

  useEffect(() => {
    if (!open) {
      setCardName(''); setCardNumber(''); setExpiry(''); setCvv('');
      setBillingLine1(''); setBillingCity(''); setBillingPostcode('');
      setStep('form'); setError(''); setShowTestCards(false);
    }
  }, [open]);

  async function getCardIdentifier(msk: string): Promise<string> {
    const expiryDigits = expiry.replace(/\D/g, '');
    const res = await fetch(`${OPAYO_SANDBOX}/card-identifiers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${msk}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cardDetails: {
          cardholderName: cardName,
          cardNumber: cardNumber.replace(/\s/g, ''),
          expiryDate: `${expiryDigits.slice(0, 2)}${expiryDigits.slice(2, 4)}`,
          securityCode: cvv,
        },
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.description ?? err[0]?.description ?? 'Card details rejected — please check and try again');
    }
    const data = await res.json();
    return data.cardIdentifier;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setStep('processing');

    try {
      // Ensure we have a fresh MSK
      let msk = mskRef.current;
      if (!msk) {
        const d = await fetchMsk();
        msk = d.merchantSessionKey;
        mskRef.current = msk;
      }

      // Tokenise card on the browser — card data never hits our server
      const cardIdentifier = await getCardIdentifier(msk);

      const nameParts = cardName.trim().split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || 'Account';

      // Submit transaction via edge function — DB updates happen server-side
      const freshToken = await getAccessToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/opayo-pay`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freshToken}`,
          'Content-Type': 'application/json',
          'Apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          merchantSessionKey: msk,
          cardIdentifier,
          orderId: orderId ?? null,
          invoiceId: invoiceId ?? null,
          amount: amountPence,
          description,
          customerFirstName: firstName,
          customerLastName: lastName,
          billingAddress: {
            address1: billingLine1,
            city: billingCity,
            postalCode: billingPostcode,
            country: 'GB',
          },
        }),
      });

      const result = await res.json();

      if (result.success) {
        setStep('success');
        setTimeout(() => { onSuccess(); onClose(); }, 2500);
      } else {
        const msg = result.error?.statusDetail
          ?? result.error?.description
          ?? (typeof result.error === 'string' ? result.error : null)
          ?? 'Payment was declined. Please check your card details and try again.';
        setError(msg);
        setStep('error');
        // Refresh MSK ready for retry
        fetchMsk().then(d => { mskRef.current = d.merchantSessionKey; }).catch(() => {});
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Payment could not be processed. Please try again.';
      setError(msg);
      setStep('error');
      fetchMsk().then(d => { mskRef.current = d.merchantSessionKey; }).catch(() => {});
    }
  }

  function fillTestCard(card: typeof TEST_CARDS[0]) {
    setCardName('Test User');
    setCardNumber(card.number);
    setExpiry(card.expiry);
    setCvv(card.cvv);
    setBillingLine1('88 Test Street');
    setBillingCity('London');
    setBillingPostcode('EC1A 1BB');
    setShowTestCards(false);
  }

  function formatCardNumber(v: string) {
    return v.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim().slice(0, 19);
  }
  function formatExpiry(v: string) {
    const d = v.replace(/\D/g, '');
    if (d.length >= 3) return `${d.slice(0, 2)}/${d.slice(2, 4)}`;
    return d;
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
              <Lock size={14} className="text-white" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">Secure Card Payment</p>
              <p className="text-xs text-gray-400">Powered by Opayo</p>
            </div>
          </div>
          {step !== 'processing' && (
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <X size={18} />
            </button>
          )}
        </div>

        {/* Amount banner */}
        <div className="px-6 py-3 bg-brand-50 border-b border-brand-100 flex items-center justify-between">
          <span className="text-sm text-brand-700 font-medium">{description}</span>
          <span className="text-xl font-bold text-brand-700">{fmt(amountPence)}</span>
        </div>

        {/* Sandbox test card helper */}
        {step === 'form' && (
          <div className="mx-6 mt-4 rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowTestCards(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
            >
              <span>Sandbox — use a test card</span>
              <ChevronDown size={13} className={`transition-transform ${showTestCards ? 'rotate-180' : ''}`} />
            </button>
            {showTestCards && (
              <div className="border-t border-amber-200 px-3 pb-3 pt-2 space-y-1.5">
                {TEST_CARDS.map(card => (
                  <button
                    key={card.number}
                    type="button"
                    onClick={() => fillTestCard(card)}
                    className="w-full text-left px-3 py-2 rounded-lg bg-white hover:bg-amber-50 border border-amber-100 transition-colors"
                  >
                    <p className="text-xs font-semibold text-gray-800">{card.label}</p>
                    <p className="text-xs font-mono text-gray-500">{card.number} · {card.expiry} · {card.cvv}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Body */}
        <div className="px-6 py-5">
          {step === 'success' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} className="text-emerald-500" />
              </div>
              <p className="text-lg font-bold text-gray-900">Payment Successful</p>
              <p className="text-sm text-gray-500 mt-1">Your payment of {fmt(amountPence)} has been processed.</p>
            </div>
          )}

          {step === 'processing' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-brand-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Loader size={28} className="text-brand-600 animate-spin" />
              </div>
              <p className="font-semibold text-gray-900">Processing Payment</p>
              <p className="text-sm text-gray-500 mt-1">Please do not close this window...</p>
            </div>
          )}

          {step === 'error' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-red-500" />
                <p>{error}</p>
              </div>
              <button
                onClick={() => { setStep('form'); setError(''); }}
                className="w-full py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {step === 'form' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-red-500" />
                  <p>{error}</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Cardholder Name</label>
                <input type="text" value={cardName} onChange={e => setCardName(e.target.value)}
                  placeholder="As it appears on card" required autoComplete="cc-name"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-shadow" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Card Number</label>
                <div className="relative">
                  <input type="text" inputMode="numeric" value={cardNumber}
                    onChange={e => setCardNumber(formatCardNumber(e.target.value))}
                    placeholder="1234 5678 9012 3456" required autoComplete="cc-number"
                    className="w-full pl-3 pr-10 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent font-mono tracking-wider transition-shadow" />
                  <CreditCard size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Expiry Date</label>
                  <input type="text" inputMode="numeric" value={expiry}
                    onChange={e => setExpiry(formatExpiry(e.target.value))}
                    placeholder="MM/YY" required autoComplete="cc-exp" maxLength={5}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent font-mono transition-shadow" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Security Code</label>
                  <input type="text" inputMode="numeric" value={cvv}
                    onChange={e => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="CVV" required autoComplete="cc-csc" maxLength={4}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent font-mono transition-shadow" />
                </div>
              </div>

              <div className="space-y-3 pt-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Billing Address</p>
                <input type="text" value={billingLine1} onChange={e => setBillingLine1(e.target.value)}
                  placeholder="Address line 1" required autoComplete="billing street-address"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-shadow" />
                <div className="grid grid-cols-2 gap-3">
                  <input type="text" value={billingCity} onChange={e => setBillingCity(e.target.value)}
                    placeholder="City / Town" required autoComplete="billing address-level2"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-shadow" />
                  <input type="text" value={billingPostcode}
                    onChange={e => setBillingPostcode(e.target.value.toUpperCase())}
                    placeholder="Postcode" required autoComplete="billing postal-code"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-shadow" />
                </div>
              </div>

              <button type="submit"
                className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-semibold py-3 rounded-xl transition-colors text-sm mt-1 shadow-sm">
                <Lock size={14} />
                Pay {fmt(amountPence)} Securely
              </button>

              <p className="text-center text-xs text-gray-400 flex items-center justify-center gap-1.5">
                <Lock size={10} />
                256-bit SSL encrypted &bull; PCI DSS compliant via Opayo
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
