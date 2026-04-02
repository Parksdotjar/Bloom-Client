import { setTimeout as sleep } from 'node:timers/promises';
import { claimJob, completeJob, failJob } from './edgeClient.js';
import { workerConfig } from './config.js';
import { logger } from './logger.js';
import { processAnimatedCapeOrder } from './processor.js';

let shuttingDown = false;

function setupSignalHandlers() {
  const stop = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.warn('shutdown_signal_received', { signal });
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

async function tickWorker() {
  const claimed = await claimJob();
  if (!claimed) return false;

  const orderId = claimed.order_id;
  logger.info('job_claimed', {
    jobId: claimed.job_id,
    orderId,
    attempts: claimed.attempts,
    maxAttempts: claimed.max_attempts
  });

  try {
    const result = await processAnimatedCapeOrder(orderId);
    await completeJob(orderId, result);
    logger.info('job_completed', {
      jobId: claimed.job_id,
      orderId,
      frameCount: result.frameCount,
      atlasPageCount: result.atlasPageCount
    });
  } catch (error) {
    logger.error('job_failed', {
      jobId: claimed.job_id,
      orderId,
      message: error instanceof Error ? error.message : String(error)
    });
    await failJob(orderId, error);
  }

  return true;
}

async function run() {
  setupSignalHandlers();
  logger.info('worker_started', {
    workerId: workerConfig.workerId,
    pollIntervalMs: workerConfig.pollIntervalMs,
    idleIntervalMs: workerConfig.idleIntervalMs,
    leaseSeconds: workerConfig.leaseSeconds,
    ffmpegBin: workerConfig.ffmpegBin,
    ffprobeBin: workerConfig.ffprobeBin
  });

  while (!shuttingDown) {
    try {
      const processed = await tickWorker();
      await sleep(processed ? workerConfig.pollIntervalMs : workerConfig.idleIntervalMs);
    } catch (error) {
      logger.error('worker_loop_error', {
        message: error instanceof Error ? error.message : String(error)
      });
      await sleep(Math.max(workerConfig.pollIntervalMs, 3000));
    }
  }

  logger.info('worker_stopped');
}

void run();
