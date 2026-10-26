import { useEffect, useState } from 'react';
import { LogOut, Moon, Sun } from 'lucide-react';
import { StoreSettings } from '../types';

interface AppHeaderProps {
  settings: StoreSettings;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onLogout: () => void;
}

/** Top bar: store logo (top-left), store name, theme button and logout. */
export function AppHeader({ settings, theme, onToggleTheme, onLogout }: AppHeaderProps) {
  const [logoBroken, setLogoBroken] = useState(false);
  // Try again whenever a new logo is chosen
  useEffect(() => setLogoBroken(false), [settings.logoUrl]);

  const showLogo = Boolean(settings.logoUrl) && !logoBroken;

  return (
    <header className="flex items-center justify-between px-4 md:px-6 py-3 bg-white border-b-4 border-amber-400 shrink-0">
      <div className="flex items-center space-x-3 min-w-0">
        {showLogo ? (
          <img
            src={settings.logoUrl}
            alt={`${settings.storeName} logo`}
            width={40}
            height={40}
            onError={() => setLogoBroken(true)}
            className="w-10 h-10 md:w-11 md:h-11 rounded-lg object-contain bg-white border border-slate-200 shadow-sm shrink-0"
          />
        ) : (
          // No logo uploaded yet: show the first letter of the store name
          <div className="w-10 h-10 md:w-11 md:h-11 bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm shrink-0" aria-hidden="true">
            <span className="text-white font-bold text-xl">{settings.storeName.charAt(0) || 'S'}</span>
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-base md:text-xl font-bold tracking-tight text-slate-800 truncate">{settings.storeName}</h1>
          <p className="text-[11px] md:text-xs text-slate-600 uppercase font-semibold tracking-wider truncate">
            {settings.ownerName ? `Owned by ${settings.ownerName}` : 'Inventory & Pricing Ledger'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3 shrink-0">
        <button
          onClick={onToggleTheme}
          className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl border border-slate-200 transition-colors shadow-xs"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <button
          onClick={onLogout}
          className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs md:text-sm border border-slate-200 transition-colors flex items-center gap-1.5 shadow-xs"
          title="Logout / Switch Role"
        >
          <LogOut className="w-4 h-4 text-slate-500" />
          <span className="hidden sm:inline">Logout</span>
        </button>
        <div className="text-right hidden lg:block">
          <p className="text-[11px] md:text-xs text-slate-600 uppercase font-bold">Current Date</p>
          <p className="text-xs md:text-sm font-semibold text-slate-700">
            {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>
    </header>
  );
}
