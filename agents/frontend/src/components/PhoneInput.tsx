import React from 'react';
import { normalizePhoneInput } from '../lib/phone';

/**
 * Shared phone entry field (2026-08-01). Fixes the copy-paste pain: a number pasted in ANY format
 * — "+91 995886 0411", "+919958860411", "919958860411", "0091-9958860411" — self-normalises to the
 * accepted form ("9958860411") on paste and on blur, while still letting you type freely.
 *
 * Drop-in for a styled <input>: pass `value` (string) + `onChange` (receives the string). All other
 * <input> props (style, placeholder, required, autoFocus, name, disabled, id, …) pass straight through.
 * Do NOT pass a truncating maxLength — paste of longer formats must not be clipped.
 */
interface PhoneInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
    value: string;
    onChange: (value: string) => void;
}

export default function PhoneInput({ value, onChange, onBlur, ...rest }: PhoneInputProps) {
    // While typing, allow digits + the punctuation people paste; strip letters/other junk. No slicing.
    const sanitize = (v: string) => v.replace(/[^\d+\-\s()]/g, '');
    return (
        <input
            {...rest}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={value}
            onChange={e => onChange(sanitize(e.target.value))}
            onPaste={e => {
                e.preventDefault();
                const text = (e.clipboardData || (window as any).clipboardData)?.getData('text') ?? '';
                onChange(normalizePhoneInput(text));
            }}
            onBlur={e => {
                const n = normalizePhoneInput(e.target.value);
                if (n !== value) onChange(n);
                onBlur?.(e);
            }}
        />
    );
}
