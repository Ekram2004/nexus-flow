import "dotenv/config";
import { Pool } from "pg";
import crypto from "crypto";
import { runReconciliation } from "./agents/orchestrator.js";
import Embedder from "./utils/embedder.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function clearTestData() {
  await pool.query('DELETE FROM "ReconciliationMatch"');
  await pool.query('DELETE FROM "Transaction"');
}

async function insertTx(
  id: string,
  source: string,
  amount: number,
  date: Date,
  desc: string,
) {
  const embedding = await Embedder.generate(desc);
  const embeddingString = `[${embedding.join(",")}]`;
  await pool.query(
    `INSERT INTO "Transaction" (id, source, amount, date, description, status, embedding, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, 'PENDING', $6::vector, NOW(), NOW())`,
    [id, source, amount, date, desc, embeddingString],
  );
}

async function runSuite() {
  console.log("🧹 Clearing old database entries...");
  await clearTestData();

  console.log("🌱 Seeding test scenarios...");

  // Setup Base Bank Record
  const bankTxId = crypto.randomUUID();
  const targetDate = new Date("2026-06-16T12:00:00.000Z");
  await insertTx(
    bankTxId,
    "BANK",
    1250.0,
    targetDate,
    "Cloud Hosting Server Fees June",
  );

  // Case 1: Mismatched Amount (Should fail deterministic step)
  const badAmountId = crypto.randomUUID();
  await insertTx(
    badAmountId,
    "INTERNAL",
    9999.0,
    targetDate,
    "Cloud Hosting Server Fees June",
  );

  // Case 2: Distant Date (Should fail date window check)
  const badDateId = crypto.randomUUID();
  const futureDate = new Date("2026-07-25T12:00:00.000Z"); // > 5 days variance
  await insertTx(
    badDateId,
    "INTERNAL",
    1250.0,
    futureDate,
    "Cloud Hosting Server Fees June",
  );

  // Case 3: Perfect Match (Should pass everything and update to MATCHED)
  const perfectMatchId = crypto.randomUUID();
  await insertTx(
    perfectMatchId,
    "INTERNAL",
    1250.0,
    targetDate,
    "AWS Cloud Server - June Invoice",
  );

  console.log("\n🚀 Executing AI Reconciliation Pipeline...");
  const result = await runReconciliation(bankTxId);
  console.log("\n📋 Pipeline Execution Output:", result);

  // Assert and Verify Database States
  console.log("\n🔍 Verifying Database Outcomes...");

  const { rows: records } = await pool.query(
    `SELECT id, description, status, source FROM "Transaction"`,
  );

  console.log(
    "------------------------------------------------------------------",
  );
  records.forEach((tx) => {
    console.log(
      `[${tx.source}] Desc: "${tx.description.padEnd(32)}" | Status: ${tx.status}`,
    );
  });
  console.log(
    "------------------------------------------------------------------",
  );

  await pool.end();
}

runSuite().catch(async (err) => {
  console.error("Test suite crashed:", err);
  await pool.end();
});
