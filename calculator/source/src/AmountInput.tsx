import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import NumberFlow from '@number-flow/react';

// Narrow no-break spaces keep digit groups together without wide gaps.
export function groupAmount(raw: string) {
  if (!raw) return '';
  const [whole, fraction] = raw.replace(',', '.').split('.');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f') + (fraction !== undefined ? `,${fraction}` : '');
}

type Props = {
  inputRef: RefObject<HTMLInputElement | null>;
  label: string;
  value: string;
  decimals: number;
  error: string;
  onChange: (raw: string) => void;
};

export default function AmountInput({ inputRef, label, value, decimals, error, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const selection = useRef<number | null>(null);
  const display = groupAmount(value);
  const fractionLength = value.split('.')[1]?.length ?? 0;
  const fontSize = value.length > (decimals ? 9 : 7) ? (decimals ? 25 : 28) : undefined;
  useLayoutEffect(() => {
    if (!editing || selection.current === null || !inputRef.current) return;
    let count = 0, position = 0;
    for (const char of display) {
      if (/[\d,]/.test(char)) count++;
      position++;
      if (count >= selection.current) break;
    }
    if (selection.current === 0) position = 0;
    inputRef.current.setSelectionRange(position, position);
    selection.current = null;
  }, [display, editing, inputRef]);

  return <span className="amount-control" style={{ fontSize }}>
    <span className={`animated-amount${!value && decimals ? ' is-empty' : ''}`} aria-hidden="true">
      <NumberFlow className={decimals ? 'rubles-number' : 'stars-number'} value={Number(value) || 0} locales="fr-FR"
        format={{ minimumFractionDigits: fractionLength, maximumFractionDigits: decimals, useGrouping: true }}
        suffix={decimals ? `${value.endsWith('.') ? ',' : ''} ₽` : ' '} trend={0}
        transformTiming={{ duration: 460, easing: 'cubic-bezier(.16,1,.3,1)' }}
        spinTiming={{ duration: 560, easing: 'cubic-bezier(.16,1,.3,1)' }}
        opacityTiming={{ duration: 180, easing: 'ease-out' }}
        respectMotionPreference willChange />
    </span>
    <input ref={inputRef} className="conversion-input" aria-label={label}
      inputMode={decimals ? 'decimal' : 'numeric'} autoComplete="off" spellCheck={false}
      placeholder="0" value={display} onFocus={() => setEditing(true)} onBlur={() => setEditing(false)}
      onChange={event => {
        const prefix = event.target.value.slice(0, event.target.selectionStart ?? event.target.value.length);
        selection.current = prefix.replace(/[^\d,]/g, '').length;
        onChange(event.target.value);
      }}
      aria-invalid={!!error} aria-describedby={error ? 'amount-error' : undefined} />
  </span>;
}
