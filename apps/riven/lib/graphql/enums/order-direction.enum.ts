import { registerEnumType } from "type-graphql";
import z from "zod";

// Sort direction used alongside `MediaItemOrderField` (and any future
// orderBy-bearing query). Uppercase to match the GraphQL convention seen in
// Relay-style schemas (`ASC`/`DESC`) rather than the lowercase mikro-orm
// `QueryOrder` enum values.
export const OrderDirection = z.enum(["ASC", "DESC"]);

export type OrderDirection = z.infer<typeof OrderDirection>;

registerEnumType(OrderDirection.enum, {
  name: "OrderDirection",
  description: "Sort direction for queries that accept an `orderBy` argument.",
});
