import { runReconciliation } from "./agents/orchestrator.js";
import { Pool } from "pg";

// Use a raw pg query to fetch the ID so we don't duplicate Prisma client setups
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function test() {
  console.log("Fetching seed bank transaction...");

  // Find the bank transaction we just seeded
  const res = await pool.query(
    `SELECT id, description FROM "Transaction" WHERE source = 'BANK' LIMIT 1`,
  );

  if (res.rows.length > 0) {
    const bankTx = res.rows[0];
    console.log("Running reconciliation for:", bankTx.description);

    const result = await runReconciliation(bankTx.id);
    console.log("Reconciliation Result:", result);
  } else {
    console.log("❌ No bank transactions found. Did you run the seed script?");
  }

  // Close pool connection so the terminal script exits cleanly
  await pool.end();
}

test().catch(async (err) => {
  console.error(err);
  await pool.end();
});
