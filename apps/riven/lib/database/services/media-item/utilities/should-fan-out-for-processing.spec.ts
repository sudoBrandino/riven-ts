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

it("does NOT fan out a complete season (processed as a pack)", ({ season }) => {
  season.number = 2;

  expect(
    shouldFanOutForProcessing({
      item: season,
      isPartialRequest: false,
      preferSeasonPacks: false,
      isSeasonComplete: true,
    }),
  ).toBe(false);
});

it("fans out an airing/incomplete season to its episodes", ({ season }) => {
  season.number = 2;

  expect(
    shouldFanOutForProcessing({
      item: season,
      isPartialRequest: false,
      preferSeasonPacks: false,
      isSeasonComplete: false,
    }),
  ).toBe(true);
});

it("fans out a special season to its episodes regardless of overrides", ({
  season,
}) => {
  season.number = 0;

  expect(
    shouldFanOutForProcessing({
      item: season,
      isPartialRequest: false,
      preferSeasonPacks: true,
      isSeasonComplete: true,
    }),
  ).toBe(true);
});

it("with preferSeasonPacks override, processes even an incomplete season as a pack", ({
  season,
}) => {
  season.number = 2;

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
