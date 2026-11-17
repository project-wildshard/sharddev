export function scratchDir(task: string, purpose: string, options?: {
  root?: string; env?: NodeJS.ProcessEnv; now?: Date; row?: string | null;
}): string;
