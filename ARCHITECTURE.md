## AI Reasoning Engine
- **Strategy:** Uses vector embeddings to map descriptions into a high-dimensional space.
- **Matching:** Utilizes `pgvector` for K-Nearest Neighbors (KNN) search to identify candidates with a similarity score > 0.8.
- **Goal:** Minimize false positives by combining semantic similarity with deterministic checks (amount/date).