import { z } from "zod";

const LatLng = z.object({ lat: z.number(), lng: z.number() });
const SourceStatus = z.enum(["seed", "estimated", "verified"]);
const Category = z.enum(["museum","park","attraction","water","playground","food","coworking","viewpoint","event","people","other"]);

const Opportunity = z.object({
  id: z.string(), title: z.string(), category: Category, location: LatLng,
  score: z.number().min(0).max(1), durationMin: z.number().positive(),
  timeWindow: z.object({ start: z.string(), end: z.string() }).optional(),
  indoor: z.boolean().optional(), babyFriendly: z.boolean().optional(),
  source: z.string(), sourceStatus: SourceStatus,
});
const Person = Opportunity.extend({
  category: z.literal("people"),
  availability: z.array(z.object({ start: z.string(), end: z.string() })).optional(),
});
const Anchor = z.object({
  id: z.string(), kind: z.literal("event"), title: z.string(), location: LatLng,
  start: z.string(), end: z.string(), source: z.string(), sourceStatus: SourceStatus,
});

export const SynthesisRequestSchema = z.object({
  anchors: z.array(Anchor).min(1),
  opportunities: z.array(Opportunity),
  people: z.array(Person).optional(),
  window: z.object({
    origin: LatLng, earliestStart: z.string(), latestEnd: z.string(),
    minNights: z.number().int().positive(), maxNights: z.number().int().positive(),
  }),
  constraints: z.object({
    babyPauseEveryMin: z.number().positive(), babyPauseDurationMin: z.number().positive(),
    maxDrivePerDayMin: z.number().positive(),
    workDays: z.array(z.number().int().min(1).max(7)),
    workStart: z.string(), workEnd: z.string(),
    caniculeNoDrive: z.object({ start: z.string(), end: z.string() }),
  }),
  themeCategory: Category.optional(),
});
