# Smart season-pack preference

Date: 2026-06-02
Branch: `feat/smart-season-packs` (off `riven-stack`)

## Context

When re-acquiring a TV library, Riven should pull a single **season pack** for
seasons that are fully aired (one grab, less churn) but fall back to individual
episodes for content where a pack does not yet exist or does not make sense
(currently-airing seasons, gaps in an otherwise-present season). Today:

- `preferSeasonPacks` (default `false`) only feeds the show-to-season fan-out
  decision in `shouldFanOutForProcessing`.
- The **NZB path** already prefers packs at the season level via
  `pickSeasonPackCandidate` (full-season packs only, most-specific season first,
  newest tiebreak), with an automatic per-episode fallback when no pack exists.
- The **torrent/debrid path** (the primary source) has **no** pack awareness:
  `rank-streams` ranks every stream by RTN quality + resolution, so a single
  high-quality episode can beat a season pack.

## Goal

Make season-pack selection _smart by show/season status_, on **both** paths,
with the debrid path treated as primary.

## Behavior spec

- **Shows always fan out to seasons.** Never grab a complete-series box.
- **Per season:**
  - **Complete season** -> prefer a season pack (torrent and NZB); fall back to
    individual episodes if no pack exists.
  - **Airing season** (the latest season of a `continuing` show) -> go straight
    to the missing episodes; do not wait on a pack that cannot be complete yet.
  - **Specials (season 0)** -> per-episode, never a pack.
  - **Partial gaps** (some episodes already present) -> only the missing
    episodes (existing `getIncompleteItems` behavior).
- A "pack" is identified from already-parsed release data:
  `parsed.episodes.length === 0 && parsed.seasons.includes(n)`. The same rule the
  NZB picker uses, now also applied to RTN-parsed torrent streams. Among packs,
  prefer the most specific (single-season pack over a multi-season box), then
  quality/recency.

## Completeness heuristic

Status-based, reusing the semantics already in `Show.getExpectedFileCount`
(`status === "continuing" ? seasons.length - 1 : seasons.length`):

> `isSeasonComplete(season, show)` is **false** when the season is a special
> (number 0) or it is the highest-numbered season of a `continuing` show;
> **true** otherwise.

No per-episode air dates are required (the `Episode` entity has none). Accepted
edge case: a season that finished airing while the show is still flagged
`continuing` is treated as "airing" (episodes, not a pack) until a newer season
exists. Acceptable for a re-acquire.

## Setting semantics

Keep the existing `preferSeasonPacks` boolean (no DB settings migration):

- Smart-by-status is the **baseline** behavior (applies regardless of the flag).
- `preferSeasonPacks: true` is an **override**: force pack preference even for
  airing/incomplete seasons (try a pack before falling back to episodes).

## Components

| File                                                                                                                              | Change                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/riven/lib/database/services/media-item/utilities/is-season-complete.ts`                                                     | **New.** `isSeasonComplete(season, show)` per the heuristic above. May need the show's season list (max season number); the caller in `getItemsToProcess` loads it.                                                                                                                                                   |
| `apps/riven/lib/database/services/media-item/utilities/should-fan-out-for-processing.ts`                                          | **Change.** Show -> always fan out to seasons. Season -> fan out to episodes when not complete and not overridden. Stays a **pure, sync** function: it receives a precomputed `isSeasonComplete` boolean (the caller computes it). Keep the `isPartialRequest` short-circuit.                                         |
| `apps/riven/lib/message-queue/flows/process-media-item/steps/download/steps/rank-streams/utilities/prefer-season-pack-streams.ts` | **New.** Torrent analog of `pickSeasonPackCandidate`: from RTN-ranked results, return only the season-pack streams for the target season (most-specific first, then rank order). Returns **empty** when no pack exists -> signals the processor to fall back to per-episode, NOT to download a single episode stream. |
| `apps/riven/lib/message-queue/flows/process-media-item/steps/download/steps/rank-streams/rank-streams.processor.ts`               | **Change.** When the item is a complete Season (or override), apply `prefer-season-pack-streams`. If it yields packs, return them; if empty, trigger the season's per-episode fan-out (the same fallback the NZB path uses) rather than returning episode streams.                                                    |
| `apps/riven/lib/message-queue/flows/process-media-item/steps/nzb-scrape/nzb-scrape-item.processor.ts`                             | **Change.** Gate `pickSeasonPackCandidate` on `isSeasonComplete` (override forces it). Airing seasons no longer reach the season-level pack scrape (they fan out earlier), so this is mostly a guard for the override path.                                                                                           |
| `apps/riven/lib/database/services/media-item/media-item.service.ts`                                                               | **Change.** `getItemsToProcess` already passes `preferSeasonPacks`; extend it to supply the completeness context the fan-out decision needs.                                                                                                                                                                          |

## Data flow

```
Show picked up
  -> shouldFanOutForProcessing: Show => fan out to seasons
     -> per Season:
        complete season (or preferSeasonPacks override)
          -> scrape, prefer a pack:
               torrent: rank-streams -> prefer-season-pack-streams
               nzb:     nzb-scrape  -> pickSeasonPackCandidate
          -> no pack found => fall back to per-episode (existing behavior)
        airing season / specials (and not override)
          -> fan out to missing episodes -> normal per-episode scrape/download
```

## Edge cases / error handling

- **No pack for a complete season:** fall back to per-episode fan-out on both
  paths so the season still completes (torrent: `prefer-season-pack-streams`
  empty -> season fans out to its missing episodes, mirroring NZB; NZB: existing
  `undefined` -> per-episode fan-out). Neither path downloads a lone episode and
  strands the rest of the season.
- **Multi-season box** that includes the target season: counts as a pack but
  ranks below a single-season pack (specificity), avoiding a giant box grab.
- **Single-season continuing show:** its only season is the airing one ->
  episodes.
- **Specials (season 0):** always per-episode.

## Testing

Unit specs mirroring the existing `pick-nzb-candidate.spec.ts` style:

- `is-season-complete`: ended show, continuing-latest, continuing-older,
  specials, single-season continuing.
- `prefer-season-pack-streams`: pack preferred over episode, single-season over
  multi-season box, fallback when no pack, override behavior.
- `should-fan-out-for-processing`: show always, complete season no, airing
  season yes, partial request, override forces season.

The full env-free dev gate (`scripts/riven-dev-verify.sh`, 32 tasks) must stay
green.

## Out of scope

- Per-show pack/episode overrides.
- Per-episode air-date precision for completeness.
- Debrid-vs-NZB source priority (already debrid-first/NZB-fallback).
