
/**
 * Veritas Orchestrator Module
 * 
 * Exports:
 * - orchestratorExecutor: Main doubt loop executor
 * - analyzeForDoubts: Analyze findings for gaps
 * - Types for findings, doubts, and results
 */

export { orchestratorExecutor } from './executor.js';
export { analyzeForDoubts } from './doubt-engine.js';

// Types must be exported with 'type' keyword for ESM compatibility
export type {
  Doubt,
  DoubtAnalysis,
  Finding,
  Source,
} from './doubt-engine.js';

export type {
  OrchestratorConfig,
  OrchestratorResult,
} from './executor.js';
