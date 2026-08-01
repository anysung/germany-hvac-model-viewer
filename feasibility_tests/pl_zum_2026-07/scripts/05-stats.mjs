// Statistical helpers for the feasibility report: Wilson intervals, stratified
// weighting, and the combined-coverage formula. Pure functions + CLI demo.
export function wilson(successes, n, z = 1.96) {
  if (n === 0) return { p: null, lo: null, hi: null };
  const p = successes / n, z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / denom;
  return { p, lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
}

// Stratified estimate: strata = [{ weight (population share of the SAMPLED
// frame), successes, n }] → weighted p̂ and a conservative CI via the widest
// stratum-level Wilson deviation (avoids overclaiming precision on small strata).
export function stratified(strata) {
  let p = 0, loDev = 0, hiDev = 0;
  for (const s of strata) {
    const w = wilson(s.successes, s.n);
    if (w.p == null) continue;
    p += s.weight * w.p;
    loDev += s.weight * (w.p - w.lo);
    hiDev += s.weight * (w.hi - w.p);
  }
  return { p, lo: Math.max(0, p - loDev), hi: Math.min(1, p + hiDev) };
}

// Combined commercial coverage: pA is exact (full enumeration) share of the
// active unique population confirmed via Path A; pB is the estimated share of
// the NON-confirmed remainder that is independently specification-complete.
export function combinedCoverage(pA, pB) {
  return {
    point: pA + (1 - pA) * pB.p,
    lo: pA + (1 - pA) * pB.lo,
    hi: pA + (1 - pA) * pB.hi,
  };
}

export function decision(c) {
  if (c.point >= 0.70 && c.lo > 0.50) return 'GO';
  if (c.point >= 0.50) return 'CONDITIONAL GO';
  return 'HOLD / NO-GO';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // demo with placeholder numbers — replaced by real results after 2026-07-20
  const pA = 0.30;
  const pB = stratified([
    { weight: 0.55, successes: 30, n: 60 },
    { weight: 0.30, successes: 20, n: 55 },
    { weight: 0.15, successes: 10, n: 35 },
  ]);
  const c = combinedCoverage(pA, pB);
  console.log({ pA, pB, combined: c, decision: decision(c) });
}
