import { useEffect, useId, useLayoutEffect, useRef, useState, type Ref } from 'react';
import './architecture-navigation.css';

interface BreadcrumbItem { id: string; label: string; tooltip?: string }

export function AnalyzerBreadcrumb({ items, label, currentRef, onOpen }: {
  items: BreadcrumbItem[]; label: string; currentRef: Ref<HTMLSpanElement>; onOpen: (id: string) => void;
}) {
  const track = useRef<HTMLOListElement>(null), measure = useRef<HTMLOListElement>(null);
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false), [open, setOpen] = useState(false);
  const menuId = useId(), middle = items.slice(1, -1), current = items.at(-1);
  const itemKey = JSON.stringify(items);
  useLayoutEffect(() => {
    const update = () => {
      const available = track.current?.getBoundingClientRect().width ?? 0;
      const required = measure.current?.getBoundingClientRect().width ?? 0;
      setCollapsed(available > 0 && required > available + 1);
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update);
    if (track.current) observer?.observe(track.current);
    if (measure.current) observer?.observe(measure.current);
    window.addEventListener('resize', update);
    document.addEventListener('fullscreenchange', update);
    return () => { observer?.disconnect(); window.removeEventListener('resize', update); document.removeEventListener('fullscreenchange', update); };
  }, [itemKey]);
  useEffect(() => { setOpen(false); }, [itemKey, collapsed]);
  useLayoutEffect(() => { if (open) menu.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }); }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);
  const separator = <span className="architecture-breadcrumb-separator" aria-hidden="true">›</span>;
  return <nav className="architecture-location analyzer-breadcrumb" aria-label={label}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <span className="architecture-location-caption">現在地：</span>
    <ol ref={track} className="analyzer-breadcrumb-track">
      {items.length > 1 && <li className="analyzer-breadcrumb-root"><button className="analyzer-breadcrumb-link" type="button" title={items[0].label} onClick={() => onOpen(items[0].id)}>{items[0].label}</button></li>}
      {collapsed && middle.length > 0 ? <li className="analyzer-breadcrumb-overflow">{separator}<button ref={trigger} type="button" className="analyzer-breadcrumb-trigger"
        aria-label="中間の祖先を選ぶ" aria-haspopup="menu" aria-expanded={open} aria-controls={menuId}
        onClick={() => setOpen(value => !value)} onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); }
        }}><span aria-hidden="true">…</span><svg aria-hidden="true" width="10" height="10" viewBox="0 0 12 12"><path d="m3 4.5 3 3 3-3" /></svg></button></li>
        : middle.map(item => <li key={item.id}>{separator}<button type="button" className="analyzer-breadcrumb-link" onClick={() => onOpen(item.id)}>{item.label}</button></li>)}
      <li className="analyzer-breadcrumb-current">{items.length > 1 && separator}<span ref={currentRef} className="architecture-current-location" aria-current="page" tabIndex={-1} title={current?.tooltip ?? current?.label}>{current?.label ?? 'プロジェクト'}</span></li>
    </ol>
    {/* Intrinsic width stays independent of the visible collapsed layout. */}
    <div className="analyzer-breadcrumb-measure-clip" aria-hidden="true" inert><ol ref={measure} className="analyzer-breadcrumb-measure">
      {items.map((item, index) => <li key={item.id}>{index > 0 && separator}<span className={index === items.length - 1 ? 'architecture-current-location' : 'analyzer-breadcrumb-link'}>{item.label}</span></li>)}
    </ol></div>
    {open && collapsed && middle.length > 0 && <div ref={menu} id={menuId} className="analyzer-breadcrumb-menu" role="menu" aria-label="中間の祖先を選ぶ"
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus({ preventScroll: true }); return; }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}>
      {middle.map(item => <button key={item.id} type="button" role="menuitem" tabIndex={-1} onClick={() => { setOpen(false); onOpen(item.id); }}>
        <span className="analyzer-breadcrumb-menu-icon" aria-hidden="true">›</span><span>{item.label}</span>
      </button>)}
    </div>}
  </nav>;
}
