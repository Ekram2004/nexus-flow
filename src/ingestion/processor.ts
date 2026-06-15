import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "crypto";

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

export async function processRawTransaction(data: {
  source: "BANK" | "INTERNAL";
  amount: number;
  date: string;
  description: string;
}) {
  // 1. Basic Validation (Deterministic layer)
  if (data.amount <= 0) throw new Error("Transaction amount must be positive.");

  //2 . Database Insertion
  return await prisma.transaction.create({
    data: {
      id: randomUUID(),
      source: data.source,
      amount: data.amount,
      date: new Date(data.date),
      description: data.description,
      status: "PENDING",
    },
  });
}
