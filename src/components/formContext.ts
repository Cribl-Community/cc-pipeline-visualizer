import { createContext } from 'react';

/** Where lookups resolve: the open worker group and pack (null for the group's own pipelines), plus the pipelines for Chain. */
export const FormContext = createContext<{ group: string | null; pack: string | null; pipelines: string[] }>({ group: null, pack: null, pipelines: [] });
