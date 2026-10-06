import { z } from "zod";

export const memoryTypeSchema = z.enum([
  "working",
  "episodic",
  "semantic",
  "project",
  "goal",
  "preference",
  "execution",
]);
export const memoryStatusSchema = z.enum([
  "candidate",
  "validated",
  "stored",
  "archived",
  "deleted",
]);
export type MemoryStatus = z.infer<typeof memoryStatusSchema>;

export const memoryRecordSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  type: memoryTypeSchema,
  content: z.string().trim().min(1).max(100_000),
  sourceType: z.enum(["user", "model", "tool", "document", "system"]),
  sourceId: z.string().min(1).max(255),
  sourceTimestamp: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  confidence: z.number().min(0).max(1),
  importance: z.number().min(0).max(1),
  sensitivity: z.enum(["public", "personal", "confidential", "restricted"]),
  scope: z.enum(["conversation", "project", "owner"]),
  status: memoryStatusSchema,
  verified: z.boolean(),
  expiresAt: z.string().datetime().nullable(),
  embeddingId: z.string().uuid().nullable(),
});
export type MemoryRecord = z.infer<typeof memoryRecordSchema>;

const lifecycle: Readonly<Record<MemoryStatus, readonly MemoryStatus[]>> = {
  candidate: ["validated", "deleted"],
  validated: ["stored", "deleted"],
  stored: ["validated", "archived", "deleted"],
  archived: ["stored", "deleted"],
  deleted: [],
};

export function transitionMemory(
  memory: MemoryRecord,
  next: MemoryStatus,
  now: Date,
): MemoryRecord {
  if (!lifecycle[memory.status].includes(next)) {
    throw new Error(`Invalid memory transition: ${memory.status} -> ${next}`);
  }
  if (next === "stored" && (!memory.verified || memory.confidence < 0.5)) {
    throw new Error("Only verified, sufficiently confident memories may be stored");
  }
  return memoryRecordSchema.parse({
    ...memory,
    status: next,
    content: next === "deleted" ? "[deleted]" : memory.content,
    embeddingId: next === "deleted" ? null : memory.embeddingId,
    updatedAt: now.toISOString(),
  });
}

export interface RetrievalCandidate {
  memory: MemoryRecord;
  semanticScore: number;
}

export function selectMemories(
  candidates: readonly RetrievalCandidate[],
  ownerId: string,
  projectId: string | null,
  limit: number,
): MemoryRecord[] {
  return candidates
    .filter(({ memory }) => memory.ownerId === ownerId)
    .filter(({ memory }) => memory.status === "stored")
    .filter(({ memory }) => memory.projectId === null || memory.projectId === projectId)
    .filter(({ memory }) => memory.expiresAt === null || Date.parse(memory.expiresAt) > Date.now())
    .sort(
      (a, b) =>
        b.semanticScore * b.memory.confidence * b.memory.importance -
        a.semanticScore * a.memory.confidence * a.memory.importance,
    )
    .slice(0, Math.max(0, limit))
    .map(({ memory }) => memory);
}
