import "dotenv/config";
import Fastify from "fastify";
import { runReconciliation } from "./agents/orchestrator.js";
import { request } from "node:http";


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