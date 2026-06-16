# NexusFlow: Intelligent Financial Reconciliation Agent

NexusFlow is an autonomous, AI-driven reconciliation engine designed to automate the matching of fragmented financial data. By combining **semantic search (pgvector)** and **Agentic AI reasoning**, NexusFlow reduces manual reconciliation time by up to 80%.

## 🚀 Key Architecture
NexusFlow uses a state-driven orchestrator to manage the reconciliation lifecycle:
1. **Ingestion:** Raw data validation and normalization.
2. **Retrieval (RAG):** Local semantic similarity search via `Transformers.js` and `pgvector` to identify raw candidates.
3. **Deterministic Filter:** High-speed preprocessing layer validating exact transactional matching boundaries (amounts & date tolerances) to minimize false positives.
4. **Cognitive Reasoning:** Google GenAI-powered evaluation using structural JSON models to resolve complex transactional anomalies.
5. **Finalization:** ACID-compliant database state transitions marking matched pairs.

## 🛠 Tech Stack
- **Runtime:** Node.js (TypeScript via `tsx`)
- **Database:** PostgreSQL + `pgvector` (via Prisma ORM & raw `pg` pool driver)
- **AI/LLM:** Google GenAI SDK (`gemini-2.5-flash`), `Transformers.js` (Local Embeddings)
- **API Framework:** Fastify

## 📋 Features
- **Semantic Matching:** Goes beyond exact string matching to identify related transactions contextually.
- **Deterministic Safeguards:** Stops false positives before invoking LLM endpoints, saving compute overhead.
- **Audit-Ready:** Every reconciliation decision is tracked, logged, and completely traceable.
- **Cost-Optimized:** Direct structural JSON schema output configuration prevents tokens from being wasted on markdown code fences.

## ⚙️ Getting Started
1. Clone the repository.
2. Configure your `.env` file with your credentials:
   ```env
   DATABASE_URL="postgresql://..."
   GEMINI_API_KEY="AIzaSy..."
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
