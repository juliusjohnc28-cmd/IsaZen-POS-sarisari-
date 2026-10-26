import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type PinInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** Classes for the box around the input (use it for width, e.g. "w-full sm:w-48"). */
  wrapperClassName?: string;
};

/** A password-style box with an eye button so the PIN can be shown while typing. */
export function PinInput({ wrapperClassName = 'w-full', className = '', style, ...rest }: PinInputProps) {
  const [show, setShow] = useState(false);
  return (
    <div className={`relative ${wrapperClassName}`}>
      <input
        {...rest}
        type={show ? 'text' : 'password'}
        className={className}
        style={{ ...style, paddingRight: '2.75rem' }}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? 'Hide PIN' : 'Show PIN'}
        aria-pressed={show}
        className="absolute right-1 top-1/2 -translate-y-1/2 p-2 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}
