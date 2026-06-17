import "dotenv/config";
import Fastify from "fastify";
import { runReconciliation } from "./agents/orchestrator.js";
import { PrismaClient } from "@prisma/client";
import { Pool } from 'pg';
import { PrismaPg } from "@prisma/adapter-pg";
import { request } from "node:http";


const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });


const fastify = Fastify({
  logger: {
    transport: {
      target: "pino-pretty",
    },
  },
});

const webhookSchema = {
  body: {
    type: "object",
    required: ["bankTransactionId"],
    properties: {
      bankTransactionId:{type:"string", format:"uuid"}
    },
  },
};

fastify.post("/webhooks/reconcile", { schema: webhookSchema }, async (request, reply) => {
    const { bankTransactionId } = request.body as { bankTransactionId: string };
    
    fastify.log.info(`Received webhook for transaction:${bankTransactionId}`);

    try {
        const result = await runReconciliation(bankTransactionId);

        if (result.status === "SUCCESS") {
            return reply.status(200).send({
                success: true,
                message: 'Transaction successfully reconciled.',
                data: result,
            });
        }

        return reply.status(200).send({
            success: false,
            message: 'Transaction processing completed but flagged for review.',
            data: result
        });
    } catch (error: any) {
        fastify.log.error(`Pipeline failure for ID ${bankTransactionId}: ${error.message}`);
        return reply.status(500).send({
          success: false,
          error: "Internal Reconciliation Engine Failure",
          details: error.message,
        });
    }
});

fastify.get("/transactions/flagged", async (request, reply) => {
    try {
        fastify.log.info("Fetching flagged transactions for dashboard audit...");

        const flaggedTransactions = await prisma.transaction.findMany({
            where: {
                status: "FLAGGED"
            },
            select: {
                id: true,
                source: true,
                amount: true,
                date: true,
                description: true,
                status: true,
                createdAt: true,
            },
            orderBy: {
                createdAt: "desc",
            }
        });

        return reply.status(200).send({
            success: true,
            count: flaggedTransactions.length,
            transactions: flaggedTransactions
        });
    } catch (error: any) {
        fastify.log.error(`Failed to fetch flagged items: ${error.message}`);
        return reply.status(500).send({
          success: false,
          error: "Database Fetch Failure",
          details: error.message,
        });
 
    }
 });

 const resolveSchema = {
   body: {
     type: "object",
     required: ["bankTransactionId", "internalRecordId"],
     properties: {
       bankTransactionId: { type: "string", format: "uuid" },
       internalRecordId: { type: "string", format: "uuid" },
     },
   },
 };

// Manual Resolution Route
fastify.post("/transactions/resolve", { schema: resolveSchema }, async (request, reply) => {
     const { bankTransactionId, internalRecordId } = request.body as {
       bankTransactionId: string;
       internalRecordId: string;
     };
    try {
      fastify.log.info(
        `Manually resolving Bank ID: ${bankTransactionId} with Internal ID: ${internalRecordId}`,
      );

      // 1 . Fetch both records to verify existence and valid statuses
      const bankTx = await prisma.transaction.findUnique({
        where: { id: bankTransactionId },
      });
      const internalTx = await prisma.transaction.findUnique({
        where: { id: internalRecordId },
      });

      if (!bankTx || !internalTx) {
        return reply.status(442).send({
          success: false,
          error: "Unprocessable Entity",
          details:
            "One or both of the provided transaction IDs do not exist in the database.",
        });
      }
      // 2. Prform safe atomic database updates within an isolated transaction boundary
      const resolution = await prisma.$transaction(async (tx) => {
        // Create the audit trial record mapping link
        const matchRecord = await tx.reconciliationMatch.create({
          data: {
            bankTransactionId: bankTx.id,
            internalRecordId: internalTx.id,
            confidenceScore: 1.0, // Manual override is treated as 100% confident operator decision
          },
        });

        // Mark the bank Transaction as MATCHED
        await tx.transaction.update({
          where: { id: bankTx.id },
          data: { status: "MATCHED" },
        });

        // Mark the Internal Record as MATCHED
        await tx.transaction.update({
          where: { id: internalTx.id },
          data: { status: "MATCHED" },
        });
        return matchRecord;
      });
      return reply.status(200).send({
        success: true,
        message: "Transactions successfully linked and resolved manually.",
        match: resolution,
      });
    } catch (error: any) {
      fastify.log.error(`Manual resolution crash: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: "Internal Resolution Server Failure",
        details: error.message,
      });
    }
 });

const start = async () => {
    try {
        const port = Number(process.env.PORT) || 3000;
        await fastify.listen({ port, host: "0.0.0.0" });
        console.log(`NexusFlow API Server running at http://localhost:${port}`);

    } catch (err) {
        fastify.log.error(err);
        process.exit(1);

    }
}

start();