# NexusFlow: Intelligent Financial Reconciliation Agent

NexusFlow is an autonomous, AI-driven reconciliation engine designed to automate the matching of fragmented financial data. By leveraging **semantic search (pgvector)** and **Agentic AI reasoning**, NexusFlow reduces manual reconciliation time by up to 80%.

## 🚀 Key Architecture
NexusFlow uses a state-driven orchestrator to manage the reconciliation lifecycle:
1. **Ingestion:** Raw data validation and normalization.
2. **Retrieval (RAG):** Semantic similarity search via `pgvector` to find candidate matches.
3. **Reasoning:** OpenAI-powered analysis to verify transaction matches.
4. **Finalization:** ACID-compliant database updates.



## 🛠 Tech Stack
- **Runtime:** Node.js (TypeScript)
- **Database:** PostgreSQL + pgvector
- **AI/LLM:** LangGraph, OpenAI GPT-4o-mini
- **API Framework:** Fastify

## 📋 Features
- **Semantic Matching:** Goes beyond exact string matching to identify related transactions.
- **Audit-Ready:** Every reconciliation decision is logged and traceable.
- **Cost-Optimized:** Designed with high-throughput, low-cost LLM reasoning in mind.

## ⚙️ Getting Started
1. Clone the repository.
2. Configure your `.env` with `DATABASE_URL` and `OPENAI_API_KEY`.
3. Run migrations: `npx prisma migrate dev`.
4. Run the orchestrator: `npx ts-node src/agents/orchestrator.ts`.