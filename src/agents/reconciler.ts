import { PrismaClient } from "@prisma/client";
import { OpenAIEmbeddings } from '@langchain/openai';

const prisma = new PrismaClient();
const embeddings = new OpenAIEmbeddings();

export async function findPotentialMatches(description: string) {
    // 1 Convert the description to a vector (embedding)
    const queryEmbedding = await embeddings.embedQuery(description);

    // 2. Perform a similarity search using pgvector
    // we look for 'Internal' transaction that are pending 

    const candidates = await prisma.$queryRaw`SELECT id, description, amount,
    1 - (embedding <=> ${queryEmbedding}::vector) AS similarity FROM "Transaction"
    WHERE source = 'INETRNAL'
    AND status = 'PENDING'
    OREDER BY similarity DESC
    LIMIT 3;
    `;

    return candidates;
}