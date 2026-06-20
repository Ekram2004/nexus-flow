import "dotenv/config";
import Fastify from "fastify";
import { runReconciliation } from "./agents/orchestrator.js";
import { PrismaClient } from "@prisma/client";
import { Pool } from 'pg';
import { PrismaPg } from "@prisma/adapter-pg";
import { workerQueue } from "./utils/queue.js";
import path from "path";
import { fileURLToPath } from "url";
import pointOfView from "@fastify/view";
import ejs from "ejs";
import { request } from "http";



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });


const isProduction =
  process.env.NODE_ENV === "production" || !!process.env.RENDER;

const fastify = Fastify({
  logger: isProduction
    ? true 
    : {
        transport: {
          target: "pino-pretty", 
        },
      },
});


await fastify.register(pointOfView, {
  engine: {
    ejs: ejs,
  },
  root: path.join(__dirname, "views"),
});


// Global API Security Middleware Hook
fastify.addHook("preHandler", async (request, reply) => {

if (
  request.url === "/health" ||
  request.url === "/dashboard" ||
  request.url === "/analytics/export-csv" ||
  request.url === "/transactions/resolve-batch"
) {
  return;
}


    const apiKey = request.headers["x-api-key"];
    const expectedKey = process.env.RECON_API_KEY; 

    if (!apiKey || apiKey !== expectedKey) {
    fastify.log.warn(`Unauthorized access attempt blocked from IP: ${request.ip}`);
    return reply.status(401).send({
      success: false,
      error: "Unauthorized",
      message: "Invalid or missing 'X-API-KEY' header credentials.",
    });
  }
});

// Public Health Check Probe
fastify.get("/health", async (request, reply) => {
    const healthStatus = {
      status: "UP",
      timestamp: new Date().toISOString(),
      services: {
        uptime: process.uptime(),
        database: "DOWN",
      },
    };
    try {
      await pool.query("SELECT 1");
      healthStatus.services.database = "UP";

      return reply.status(200).send(healthStatus);
    } catch (error: any) {
      fastify.log.error(`Health check failed: ${error.message}`);
      healthStatus.status = "DOWN";

      // Return an HTTP 503 Service Unavailable so load balancers know the container is unhealthy
      return reply.status(503).send(healthStatus);
    }

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
    
  // 1. Push directly into the asynchronous processing line
  workerQueue.enqueue({ bankTransactionId });

  // 2. Respond immediately to the client with 202 Accepted
  return reply.status(202).send({
    success: true,
    message: "Transaction accepted and placed into the processing queue.",
    data: {
      bankTransactionId,
      status: "QUEUED",
      pendingTasksAhead: workerQueue.getPendingCount() - 1
    }
  });
});

