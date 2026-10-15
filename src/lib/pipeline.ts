import type { PipelineConf, PipelineFunction } from './types';

/** Functions Cribl actually executes: not comments, not disabled, not in a disabled group. */
export function isActive(fn: PipelineFunction, conf: PipelineConf): boolean {
  if (fn.disabled || fn.id === 'comment') return false;
  if (fn.groupId) {
    const g = conf.groups?.[fn.groupId] as { disabled?: boolean } | undefined;
    if (g?.disabled) return false;
  }
  return true;
}

/** The pipeline cut off before function `end` (exclusive). */
export function sliceConf(conf: PipelineConf, end: number): PipelineConf {
  return { ...conf, functions: conf.functions.slice(0, end) };
}

/**
 * Stable identity of what a preview of `conf` would compute. Comments and inactive
 * functions are left out, so stepping across them reuses the cached run.
 */
export function previewKey(conf: PipelineConf, sampleId: string): string {
  const active = conf.functions
    .filter((f) => isActive(f, conf))
    .map(({ id, filter, final, conf: c }) => ({ id, filter: filter ?? 'true', final: !!final, c }));
  return JSON.stringify([sampleId, conf.asyncFuncTimeout ?? null, active]);
}

/** Position of function `index` in the preview `stats.functions` array (active functions only). */
export function statsIndex(conf: PipelineConf, index: number): number {
  let n = 0;
  for (let i = 0; i < index; i++) if (isActive(conf.functions[i], conf)) n++;
  return n;
}

export function activeIndexes(conf: PipelineConf): number[] {
  return conf.functions.map((f, i) => (isActive(f, conf) ? i : -1)).filter((i) => i >= 0);
}

export function newFunction(id: string, defaults: Record<string, unknown>): PipelineFunction {
  return { id, filter: 'true', disabled: false, conf: structuredClone(defaults) };
}
