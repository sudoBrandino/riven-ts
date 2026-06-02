import type { ShowStatus } from "@repo/util-plugin-sdk/dto/enums/show-status.enum";

/**
 * A season is "complete" (a season pack is appropriate) unless it is a special
 * (season 0) or the currently-airing latest season of a continuing show.
 *
 * Mirrors the season accounting in `Show.getExpectedFileCount`, where a
 * continuing show's latest season is treated as still in flight.
 */
export function isSeasonComplete(params: {
  seasonNumber: number;
  showStatus: ShowStatus;
  latestSeasonNumber: number;
}): boolean {
  const { seasonNumber, showStatus, latestSeasonNumber } = params;

  if (seasonNumber === 0) {
    return false;
  }

  if (showStatus === "continuing" && seasonNumber === latestSeasonNumber) {
    return false;
  }

  return true;
}
