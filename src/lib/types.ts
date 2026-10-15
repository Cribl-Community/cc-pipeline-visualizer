export interface ConfigGroup {
  id: string;
  description?: string;
  isSearch?: boolean;
  isFleet?: boolean;
  type?: string;
}

export interface Pack {
  id: string;
  displayName?: string;
  version?: string;
}

export interface PipelineFunction {
  id: string;
  filter?: string;
  disabled?: boolean;
  final?: boolean;
  description?: string;
  conf: Record<string, unknown>;
  groupId?: string;
}

export interface PipelineConf {
  output?: string;
  streamtags?: string[];
  groups?: Record<string, unknown>;
  asyncFuncTimeout?: number;
  description?: string;
  functions: PipelineFunction[];
  [key: string]: unknown;
}

export interface Pipeline {
  id: string;
  conf: PipelineConf;
}

export interface FunctionMeta {
  id: string;
  name: string;
  group: string;
  schema?: Record<string, unknown>;
  uischema?: Record<string, unknown>;
}

export interface Sample {
  id: string;
  sampleName?: string;
  size?: number;
  numEvents?: number;
  created?: number;
  inPack?: boolean;
}

export type CriblEvent = Record<string, unknown>;

export interface FunctionStats {
  func: string;
  eventsIn: number;
  eventsOut: number;
  bytesIn: number;
  bytesOut: number;
  duration: number;
}

export interface PreviewResult {
  events: CriblEvent[];
  stats: FunctionStats[];
  errors: string[];
}

/** A route of the worker group or pack routing table; only what the pipelines overview shows. */
export interface Route {
  id: string;
  name?: string;
  pipeline?: string;
  output?: string;
  disabled?: boolean;
}

/** A source; `pipeline` is its pre-processing pipeline, `connections` its QuickConnect links. */
export interface Input {
  id: string;
  pipeline?: string;
  disabled?: boolean;
  connections?: { pipeline?: string; output?: string }[];
}

/** Event counts of a pipeline over the last 15 minutes, as in the Stats column of Cribl's Pipelines page. */
export interface PipeStats {
  in: number;
  out: number;
  dropped: number;
  err: number;
}
