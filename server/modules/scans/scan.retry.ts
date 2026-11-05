export type ScanAttemptInfo = {
  attemptsMade?: number;
  opts?: { attempts?: number };
};

export function isFinalAttempt(job: ScanAttemptInfo): boolean {
  return (job.attemptsMade ?? 0) + 1 >= (job.opts?.attempts ?? 1);
}
