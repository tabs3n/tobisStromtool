import { useEffect, useRef, useState, type ReactNode } from 'react';

interface NumInputProps {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** 0 wird als leeres Feld dargestellt. */
  blankZero?: boolean;
  className?: string;
  placeholder?: string;
  title?: string;
  style?: React.CSSProperties;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
}

/** Zahlenfeld, das beim Tippen nicht springt und leere Eingaben zulässt. */
export function NumInput({
  value,
  onChange,
  min,
  max,
  step,
  blankZero,
  className,
  placeholder,
  title,
  style,
  onFocus,
}: NumInputProps) {
  const format = (n: number) => (blankZero && n === 0 ? '' : String(n));
  const [text, setText] = useState(() => format(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(format(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, blankZero]);

  const commit = (raw: string) => {
    setText(raw);
    if (raw.trim() === '') {
      onChange(0);
      return;
    }
    const n = Number(raw.replace(',', '.'));
    if (Number.isFinite(n)) {
      let v = n;
      if (min !== undefined) v = Math.max(min, v);
      if (max !== undefined) v = Math.min(max, v);
      onChange(v);
    }
  };

  return (
    <input
      type="number"
      className={className}
      style={style}
      title={title}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
      value={text}
      onFocus={(e) => {
        focused.current = true;
        onFocus?.(e);
      }}
      onChange={(e) => commit(e.target.value)}
      onBlur={() => {
        focused.current = false;
        setText(format(value));
      }}
    />
  );
}

interface TextInputProps {
  value: string;
  onChange: (s: string) => void;
  className?: string;
  placeholder?: string;
  title?: string;
  style?: React.CSSProperties;
}

export function TextInput({ value, onChange, className, placeholder, title, style }: TextInputProps) {
  return (
    <input
      type="text"
      className={className}
      style={style}
      title={title}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <header>
          <h3>{title}</h3>
          <div style={{ flex: 1 }} />
          <button className="btn icon" onClick={onClose} title="Schließen">
            ✕
          </button>
        </header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

export interface MenuItem {
  label: string;
  onClick: () => void;
  /** Kleine Zusatzzeile unter dem Label. */
  hint?: string;
  /** Trennlinie vor diesem Eintrag. */
  separator?: boolean;
}

/** Button mit aufklappbarer Liste; schließt bei Klick daneben oder Escape. */
export function MenuButton({
  label,
  items,
  className = 'btn',
  align = 'right',
  title,
}: {
  label: ReactNode;
  items: MenuItem[];
  className?: string;
  align?: 'left' | 'right';
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button className={className} title={title} onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open && (
        <div className={`menu-list ${align}`}>
          {items.map((it) => (
            <button
              key={it.label}
              className={it.separator ? 'sep' : undefined}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
            >
              {it.label}
              {it.hint && <small>{it.hint}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
