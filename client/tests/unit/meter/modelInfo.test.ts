import { describe, expect, it } from "vitest";
import { listEcologitsModels } from "@shared/footprint/ecologits";
import { MODEL_ROLES, ZONE_NAMES } from "@/meter/modelInfo";

describe("meter model info", () => {
  it.each(listEcologitsModels().map(([id, model]) => ({ id, model })))(
    "describes $id's role and place for visitors",
    ({ id, model }) => {
      expect(MODEL_ROLES[id]).toBeDefined();
      expect(ZONE_NAMES[model.datacenterZone]).toBeDefined();
    },
  );
});
