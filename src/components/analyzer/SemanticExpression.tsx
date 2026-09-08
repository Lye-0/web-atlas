import { useRef, useState } from 'react';

export function SemanticExpression({ text, label = '完全な式' }: { text: string; label?: string }) {
  const [status, setStatus] = useState('');
  const code = useRef<HTMLElement>(null);
  return <div className="semantic-expression-block"><div className="semantic-expression-heading"><span>{label}</span><button type="button" onClick={() => {
    if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(text).then(() => setStatus('コピーしました'), () => setStatus('コピーできませんでした。コードを選択してコピーできます。'));
    else { const selection = window.getSelection(); if (selection && code.current) { const range = document.createRange(); range.selectNodeContents(code.current); selection.removeAllRanges(); selection.addRange(range); setStatus('コードを選択しました。コピーしてください。'); } }
  }}>コピー</button></div><pre className="semantic-data-expression" tabIndex={0} aria-label={label}><code ref={code}>{text}</code></pre>{status && <small role="status">{status}</small>}</div>;
}
