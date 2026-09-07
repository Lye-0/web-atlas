import { useEffect, useId, type DOMAttributes } from 'react';
import type { SemanticFlowHoverHandler, SemanticFlowHoverTarget } from '../../analyzer/semantic/flowRelationInteraction';

export function semanticFlowHoverBindings<T extends Element>(handler: SemanticFlowHoverHandler | undefined, target: SemanticFlowHoverTarget, source: string): Pick<DOMAttributes<T>, 'onPointerMove' | 'onPointerLeave' | 'onFocus' | 'onBlur'> {
  return {
    // Focus can scroll another row under a parked pointer; entry alone is not a new input.
    onPointerMove: event => { if (event.buttons === 0) handler?.(target, { source, modality: 'pointer' }); },
    onPointerLeave: () => handler?.(undefined, { source, modality: 'pointer' }),
    onFocus: () => handler?.(target, { source, modality: 'focus' }),
    onBlur: event => {
      if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) handler?.(undefined, { source, modality: 'focus' });
    },
  };
}

/** Each rendered row owns its input, even when the same counterpart appears twice. */
export function useSemanticFlowHoverBindings<T extends Element>(handler: SemanticFlowHoverHandler | undefined, target: SemanticFlowHoverTarget, sourcePrefix = 'flow-item') {
  const instanceId = useId(), source = `${sourcePrefix}:${instanceId}`;
  useEffect(() => () => {
    handler?.(undefined, { source, modality: 'pointer' });
    handler?.(undefined, { source, modality: 'focus' });
  }, [handler, source, target.kind, target.id]);
  return semanticFlowHoverBindings<T>(handler, target, source);
}
