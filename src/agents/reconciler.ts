import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import Embedder from "../utils/embedder.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

export async function findPotentialMatches(description: string) {
  // 1. Convert the description to a vector (embedding)
  const queryEmbedding = await Embedder.generate(description);

  // 2. Format the float array into a string matching pgvector syntax: '[0.1,0.2,...]'
  const embeddingString = `[${queryEmbedding.join(",")}]`;

  // 3. Query the DB using $queryRawUnsafe with positional arguments
  const candidates = await prisma.$queryRawUnsafe(
    `
    SELECT id, description, amount, date, status,
    (1 - (embedding <=> $1::vector)) AS similarity 
    FROM "Transaction"
    WHERE source = 'INTERNAL'
    AND status = 'PENDING'
    AND (1 - (embedding <=> $1::vector)) > 0.8
    ORDER BY similarity DESC
    LIMIT 5;
  `,
    embeddingString,
  );

  return candidates;
}
