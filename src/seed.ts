import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import crypto from "crypto";

import Embedder from "./utils/embedder.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function seed() {
  console.log("Generating local embeddings for seed data...");

  // 1. Generate and save Internal Record (The "Truth")
  const embedding = await Embedder.generate("Office Rent Payment - June 2026");
  const embeddingString = `[${embedding.join(",")}]`;

  // Explicitly wrap "Transaction", "createdAt", and "updatedAt" in double quotes
  await pool.query(
    `INSERT INTO "Transaction" (id, source, amount, date, description, status, embedding, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7::vector, NOW(), NOW())`,
    [
      crypto.randomUUID(),
      "INTERNAL",
      2500.0,
      new Date(),
      "Office Rent Payment - June 2026",
      "PENDING",
      embeddingString,
    ],
  );

  // 2. Generate and save Bank Record (The "Test")
  const bankEmbedding = await Embedder.generate("June 2026 Office Rent");
  const bankEmbeddingString = `[${bankEmbedding.join(",")}]`;

  await pool.query(
    `INSERT INTO "Transaction" (id, source, amount, date, description, status, embedding, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7::vector, NOW(), NOW())`,
    [
      crypto.randomUUID(),
      "BANK",
      2500.0,
      new Date(),
      "June 2026 Office Rent",
      "PENDING",
      bankEmbeddingString,
    ],
  );

  console.log("Database seeded successfully!");
  await pool.end();
}

seed().catch(async (error) => {
  console.error(error);
  await pool.end();
});
