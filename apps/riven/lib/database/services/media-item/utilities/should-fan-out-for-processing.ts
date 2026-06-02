import {
  type MediaItem,
  Season,
  Show,
} from "@repo/util-plugin-sdk/dto/entities";

/**
 * Decide whether an item fans out to its incomplete children when it is picked
 * up for processing, rather than being processed as a single unit.
 *
 * - Any partial request fans out (only the requested subset exists).
 * - A Show ALWAYS fans out to its seasons: we never grab a complete-series box,
 *   so each season is decided on its own.
 * - A Season fans out to its episodes when it is a special, or when it is
 *   incomplete (currently airing) and the `preferSeasonPacks` override is off.
 *   A complete season -- or any non-special season under the override -- is
 *   processed as a single unit so the scrape leaf can prefer a season pack.
 * - Movies and episodes are leaves: processed as-is.
 */
export function shouldFanOutForProcessing(params: {
  item: MediaItem;
  isPartialRequest: boolean;
  preferSeasonPacks: boolean;
  isSeasonComplete: boolean;
}): boolean {
  const { item, isPartialRequest, preferSeasonPacks, isSeasonComplete } =
    params;

  if (isPartialRequest) {
    return true;
  }

  if (item instanceof Show) {
    return true;
  }

  if (item instanceof Season) {
    if (item.isSpecial) {
      return true;
    }

    if (preferSeasonPacks) {
      return false;
    }

    return !isSeasonComplete;
  }

  return false;
}
