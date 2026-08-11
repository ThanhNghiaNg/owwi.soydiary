import type { BabyDocument } from "./baby.model";
import type { BabyDto } from "./baby.dto";
export function toBabyDto(doc: BabyDocument): BabyDto {
  if (!doc._id) throw new Error("Baby document has no id");
  return { id: doc._id.toHexString(), name: doc.name, birthDate: doc.birthDate, createdAt: doc.createdAt.toISOString(), updatedAt: doc.updatedAt.toISOString() };
}
