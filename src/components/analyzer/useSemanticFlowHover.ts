import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { SemanticFlowHoverHandler, SemanticFlowHoverInput, SemanticFlowHoverTarget } from '../../analyzer/semantic/flowRelationInteraction';

interface HoverInput { source: string; target: SemanticFlowHoverTarget }
interface HoverState { context: object; pointer?: HoverInput; focus?: HoverInput; latest?: 'pointer' | 'focus' }
const defaultInput: SemanticFlowHoverInput = { source: 'default', modality: 'pointer' };

/** Input ownership prevents a late graph leave from clearing a newer detail hover. */
export function useSemanticFlowHover(context: object) {
  const currentContext = useRef(context);
  useLayoutEffect(() => { currentContext.current = context; }, [context]);
  const [state, setState] = useState<HoverState>();
  const onHoverTarget = useCallback<SemanticFlowHoverHandler>((target, input = defaultInput) => {
    if (currentContext.current !== context) return;
    setState(previous => {
      const current = previous?.context === context ? previous : { context };
      const active = current[input.modality];
      if (!target) {
        if (active?.source !== input.source) return previous;
        return { ...current, [input.modality]: undefined };
      }
      if (current.latest === input.modality && active?.source === input.source && active.target.kind === target.kind && active.target.id === target.id) return previous;
      return { ...current, latest: input.modality, [input.modality]: { source: input.source, target } };
    });
  }, [context]);
  const clearHover = useCallback(() => {
    if (currentContext.current === context) setState(undefined);
  }, [context]);
  const current = state?.context === context ? state : undefined;
  const latest = current?.latest === 'focus' ? current.focus?.target ?? current.pointer?.target : current?.pointer?.target ?? current?.focus?.target;
  return { hoverTarget: latest, onHoverTarget, clearHover };
}
