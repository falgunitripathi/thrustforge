/**
 * Removes source citations — "(§5)", "(Ref §8/§9)", "(reference/x.md §4,
 * judgment call #2)", "(NPTEL p.278)" — from text shown to users. The
 * source strings keep them (they document provenance, and splitFormula
 * uses them to separate equation from explanation); they're just not
 * displayed.
 */
export function stripCitations(s) {
  if (!s) return s;
  return s
    .replace(/\s*\([^()]*(?:§|\bRef\b|reference\/|NPTEL|judgment call)[^()]*\)/g, "")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/([.;:])\1+/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s.,;:—-]+/, "")
    .trim();
}
