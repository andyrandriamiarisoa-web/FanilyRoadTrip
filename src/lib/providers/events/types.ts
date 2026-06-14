import type { Opportunity } from "@/lib/synthesis/types";
import type { BBox } from "@/lib/synthesis/adapters";

export type { BBox };
export interface DateRange { start: string; end: string }
export interface EventsProvider { search(bbox: BBox, range: DateRange): Promise<Opportunity[]>; }
