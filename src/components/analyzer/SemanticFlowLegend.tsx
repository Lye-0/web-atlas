import { analyzerDirectionColors } from '../../analyzer/edgeDirection';
import { semanticFlowDirectionLanguage, type SemanticFlowLanguageView } from './semanticFlowLanguage';
import './semantic-flow-language.css';

export function SemanticFlowLegend({ view, inline = false }: { view: SemanticFlowLanguageView; inline?: boolean }) {
  const language = semanticFlowDirectionLanguage(view);
  return <div className={`semantic-flow-direction-legend${inline ? ' is-inline' : ''}`} aria-label="選択対象を基準にした方向の凡例" title={language.help}>
    <div className="semantic-flow-direction-row" role="img" aria-label={`${language.incoming}から選択対象へ、選択対象から${language.outgoing}へ`}>
      <span data-direction="incoming" style={{ color: analyzerDirectionColors.incoming }}>{language.incoming} <span aria-hidden="true">→</span></span>
      <strong>選択対象</strong>
      <span data-direction="outgoing" style={{ color: analyzerDirectionColors.outgoing }}><span aria-hidden="true">→</span> {language.outgoing}</span>
    </div>
    <p>{language.caption}<span style={{ color: analyzerDirectionColors.internal }}>緑：選択範囲内</span></p>
  </div>;
}