fastify.get("/transactions/flagged", async (request, reply) => {
    try {
        fastify.log.info("Fetching flagged transactions for dashboard audit...");

        const query = request.query as {
          page?: string;
          limit?: string;
          sortBy?: string;
          order?: string;
        };

        const page = Math.max(1, parseInt(query.page || "1", 10));
        const limit = Math.max(
          1,
          Math.min(100, parseInt(query.limit || "10", 10)),
        ); // Cap maximum limit at 100 rows
        const skip = (page - 1) * limit;

        // Validate sorting parameters to prevent SQL injection profiles
    const allowedSortFields = ["date", "amount", "createdAt", "description"];
    const sortBy = allowedSortFields.includes(query.sortBy || "") ? (query.sortBy as string) : "createdAt";
    const order = (query.order || "").toLowerCase() === "asc" ? "asc" : "desc";



        const [totalCount, flaggedTransactions] = await Promise.all([
          prisma.transaction.count({
            where: { status: "FLAGGED" },
          }),
          prisma.transaction.findMany({
            where: { status: "FLAGGED" },
            select: {
              id: true,
              source: true,
              amount: true,
              date: true,
              description: true,
              status: true,
              createdAt: true,
            },
            skip,
            take: limit,
            orderBy: {
              [sortBy]: order,
            },
          }),
        ]);



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
        
        const flaggedTime = new Date(bankTx.createdAt).getTime();
        const resolutionTime = new Date().getTime();
        const secondsToResolve = Math.max(
          0,
          Math.floor((resolutionTime - flaggedTime) / 1000),
        );

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
          
          await tx.auditResolutionLog.create({
            data: {
              bankTransactionId: bankTx.id,
              internalRecordId: internalTx.id,
              secondsToResolve: secondsToResolve,
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
 
// NEW: Worker Queue Performance Metric Endpoint
fastify.get("/queue/status", async (request, reply) => {
  try {
    fastify.log.info("Fetching real-time background worker metrics...");

      const queueMetrics = workerQueue.getMetrics();
      
    //Execute a raw SQL query to capture real-time Postgres table storage footprints
    const storageQuery = await prisma.$queryRawUnsafe<any[]>(`
      SELECT 
        pg_total_relation_size('"Transaction"') AS total_bytes,
        pg_size_pretty(pg_total_relation_size('"Transaction"')) AS human_readable
    `);
const tableStats = storageQuery[0] || {
  total_bytes: 0,
  human_readable: "0 bytes",
};

    return reply.status(200).send({
      success: true,
      timestamp: new Date().toISOString(),
      worker: {
        status: queueMetrics.status,
        backlogCount: queueMetrics.backlogSize,
        backlogItems: queueMetrics.pendingTaskIds,
      },
      storage: {
        activeTransactionTable: {
          bytes: Number(tableStats.total_bytes),
          readable: tableStats.human_readable,
        },
      },
      system: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage().heapUsed, // Tracking memory load prevents leaks during bulk batches
      },
    });
  } catch (error: any) {
    fastify.log.error(`Queue monitoring request failed: ${error.message}`);
    return reply.status(500).send({
      success: false,
      error: "Metrics Retrieval Error",
      details: error.message,
    });
  }
});



//  Browser HTML Dashboard Render Route Endpoint
fastify.get("/dashboard", async (request, reply) => {
  try {
    // Collect queue analytics
    const workerMetrics = workerQueue.getMetrics();

    // Query database directly for open items window
    const [
      totalCount,
      flaggedTransactions,
      aggregations,
      storageQuery,
      historicalLogs,
    ] = await Promise.all([
      prisma.transaction.count({ where: { status: "FLAGGED" } }),
      prisma.transaction.findMany({
        where: { status: "FLAGGED" },
        orderBy: { createdAt: "desc" },
        take: 20, // Display top 20 newest exceptions automatically
      }),
      prisma.auditResolutionLog.aggregate({
        _avg: { secondsToResolve: true },
      }),
      prisma.$queryRawUnsafe<any[]>(`
        SELECT pg_size_pretty(pg_total_relation_size('"Transaction"')) AS human_readable
      `),
      prisma.auditResolutionLog.findMany({
        orderBy: { resolvedAt: "desc" },
        take: 10,
      }),
    ]);
const avgSeconds = Math.round(aggregations._avg.secondsToResolve || 0);
const readableAvgSpeed =
  avgSeconds > 0
    ? `${Math.floor(avgSeconds / 60)}m ${avgSeconds % 60}s`
    : "N/A";

    const tableSizePretty = storageQuery?.[0]?.human_readable || "0 bytes";

    return reply.view("dashboard.ejs", {
      worker: workerMetrics,
      meta: {
        totalRecords: totalCount,
        currentPage: 1,
        totalPages: Math.ceil(totalCount / 20),
        avgResolutionSpeed: readableAvgSpeed,
        tableDiskSize: tableSizePretty,
      },
      transactions: flaggedTransactions,
      history: historicalLogs,
    });
  } catch (error: any) {
    fastify.log.error(`Dashboard rendering crashed: ${error.message}`);
    return reply.status(500).send("Fatal Error Loading Interface Workspace.");
  }
});


// Define structural validation schema for an array of transaction IDs
const batchWebhookSchema = {
  body: {
    type: "object",
    required: ["bankTransactionIds"],
    properties: {
      bankTransactionIds: {
        type: "array",
        minItems: 1,
        maxItems: 100, // Safe upper boundary gate per single HTTP payload
        items: { type: "string", format: "uuid" }
      }
    }
  }
};

// High-Throughput Batch Ingestion Endpoint
fastify.post("/webhooks/reconcile/batch", { schema: batchWebhookSchema }, async (request, reply) => {
  const { bankTransactionIds } = request.body as { bankTransactionIds: string[] };
  
  fastify.log.info(`Received batch upload containing ${bankTransactionIds.length} transaction tasks.`);

  // 1. Bulk push each incoming transaction payload straight into the async worker queue line
  for (const id of bankTransactionIds) {
    workerQueue.enqueue({ bankTransactionId: id });
  }

  // 2. Instantly return a 202 Accepted summary metadata payload to the client
  return reply.status(202).send({
    success: true,
    message: `Batch successfully processed. Enqueued ${bankTransactionIds.length} tasks into the background worker line.`,
    data: {
      batchSizeProcessed: bankTransactionIds.length,
      currentTotalBacklog: workerQueue.getPendingCount(),
      status: "BATCH_ACCEPTED"
    }
  });
});

// Operational Performance Reporting Analytics Endpoint
fastify.get("/analytics/dashboard", async (request, reply) => {
  try {
    fastify.log.info("Calculating operational exception resolution metrics...");

    // 1. Fetch aggregation numbers directly from the AuditResolutionLog table
    const aggregations = await prisma.auditResolutionLog.aggregate({
      _count: {
        id: true,
      },
      _avg: {
        secondsToResolve: true,
      },
      _min: {
        secondsToResolve: true,
      },
      _max: {
        secondsToResolve: true,
      },
    });

    const totalResolved = aggregations._count.id;

    // 2. Handle fallback edge case if no manual resolutions exist in the log database yet
    if (totalResolved === 0) {
      return reply.status(200).send({
        success: true,
        message: "No historical resolution data available for analytics tracking yet.",
        metrics: {
          totalResolvedExceptions: 0,
          averageResolutionSpeedSeconds: 0,
          fastestResolutionSeconds: 0,
          slowestResolutionSeconds: 0,
          operationalEfficiencyRating: "N/A",
        },
      });
    }

    const avgSeconds = Math.round(aggregations._avg.secondsToResolve || 0);
    const minSeconds = aggregations._min.secondsToResolve || 0;
    const maxSeconds = aggregations._max.secondsToResolve || 0;

    // 3. Determine an operational efficiency rating scale based on average speed boundaries
    let efficiencyRating = "EXCELLENT";
    if (avgSeconds > 300) efficiencyRating = "NEEDS_OPTIMIZATION"; // > 5 minutes
    else if (avgSeconds > 120) efficiencyRating = "STANDARD";     // > 2 minutes

    return reply.status(200).send({
      success: true,
      timestamp: new Date().toISOString(),
      metrics: {
        totalResolvedExceptions: totalResolved,
        averageResolutionSpeed: {
          rawSeconds: avgSeconds,
          readableFormat: `${Math.floor(avgSeconds / 60)}m ${avgSeconds % 60}s`
        },
        fastestResolutionTime: {
          rawSeconds: minSeconds,
          readableFormat: `${Math.floor(minSeconds / 60)}m ${minSeconds % 60}s`
        },
        slowestResolutionTime: {
          rawSeconds: maxSeconds,
          readableFormat: `${Math.floor(maxSeconds / 60)}m ${maxSeconds % 60}s`
        },
        operationalEfficiencyRating: efficiencyRating,
      }
    });

  } catch (error: any) {
    fastify.log.error(`Analytics generation dashboard failed: ${error.message}`);
    return reply.status(500).send({
      success: false,
      error: "Analytics Computation Error",
      details: error.message,
    });
  }
});


// 🔥 NEW: Automated Database Maintenance & Archiving Endpoint
fastify.post("/admin/archive", async (request, reply) => {
  try {
    fastify.log.info("Starting automated database archiving routine...");

    // 1. Define the 30-day age boundary limit
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 2. Perform atomic migration within a strict database transaction block
    const metrics = await prisma.$transaction(async (tx) => {
      
      // A. Find matched transactions older than 30 days
      const targets = await tx.transaction.findMany({
        where: {
          status: "MATCHED",
          updatedAt: { lt: thirtyDaysAgo }
        }
      });

      if (targets.length === 0) {
        return { migratedCount: 0 };
      }

      const targetIds = targets.map(t => t.id);

      // B. Fetch corresponding audit log entries to migrate
      const auditLogs = await tx.auditResolutionLog.findMany({
        where: { bankTransactionId: { in: targetIds } }
      });

      // C. Move transactions to cold storage archive
      await tx.archivedTransaction.createMany({
        data: targets.map(t => ({
          id: t.id,
          source: t.source,
          amount: t.amount,
          date: t.date,
          description: t.description,
          status: t.status,
          createdAt: t.createdAt
        }))
      });

      // D. Move analytics log to cold storage archive
      if (auditLogs.length > 0) {
        await tx.archivedMatchLog.createMany({
          data: auditLogs.map(log => ({
            id: log.id,
            bankTransactionId: log.bankTransactionId,
            internalRecordId: log.internalRecordId,
            secondsToResolve: log.secondsToResolve,
            resolvedAt: log.resolvedAt
          }))
        });

        // Delete from active analytics log
        await tx.auditResolutionLog.deleteMany({
          where: { bankTransactionId: { in: targetIds } }
        });
      }

      // E. Delete records from active primary transaction table
      await tx.transaction.deleteMany({
        where: { id: { in: targetIds } }
      });

      return { migratedCount: targets.length };
    });

    fastify.log.info(`[Archive Engine] Successfully optimized indices. Archived ${metrics.migratedCount} rows.`);

    return reply.status(200).send({
      success: true,
      message: "Database optimization routine completed successfully.",
      data: {
        recordsArchivedCount: metrics.migratedCount,
        boundaryThresholdDate: thirtyDaysAgo.toISOString()
      }
    });

  } catch (error: any) {
    fastify.log.error(`Database archiving job failed: ${error.message}`);
    return reply.status(500).send({
      success: false,
      error: "Archiving Execution Failure",
      details: error.message
    });
  }
});

// 🔥 NEW: Operational Audit Trail CSV Export Endpoint
fastify.get("/analytics/export-csv", async (request, reply) => {
  try {
    fastify.log.info("Generating CSV data dump for historical resolution log...");

    // 1. Pull all historical data logs from the database
    const logs = await prisma.auditResolutionLog.findMany({
      orderBy: { resolvedAt: "desc" },
    });

    // 2. Define the header columns line
    let csvContent = "ID,Bank Transaction ID,Internal Record ID,Seconds To Resolve,Timestamp Locked\n";

    // 3. Loop and sanitize rows to prevent Excel data-break profiles
    for (const log of logs) {
      const sanitizedId = log.id;
      const sanitizedBankId = log.bankTransactionId;
      const sanitizedInternalId = log.internalRecordId;
      const seconds = log.secondsToResolve;
      const timestamp = new Date(log.resolvedAt).toISOString();

      csvContent += `"${sanitizedId}","${sanitizedBankId}","${sanitizedInternalId}",${seconds},"${timestamp}"\n`;
    }

    // 4. Configure HTTP attachments headers to force browser download prompts
    const filename = `nexusflow_audit_trail_${new Date().toISOString().split('T')[0]}.csv`;
    
    return reply
      .header("Content-Type", "text/csv")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(csvContent);

  } catch (error: any) {
    fastify.log.error(`CSV generation stream failed: ${error.message}`);
    return reply.status(500).send("Failed to compile CSV spreadsheet export resource.");
  }
});

const batchResolveSchema = {
  body: {
    type: "object",
    required: ["pairings"],
    properties: {
      pairings: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["bankTransactionId", "internalRecordId"],
          properties: {
            bankTransactionId: { type: "string", format: "uuid" },
            internalRecordId: { type: "string", format: "uuid" },
          },
        },
      },
    },
  },
};

fastify.post(
  "/transactions/resolve-batch",
  { schema: batchResolveSchema },
  async (request, reply) => {
    const { pairings } = request.body as {
      pairings: Array<{ bankTransactionId: string; internalRecordId: string }>;
    };

    try {
      fastify.log.info(
        `Batch resolving ${pairings.length} transaction exceptions...`,
      );

      await prisma.$transaction(async (tx) => {
        for (const pair of pairings) {
          const bankTx = await tx.transaction.findUnique({
            where: { id: pair.bankTransactionId },
          });
          const internalTx = await tx.transaction.findUnique({
            where: { id: pair.internalRecordId },
          });

          if (!bankTx || !internalTx) continue;

          const flaggedTime = new Date(bankTx.createdAt).getTime();
          const secondsToResolve = Math.max(
            0,
            Math.floor((new Date().getTime() - flaggedTime) / 1000),
          );

          // Create logging entries
          await tx.reconciliationMatch.create({
            data: {
              bankTransactionId: bankTx.id,
              internalRecordId: internalTx.id,
              confidenceScore: 1.0,
            },
          });

          await tx.auditResolutionLog.create({
            data: {
              bankTransactionId: bankTx.id,
              internalRecordId: internalTx.id,
              secondsToResolve,
            },
          });

          // Update ledger fields
          await tx.transaction.update({
            where: { id: bankTx.id },
            data: { status: "MATCHED" },
          });
          await tx.transaction.update({
            where: { id: internalTx.id },
            data: { status: "MATCHED" },
          });
        }
      });

      return reply
        .status(200)
        .send({
          success: true,
          message: `Successfully resolved ${pairings.length} exceptions.`,
        });
    } catch (error: any) {
      fastify.log.error(`Batch resolution failed: ${error.message}`);
      return reply
        .status(500)
        .send({
          success: false,
          error: "Internal Batch Failure",
          details: error.message,
        });
    }
  },
);




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