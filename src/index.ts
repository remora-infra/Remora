import "dotenv/config";
import Fastify from "fastify";
import { randomUUID } from "crypto";
import { connectMongo, memoryCollection } from "./db/mongo";
import { vectorIndex } from "./vector";


import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { InMemoryEventStore } from '@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { pipeline } from '@xenova/transformers';

const app = Fastify({ logger: true });
const streamableConnections = new Map<string, StreamableHTTPServerTransport>();

// --- Initialize Local Embedding Model ---
let embedder: any;
async function initEmbedder() {
  embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
}

async function rebuildLocalVectorIndex() {
  vectorIndex.clear();
  const docs = await memoryCollection().find({}).toArray();
  for (const d of docs as any[]) {
    if (Array.isArray(d.embedding) && d.embedding.length > 0) {
      vectorIndex.upsert(d.memory_id, d.embedding);
    }
  }
}

app.route({
  method: ["GET", "POST"],
  url: "/mcp",
  handler: async (request, reply) => {
    const sessionId = request.headers["mcp-session-id"] as string | undefined;
    try {
      let transport: StreamableHTTPServerTransport | undefined;
      if (sessionId && streamableConnections.has(sessionId)) {
        transport = streamableConnections.get(sessionId);
        if (transport) {
          await transport.handleRequest(request.raw, reply.raw, request.body as any);
          return;
        }
      }

      if (request.method === "POST" && request.body && (request.body as any).method === "initialize") {
        const eventStore = new InMemoryEventStore();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          eventStore,
          onsessioninitialized: (sid) => { streamableConnections.set(sid, transport!); },
        });

        const mcpServer = new Server({ name: "remora", version: "1.0.0" }, { capabilities: { tools: {} } });

        // 1. TOOL DEFINITIONS (Now accepting TEXT strings)
        mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
          tools: [
            {
              name: "add_memory",
              description: "Saves a fact. The server handles embedding automatically.",
              inputSchema: {
                type: "object",
                properties: {
                  user_id: { type: "string" },
                  text: { type: "string", description: "The fact to remember" },
                  scope: { type: "string", enum: ["global", "agent"] }
                },
                required: ["user_id", "text", "scope"]
              }
            },
            {
              name: "search_memories",
              description: "Finds facts by searching the meaning of your query text.",
              inputSchema: {
                type: "object",
                properties: {
                  user_id: { type: "string" },
                  query_text: { type: "string", description: "What are you looking for?" },
                  top_k: { type: "number", default: 5 }
                },
                required: ["user_id", "query_text"]
              }
            }
          ]
        }));

        // 2. TOOL LOGIC (Handling embedding internally)
        mcpServer.setRequestHandler(CallToolRequestSchema, async (req) => {
          const args = req.params.arguments as any;

          if (req.params.name === "add_memory") {
            // Generate embedding on the server
            const output = await embedder(args.text, { pooling: 'mean', normalize: true });
            const vector = Array.from(output.data) as number[];

            const memory_id = randomUUID();
            await memoryCollection().insertOne({
              memory_id,
              user_id: args.user_id,
              text: args.text, // Saving as plaintext for this test
              embedding: vector,
              created_at: new Date()
            });
            vectorIndex.upsert(memory_id, vector);
            return { content: [{ type: "text", text: "Memory saved successfully." }] };
          }

          if (req.params.name === "search_memories") {
            // Generate embedding for the search query
            const output = await embedder(args.query_text, { pooling: 'mean', normalize: true });
            const queryVector = Array.from(output.data) as number[];

            const ranked = vectorIndex.search(queryVector, args.top_k || 5);
            const ids = ranked.map(r => r.memory_id);

            const docs = await memoryCollection().find({ memory_id: { $in: ids } }).toArray();
            return {
              content: [{
                type: "text",
                text: JSON.stringify(docs.map(d => ({ fact: d.text, when: d.created_at })))
              }]
            };
          }
          throw new Error("Tool not found");
        });

        await mcpServer.connect(transport);
        await transport.handleRequest(request.raw, reply.raw, request.body as any);
        return;
      }
      if (request.method === "GET") return reply.send({ status: "ready" });
    } catch (error) {
      return reply.code(500).send({ error: String(error) });
    }
  }
});

async function main() {
  await connectMongo();
  await initEmbedder();
  await rebuildLocalVectorIndex();
  await app.listen({ port: 8080, host: "0.0.0.0" });
}
main().catch(console.error);