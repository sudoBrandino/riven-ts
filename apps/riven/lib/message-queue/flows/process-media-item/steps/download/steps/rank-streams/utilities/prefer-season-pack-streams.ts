import type { RankedResult } from "@repo/util-rank-torrent-name";

/**
 * From RTN-ranked streams (already sorted best-first), prefer full-season packs
 * for `seasonNumber`. A pack carries the season but no specific episode. Among
 * packs the most specific wins (a single-season pack beats a multi-season box);
 * ties keep the incoming rank order (`Array.prototype.sort` is stable).
 *
 * Returns the input unchanged when no pack exists, so the season still gets a
 * result and the existing `download.partial-success` -> fan-out flow completes
 * any remaining episodes. No regression versus the prior episode-only behavior.
 */
export function preferSeasonPackStreams(
  results: readonly RankedResult[],
  seasonNumber: number,
): RankedResult[] {
  const packs = results.filter(
    (result) =>
      result.data.episodes.length === 0 &&
      result.data.seasons.includes(seasonNumber),
  );

  if (packs.length === 0) {
    return [...results];
  }

  return [...packs].sort(
    (a, b) => a.data.seasons.length - b.data.seasons.length,
  );
}
