import { prepareAutoAggregation } from '../autoAggregation';
import { createSemanticFlowProjector, semanticAggregationInput } from './flowAutoAggregation';
import { buildUnresolvedFlowPresentation } from './flowUnresolvedPresentation';
import type { SemanticExplorerModel } from './semanticExplorer';
import type { SemanticGraph } from './types';

function buildInput(graph: SemanticGraph, explorer?: SemanticExplorerModel) {
  const presentation = buildUnresolvedFlowPresentation(graph, explorer);
  const allPositions = [...presentation.regular, ...presentation.individual];
  const aggregationInput = semanticAggregationInput(graph, allPositions, explorer);
  return { presentation, allPositions, aggregationInput,
    preparedAggregation: prepareAutoAggregation(aggregationInput.points, aggregationInput.groups),
    projectDisplay: createSemanticFlowProjector(graph, allPositions),
    byId: new Map(graph.nodes.map(node => [node.id, node])),
  };
}

// Immutable graph identity owns all static layout and membership data. Selection,
// camera and mode visits never own this cache; new inputs cannot retrieve it.
const inputs = new WeakMap<SemanticGraph, { explorer?: SemanticExplorerModel; value: ReturnType<typeof buildInput> }>();
export function semanticFlow3DInput(graph: SemanticGraph, explorer?: SemanticExplorerModel) {
  const cached = inputs.get(graph);
  if (cached && cached.explorer === explorer) return cached.value;
  const value = buildInput(graph, explorer);
  inputs.set(graph, { explorer, value });
  return value;
}
