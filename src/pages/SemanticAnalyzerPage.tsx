import type { SemanticViewId } from '../analyzer/semantic/types';
import FlowAnalyzerPage from './FlowAnalyzerPage';

export default function SemanticAnalyzerPage({ view }: { view: SemanticViewId }) {
  return <FlowAnalyzerPage view={view} />;
}
