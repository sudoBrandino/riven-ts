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
