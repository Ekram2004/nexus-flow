# NexusFlow: Intelligent Financial Reconciliation Agent

NexusFlow is an autonomous, AI-driven reconciliation engine designed to automate the matching of fragmented financial data. By combining **semantic search (pgvector)** and **Agentic AI reasoning**, NexusFlow reduces manual reconciliation time by up to 80%.

## 🚀 Key Architecture
NexusFlow uses a state-driven orchestrator to manage the reconciliation lifecycle:
1. **Ingestion:** High-throughput batch or single webhook ingestion channels.
2. **Retrieval (RAG):** Local semantic similarity search via `Transformers.js` and `pgvector` to identify raw candidates.
3. **Deterministic Filter:** High-speed preprocessing layer validating exact transactional matching boundaries (amounts & date tolerances) to minimize false positives.
4. **Cognitive Reasoning:** Google GenAI-powered evaluation using structural JSON models (`gemini-2.5-flash`) to resolve complex transactional anomalies.
5. **Asynchronous Background Processing:** Decoupled in-memory non-blocking worker queue minimizing HTTP ingestion latencies.
6. **Finalization:** ACID-compliant database state transitions marking matched pairs, alongside outbound operation alerting blocks.

## 🛠 Tech Stack
- **Runtime:** Node.js (TypeScript via `tsx` on `node:24-slim`)
- **Database:** PostgreSQL + `pgvector` (via Prisma ORM & raw `pg` pool driver)
- **AI/LLM:** Google GenAI SDK (`gemini-2.5-flash`), `Transformers.js` (Local Neural Embeddings)
- **API Framework:** Fastify
- **Containerization:** Docker + Docker Compose

## 📋 Features
- **Semantic Matching:** Goes beyond exact string matching to identify related transactions contextually.
- **Deterministic Safeguards:** Stops false positives before invoking LLM endpoints, saving compute overhead.
- **Interactive Multi-Agent Dashboard:** Dark-mode operator viewport featuring dynamic, real-time client-side fuzzy text queries and live metric background AJAX polling status loops.
- **Data Portability:** Isolated comma-separated value spreadsheet export modules for financial audit streams.
- **Outbound Exception Alerts:** Direct markdown webhooks pushing exception notifications straight to operations warning channels.
- **Audit-Ready Logging:** Measures operational human resolution execution velocities in seconds.

## ⚙️ Getting Started

### Local Standalone Deployment
1. Clone the repository.
2. Configure your `.env` file with your credentials:
   ```env
   DATABASE_URL="postgresql://nexus_admin:secure_db_password_2026@localhost:5432/nexusflow_ledger?schema=public"
   RECON_API_KEY="nexus_secret_secure_key_2026"
   GEMINI_API_KEY="AIzaSyYourGeminiKeyHere"
   NOTIFICATION_WEBHOOK_URL="https://discord.com..."
   ```
3. Sync and push your database schema:
   ```bash
   npx prisma db push
   ```
4. Run the seed script to prepare test assets:
   ```bash
   npx tsx src/seed.ts
   ```
5. Run the automated regression testing suite:
   ```bash
   npx tsx src/test-regression.ts
   ```
6. Spin up the Fastify API engine web application server:
   ```bash
   npx tsx src/server.ts
   ```

### Containerized Infrastructure Deployment (Docker Compose)
To launch your complete system alongside a self-contained isolated PostgreSQL table instance with prepackaged `pgvector` dependencies:
1. Update your `.env` credentials or match variables inside `docker-compose.yml`.
2. Boot up the architecture grid array:
   ```bash
   docker compose up --build -d
   ```
3. Watch the Node app logs compile and listen on port `3000`:
   ```bash
   docker compose logs -f app
   ```

## 🩺 System Inspection Endpoints
- **Visual Operations Workspaces:** `GET http://localhost:3000/dashboard`
- **Telemetry Worker Stats:** `GET http://localhost:3000/queue/status` (Requires `X-API-KEY` header)
- **Container Health Check Probe:** `GET http://localhost:3000/health` (Public liveness verification)
