import { describe, expect, it } from "vitest";
import { featureRegistry } from "./features";

describe("feature registry", () => {
  it("registers the initial pages once and every route has a page component", () => {
    expect(featureRegistry.map((feature) => feature.id)).toEqual([
      "calculator",
      "projects",
      "formula-master",
      "budget-master",
    ]);
    expect(new Set(featureRegistry.map((feature) => feature.path)).size).toBe(
      featureRegistry.length,
    );
    expect(featureRegistry.every((feature) => feature.component)).toBe(true);
  });
});
