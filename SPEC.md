# NexusFlow: Intelligent Financial Reconciliation Agent

## 1. Problem Statement
Manual financial reconciliation is time-consuming and error-prone. Businesses often have disparate data sources (bank exports, internal ERP records) that don't match due to formatting differences. 

## 2. The Solution
NexusFlow is an autonomous agent that:
- **Ingests** unstructured financial data (CSV/JSON).
- **Embeds** data into a vector space using `pgvector` to identify "fuzzy matches" (e.g., matching "Acme Corp" to "Acme Inc").
- **Orchestrates** the reconciliation workflow using a state machine (LangGraph) to ensure reliability and auditability.

## 3. Architecture
- **Orchestrator:** LangGraph (Stateful workflow management).
- **Brain:** OpenAI GPT-4o-mini (For reasoning and categorization).
- **Memory/Vector DB:** PostgreSQL + pgvector (For semantic similarity search).
- **API:** Fastify (High-performance, schema-validated endpoints).

## 4. Why this matters (Trade-offs)
- **Why pgvector?** Chosen over specialized vector DBs to reduce infrastructure complexity, keeping all operational and vector data within a single ACID-compliant database.
- **Why LangGraph?** We chose a graph-based state machine over simple linear chains to allow for "Human-in-the-loop" overrides, a critical requirement for financial systems.