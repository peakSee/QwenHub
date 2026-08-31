export interface ModelHealthMetrics {
  successCount: number;
  errorCount: number;
  lastActivity: string;
}

const MODEL_HEALTH_WINDOW_MS = 5 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;
const modelErrorCounts: Map<string, number> = new Map();
const modelSuccessCounts: Map<string, number> = new Map();
const modelHealthTimestamps: Map<string, number> = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [model, ts] of modelHealthTimestamps) {
    if (now - ts > MODEL_HEALTH_WINDOW_MS) {
      modelErrorCounts.delete(model);
      modelSuccessCounts.delete(model);
      modelHealthTimestamps.delete(model);
    }
  }
}, CLEANUP_INTERVAL_MS);

export function recordModelError(model: string): void {
  const count = modelErrorCounts.get(model) || 0;
  modelErrorCounts.set(model, count + 1);
  modelHealthTimestamps.set(model, Date.now());
}

export function recordModelSuccess(model: string): void {
  const count = modelSuccessCounts.get(model) || 0;
  modelSuccessCounts.set(model, count + 1);
  modelHealthTimestamps.set(model, Date.now());
}

export function getModelHealth(model: string): { errors: number; successes: number; errorRate: number; isHealthy: boolean } {
  const now = Date.now();
  const lastCheck = modelHealthTimestamps.get(model);
  if (lastCheck && now - lastCheck > MODEL_HEALTH_WINDOW_MS) {
    modelErrorCounts.delete(model);
    modelSuccessCounts.delete(model);
    modelHealthTimestamps.delete(model);
    return { errors: 0, successes: 0, errorRate: 0, isHealthy: true };
  }
  const errors = modelErrorCounts.get(model) || 0;
  const successes = modelSuccessCounts.get(model) || 0;
  const total = errors + successes;
  const errorRate = total > 0 ? errors / total : 0;
  return { errors, successes, errorRate, isHealthy: errorRate < 0.3 };
}

export function resetModelHealth(model: string): void {
  modelErrorCounts.delete(model);
  modelSuccessCounts.delete(model);
  modelHealthTimestamps.delete(model);
}

export function getAllModelHealth(): Record<string, ModelHealthMetrics> {
  const result: Record<string, ModelHealthMetrics> = {};
  const allModels = new Set([...modelErrorCounts.keys(), ...modelSuccessCounts.keys()]);
  for (const model of allModels) {
    result[model] = {
      successCount: modelSuccessCounts.get(model) || 0,
      errorCount: modelErrorCounts.get(model) || 0,
      lastActivity: modelHealthTimestamps.get(model) ? new Date(modelHealthTimestamps.get(model)!).toISOString() : '',
    };
  }
  return result;
}
