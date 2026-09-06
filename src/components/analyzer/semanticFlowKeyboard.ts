/** The focused 3D canvas shares 2D's Escape action. Ancestor fullscreen capture gets first refusal. */
export function bindSemanticFlowKeyboard(canvas: HTMLCanvasElement, onClear: () => void): () => void {
  const keydown = (event: KeyboardEvent) => {
    if (event.target !== canvas || event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.key !== 'Escape') return;
    event.preventDefault(); event.stopPropagation(); onClear();
  };
  canvas.addEventListener('keydown', keydown);
  return () => canvas.removeEventListener('keydown', keydown);
}
