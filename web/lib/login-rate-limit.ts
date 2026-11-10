type AttemptBucket = {
  count: number;
  resetAt: number;
};

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

const failuresByIp = new Map<string, AttemptBucket>();

function prune(now: number) {
  for (const [ip, bucket] of failuresByIp) {
    if (bucket.resetAt <= now) {
      failuresByIp.delete(ip);
    }
  }
}

export function isLoginRateLimited(ip: string): boolean {
  const now = Date.now();
  prune(now);
  const bucket = failuresByIp.get(ip);
  if (!bucket) return false;
  if (bucket.resetAt <= now) {
    failuresByIp.delete(ip);
    return false;
  }
  return bucket.count >= MAX_FAILURES;
}

export function recordLoginFailure(ip: string) {
  const now = Date.now();
  prune(now);
  const bucket = failuresByIp.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    failuresByIp.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  bucket.count += 1;
}

export function clearLoginFailures(ip: string) {
  failuresByIp.delete(ip);
}
