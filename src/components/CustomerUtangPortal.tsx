import { PinInput } from './PinInput';
import React, { useState } from 'react';
import { User, ArrowLeft, CheckCircle, ShieldAlert, Store, KeyRound, UserPlus, LogIn } from 'lucide-react';
import { UtangRecord } from '../types';
import { utangRemaining } from '../utils/stock';
import { useToast } from './Toast';
import { PortalUtangSections } from './PortalUtangSections';

interface CustomerUtangPortalProps {
  utangs: UtangRecord[];
  customers: string[];
  storeName: string;
  onSwitchToAdmin: () => void;
  onAddCustomer: (name: string) => void;
}

export const CustomerUtangPortal: React.FC<CustomerUtangPortalProps> = ({
  utangs,
  customers,
  storeName,
  onSwitchToAdmin,
  onAddCustomer,
}) => {
  const toast = useToast();

  // Get stored customer PIN map from localStorage
  const [customerPins, setCustomerPins] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('sariSariCustomerPins');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [selectedCustomer, setSelectedCustomer] = useState<string>(() => {
    const saved = localStorage.getItem('sariSariPortalCustomer');
    return saved || '';
  });

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  
  // Login form state
  const [loginName, setLoginName] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [loginError, setLoginError] = useState('');

  // Register form state
  const [regName, setRegName] = useState('');
  const [regPin, setRegPin] = useState('');
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const trimmedName = loginName.trim();
    if (!trimmedName || !loginPin) {
      setLoginError('Please enter both your name and PIN.');
      return;
    }

    const matchedKey = Object.keys(customerPins).find(
      k => k.toLowerCase() === trimmedName.toLowerCase()
    );

    if (!matchedKey) {
      setLoginError('Customer name not registered. Please register first.');
      return;
    }

    if (customerPins[matchedKey] !== loginPin) {
      setLoginError('Incorrect PIN. Please try again.');
      return;
    }

    // Success login
    const actualName = matchedKey;
    setSelectedCustomer(actualName);
    localStorage.setItem('sariSariPortalCustomer', actualName);
    setLoginPin('');
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    setRegSuccess('');

    const trimmedName = regName.trim().replace(/\s+/g, ' ').toUpperCase();
    if (!trimmedName || !regPin) {
      setRegError('Please enter your name and create a 4-digit PIN.');
      return;
    }

    if (regPin.length < 3) {
      setRegError('PIN should be at least 3 characters or numbers.');
      return;
    }


    const updatedPins = { ...customerPins, [trimmedName]: regPin };
    setCustomerPins(updatedPins);
    localStorage.setItem('sariSariCustomerPins', JSON.stringify(updatedPins));

    // Also add to admin's customer list if not already present
    if (!customers.some(c => c.toLowerCase() === trimmedName.toLowerCase())) {
      onAddCustomer(trimmedName);
    }

    // Go straight to the new customer's ledger. No need to log in again right after registering.
    setRegPin('');
    setRegName('');
    setLoginName('');
    setLoginPin('');
    setSelectedCustomer(trimmedName);
    localStorage.setItem('sariSariPortalCustomer', trimmedName);
    toast.success(`Welcome, ${trimmedName}! This is your utang ledger.`);
  };

  const handleLogoutCustomer = () => {
    setSelectedCustomer('');
    localStorage.removeItem('sariSariPortalCustomer');
    setLoginName('');
    setLoginPin('');
    setLoginError('');
  };

  // Filtered customer utangs for logged in customer
  const customerUtangs = selectedCustomer 
    ? utangs.filter(u => u.customerName.toLowerCase() === selectedCustomer.toLowerCase())
    : [];

  const totalUnpaid = customerUtangs.reduce((sum, u) => sum + utangRemaining(u), 0);

  const totalPaid = customerUtangs.reduce(
    (sum, u) => sum + (u.status === 'PAID' ? u.amount : u.paidAmount ?? 0),
    0
  );

  // Suggested names for login autocomplete
  const allCustomerNames = Array.from(
    new Set([
      ...customers,
      ...Object.keys(customerPins),
      ...utangs.map(u => u.customerName.trim())
    ])
  ).filter(Boolean).sort();

  return (
    <div className="flex flex-col min-h-screen bg-slate-900 text-slate-100 font-sans">
      {/* Portal Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-4 md:px-8 py-4 flex items-center justify-between shadow-md shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shadow-lg text-slate-900 font-black text-xl">
            {storeName.charAt(0) || 'S'}
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-black text-white tracking-tight">{storeName}</h1>
            <p className="text-xs text-amber-400 font-bold uppercase tracking-wider">Customer Utang Portal</p>
          </div>
        </div>

        <button
          onClick={onSwitchToAdmin}
          className="px-3.5 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl font-bold text-xs md:text-sm transition-colors flex items-center gap-2 border border-slate-600"
        >
          <Store className="w-4 h-4 text-amber-400" />
          <span>Store Owner / Admin Login</span>
        </button>
      </header>

      {/* Main Container */}
      <main className="flex-grow max-w-2xl w-full mx-auto p-4 md:p-8 flex flex-col justify-center">
        {!selectedCustomer ? (
          <div className="bg-slate-800/90 backdrop-blur-md rounded-2xl border border-slate-700 shadow-2xl p-6 md:p-10 my-auto">
            {/* Tabs for Login vs Register */}
            <div className="flex bg-slate-900/80 p-1 rounded-xl mb-6 border border-slate-700">
              <button
                onClick={() => { setAuthMode('login'); setLoginError(''); }}
                className={`flex-1 py-2.5 rounded-lg font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 ${
                  authMode === 'login'
                    ? 'bg-amber-500 text-slate-900 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <LogIn className="w-4 h-4" />
                <span>Customer Login</span>
              </button>
              <button
                onClick={() => { setAuthMode('register'); setRegError(''); setRegSuccess(''); }}
                className={`flex-1 py-2.5 rounded-lg font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 ${
                  authMode === 'register'
                    ? 'bg-amber-500 text-slate-900 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <UserPlus className="w-4 h-4" />
                <span>Register & PIN</span>
              </button>
            </div>

            {authMode === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="text-center mb-6">
                  <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <User className="w-7 h-7" />
                  </div>
                  <h2 className="text-xl font-black text-white">Welcome Back!</h2>
                  <p className="text-xs text-slate-400 mt-1">Enter your registered name and PIN to view your utang records.</p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Customer Name</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <User className="w-4 h-4 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      placeholder="e.g. Juan dela Cruz"
                      value={loginName}
                      onChange={(e) => setLoginName(e.target.value)}
                      list="customerSuggestions"
                      className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm font-medium text-white focus:ring-2 focus:ring-amber-500 outline-none"
                      required
                    />
                    <datalist id="customerSuggestions">
                      {allCustomerNames.map(name => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Security PIN</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <KeyRound className="w-4 h-4 text-slate-400" />
                    </div>
                    <PinInput
                      placeholder="Enter your secret PIN"
                      value={loginPin}
                      onChange={(e) => setLoginPin(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm font-medium text-white focus:ring-2 focus:ring-amber-500 outline-none"
                      required
                    />
                  </div>
                </div>

                {loginError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-bold">
                    {loginError}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black rounded-xl transition-colors shadow-lg shadow-amber-500/20 text-sm md:text-base mt-2"
                >
                  View My Utang Balance
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="text-center mb-6">
                  <div className="w-14 h-14 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <UserPlus className="w-7 h-7" />
                  </div>
                  <h2 className="text-xl font-black text-white">Create Portal Account</h2>
                  <p className="text-xs text-slate-400 mt-1">Register your name and set a PIN so only you can view your utang.</p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Your Full Name</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <User className="w-4 h-4 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      placeholder="e.g. Maria Santos"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm font-medium text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Create Secret PIN</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <KeyRound className="w-4 h-4 text-slate-400" />
                    </div>
                    <PinInput
                      placeholder="Enter 4-digit or custom PIN"
                      value={regPin}
                      onChange={(e) => setRegPin(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm font-medium text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                      required
                    />
                  </div>
                </div>

                {regError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-bold">
                    {regError}
                  </div>
                )}

                {regSuccess && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs font-bold">
                    {regSuccess}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl transition-colors shadow-lg shadow-indigo-600/20 text-sm md:text-base mt-2"
                >
                  Register Account & PIN
                </button>
              </form>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-6 animate-fade-in py-4">
            {/* Top Bar for Logged in Customer */}
            <div className="flex items-center justify-between bg-slate-800 p-4 md:p-6 rounded-2xl border border-slate-700 shadow-md">
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleLogoutCustomer}
                  className="p-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl transition-colors"
                  title="Logout"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                  <span className="text-xs font-bold text-amber-400 uppercase">Logged in as</span>
                  <h2 className="text-lg md:text-2xl font-black text-white">{selectedCustomer}</h2>
                </div>
              </div>
              <button
                onClick={handleLogoutCustomer}
                className="text-xs md:text-sm font-bold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 px-3.5 py-2 rounded-xl border border-red-500/20 transition-colors"
              >
                Logout
              </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-red-600 to-rose-700 text-white p-6 rounded-2xl shadow-lg flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs md:text-sm font-extrabold uppercase tracking-wider text-red-200">Total Unpaid Balance</span>
                    <ShieldAlert className="w-6 h-6 text-red-200" />
                  </div>
                  <p className="text-3xl md:text-4xl font-mono font-black mt-2">₱{totalUnpaid.toFixed(2)}</p>
                </div>
                <p className="text-xs text-red-200 mt-4 font-medium">Please settle your balance with the store owner.</p>
              </div>

              <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-md flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs md:text-sm font-bold uppercase tracking-wider text-slate-400">Total Paid (History)</span>
                    <CheckCircle className="w-6 h-6 text-emerald-400" />
                  </div>
                  <p className="text-3xl md:text-4xl font-mono font-black text-white mt-2">₱{totalPaid.toFixed(2)}</p>
                </div>
                <p className="text-xs text-slate-400 mt-4 font-medium">Thank you for your prompt payments!</p>
              </div>
            </div>

            {/* Utang Records Table */}
            <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-md overflow-hidden flex flex-col">
              <div className="p-4 md:p-5 border-b border-slate-700 bg-slate-800/80 flex items-center justify-between">
                <h3 className="font-bold text-white text-sm md:text-base">Your Secure Utang History</h3>
                <span className="text-xs font-semibold text-slate-400">{customerUtangs.length} total transaction{customerUtangs.length === 1 ? '' : 's'}</span>
              </div>

              <PortalUtangSections records={customerUtangs} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
