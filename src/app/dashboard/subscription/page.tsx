'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Award, RefreshCw, Zap, CheckCircle2,
  Copy, Check, AlertCircle, Loader, X, QrCode as QrIcon
} from 'lucide-react';
import QRCode from 'qrcode';
import { 
  getUserSubscriptionState, getBillingPlans, getWalletSettings,
  createPaymentRequest, submitPaymentTxnHash,
  createRazorpayOrder, verifyRazorpayPayment, getRazorpayExchangeRate
} from '@/app/actions/billing';

export default function SubscriptionPage() {
  const [loading, setLoading] = useState(true);
  const [subState, setSubState] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [wallets, setWallets] = useState<any[]>([]);

  // Selection states for modal
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [selectedNetwork, setSelectedNetwork] = useState('');
  const [activePayment, setActivePayment] = useState<any>(null);
  const [txnHash, setTxnHash] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successActivated, setSuccessActivated] = useState(false);

  // Razorpay states
  const [razorpayLoading, setRazorpayLoading] = useState(false);
  const [showMethodChooser, setShowMethodChooser] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'crypto' | 'razorpay' | null>(null);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);

  useEffect(() => {
    if (activePayment?.wallet_address) {
      QRCode.toDataURL(activePayment.wallet_address, {
        width: 320,
        margin: 1,
        color: {
          dark: '#020617',
          light: '#ffffff',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch(() => setQrDataUrl(null));
    } else {
      setQrDataUrl(null);
    }
  }, [activePayment?.wallet_address]);

  const loadSubscription = useCallback(async () => {
    setLoading(true);
    try {
      const [subRes, plansRes, walletRes] = await Promise.all([
        getUserSubscriptionState(),
        getBillingPlans(),
        getWalletSettings()
      ]);

      if (subRes.success) {
        setSubState(subRes);
      }
      if (plansRes.success && plansRes.plans) {
        setPlans(plansRes.plans.filter(p => p.enabled));
      }
      if (walletRes.success && walletRes.wallets) {
        setWallets(walletRes.wallets);
        if (walletRes.wallets.length > 0) {
          setSelectedNetwork(walletRes.wallets[0].network);
        }
      }
    } catch (err) {
      console.error('Subscription mount error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSubscription();
  }, [loadSubscription]);

  const startCryptoPayment = async () => {
    setPaymentMethod('crypto');
    setShowMethodChooser(false);
    if (wallets.length > 0) {
      const defaultNet = wallets[0].network;
      setSelectedNetwork(defaultNet);
      await createRequestRecord(selectedPlan.id, defaultNet);
    }
  };

  const startRazorpayPayment = async () => {
    setPaymentMethod('razorpay');
    setShowMethodChooser(false);
    setRazorpayLoading(true);
    setErrorMsg('');
    try {
      const res = await createRazorpayOrder(selectedPlan.id);
      if (!res.success || !res.order) {
        setErrorMsg(res.error || 'Failed to create Razorpay order');
        setRazorpayLoading(false);
        return;
      }

      const { order, paymentRequestId } = res;

      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => {
        const options = {
          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          amount: order.amount,
          currency: order.currency,
          name: 'Quotex Intelligence Journal',
          description: selectedPlan.name,
          order_id: order.id,
          handler: async function (response: any) {
            setRazorpayLoading(true);
            try {
              const verifyRes = await verifyRazorpayPayment(
                response.razorpay_order_id,
                response.razorpay_payment_id,
                response.razorpay_signature,
                paymentRequestId,
              );
              if (verifyRes.success) {
                setSuccessActivated(true);
                setStatusMsg('Success! Your account has been upgraded to Premium.');
                setTimeout(() => {
                  setSuccessActivated(false);
                  setSelectedPlan(null);
                  setPaymentMethod(null);
                  loadSubscription();
                }, 3000);
              } else {
                setErrorMsg(verifyRes.error || 'Payment verification failed');
              }
            } catch {
              setErrorMsg('Payment verification error');
            } finally {
              setRazorpayLoading(false);
            }
          },
          modal: {
            ondismiss: () => {
              setRazorpayLoading(false);
            },
          },
          prefill: {
            contact: '',
            email: '',
          },
          theme: {
            color: '#7c3aed',
          },
        };
        const rzp = new (window as any).Razorpay(options);
        rzp.on('payment.failed', function (response: any) {
          setErrorMsg(response.error?.description || 'Payment failed');
          setRazorpayLoading(false);
        });
        rzp.open();
      };
      script.onerror = () => {
        setErrorMsg('Failed to load Razorpay checkout SDK');
        setRazorpayLoading(false);
      };
      document.body.appendChild(script);
    } catch {
      setErrorMsg('Failed to initiate Razorpay payment');
      setRazorpayLoading(false);
    }
  };

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyAmount = (amt: number | string) => {
    navigator.clipboard.writeText(String(amt));
    setCopiedAmount(true);
    setTimeout(() => setCopiedAmount(false), 2000);
  };

  const handleCheckoutInitiate = async (plan: any) => {
    setSelectedPlan(plan);
    setErrorMsg('');
    setStatusMsg('');
    setTxnHash('');
    setPaymentMethod(null);
    setShowMethodChooser(true);
    const rateRes = await getRazorpayExchangeRate();
    if (rateRes.success && rateRes.rate) setExchangeRate(rateRes.rate);
  };

  const createRequestRecord = async (planId: string, network: string) => {
    setErrorMsg('');
    try {
      const res = await createPaymentRequest(planId, network);
      if (res.success && res.payment) {
        setActivePayment(res.payment);
      } else {
        setErrorMsg(res.error || 'Failed to create payment invoice.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Invoice generation error');
    }
  };

  const handleNetworkChange = async (net: string) => {
    setSelectedNetwork(net);
    if (selectedPlan) {
      await createRequestRecord(selectedPlan.id, net);
    }
  };

  const handleVerifyTxn = async () => {
    if (!txnHash.trim() || txnHash.trim().length < 8) {
      setErrorMsg('Please input a valid transaction hash (at least 8 characters).');
      return;
    }
    setErrorMsg('');
    setVerifying(true);
    setStatusMsg('Verifying blockchain nodes block confirmations...');
    try {
      const res = await submitPaymentTxnHash(activePayment.id, txnHash);
      if (res.success) {
        setSuccessActivated(true);
        setStatusMsg('Success! Your account has been upgraded to Premium.');
        setTimeout(() => {
          setSuccessActivated(false);
          setSelectedPlan(null);
          setPaymentMethod(null);
          loadSubscription();
        }, 3000);
      } else {
        setErrorMsg(res.error || 'Verification failed. Double check your tx hash.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Verification execution error');
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Loader className="h-8 w-8 animate-spin text-neon-green" />
        <span className="text-xs font-mono text-slate-500">RESOLVING ACCOUNT SUBSCRIPTIONS...</span>
      </div>
    );
  }

  const currentRoleLabel = subState?.traderProfile?.premium_access
    ? 'Premium Pro'
    : subState?.traderProfile?.vip_access
    ? 'VIP Member'
    : 'Free Account';

  const progressPercent = subState?.subscription?.plan_id === 'premium_monthly'
    ? Math.round((subState.remainingDays / 30) * 100)
    : subState?.subscription?.plan_id === 'premium_6months'
    ? Math.round((subState.remainingDays / 180) * 100)
    : subState?.subscription?.plan_id === 'premium_yearly'
    ? Math.round((subState.remainingDays / 365) * 100)
    : 100;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 w-full max-w-7xl mx-auto text-left font-mono">
      
      {/* Title / Hero */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-glass-border pb-4 gap-4">
        <div>
          <span className="text-[10px] font-mono text-neon-green font-bold uppercase tracking-wider block">billing and invoices</span>
          <h1 className="text-2xl font-bold font-mono tracking-tight text-slate-100">Subscription Center</h1>
        </div>
        <button
          onClick={loadSubscription}
          className="flex items-center gap-1.5 px-3 py-2 rounded border border-glass-border hover:bg-slate-900/40 text-xs font-mono font-bold text-slate-400 hover:text-slate-200 transition-all uppercase"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh status
        </button>
      </div>

      {/* Active membership status grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Plan card summary */}
        <div className="glass-panel p-5 rounded-xl border border-glass-border flex flex-col justify-between space-y-4 md:col-span-2 transition-all duration-300 hover:scale-[1.01] hover:border-glass-border/50 animate-fadeInUp">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[8px] text-slate-500 uppercase tracking-widest">Active Plan</span>
              <div className="text-xl font-bold text-slate-200 uppercase flex items-center gap-2">
                <Award className="h-5 w-5 text-gold-vip" />
                {currentRoleLabel}
              </div>
            </div>
            <span className={`px-2.5 py-0.5 rounded text-[9px] font-bold border ${
              subState?.hasActiveSubscription
                ? 'border-neon-green/30 bg-neon-green/10 text-neon-green'
                : 'border-slate-800 bg-slate-900/30 text-slate-500'
            }`}>
              {subState?.hasActiveSubscription ? 'ACTIVE SUBSCRIPTION' : 'FREE MODE'}
            </span>
          </div>

          {/* Dates list */}
          {subState?.subscription && (
            <div className="grid grid-cols-2 gap-4 text-xs pt-2 border-t border-glass-border/30">
              <div>
                <span className="text-[8px] text-slate-500 uppercase">Activated At</span>
                <span className="block font-bold text-slate-300 mt-1">
                  {new Date(subState.subscription.activated_at).toLocaleDateString([], { dateStyle: 'medium' })}
                </span>
              </div>
              <div>
                <span className="text-[8px] text-slate-500 uppercase">Expiry Date</span>
                <span className="block font-bold text-gold-vip mt-1">
                  {subState.subscription.expires_at 
                    ? new Date(subState.subscription.expires_at).toLocaleDateString([], { dateStyle: 'medium' })
                    : 'LIFETIME ACCESS'}
                </span>
              </div>
            </div>
          )}

          {/* Cancel future support notice */}
          {subState?.hasActiveSubscription && (
            <div className="text-[8px] text-slate-600 italic">
              * Auto-renew billing is processed via block transfers. Cancel subscription halts future deposit audits.
            </div>
          )}
        </div>

        {/* Days remaining progress widget */}
        <div className="glass-panel p-5 rounded-xl border border-glass-border flex flex-col justify-between transition-all duration-300 hover:scale-[1.01] hover:border-glass-border/50 animate-fadeInUp" style={{ animationDelay: '0.1s' }}>
          <div>
            <span className="text-[8px] text-slate-500 uppercase tracking-widest">Days Remaining</span>
            <div className="text-4xl font-extrabold text-slate-200 mt-3 font-mono">
              {subState?.subscription?.plan_id === 'premium_lifetime' ? '∞' : subState?.remainingDays || 0}
            </div>
            <div className="text-[9px] text-slate-500 mt-1 uppercase">days of premium left</div>
          </div>

          {subState?.subscription && subState?.subscription?.plan_id !== 'premium_lifetime' && (
            <div className="space-y-1.5 pt-4">
              <div className="h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-950">
                <div 
                  className="h-full bg-neon-green rounded-full glow-shadow-green transition-all duration-1000"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-[8px] text-slate-500">
                <span>0 days</span>
                <span>{progressPercent}% left</span>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Plans Pricing Grid */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b border-glass-border/40 pb-2">
          <Zap className="h-4.5 w-4.5 text-neon-green" />
          <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">Choose Pricing Package Plan</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {plans.map((p) => {
            const isCurrentPlan = subState?.subscription?.plan_id === p.id;
            const hasDiscount = p.discount > 0;
            const discountedPrice = Math.max(0, p.price - (p.price * (p.discount / 100)));

            return (
              <div 
                key={p.id} 
                className={`glass-panel p-5 rounded-xl border flex flex-col justify-between transition-all duration-300 ${
                  isCurrentPlan 
                    ? 'border-neon-green/30 bg-neon-green/[0.01] scale-[1.02]' 
                    : 'border-glass-border hover:border-slate-700 hover:scale-[1.02] hover:shadow-lg'
                }`}
              >
                <div className="space-y-4">
                  {/* Name */}
                  <div className="space-y-1">
                    <span className="text-[9px] text-slate-500 uppercase block">{p.id.replace('_', ' ')}</span>
                    <h3 className="text-base font-bold text-slate-200 uppercase">{p.name}</h3>
                  </div>

                  {/* Price info */}
                  <div className="pt-2">
                    {hasDiscount ? (
                      <div className="space-y-1">
                        <span className="text-[9px] text-rose-400 font-bold border border-rose-500/30 px-1.5 py-0.5 rounded bg-rose-500/5">
                          {p.discount}% DISCOUNT ACTIVE
                        </span>
                        <div className="flex items-baseline gap-1.5 mt-2">
                          <span className="text-2xl font-extrabold text-slate-200 font-mono">${discountedPrice}</span>
                          <span className="text-xs text-slate-600 line-through">${p.price}</span>
                          <span className="text-[9px] text-slate-500 font-bold uppercase">/ {p.id === 'premium_yearly' ? 'yr' : p.id === 'premium_lifetime' ? 'one-time' : p.id === 'premium_6months' ? '6 mo' : 'mo'}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-1 mt-2">
                        <span className="text-2xl font-extrabold text-slate-200 font-mono">${p.price}</span>
                        <span className="text-[9px] text-slate-500 font-bold uppercase">/ {p.id === 'premium_yearly' ? 'yr' : p.id === 'premium_lifetime' ? 'one-time' : p.id === 'premium_6months' ? '6 mo' : 'mo'}</span>
                      </div>
                    )}
                  </div>

                  {/* Feature Lists */}
                  <ul className="text-[10px] text-slate-500 space-y-2 pt-4 border-t border-glass-border/30">
                    {p.id === 'free' ? (
                      <>
                        <li className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                          <span>Free Telegram Channel Access</span>
                        </li>
                        <li className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                          <span>Basic Learning Resources</span>
                        </li>
                        <li className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                          <span>Periodic Market Review</span>
                        </li>
                        <li className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                          <span>Limited Sample Signals</span>
                        </li>
                      </>
                    ) : (
                      <>
                        <li className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-neon-green shrink-0" />
                          <span>Professional Signals Feed</span>
                        </li>
                        <li className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-neon-green shrink-0" />
                          <span>Unlimited Journal Entries</span>
                        </li>
                        <li className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-neon-green shrink-0" />
                          <span>Advanced Stats Analytics</span>
                        </li>
                        <li className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-neon-green shrink-0" />
                          <span>Chronological timeline audits</span>
                        </li>
                      </>
                    )}
                  </ul>
                </div>

                <div className="pt-6">
                  {p.id === 'free' ? (
                    <div className="text-center py-2 text-[9px] font-bold text-slate-600 border border-slate-900 rounded bg-slate-950/20 uppercase">
                      Default Level
                    </div>
                  ) : isCurrentPlan ? (
                    <div className="text-center py-2 text-[9px] font-bold text-neon-green border border-neon-green/30 rounded bg-neon-green/5 uppercase tracking-wider">
                      Current Plan
                    </div>
                  ) : (
                    <button
                      onClick={() => handleCheckoutInitiate(p)}
                      className="w-full py-2 rounded bg-purple-600 hover:bg-purple-500 text-white font-mono font-bold text-[10px] uppercase tracking-wider transition-colors shadow-md shadow-purple-900/40"
                    >
                      Subscribe package
                    </button>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      </div>

      {/* Payment Method Chooser */}
      {selectedPlan && showMethodChooser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md glass-panel p-6 rounded-xl border border-glass-border space-y-5 text-left relative overflow-hidden">
            <button
              onClick={() => { setSelectedPlan(null); setShowMethodChooser(false); }}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-500 hover:text-slate-200 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2 border-b border-glass-border/40 pb-3">
              <Zap className="h-5 w-5 text-neon-green" />
              <span className="font-mono font-bold text-slate-200 text-sm uppercase">Choose Payment Method</span>
            </div>

            <div className="space-y-3">
              {(() => {
                const usdPrice = Math.max(0, selectedPlan.price - (selectedPlan.price * (selectedPlan.discount / 100)));
                const rate = exchangeRate || 84;
                const inrPrice = usdPrice * rate;
                return (
                  <div className="flex justify-between items-center bg-[#020617]/50 p-3 rounded border border-glass-border/40">
                    <div>
                      <span className="text-[8px] text-slate-500 uppercase block">PLAN</span>
                      <span className="font-bold text-slate-200 uppercase text-sm">{selectedPlan.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[8px] text-slate-500 uppercase block">PRICE</span>
                      <span className="font-bold text-neon-green">${usdPrice}</span>
                      <span className="text-[10px] text-slate-400 block">≈ ₹{inrPrice.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                );
              })()}

              <button
                onClick={startCryptoPayment}
                className="w-full py-3 px-4 rounded-lg border border-glass-border bg-slate-900/50 hover:bg-slate-900/80 text-left transition-all flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0">
                  <img src="https://cryptologos.cc/logos/tether-usdt-logo.svg" alt="USDT" className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <span className="block font-bold text-slate-200 text-sm">Pay with Crypto (USDT)</span>
                  <span className="text-[10px] text-slate-500">USDT on TRC-20 or BEP-20 network</span>
                </div>
              </button>

              <button
                onClick={startRazorpayPayment}
                disabled={razorpayLoading}
                className="w-full py-3 px-4 rounded-lg border border-glass-border bg-slate-900/50 hover:bg-slate-900/80 text-left transition-all flex items-center gap-3 disabled:opacity-50"
              >
                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                  <img src="https://razorpay.com/favicon.png" alt="Razorpay" className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <span className="block font-bold text-slate-200 text-sm">Pay with Razorpay (INR)</span>
                  <span className="text-[10px] text-slate-500">Credit/Debit card, UPI, Net Banking, Wallet</span>
                </div>
                {razorpayLoading && <Loader className="h-5 w-5 animate-spin text-blue-400 shrink-0" />}
              </button>
            </div>

            <div className="pt-2">
              <button
                onClick={() => { setSelectedPlan(null); setShowMethodChooser(false); }}
                disabled={razorpayLoading}
                className="w-full py-2.5 rounded bg-slate-900 border border-glass-border text-slate-400 hover:text-slate-200 text-xs font-bold uppercase transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Razorpay Loading / Error Overlay */}
      {(razorpayLoading || errorMsg) && paymentMethod === 'razorpay' && !successActivated && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm glass-panel p-6 rounded-xl border border-glass-border space-y-4">
            {razorpayLoading && !errorMsg && (
              <div className="flex flex-col items-center gap-3 py-4">
                <Loader className="h-8 w-8 animate-spin text-blue-400" />
                <span className="text-sm font-mono text-slate-400">Opening Razorpay checkout...</span>
              </div>
            )}
            {errorMsg && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-rose-400 text-xs bg-rose-500/5 p-3.5 rounded border border-rose-500/20">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
                <button
                  onClick={() => {
                    setErrorMsg('');
                    setRazorpayLoading(false);
                    setPaymentMethod(null);
                    setShowMethodChooser(true);
                  }}
                  className="w-full py-2.5 rounded bg-slate-900 border border-glass-border text-slate-400 hover:text-slate-200 text-xs font-bold uppercase transition-colors"
                >
                  Try Again
                </button>
                <button
                  onClick={() => {
                    setErrorMsg('');
                    setRazorpayLoading(false);
                    setSelectedPlan(null);
                    setPaymentMethod(null);
                  }}
                  className="w-full py-2 rounded text-slate-500 hover:text-slate-400 text-[10px] uppercase transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Crypto Checkout Modal */}
      {selectedPlan && activePayment && paymentMethod === 'crypto' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg glass-panel p-6 rounded-xl border border-glass-border space-y-4 text-left relative overflow-hidden max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => { setSelectedPlan(null); setPaymentMethod(null); }}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-500 hover:text-slate-200 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Modal Title */}
            <div className="flex items-center gap-2 border-b border-glass-border/40 pb-3">
              <Zap className="h-5 w-5 text-neon-green" />
              <span className="font-mono font-bold text-slate-200 text-sm uppercase">USDT Wallet Payment Gateway</span>
            </div>

            {/* Main Payment steps */}
            <div className="space-y-4 font-mono text-xs">
              
              {/* Plan info row */}
              <div className="flex justify-between items-center bg-[#020617]/50 p-3 rounded border border-glass-border/40">
                <div>
                  <span className="text-[8px] text-slate-500 uppercase block">PLAN SELECTION</span>
                  <span className="font-bold text-slate-200 uppercase">{selectedPlan.name}</span>
                </div>
                <div className="text-right">
                  <span className="text-[8px] text-slate-500 uppercase block">TOTAL AMOUNT</span>
                  <span className="font-bold text-neon-green text-sm">${activePayment.amount} USDT</span>
                </div>
              </div>

              {/* Wallet Network Selectors */}
              <div className="space-y-1.5">
                <label className="text-[9px] text-slate-500 uppercase block font-bold">1. Select Network</label>
                <div className="grid grid-cols-2 gap-2">
                  {wallets.map(w => (
                    <button
                      key={w.network}
                      onClick={() => handleNetworkChange(w.network)}
                      className={`py-2 rounded border font-bold text-[10px] text-center transition-all ${
                        selectedNetwork === w.network
                          ? 'border-neon-green/30 bg-neon-green/10 text-neon-green'
                          : 'border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-400'
                      }`}
                    >
                      {w.display_name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic QR Code Section */}
              <div className="space-y-2 bg-[#020617]/70 border border-glass-border p-3.5 rounded-lg text-center">
                <div className="flex items-center justify-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase">
                  <QrIcon className="h-3.5 w-3.5 text-neon-green" />
                  <span>Scan QR with Wallet / Exchange App</span>
                </div>

                <div className="flex justify-center py-1">
                  {(activePayment.qr_code_url || qrDataUrl) ? (
                    <div className="bg-white p-2.5 rounded-lg shadow-lg inline-block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={activePayment.qr_code_url || qrDataUrl}
                        alt="USDT Deposit QR"
                        className="w-36 h-36 rounded block object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-36 h-36 bg-slate-900/60 rounded flex items-center justify-center border border-dashed border-slate-800 text-slate-600 text-[10px]">
                      Loading QR...
                    </div>
                  )}
                </div>

                <div className="text-[9px] text-slate-400 font-mono">
                  Network: <span className="text-neon-green font-bold uppercase">{selectedNetwork.replace('_', ' ')}</span>
                </div>
              </div>

              {/* Transfer Details & Copy Controls */}
              <div className="space-y-2">
                <label className="text-[9px] text-slate-500 uppercase block font-bold">2. Transfer Details</label>

                {/* Amount Row */}
                <div className="bg-[#020617] border border-glass-border p-2.5 rounded-lg flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[8px] text-slate-500 uppercase block">Payable Amount</span>
                    <span className="font-bold text-neon-green text-xs">${activePayment.amount} USDT</span>
                  </div>
                  <button
                    onClick={() => copyAmount(activePayment.amount)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-slate-900 border border-glass-border text-slate-300 hover:text-slate-100 hover:border-neon-green/30 transition-colors text-[10px]"
                    title="Copy amount"
                  >
                    {copiedAmount ? <Check className="h-3.5 w-3.5 text-neon-green" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedAmount ? 'Copied' : 'Copy Amount'}</span>
                  </button>
                </div>

                {/* Wallet Address Row */}
                <div className="bg-[#020617] border border-glass-border p-2.5 rounded-lg flex items-center justify-between gap-3">
                  <div className="overflow-x-auto select-all scrollbar-none font-mono text-slate-300 text-[10px] min-w-0 flex-1">
                    <span className="text-[8px] text-slate-500 uppercase block">Deposit Address</span>
                    <span className="truncate block">{activePayment.wallet_address}</span>
                  </div>
                  <button
                    onClick={() => copyAddress(activePayment.wallet_address)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-slate-900 border border-glass-border text-slate-300 hover:text-slate-100 hover:border-neon-green/30 transition-colors text-[10px] shrink-0"
                    title="Copy wallet address"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-neon-green" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy Address'}</span>
                  </button>
                </div>

                {/* Warning Banner */}
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 space-y-1">
                  <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[10px] uppercase">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>Exact Amount Warning</span>
                  </div>
                  <p className="text-[9px] text-amber-200/80 leading-relaxed font-sans">
                    You must send exactly <strong className="text-amber-300 font-mono">${activePayment.amount} USDT</strong>. If withdrawing from an exchange (Binance, Bybit, OKX, etc.), please ensure withdrawal fees are covered so the receiver gets the exact total. Underpaid transactions cannot be verified automatically.
                  </p>
                </div>
              </div>

              {/* Tx Hash Input */}
              <div className="space-y-1.5 border-t border-glass-border/30 pt-3">
                <label className="text-[9px] text-slate-500 uppercase block font-bold">3. Enter Transaction Hash / Tx ID</label>
                <input
                  type="text"
                  placeholder="e.g. f83d7a8b9c20..."
                  value={txnHash}
                  onChange={(e) => setTxnHash(e.target.value)}
                  disabled={verifying}
                  className="w-full bg-[#02050b] border border-glass-border px-3 py-2 rounded text-slate-200 focus:outline-none focus:border-neon-green/30 text-xs font-mono"
                />
              </div>

              {/* Status & Loader alerts */}
              {verifying && (
                <div className="flex items-center gap-2 text-gold-vip text-[10px] bg-gold-vip/5 p-3.5 rounded border border-gold-vip/20">
                  <Loader className="h-4 w-4 animate-spin shrink-0" />
                  <span>{statusMsg}</span>
                </div>
              )}

              {successActivated && (
                <div className="flex items-center gap-2 text-neon-green text-[10px] bg-neon-green/5 p-3.5 rounded border border-neon-green/20">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{statusMsg}</span>
                </div>
              )}

              {errorMsg && (
                <div className="flex items-center gap-2 text-rose-400 text-[10px] bg-rose-500/5 p-3.5 rounded border border-rose-500/20">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

            </div>

            {/* Modal Actions */}
            <div className="pt-2 grid grid-cols-2 gap-3 font-mono">
              <button
                onClick={() => { setSelectedPlan(null); setPaymentMethod(null); }}
                disabled={verifying}
                className="py-2.5 rounded bg-slate-900 border border-glass-border text-slate-400 hover:text-slate-200 text-xs font-bold uppercase transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleVerifyTxn}
                disabled={verifying || successActivated}
                className="py-2.5 rounded bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold uppercase transition-colors shadow-md"
              >
                Verify Payment
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
