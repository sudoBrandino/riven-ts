import { registerEnumType } from "type-graphql";
import z from "zod";

// Columns the `mediaItems` query accepts for `orderBy`. Restricted to a fixed
// allowlist so the resolver can map directly to a typed mikro-orm
// `QueryOrderMap` without exposing arbitrary entity properties to clients.
export const MediaItemOrderField = z.enum([
  "createdAt",
  "updatedAt",
  "indexedAt",
  "scrapedAt",
  "releaseDate",
  "title",
  "year",
]);

export type MediaItemOrderField = z.infer<typeof MediaItemOrderField>;

registerEnumType(MediaItemOrderField.enum, {
  name: "MediaItemOrderField",
  description:
    "Allowlisted columns clients may pass to `mediaItems(orderBy:)`. Mirrors a subset of `MediaItem` timestamp and identifying fields.",
});
