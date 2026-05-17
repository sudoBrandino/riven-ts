import { JSONObjectResolver } from "graphql-scalars";
import { Field, Float, ID, Int, ObjectType } from "type-graphql";

@ObjectType({
  description:
    "A single BullMQ job projected for the admin query surface. Timestamps are unix-ms floats to match BullMQ's `Job` shape and avoid Int32 overflow.",
})
export class QueueJob {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  name!: string;

  // BullMQ stores `job.data` as a user-defined opaque payload. Surface as
  // nullable JSON so callers can distinguish a real `null` payload from one
  // that was simply never set.
  @Field(() => JSONObjectResolver, { nullable: true })
  data!: Record<string, unknown> | null;

  @Field(() => Int)
  attemptsMade!: number;

  @Field(() => String, { nullable: true })
  failedReason!: string | null;

  @Field(() => Float, { nullable: true })
  processedOn!: number | null;

  @Field(() => Float, { nullable: true })
  finishedOn!: number | null;

  @Field(() => Float, {
    description: "Unix epoch milliseconds the job was enqueued.",
  })
  timestamp!: number;
}

@ObjectType()
export class QueueJobEdge {
  @Field(() => QueueJob)
  node!: QueueJob;
}

@ObjectType({
  description:
    "A page of queue jobs plus the total count for the requested `(queue, status)` filter.",
})
export class QueueJobsPage {
  @Field(() => [QueueJobEdge])
  edges!: QueueJobEdge[];

  @Field(() => Int)
  total!: number;
}
