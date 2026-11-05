// Above this many tracked keys, expired entries are swept on the next hit so memory stays bounded.
const SWEEP_THRESHOLD = 10_000;

/**
 * In-memory sliding-window limiter: at most `max` hits per key within any `windowMs` span.
 * State is per process; run a shared store instead if the API is scaled horizontally.
 */
export function createSlidingWindow({ max, windowMs }) {
  const hits = new Map();

  const sweep = (now) => {
    for (const [key, times] of hits) if (now - times.at(-1) >= windowMs) hits.delete(key);
  };

  return {
    /** Records a hit for `key`. Returns 0 when allowed, otherwise the milliseconds until a slot frees up. */
    take(key, now = Date.now()) {
      if (hits.size > SWEEP_THRESHOLD) sweep(now);
      const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return recent[0] + windowMs - now;
      }
      recent.push(now);
      hits.set(key, recent);
      return 0;
    },
  };
}
