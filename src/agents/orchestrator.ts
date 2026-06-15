import { findPotentialMatches } from "./reconciler";
import { verifyMatch } from "./reasoner";
import { PrismaClient } from "@prisma/client";
import { match } from "node:assert";

const prisma = new PrismaClient();


export async function runReconciliation(bankTxTd: string) {
    // 1. Fetch the raw bank transaction
    const bankTx = await prisma.transaction.findUnique({ where: { id: bankTxTd } });
    if (!bankTx) throw new Error("Transaction not found");

    // 2. Retrieve candidates using vector search
    const candidates = await findPotentialMatches(bankTx.description);

    // 3. Let the AI reason over the candidates
    for (const candidate of candidates as any[]) {
        const result = await verifyMatch(bankTx, candidate);

        if (result.isMatch) {
            // 4. Finalize the match in the DB 
            await prisma.reconciliationMatch.create({
                data: {
                    bankTransactionId: bankTx.id,
                    internalRecordId: candidate.id,
                    confidenceScore: 1.0
                }
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