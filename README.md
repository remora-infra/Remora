# 🐟 Remora: The Neural Memory Layer

**Remora** is a high-performance [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that acts as a **Shared Subconscious Layer** for your AI ecosystem.

In a traditional AI setup, agents are silos-they exist in a vacuum, perform their task, and vanish. **Remora** changes the narrative. It provides a persistent, semantic memory bridge that allows multiple agents to share context and facts **without ever having to talk to each other directly.**

---

## 🌌 The Narrative: Inter-Agent Continuity

Imagine you have two agents:
1.  **The Clerk:** An organized archivist that listens to your messy thoughts and organizes them.
2.  **The Brain:** A high-level strategist focused on solving complex problems.

The **Clerk** and the **Brain** don't share a chat window. They might not even use the same LLM provider. **Remora is the layer beneath them.** 

When the **Clerk** saves a fact about your project, it is woven into the Remora Layer. When the **Brain** later encounters a problem related to that project, it "recollects" the relevant memory through Remora's semantic search. It creates a world where your agents don't just work-they remember.

---

## 🏗 Leveraging Archestra.ai: The Central Nervous System

While **Remora** provides the shared memory, **[Archestra.ai](https://archestra.ai)** provides the infrastructure that allows these agents to exist and stay synchronized.

### 1. Agent-to-Agent (A2A) Handover
Archestra orchestrates the "Handover" between your Main Assistant and your specialized agents. One agent can "Write" to Remora, and another can "Read" from it, managed entirely by Archestra’s workflow engine.

### 2. Secure Identity & RBAC
Archestra acts as a security proxy. It automatically maps the correct `user_id` to the Remora request, ensuring that memories are private, secure, and accessible only by the right agents.

### 3. Unified LLM Proxy
Remora is built with **StreamableHTTP**, specifically optimized for Archestra's LLM Proxy. Whether your agent uses Gemini, OpenAI, or Claude, they all interact with Remora through a single, stable interface.

---

##  Core Features

- **Server-Side Vectorization:** Agents send plain English. Remora handles the complex math of turning text into vectors locally using `@xenova/transformers` (`all-MiniLM-L6-v2`).
- **Semantic Retrieval:** Find facts based on meaning and context, not just keyword matching.
- **Hybrid Storage:** Combines the persistence of **MongoDB** with the speed of an in-memory **Local Vector Index**.
- **Zero-Knowledge Architecture:** Agents don't need to know who saved a fact or how it's stored; they simply "remember" via the tools.

---

## 🛠 Tools Provided

### 🛣 `add_memory`
*Used by Archivist/Clerk agents to deposit facts.*
- **Input:** Natural language text.
- **Action:** Remora automatically vectorizes and stores the fact in the collective subconscious.

### 🛣 `search_memories`
*Used by Strategist/Brain agents to recall context.*
- **Input:** Natural language questions or topics.
- **Action:** Remora performs a semantic similarity search to find the most relevant truths across the history of all connected agents.

---
