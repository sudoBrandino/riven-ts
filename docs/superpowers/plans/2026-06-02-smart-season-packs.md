# Smart Season-Pack Preference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Riven prefer a season pack for fully-aired seasons (on both the torrent/debrid and NZB paths) while using individual episodes for currently-airing seasons, specials, and gaps.

**Architecture:** Completeness is decided once, at the show/season fan-out point (`shouldFanOutForProcessing`): shows always descend to seasons; a season fans out to its episodes unless it is "complete" (or the `preferSeasonPacks` override is on). Only seasons meant to be grabbed as a pack reach the scrape leaf, where each path prefers a pack and harmlessly falls back. A new pure `isSeasonComplete` derives completeness from show status; a new pure `preferSeasonPackStreams` adds pack preference to the torrent ranker (the NZB path already has `pickSeasonPackCandidate`).

**Tech Stack:** TypeScript (ESM, `.ts` extensions), MikroORM entities, vitest with the repo `test-context` fixtures, turbo.

**Spec:** `docs/superpowers/specs/2026-06-02-smart-season-packs-design.md`. Refinements made during planning (cleaner than the spec's first cut, same behavior): completeness gates entirely at fan-out; torrent no-pack returns the full ranked list (relies on the existing `download.partial-success` -> fan-out self-heal, no state-machine change); `nzb-scrape-item.processor.ts` needs no change.

**Dev gate (run from the wilcoxunraid-stack repo):** `bash scripts/riven-dev-verify.sh` — rsyncs the working tree to dev LXC 170 and runs check-types + lint + test env-free (must stay green: 32 tasks).

---

### Task 1: `isSeasonComplete` pure helper

**Files:**

- Create: `apps/riven/lib/database/services/media-item/utilities/is-season-complete.ts`
- Test: `apps/riven/lib/database/services/media-item/utilities/is-season-complete.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { isSeasonComplete } from "./is-season-complete.ts";

describe("isSeasonComplete", () => {
  it("treats every season of an ended show as complete", () => {
    expect(
      isSeasonComplete({
        seasonNumber: 3,
        showStatus: "ended",
        latestSeasonNumber: 3,
      }),
    ).toBe(true);
  });

  it("treats the latest season of a continuing show as airing (not complete)", () => {
    expect(
      isSeasonComplete({
        seasonNumber: 4,
        showStatus: "continuing",
        latestSeasonNumber: 4,
      }),
    ).toBe(false);
  });

  it("treats older seasons of a continuing show as complete", () => {
    expect(
      isSeasonComplete({
        seasonNumber: 2,
        showStatus: "continuing",
        latestSeasonNumber: 4,
      }),
    ).toBe(true);
  });

  it("never treats specials (season 0) as complete", () => {
    expect(
      isSeasonComplete({
        seasonNumber: 0,
        showStatus: "ended",
        latestSeasonNumber: 5,
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Development/personal/riven-ts && pnpm --filter @repo/riven exec vitest run lib/database/services/media-item/utilities/is-season-complete.spec.ts`
Expected: FAIL — `Cannot find module './is-season-complete.ts'`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { ShowStatus } from "@repo/util-plugin-sdk/dto/enums/show-status.enum";

/**
 * A season is "complete" (a pack is appropriate) unless it is a special
 * (season 0) or the currently-airing latest season of a continuing show.
 * Mirrors the season accounting in `Show.getExpectedFileCount`.
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
```

Note: confirm the import path of `ShowStatus` — the enum lives at `packages/util-plugin-sdk/lib/dto/enums/show-status.enum.ts` and is re-exported; use whatever path the sibling entities import (`Show` imports `ShowStatus` from `../../enums/show-status.enum.ts`). If a clean type import is awkward, type `showStatus: string` and compare to `"continuing"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Development/personal/riven-ts && pnpm --filter @repo/riven exec vitest run lib/database/services/media-item/utilities/is-season-complete.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd ~/Development/personal/riven-ts
git add apps/riven/lib/database/services/media-item/utilities/is-season-complete.ts apps/riven/lib/database/services/media-item/utilities/is-season-complete.spec.ts
git commit -m "feat(core): add isSeasonComplete helper for season-pack decisions"
```

---

### Task 2: `preferSeasonPackStreams` torrent picker

**Files:**

- Create: `apps/riven/lib/message-queue/flows/process-media-item/steps/download/steps/rank-streams/utilities/prefer-season-pack-streams.ts`
- Test: `apps/riven/lib/message-queue/flows/process-media-item/steps/download/steps/rank-streams/utilities/prefer-season-pack-streams.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { preferSeasonPackStreams } from "./prefer-season-pack-streams.ts";

import type { RankedResult } from "@repo/util-rank-torrent-name";

const result = (
  hash: string,
  seasons: number[],
  episodes: number[],
  rank: number,
): RankedResult =>
  ({
    hash,
    rank,
    data: { seasons, episodes, resolution: "1080p" },
    fetch: true,
    failedChecks: new Set<string>(),
    scoreParts: {},
    levRatio: 1,
  }) as unknown as RankedResult;

describe("preferSeasonPackStreams", () => {
  it("keeps only season packs for the target season when packs exist", () => {
    const episode = result("ep", [2], [3], 500);
    const pack = result("pack", [2], [], 100);

    expect(
      preferSeasonPackStreams([episode, pack], 2).map((r) => r.hash),
    ).toEqual(["pack"]);
  });

  it("prefers a single-season pack over a multi-season box", () => {
    const box = result("box", [1, 2, 3], [], 900);
    const single = result("single", [2], [], 100);

    expect(
      preferSeasonPackStreams([box, single], 2).map((r) => r.hash),
    ).toEqual(["single", "box"]);
  });

  it("returns the full list unchanged when no pack exists (no regression)", () => {
    const a = result("a", [2], [3], 500);
    const b = result("b", [2], [4], 100);

    expect(preferSeasonPackStreams([a, b], 2).map((r) => r.hash)).toEqual([
      "a",
      "b",
    ]);
  });

  it("does not treat a pack for a different season as a match", () => {
    const otherPack = result("other", [5], [], 100);
    const episode = result("ep", [2], [3], 500);

    expect(
      preferSeasonPackStreams([otherPack, episode], 2).map((r) => r.hash),
    ).toEqual(["other", "ep"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Development/personal/riven-ts && pnpm --filter @repo/riven exec vitest run lib/message-queue/flows/process-media-item/steps/download/steps/rank-streams/utilities/prefer-season-pack-streams.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { RankedResult } from "@repo/util-rank-torrent-name";

/**
 * From RTN-ranked streams (already sorted best-first), prefer full-season packs
 * for `seasonNumber`. A pack carries the season but no specific episode. Among
 * packs, the most specific wins (a single-season pack beats a multi-season box);
 * ties keep the incoming rank order (Array.prototype.sort is stable).
 *
 * Returns the input unchanged when no pack exists, so the season still gets a
 * result and the existing `download.partial-success` -> fan-out flow completes
 * the remaining episodes. No regression versus the prior episode-only behavior.
 */
export function preferSeasonPackStreams(
  results: readonly RankedResult[],
  seasonNumber: number,
): RankedResult[] {
  const packs = results.filter(
    (r) =>
      r.data.episodes.length === 0 && r.data.seasons.includes(seasonNumber),
  );

  if (packs.length === 0) {
    return [...results];
  }

  return [...packs].sort(
    (a, b) => a.data.seasons.length - b.data.seasons.length,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Development/personal/riven-ts && pnpm --filter @repo/riven exec vitest run lib/message-queue/flows/process-media-item/steps/download/steps/rank-streams/utilities/prefer-season-pack-streams.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd ~/Development/personal/riven-ts
git add apps/riven/lib/message-queue/flows/process-media-item/steps/download/steps/rank-streams/utilities/prefer-season-pack-streams.ts apps/riven/lib/message-queue/flows/process-media-item/steps/download/steps/rank-streams/utilities/prefer-season-pack-streams.spec.ts
git commit -m "feat(core): add preferSeasonPackStreams torrent pack picker"
```

---

### Task 3: Update `shouldFanOutForProcessing` for smart-by-status

**Files:**

- Modify: `apps/riven/lib/database/services/media-item/utilities/should-fan-out-for-processing.ts`
- Modify (rewrite cases): `apps/riven/lib/database/services/media-item/utilities/should-fan-out-for-processing.spec.ts`

New signature drops `downloadStrategy` (shows now always fan out, which subsumes the old nzb-always rule) and adds `isSeasonComplete`.

- [ ] **Step 1: Rewrite the test to the new behavior**

Replace the file contents with:

```ts
import assert from "node:assert";
import { expect } from "vitest";

import { it } from "../../../../__tests__/test-context.ts";
import { shouldFanOutForProcessing } from "./should-fan-out-for-processing.ts";

it("does not fan out a movie", ({ indexedMovieContext: { indexedMovie } }) => {
  expect(
    shouldFanOutForProcessing({
      item: indexedMovie,
      isPartialRequest: false,
      preferSeasonPacks: false,
      isSeasonComplete: false,
    }),
  ).toBe(false);
});

it("always fans out a show to its seasons (ended or continuing)", ({
  scrapedShowContext: { scrapedShow },
}) => {
  for (const status of ["ended", "continuing"] as const) {
    scrapedShow.status = status;
    expect(
      shouldFanOutForProcessing({
        item: scrapedShow,
        isPartialRequest: false,
        preferSeasonPacks: false,
        isSeasonComplete: false,
      }),
    ).toBe(true);
  }
});

it("does NOT fan out a complete season (processed as a pack)", async ({
  scrapedShowContext: { scrapedShow },
}) => {
  const [season] = await scrapedShow.seasons.load();
  assert(season);

  expect(
    shouldFanOutForProcessing({
      item: season,
      isPartialRequest: false,
      preferSeasonPacks: false,
      isSeasonComplete: true,
    }),
  ).toBe(false);
});

it("fans out an airing/incomplete season to its episodes", async ({
  scrapedShowContext: { scrapedShow },
}) => {
  const [season] = await scrapedShow.seasons.load();
  assert(season);

  expect(
    shouldFanOutForProcessing({
      item: season,
      isPartialRequest: false,
      preferSeasonPacks: false,
      isSeasonComplete: false,
    }),
  ).toBe(true);
});

it("with preferSeasonPacks override, processes even an incomplete season as a pack", async ({
  scrapedShowContext: { scrapedShow },
}) => {
  const [season] = await scrapedShow.seasons.load();
  assert(season);

  expect(
    shouldFanOutForProcessing({
      item: season,
      isPartialRequest: false,
      preferSeasonPacks: true,
      isSeasonComplete: false,
    }),
  ).toBe(false);
});

it("fans out any item flagged as a partial request", ({
  indexedMovieContext: { indexedMovie },
}) => {
  expect(
    shouldFanOutForProcessing({
      item: indexedMovie,
      isPartialRequest: true,
      preferSeasonPacks: false,
      isSeasonComplete: false,
    }),
  ).toBe(true);
});
```

Note: if the `scrapedShowContext` season fixture is a special (number 0), use an explicit season instance or assert `season.number !== 0`; the special-season case is covered by Task 1 + the `isSpecial` guard below. Adjust the fixture access if the test-context exposes a season fixture directly.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Development/personal/riven-ts && pnpm --filter @repo/riven exec vitest run lib/database/services/media-item/utilities/should-fan-out-for-processing.spec.ts`
Expected: FAIL — type error on removed `downloadStrategy` / behavior mismatch.

- [ ] **Step 3: Rewrite the implementation**

```ts
import {
  type MediaItem,
  Season,
  Show,
} from "@repo/util-plugin-sdk/dto/entities";

/**
 * Decide whether an item fans out to its incomplete children when picked up for
 * processing, rather than being processed as a single unit.
 *
 * - Any partial request fans out (only the requested subset exists).
 * - A Show ALWAYS fans out to its seasons (we never grab a complete-series box;
 *   each season is decided on its own).
 * - A Season fans out to its episodes when it is a special, or it is incomplete
 *   (currently airing) and the `preferSeasonPacks` override is off. A complete
 *   season (or any season under the override) is processed as a unit so the
 *   scrape leaf can prefer a pack.
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Development/personal/riven-ts && pnpm --filter @repo/riven exec vitest run lib/database/services/media-item/utilities/should-fan-out-for-processing.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/Development/personal/riven-ts
git add apps/riven/lib/database/services/media-item/utilities/should-fan-out-for-processing.ts apps/riven/lib/database/services/media-item/utilities/should-fan-out-for-processing.spec.ts
git commit -m "feat(core): fan out shows to seasons and gate seasons on completeness"
```

---

### Task 4: Wire completeness into `getItemsToProcess`

**Files:**

- Modify: `apps/riven/lib/database/services/media-item/media-item.service.ts` (the `getItemsToProcess` method, around lines 30-58)

This is the caller that computes `isSeasonComplete` for Season items and calls `shouldFanOutForProcessing` with the new signature (no `downloadStrategy`). Validated by the existing service/integration tests plus the full gate.

- [ ] **Step 1: Update the method**

Add imports at the top of the file (alongside existing imports):

```ts
import { Season } from "@repo/util-plugin-sdk/dto/entities";

import { isSeasonComplete } from "./utilities/is-season-complete.ts";
```

Replace the fan-out block inside `getItemsToProcess` (currently passing `downloadStrategy`/`preferSeasonPacks`) with:

```ts
const { settings } = await import("../../../utilities/settings.ts");

let seasonComplete = false;

if (item instanceof Season) {
  const show = await item.getShow();
  const standardSeasons = await show.getStandardSeasons();
  const latestSeasonNumber = standardSeasons.length
    ? Math.max(...standardSeasons.map((season) => season.number))
    : item.number;

  seasonComplete = isSeasonComplete({
    seasonNumber: item.number,
    showStatus: show.status,
    latestSeasonNumber,
  });
}

if (
  shouldFanOutForProcessing({
    item,
    isPartialRequest: item.itemRequest.getProperty("isPartialRequest"),
    preferSeasonPacks: settings.preferSeasonPacks,
    isSeasonComplete: seasonComplete,
  })
) {
  return await services.downloaderService.getFanOutDownloadItems(id);
}

return [item];
```

- [ ] **Step 2: Type-check + run existing media-item service specs**

Run: `cd ~/Development/personal/riven-ts && pnpm --filter @repo/riven exec tsc --noEmit --project tsconfig.lib.json`
Expected: no errors (confirms the new signature and imports line up).

Run: `cd ~/Development/personal/riven-ts && pnpm --filter @repo/riven exec vitest run lib/database/services/media-item`
Expected: PASS (existing specs still green with the new call shape).

- [ ] **Step 3: Commit**

```bash
cd ~/Development/personal/riven-ts
git add apps/riven/lib/database/services/media-item/media-item.service.ts
git commit -m "feat(core): compute season completeness for the fan-out decision"
```

---

### Task 5: Apply pack preference in the torrent ranker

**Files:**

- Modify: `apps/riven/lib/message-queue/flows/process-media-item/steps/download/steps/rank-streams/rank-streams.processor.ts`
- Modify (add a case): `apps/riven/lib/message-queue/flows/process-media-item/steps/download/steps/rank-streams/rank-streams.processor.spec.ts`

Only seasons meant to be packs reach this processor (airing/special seasons fanned out earlier), so the rule is simply: if the item is a `Season`, prefer packs.

- [ ] **Step 1: Add a failing test**

Add to `rank-streams.processor.spec.ts` a case asserting that, for a `Season` item, a season-pack stream is returned ahead of / instead of a higher-ranked single-episode stream. Mirror the existing spec's harness in that file for building the job + streams (reuse its stream/`parsedData` fixture builders and the season fixture from the test-context). The assertion: the returned array's first element is the pack hash, and single-episode hashes are excluded when a pack exists.

- [ ] **Step 2: Run to verify it fails**

Run: `cd ~/Development/personal/riven-ts && pnpm --filter @repo/riven exec vitest run lib/message-queue/flows/process-media-item/steps/download/steps/rank-streams/rank-streams.processor.spec.ts`
Expected: FAIL — episode currently outranks the pack.

- [ ] **Step 3: Implement**

Add the import near the other utility import:

```ts
import { Season } from "@repo/util-plugin-sdk/dto/entities";

import { preferSeasonPackStreams } from "./utilities/prefer-season-pack-streams.ts";
```

(`ShowLikeMediaItem` and `Stream` are already imported; add `Season` to that entities import instead of a duplicate line if the linter prefers.)

Replace the final two statements (`const sortedTorrentsByResolution = ...; return sortedTorrentsByResolution;`) with:

```ts
const sortedTorrentsByResolution = bucketedTorrents.sort(
  sortByRankAndResolution,
);

if (item instanceof Season) {
  return preferSeasonPackStreams(sortedTorrentsByResolution, item.number);
}

return sortedTorrentsByResolution;
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd ~/Development/personal/riven-ts && pnpm --filter @repo/riven exec vitest run lib/message-queue/flows/process-media-item/steps/download/steps/rank-streams/rank-streams.processor.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/Development/personal/riven-ts
git add apps/riven/lib/message-queue/flows/process-media-item/steps/download/steps/rank-streams/rank-streams.processor.ts apps/riven/lib/message-queue/flows/process-media-item/steps/download/steps/rank-streams/rank-streams.processor.spec.ts
git commit -m "feat(core): prefer season packs on the torrent path for season items"
```

---

### Task 6: Full env-free gate

- [ ] **Step 1: Run the full dev gate**

Run (from the wilcoxunraid-stack repo): `cd ~/Development/personal/wilcoxunraid-stack && bash scripts/riven-dev-verify.sh`
Expected: `all checks passed` — check-types + lint + test green across all packages (no env), matching the 32-task baseline.

- [ ] **Step 2: Push the branch**

```bash
cd ~/Development/personal/riven-ts
git push -u origin feat/smart-season-packs
```

---

## Self-Review

- **Spec coverage:** shows-always-fan-out (Task 3), complete->pack / airing->episodes / specials->episodes / partial->missing (Tasks 1+3+4), torrent pack preference (Tasks 2+5), NZB unchanged (covered: airing seasons fan out before reaching nzb-scrape; complete ones already pack-then-fallback), `preferSeasonPacks` override (Task 3), completeness heuristic (Task 1), tests mirror existing style (all tasks), gate green (Task 6). No gaps.
- **Type consistency:** `isSeasonComplete({ seasonNumber, showStatus, latestSeasonNumber })` used identically in Task 1 and Task 4. `preferSeasonPackStreams(results, seasonNumber)` identical in Task 2 and Task 5. `shouldFanOutForProcessing({ item, isPartialRequest, preferSeasonPacks, isSeasonComplete })` identical in Task 3 and Task 4.
- **Placeholder scan:** Tasks 1-4 carry complete code. Task 5's test step describes reusing the existing processor spec's fixtures rather than inlining a fabricated harness (the real fixture builders must match that file); implementation code is complete.
