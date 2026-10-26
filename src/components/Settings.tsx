import { PinInput } from './PinInput';
import React, { useRef, useState } from 'react';
import { StoreSettings } from '../types';
import { AlertTriangle, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { resizeImageFile } from '../utils/image';

interface SettingsProps {
  settings: StoreSettings;
  onSave: (settings: StoreSettings) => void;
  onClearData: () => void;
}

export function Settings({ settings, onSave, onClearData }: SettingsProps) {
  const [storeName, setStoreName] = useState(settings.storeName);
  const [ownerName, setOwnerName] = useState(settings.ownerName);
  const [securityPin, setSecurityPin] = useState(settings.securityPin || '');

  // Store logo: picked here, shown in the header after you press Save Settings
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl || '');
  const [logoLoading, setLogoLoading] = useState(false);
  const [logoError, setLogoError] = useState('');
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleLogoPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets the same file be chosen again later
    if (!file) return;
    setLogoError('');
    setLogoLoading(true);
    try {
      // Small, square-ish picture that keeps its transparent background
      setLogoUrl(await resizeImageFile(file, 256, 'png'));
    } catch (err: any) {
      setLogoError(err?.message ?? 'Could not process that image.');
    } finally {
      setLogoLoading(false);
    }
  };

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ storeName, ownerName, securityPin, logoUrl });
  };

  const handleClearData = () => {
    if (!settings.securityPin) {
      setPinError('Please set and save a Security PIN above before clearing data.');
      return;
    }
    if (confirmPin === settings.securityPin) {
      onClearData();
      setShowClearConfirm(false);
      setConfirmPin('');
      setPinError('');
    } else {
      setPinError('Incorrect PIN.');
    }
  };

  return (
    <div className="bg-white rounded-lg border border-slate-300 shadow-sm overflow-hidden flex flex-col h-full max-w-2xl mx-auto w-full">
      <div className="p-4 md:p-6 bg-slate-50 border-b border-slate-200">
        <h2 className="text-lg md:text-xl font-black text-slate-800">Store Settings</h2>
        <p className="text-xs md:text-sm text-slate-600">Customize your store's information</p>
      </div>

      <div className="p-4 md:p-6 flex-1 overflow-auto space-y-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <h3 className="font-bold text-slate-700 text-base md:text-lg border-b border-slate-200 pb-2">General Info</h3>
          <div>
            <label htmlFor="storeName" className="block text-sm font-semibold text-slate-700 mb-1">
              Store Name
            </label>
            <input
              type="text"
              id="storeName"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
              placeholder="e.g. Nanay's Sari-Sari Store"
              required
            />
          </div>

          <div>
            <label htmlFor="ownerName" className="block text-sm font-semibold text-slate-700 mb-1">
              Owner Name
            </label>
            <input
              type="text"
              id="ownerName"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
              placeholder="e.g. Maria"
            />
          </div>

          <div>
            <label htmlFor="logoUpload" className="block text-sm font-semibold text-slate-700 mb-1">
              Store Logo <span className="text-slate-500 font-normal">(shown at the top-left)</span>
            </label>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl border border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                {logoLoading ? (
                  <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
                ) : logoUrl ? (
                  <img src={logoUrl} alt="Logo preview" className="w-full h-full object-contain" />
                ) : (
                  <ImagePlus className="w-6 h-6 text-slate-400" aria-hidden="true" />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={logoInputRef}
                  id="logoUpload"
                  type="file"
                  accept="image/*"
                  onChange={handleLogoPicked}
                  className="sr-only"
                />
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={logoLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-60 text-indigo-700 border border-indigo-200 rounded-lg text-sm font-bold transition-colors"
                >
                  <ImagePlus className="w-4 h-4" />
                  {logoUrl ? 'Change Logo' : 'Upload Logo'}
                </button>
                {logoUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setLogoUrl('');
                      setLogoError('');
                    }}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-sm font-bold transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Remove
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-600 mt-1.5">
              {logoError ? <span className="text-rose-600 font-semibold">{logoError}</span> : 'PNG or JPG. Press Save Settings to keep it.'}
            </p>
          </div>

          <div>
            <label htmlFor="securityPin" className="block text-sm font-semibold text-slate-700 mb-1">
              Security PIN <span className="text-slate-500 font-normal">(For Danger Zone)</span>
            </label>
            <PinInput
              id="securityPin"
              value={securityPin}
              onChange={(e) => setSecurityPin(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
              placeholder="Enter a PIN code..."
            />
          </div>

          <button
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded shadow-sm transition-colors"
          >
            Save Settings
          </button>
        </form>

        <div className="space-y-4 pt-4 border-t border-red-100 mt-8">
          <h3 className="font-bold text-red-700 text-base md:text-lg flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Danger Zone
          </h3>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h4 className="font-bold text-red-800 text-sm mb-1">Clear All Data</h4>
            <p className="text-xs text-red-600 mb-4">This will permanently delete all inventory, transactions, utang records, and customers. This action cannot be undone.</p>
            
            {!showClearConfirm ? (
              <button 
                type="button"
                onClick={() => setShowClearConfirm(true)}
                className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded shadow-sm transition-colors text-sm"
              >
                Clear All Data
              </button>
            ) : (
              <div className="space-y-2">
                <PinInput
                  placeholder="Enter PIN to confirm"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  wrapperClassName="w-full sm:w-56"
                  className="w-full bg-white border border-red-300 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-red-500 outline-none transition-colors"
                />
                {pinError && <p className="text-xs text-red-600 font-bold">{pinError}</p>}
                <div className="flex gap-2">
                  <button 
                    type="button"
                    onClick={handleClearData}
                    className="bg-red-600 hover:bg-red-700 text-white font-bold py-1.5 px-4 rounded shadow-sm transition-colors text-sm"
                  >
                    Confirm Clear
                  </button>
                  <button 
                    type="button"
                    onClick={() => {
                      setShowClearConfirm(false);
                      setConfirmPin('');
                      setPinError('');
                    }}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-1.5 px-4 rounded shadow-sm transition-colors text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
