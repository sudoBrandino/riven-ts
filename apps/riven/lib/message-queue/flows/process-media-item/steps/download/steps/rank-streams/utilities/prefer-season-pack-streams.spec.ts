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
