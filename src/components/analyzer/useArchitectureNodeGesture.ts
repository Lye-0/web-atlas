import { useRef, type MouseEvent, type PointerEvent } from 'react';

export interface ArchitectureNodeClick { clientX: number; clientY: number; timeStamp: number; detail: number; button: number }

// The first selection can resize the canvas. Keep the gesture's original identity
// above both the canvas and detail panel so its second click cannot hit a new node.
export function useArchitectureNodeGesture(context: string, enabled: boolean, canOpen: (id: string) => boolean, open: (id: string) => void, select: (id: string) => void) {
  const pending = useRef<{ id: string; context: string; event: ArchitectureNodeClick } | undefined>(undefined);
  const down = useRef<{ x: number; y: number; moved: boolean } | undefined>(undefined);
  const cancel = () => { pending.current = undefined; };
  const onNodeClick = (id: string, event: ArchitectureNodeClick, selectOverride?: () => void) => {
    pending.current = enabled && event.button === 0 && event.detail === 1 && !down.current?.moved
      ? { id, context, event: { clientX: event.clientX, clientY: event.clientY, timeStamp: event.timeStamp, detail: event.detail, button: event.button } } : undefined;
    if (selectOverride) selectOverride(); else select(id);
  };
  return {
    onNodeClick: enabled ? onNodeClick : undefined,
    bindings: enabled ? {
      onPointerDownCapture: (event: PointerEvent) => {
        down.current = { x: event.clientX, y: event.clientY, moved: false };
        if (event.button !== 0 || event.pointerType === 'touch') cancel();
      },
      onPointerMoveCapture: (event: PointerEvent) => {
        if (event.buttons && down.current && Math.hypot(event.clientX - down.current.x, event.clientY - down.current.y) > 5) { down.current.moved = true; cancel(); }
      },
      onPointerCancelCapture: cancel,
      onKeyDownCapture: cancel,
      onWheelCapture: cancel,
      onContextMenuCapture: cancel,
      onClickCapture: (event: MouseEvent) => {
        const first = pending.current;
        cancel();
        if (!first || first.context !== context || event.button !== 0 || event.detail !== 2 || down.current?.moved
          || event.timeStamp - first.event.timeStamp > 750 || Math.hypot(event.clientX - first.event.clientX, event.clientY - first.event.clientY) > 6) return;
        event.preventDefault(); event.stopPropagation(); if (canOpen(first.id)) open(first.id);
      },
    } : {},
  };
}
