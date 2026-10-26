-- Embeddings move from OpenAI's text-embedding-3-small to NVIDIA's Nemotron (nemotron-3.5-embed-1b,
-- 1536 of its 2048 dimensions). The old vectors live in another space, so a search would compare
-- across the two: clear them, and the worker gives every passage a new one at start-up.
DELETE FROM "embedding_cache";--> statement-breakpoint
UPDATE "passages" SET "embedding" = NULL WHERE "embedding" IS NOT NULL;
