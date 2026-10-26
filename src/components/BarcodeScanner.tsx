import React, { useEffect, useRef, useState } from 'react';
import { X, CameraOff, Keyboard } from 'lucide-react';

export type ScanStatus =
  | { kind: 'ok' | 'error' | 'info'; text: string }
  | null;

interface BarcodeScannerProps {
  title: string;
  /** Called once per scanned code (the same code is ignored until it leaves the camera view for ~1.5s). */
  onDetect: (code: string) => void;
  onClose: () => void;
  closeLabel?: string;
  /** Anything the screen wants to show under the camera: mode toggle, last result, etc. */
  children?: React.ReactNode;
}

const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'];

function friendlyCameraError(e: any): string {
  const name = e?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera access is blocked. Allow the camera for this site in your browser settings, or type the code below.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No camera found on this device. You can still type the code below.';
  }
  if (name === 'NotReadableError') {
    return 'The camera is being used by another app. Close it and try again.';
  }
  return 'Could not start the camera. You can still type the code below.';
}

let audioCtx: AudioContext | null = null;
function beep() {
  try {
    navigator.vibrate?.(60);
  } catch {
    /* not supported */
  }
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    audioCtx = audioCtx ?? new AC();
    audioCtx.resume?.();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1100;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.09);
  } catch {
    /* sound is optional */
  }
}

export function BarcodeScanner({ title, onDetect, onClose, closeLabel = 'Done', children }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camError, setCamError] = useState('');
  const [starting, setStarting] = useState(true);
  const [flash, setFlash] = useState(false);
  const [manual, setManual] = useState('');

  // Always call the latest handler (it closes over fresh screen state) without restarting the camera.
  const handlerRef = useRef(onDetect);
  handlerRef.current = onDetect;
  const lastSeen = useRef<{ code: string; time: number }>({ code: '', time: 0 });

  const emit = (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    const now = Date.now();
    const same = lastSeen.current.code === code && now - lastSeen.current.time < 1500;
    lastSeen.current = { code, time: now };
    if (same) return;
    beep();
    setFlash(true);
    window.setTimeout(() => setFlash(false), 300);
    handlerRef.current(code);
  };
  const emitRef = useRef(emit);
  emitRef.current = emit;

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | null = null;

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamError(
          window.isSecureContext
            ? "This browser can't open the camera. You can still type the code below."
            : 'The camera only works on a secure (https) page. You can still type the code below.'
        );
        setStarting(false);
        return;
      }
      try {
        const video = videoRef.current;
        if (!video) return;

        // Prefer the browser's built-in detector (fast, Chrome on Android); otherwise fall back to ZXing (iPhone, desktop Firefox...).
        const Detector = (window as any).BarcodeDetector;
        let nativeFormats: string[] = [];
        if (Detector) {
          try {
            const supported: string[] = (await Detector.getSupportedFormats?.()) ?? [];
            nativeFormats = supported.filter((f) => NATIVE_FORMATS.includes(f));
          } catch {
            nativeFormats = [];
          }
        }

        if (nativeFormats.length > 0) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false,
          });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          video.srcObject = stream;
          await video.play().catch(() => undefined);
          const detector = new Detector({ formats: nativeFormats });
          let busy = false;
          const timer = window.setInterval(async () => {
            if (busy || video.readyState < 2) return;
            busy = true;
            try {
              const found = await detector.detect(video);
              if (found?.[0]?.rawValue) emitRef.current(found[0].rawValue);
            } catch {
              /* a frame failed to decode; try the next one */
            } finally {
              busy = false;
            }
          }, 180);
          stop = () => {
            window.clearInterval(timer);
            stream.getTracks().forEach((t) => t.stop());
            video.srcObject = null;
          };
        } else {
          const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
            import('@zxing/browser'),
            import('@zxing/library'),
          ]);
          const hints = new Map<any, any>();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
            BarcodeFormat.CODE_128,
            BarcodeFormat.CODE_39,
            BarcodeFormat.ITF,
            BarcodeFormat.QR_CODE,
          ]);
          hints.set(DecodeHintType.TRY_HARDER, true);
          const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
          const controls = await reader.decodeFromConstraints(
            { video: { facingMode: { ideal: 'environment' } }, audio: false },
            video,
            (result) => {
              if (result) emitRef.current(result.getText());
            }
          );
          if (cancelled) {
            controls.stop();
            return;
          }
          stop = () => controls.stop();
        }
        setStarting(false);
      } catch (e) {
        if (!cancelled) {
          setCamError(friendlyCameraError(e));
          setStarting(false);
        }
      }
    };

    start();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manual.trim();
    if (!code) return;
    setManual('');
    // Typed / handheld-scanner codes always count, even if the same as the last one.
    lastSeen.current = { code: '', time: 0 };
    emit(code);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/80 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[96dvh] overflow-auto flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0">
          <h3 className="text-sm sm:text-base font-bold text-slate-800">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scanner"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative bg-black aspect-[4/3] shrink-0">
          <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
          {!camError && (
            <div
              className={`absolute left-[12%] right-[12%] top-[28%] bottom-[28%] rounded-xl border-2 transition-colors duration-150 pointer-events-none ${
                flash ? 'border-emerald-400 bg-emerald-400/20' : 'border-white/80'
              }`}
            />
          )}
          {starting && !camError && (
            <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white/80">
              Starting camera…
            </div>
          )}
          {camError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-5 text-center bg-slate-800">
              <CameraOff className="w-7 h-7 text-slate-300" />
              <p className="text-xs sm:text-sm font-medium text-slate-200">{camError}</p>
            </div>
          )}
        </div>

        <div className="p-4 flex flex-col gap-3">
          {children}

          <form onSubmit={submitManual} className="flex items-center gap-2">
            <div className="relative flex-1">
              <Keyboard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                inputMode="numeric"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="Type the code, or use a handheld scanner"
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
              />
            </div>
            <button
              type="submit"
              className="shrink-0 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold transition-colors"
            >
              Enter
            </button>
          </form>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition-colors"
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Small colored message bar used under the camera by Inventory and POS. */
export function ScanStatusBar({ status }: { status: ScanStatus }) {
  if (!status) {
    return (
      <p className="text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-center">
        Point the camera at a barcode.
      </p>
    );
  }
  const styles =
    status.kind === 'ok'
      ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
      : status.kind === 'error'
      ? 'text-rose-700 bg-rose-50 border-rose-200'
      : 'text-amber-800 bg-amber-50 border-amber-200';
  return (
    <p role="status" className={`text-xs sm:text-sm font-bold border rounded-xl px-3 py-2.5 text-center ${styles}`}>
      {status.text}
    </p>
  );
}
