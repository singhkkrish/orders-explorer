import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

interface Props {
  label: ReactNode;
  title?: string;
  ariaLabel?: string;
  icon?: ReactNode;
  align?: 'left' | 'right';
  className?: string;
  children: (close: () => void) => ReactNode;
}

/** Minimal accessible popover: button + panel, closes on outside click / Escape (focus returns to the button). */
export function Popover({ label, title, ariaLabel, icon, align = 'left', className = '', children }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  return (
    <div
      className="popover"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpen(false);
          button.current?.focus();
        }
      }}
    >
      <button
        ref={button}
        type="button"
        className={`btn ${className}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={ariaLabel}
        title={title}
        onClick={() => setOpen((o) => !o)}
      >
        {icon}
        {label}
      </button>
      {open && (
        <div id={panelId} role="dialog" aria-label={ariaLabel ?? title} className={`popover-panel ${align}`}>
          {children(() => {
            setOpen(false);
            button.current?.focus();
          })}
        </div>
      )}
    </div>
  );
}
