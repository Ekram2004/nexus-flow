import { processRawTransaction } from "./processor.js";
import { logger } from "../utils/logger.js";


async function runTest() {
    try {
        const tx = await processRawTransaction({
            source: 'BANK',
            amount: 1500.50,
            date: '2026-06-15',
            description: 'Payment for Services - Tech Conslulating'
        });
        logger.info('Successfully ingested transaction:', tx.id);
    } catch (err) {
        logger.error('Ingestion failed', err);
    }
}

runTest();