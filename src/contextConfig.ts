export const CONTEXT_CHOICES = [4096, 6144, 8192, 16384, 32768, 65536] as const;
export const DEFAULT_CONTEXT_TOKENS = 6144;
export function validContextTokens(n: number): boolean { return CONTEXT_CHOICES.some(v => v === n); }
export function contextBudget(n: number) {
  switch(n) {
    case 4096: return {source:2400,total:3800,recent:3,user:500,project:1200};
    case 6144: return {source:4400,total:7900,recent:4,user:1000,project:2600};
    case 8192: return {source:6700,total:11500,recent:6,user:1400,project:4000};
    case 16384: return {source:16000,total:24000,recent:10,user:2200,project:10000};
    case 32768: return {source:37500,total:52000,recent:18,user:4200,project:26000};
    case 65536: return {source:81000,total:97000,recent:28,user:7000,project:42000};
    default: return contextBudget(DEFAULT_CONTEXT_TOKENS);
  }
}
