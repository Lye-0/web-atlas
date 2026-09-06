import type { AnalyzerProjectStore } from '../types';
import type { TraceImport } from './traces';

/** Imported execution data lives only for the current project object and browser session. */
export const semanticTraceCache = new WeakMap<AnalyzerProjectStore, TraceImport>();
