import { describe, it, expect } from "vitest";
import { curateSlot } from "./curation";
import { REFERENCE_REQUEST } from "@/data/synthesis-fixtures";

describe("curateSlot", () => {
  it("classe sans exclure et privilégie l'intérieur sous canicule", async () => {
    const near = REFERENCE_REQUEST.anchors[0].location;
    const ranked = curateSlot("canicule", near, REFERENCE_REQUEST.opportunities);
    expect(ranked.length).toBe(REFERENCE_REQUEST.opportunities.length); // rien n'est filtré
    const firstIndoor = ranked.findIndex(o => o.indoor === true);
    const firstOutdoor = ranked.findIndex(o => o.indoor === false);
    if (firstIndoor !== -1 && firstOutdoor !== -1) expect(firstIndoor).toBeLessThan(firstOutdoor);
  });
});
