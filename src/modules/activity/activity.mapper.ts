import type { ActivityDocument } from "./activity.model";
import type { ActivityDto } from "./activity.dto";
export function toActivityDto(doc: ActivityDocument): ActivityDto {
  if (!doc._id) throw new Error("Activity document has no id");
  const { _id, babyId, ownerId: _ownerId, createdAt, updatedAt, ...input } = doc;
  return { ...input, id: _id.toHexString(), babyId: babyId.toHexString(), createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() } as ActivityDto;
}
