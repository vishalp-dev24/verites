
/**
 * Orchestrator Module
 * 
 * Exports:
 * - orchestratorExecutor: Main doubt loop executor
 * - analyzeForDoubts: Analyze findings for gaps
 * - Types for findings, doubts, and results
 */

export { orchestratorExecutor } from './executor.js';
export {
  analyzeForDoubts,
  Doubt,
  DoubtAnalysis,
  Finding,
  Source,
} from './doubt-engine.js';

export type {
  OrchestratorConfig,
  OrchestratorResult,
} from './executor.js';
