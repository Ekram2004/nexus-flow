import { runReconciliation } from "../agents/orchestrator.js";

type Task = {
  bankTransactionId: string;
};

class WorkerQueue {
  private queue: Task[] = [];
  private isProcessing = false;

  // Enqueue an incoming transaction task
  public enqueue(task: Task): void {
    this.queue.push(task);
    console.log(`[Queue] Task added. Current queue size: ${this.queue.length}`);
    this.processNext();
  }

  // Process the queue sequentially in the background
  private async processNext(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const currentTask = this.queue.shift();

    if (currentTask) {
      console.log(
        `[Worker] Started processing transaction: ${currentTask.bankTransactionId}`,
      );
      try {
        const result = await runReconciliation(currentTask.bankTransactionId);
        console.log(
          `[Worker] Finished processing ${currentTask.bankTransactionId}. Outcome Status: ${result.status}`,
        );
      } catch (error: any) {
        console.error(
          `[Worker Error] Failed background pipeline run for ID ${currentTask.bankTransactionId}:`,
          error.message,
        );
      }
    }

    this.isProcessing = false;
    // Trigger next item immediately
    this.processNext();
  }

  // Helper to view outstanding items waiting in line
  public getPendingCount(): number {
    return this.queue.length;
  }
}

export const workerQueue = new WorkerQueue();
