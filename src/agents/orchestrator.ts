import { findPotentialMatches } from "./reconciler.js";
import { verifyMatch } from "./reasoner.js";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

// Helper to check if dates are within a 7-day threshold window

function isWithinDateRange(dateA: Date, dateB: Date, maxDays = 7): boolean{
    const diffTime = Math.abs(new Date(dateA).getTime() - new Date(dateB).getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= maxDays;
}


export async function runReconciliation(bankTxTd: string) {
    // 1. Fetch the raw bank transaction
    const bankTx = await prisma.transaction.findUnique({ where: { id: bankTxTd } });
    if (!bankTx) throw new Error("Transaction not found");

    // 2. Retrieve candidates using vector search
    const candidates = await findPotentialMatches(bankTx.description);

    // 3. Let the AI reason over the candidates
    for (const candidate of candidates as any[]) {

        const amountsMatch = Number(bankTx.amount) === Number(candidate.amount);
        const datesMatch = isWithinDateRange(bankTx.date, candidate.date, 5); // 5-day variance limit

        if (!amountsMatch || !datesMatch) {
          console.log(
            `[Skipped] Candidate ${candidate.id} failed deterministic thresholds.`,
          );
          continue;
        }

        const result = await verifyMatch(bankTx, candidate);

        if (result.isMatch) {
            // 4. Finalize the match in the DB 
            await prisma.reconciliationMatch.create({
              data: {
                bankTransactionId: bankTx.id,
                internalRecordId: candidate.id,
                confidenceScore: parseFloat(candidate.similarity),
              },
            });

            await prisma.transaction.update({
              where: { id: bankTx.id },
              data: { status: "MATCHED" },
            });
            return { status: 'SUCCESS', match: candidate.id };
        }
    }

    return { status: "FLAGGED", reason: "No confident match found" };
}