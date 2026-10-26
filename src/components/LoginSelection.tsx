import { PinInput } from './PinInput';
import React, { useState } from 'react';
import { User, ShieldCheck, ArrowRight, KeyRound } from 'lucide-react';
import { StoreSettings } from '../types';

interface LoginSelectionProps {
  settings: StoreSettings;
  onLoginAsAdmin: () => void;
  onOpenCustomerPortal: () => void;
}

export const LoginSelection: React.FC<LoginSelectionProps> = ({
  settings,
  onLoginAsAdmin,
  onOpenCustomerPortal,
}) => {
  const [showAdminPinModal, setShowAdminPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // If security PIN is set, verify it. Otherwise let them in directly.
    if (!settings.securityPin || settings.securityPin.trim() === '' || pinInput === settings.securityPin) {
      onLoginAsAdmin();
    } else {
      setPinError('Incorrect Admin PIN.');
    }
  };

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 md:p-8 relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="max-w-2xl w-full mx-auto relative z-10 space-y-8">
        {/* Store Header Branding */}
        <div className="text-center space-y-3">
          <div className="inline-flex w-20 h-20 bg-indigo-600 rounded-3xl items-center justify-center text-white font-black text-3xl shadow-xl shadow-indigo-600/30 border border-indigo-500/30">
            {settings.storeName.charAt(0) || 'S'}
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            {settings.storeName || "Sari-Sari Store"}
          </h1>
          <p className="text-sm sm:text-base text-slate-400 font-medium">
            Managed by <span className="text-slate-200 font-bold">{settings.ownerName || "Store Owner"}</span> • Inventory & Utang Management System
          </p>
        </div>

        {/* Role Selection Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 pt-4">
          {/* Admin Card */}
          <div className="bg-slate-800/80 backdrop-blur-md border border-slate-700/80 hover:border-indigo-500/50 rounded-2xl p-6 sm:p-8 flex flex-col justify-between shadow-xl transition-all group">
            <div>
              <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Store Owner / Admin</h2>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Access POS cash register, full inventory management, sales reports, and customer utang ledger.
              </p>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-700/60">
              {!showAdminPinModal ? (
                <button
                  onClick={() => {
                    if (settings.securityPin && settings.securityPin.trim() !== '') {
                      setShowAdminPinModal(true);
                    } else {
                      onLoginAsAdmin();
                    }
                  }}
                  className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 text-sm sm:text-base"
                >
                  <span>Admin Login</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <form onSubmit={handleAdminSubmit} className="space-y-3">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <KeyRound className="w-4 h-4 text-slate-400" />
                    </div>
                    <PinInput
                      placeholder="Enter Admin PIN"
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-900 border border-slate-600 rounded-xl text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                      autoFocus
                    />
                  </div>
                  {pinError && <p className="text-xs text-red-400 font-bold">{pinError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs sm:text-sm transition-colors"
                    >
                      Verify PIN
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAdminPinModal(false);
                        setPinInput('');
                        setPinError('');
                      }}
                      className="py-2.5 px-3 bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold rounded-xl text-xs sm:text-sm transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* Customer Card */}
          <div className="bg-slate-800/80 backdrop-blur-md border border-slate-700/80 hover:border-amber-500/50 rounded-2xl p-6 sm:p-8 flex flex-col justify-between shadow-xl transition-all group">
            <div>
              <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <User className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Customer Portal</h2>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Check your active utang balance, view previous purchases, and track payment history securely.
              </p>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-700/60">
              <button
                onClick={onOpenCustomerPortal}
                className="w-full py-3 px-4 bg-amber-700 hover:bg-amber-600 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-amber-600/20 text-sm sm:text-base"
              >
                <span>Customer Login / Portal</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center text-xs text-slate-500 pt-4">
          Sari-Sari Store Management System &bull; Secure Local Database
        </div>
      </div>
    </main>
  );
};
