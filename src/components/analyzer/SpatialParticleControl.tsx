import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { SpatialParticleMode } from './useSpatialFlowMotion';

const modes: { value: SpatialParticleMode; label: string }[] = [
  { value: 'normal', label: '通常' },
  { value: 'reduced', label: '控えめ' },
  { value: 'off', label: 'オフ' },
];

export function SpatialParticleControl({ mode, onChange, onOpen }: {
  mode: SpatialParticleMode;
  onChange: (mode: SpatialParticleMode) => void;
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const label = modes.find(option => option.value === mode)!.label;

  useLayoutEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus({ preventScroll: true });
  };
  return <div ref={rootRef} className="analyzer-particle-control"
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={buttonRef} type="button" className="analyzer-particle-trigger" data-mode={mode}
      aria-label={`パーティクル: ${label}`} aria-haspopup="menu" aria-expanded={open} aria-controls={menuId}
      onClick={() => { if (!open) onOpen?.(); setOpen(!open); }}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (!open) onOpen?.(); setOpen(true); }
      }}>
      パーティクル <span className="analyzer-particle-mode">{label}</span>
      <svg aria-hidden="true" width="10" height="10" viewBox="0 0 12 12"><path d="m3 4.5 3 3 3-3" /></svg>
    </button>
    {open && <div ref={menuRef} id={menuId} className="analyzer-particle-menu" role="menu" aria-label="パーティクル"
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
        if (event.key === 'Tab') { close(); return; }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
        const current = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
          : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }}>
      {modes.map(option => <button key={option.value} type="button" role="menuitemradio"
        aria-checked={mode === option.value} tabIndex={-1}
        onClick={() => { onChange(option.value); close(); }}>
        <span className="analyzer-particle-check" aria-hidden="true">{mode === option.value ? '✓' : ''}</span>
        {option.label}
      </button>)}
    </div>}
  </div>;
}
