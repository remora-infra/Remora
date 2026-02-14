import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { memoryCollection } from "../db/mongo";
import { vectorIndex } from "../vector";

export type MemoryScope = "global" | "agent";


export async function registerMcpTools(server: McpServer) {
  // Add Memory (ciphertext + embedding)
  server.tool(
    "add_memory",
    {
      user_id: z.string().describe("User owner of the memory"),
      agent_id: z.string().optional().describe("Agent creating the memory"),
      scope: z.enum(["global", "agent"]).describe("Memory scope"),
      encrypted_text: z.string().describe("Ciphertext (SDK encrypted)"),
      embedding: z.array(z.number()).min(1).describe("Vector embedding (SDK generated)"),
      embedding_model: z.string().optional().describe("Embedding model identifier (client-provided)")
    },
    async (args) => {
      const memory_id = uuidv4();

      const doc = {
        memory_id,
        user_id: args.user_id,
        agent_id: args.agent_id ?? null,
        scope: args.scope as MemoryScope,
        encrypted_text: args.encrypted_text,
        embedding: args.embedding,
        embedding_model: args.embedding_model ?? "client",
        embedding_dim: args.embedding.length,
        created_at: new Date()
      };

      await memoryCollection().insertOne(doc);
      vectorIndex.upsert(memory_id, args.embedding);

      return {
        content: [{ type: "text", text: JSON.stringify({ memory_id }) }]
      };
    }
  );

  // Search Memories
  server.tool(
    "search_memories",
    {
      user_id: z.string().describe("User owner"),
      agent_id: z.string().optional().describe("Agent requesting memory"),
      query_embedding: z.array(z.number()).min(1).describe("Query embedding (SDK generated)"),
      top_k: z.number().int().min(1).max(50).optional().default(5)
    },
    async (args) => {
      const topK = args.top_k ?? 5;

      // 1) Search local vector index (semantic)
      const ranked = vectorIndex.search(args.query_embedding, topK);
      const rankedIds = ranked.map(r => r.memory_id);

      if (rankedIds.length === 0) {
        return { content: [{ type: "text", text: JSON.stringify({ memories: [] }) }] };
      }

      // 2) Enforce scope rules in Mongo
      // Agent sees: global + its own agent-scoped memories
      const scopeFilter = {
        user_id: args.user_id,
        memory_id: { $in: rankedIds },
        $or: [
          { scope: "global" },
          { scope: "agent", agent_id: args.agent_id ?? null }
        ]
      };

      const docs = await memoryCollection().find(scopeFilter).toArray();

      // Preserve semantic order
      const docMap = new Map(docs.map(d => [d.memory_id, d]));
      const ordered = rankedIds.map(id => docMap.get(id)).filter(Boolean) as any[];

      // Return ciphertext only 
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            memories: ordered.map(m => ({
              memory_id: m.memory_id,
              encrypted_text: m.encrypted_text,
              scope: m.scope,
              agent_id: m.agent_id,
              created_at: m.created_at,
              embedding_model: m.embedding_model
            }))
          })
        }]
      };
    }
  );

  // Hard delete
  server.tool(
    "delete_memory",
    {
      user_id: z.string(),
      memory_id: z.string()
    },
    async (args) => {
      await memoryCollection().deleteOne({ user_id: args.user_id, memory_id: args.memory_id });
      vectorIndex.delete(args.memory_id);
      return { content: [{ type: "text", text: JSON.stringify({ deleted: true }) }] };
    }
  );
}

/**
 * REST Routes (so you can test in Thunder Client)
 * Same behavior as tools.
 */
import type { FastifyInstance } from "fastify";

export async function memoryRoutes(app: FastifyInstance) {
  // STORE
  app.post("/v1/memories", async (req, reply) => {
    const body = req.body as any;

    const required = ["user_id", "scope", "encrypted_text", "embedding"];
    for (const k of required) {
      if (!(k in body)) return reply.code(400).send({ error: `Missing ${k}` });
    }
    if (!Array.isArray(body.embedding) || body.embedding.length === 0) {
      return reply.code(400).send({ error: "embedding must be number[]" });
    }

    const memory_id = uuidv4();
    const doc = {
      memory_id,
      user_id: body.user_id,
      agent_id: body.agent_id ?? null,
      scope: body.scope,
      encrypted_text: body.encrypted_text,
      embedding: body.embedding,
      embedding_model: body.embedding_model ?? "client",
      embedding_dim: body.embedding.length,
      created_at: new Date()
    };

    await memoryCollection().insertOne(doc);
    vectorIndex.upsert(memory_id, body.embedding);

    return reply.send({ memory_id });
  });

  // SEARCH (requires query_embedding)
  app.post("/v1/search", async (req, reply) => {
    const body = req.body as any;

    if (!body.user_id) return reply.code(400).send({ error: "user_id required" });
    if (!Array.isArray(body.query_embedding) || body.query_embedding.length === 0) {
      return reply.code(400).send({ error: "query_embedding must be number[]" });
    }

    const topK = Math.max(1, Math.min(body.top_k ?? 5, 50));

    const ranked = vectorIndex.search(body.query_embedding, topK);
    const rankedIds = ranked.map((r) => r.memory_id);

    if (rankedIds.length === 0) return reply.send({ memories: [] });

    const scopeFilter = {
      user_id: body.user_id,
      memory_id: { $in: rankedIds },
      $or: [
        { scope: "global" },
        { scope: "agent", agent_id: body.agent_id ?? null }
      ]
    };

    const docs = await memoryCollection().find(scopeFilter).toArray();
    const docMap = new Map(docs.map(d => [d.memory_id, d]));
    const ordered = rankedIds.map(id => docMap.get(id)).filter(Boolean) as any[];

    return reply.send({
      memories: ordered.map(m => ({
        memory_id: m.memory_id,
        encrypted_text: m.encrypted_text,
        scope: m.scope,
        agent_id: m.agent_id,
        created_at: m.created_at,
        embedding_model: m.embedding_model
      }))
    });
  });

  // DELETE
  app.delete("/v1/memories/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const user_id = (req.query as any)?.user_id;
    if (!user_id) return reply.code(400).send({ error: "user_id required in query" });

    await memoryCollection().deleteOne({ user_id, memory_id: id });
    vectorIndex.delete(id);

    return reply.send({ deleted: true });
  });
}
