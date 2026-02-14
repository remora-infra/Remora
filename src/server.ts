import Fastify from "fastify";
import { memoryRoutes } from "./routes/memory";

export function createServer() {
  const app = Fastify({ logger: true });

  app.register(memoryRoutes);

  return app;
}
