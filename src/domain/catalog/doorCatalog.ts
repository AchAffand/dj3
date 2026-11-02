import catalogSeed from "./door-catalog.json";
import type { DoorModel } from "./types";

export const doorCatalog = new Map<number, DoorModel>(
  catalogSeed.models.map((model) => [model.code, model as DoorModel]),
);
