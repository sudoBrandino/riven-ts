import { registerEnumType } from "type-graphql";
import z from "zod";

// Mirrors the subset of BullMQ's `JobType` exposed by the admin job list
// filter. `delayed`, `paused`, `prioritized`, `waiting-children`, `repeat`,
// and `wait` are intentionally omitted: counts for those still surface via
// `QueueOverview`, but the per-job list view only filters by the four
// primary lifecycle buckets.
export const JobStatus = z.enum(["waiting", "active", "completed", "failed"]);

export type JobStatus = z.infer<typeof JobStatus>;

registerEnumType(JobStatus.enum, {
  name: "JobStatus",
  description:
    "BullMQ job lifecycle states exposed by the admin query surface. Maps directly onto bullmq's `JobType` for `Queue#getJobs(types)` calls.",
});
