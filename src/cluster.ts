/**
 * Cluster mode — multi-process Bun server using reusePort.
 * Each worker runs the full app independently. Kernel-level load balancing
 * distributes connections across workers via SO_REUSEPORT.
 *
 * Usage: bun src/cluster.ts
 * Or: npm run cluster
 */

import { availableParallelism, cpus } from 'node:os';
import { logStore } from './services/logStore.ts';
import { isBun } from './utils/env.ts';

if (!isBun) {
  console.error('[cluster] Cluster mode requires Bun runtime. Install Bun: https://bun.sh');
  process.exit(1);
}

const numWorkers = availableParallelism?.() ?? cpus().length;
logStore.log('debug', 'cluster', `\x1b[31m[cluster]\x1b[0m Starting ${numWorkers} workers...`);

interface Worker {
  process: ReturnType<typeof Bun.spawn>;
  id: number;
  restarts: number;
}

const workers: Worker[] = [];
let shuttingDown = false;

function spawnWorker(id: number): Worker {
  const proc = Bun.spawn(['bun', 'src/index.tsx'], {
    stdout: 'inherit',
    stderr: 'inherit',
    env: {
      ...process.env,
      QWEN_WORKER: String(id),
      QWEN_CLUSTER: 'true',
    },
  });

  const worker: Worker = { process: proc, id, restarts: 0 };
  workers[id] = worker;

  logStore.log('debug', 'cluster', `\x1b[32m[cluster]\x1b[0m Worker ${id + 1} started (PID: ${proc.pid})`);
  return worker;
}

// Spawn all workers
for (let i = 0; i < numWorkers; i++) {
  spawnWorker(i);
}

// Monitor and restart dead workers every 5s
const monitor = setInterval(async () => {
  if (shuttingDown) return;

  for (let i = 0; i < workers.length; i++) {
    const worker = workers[i];
    if (!worker) continue;

    try {
      const exited = worker.process.exitCode;
      if (exited !== null) {
        logStore.log(
          'debug',
          'cluster',
          `\x1b[33m[cluster]\x1b[0m Worker ${i + 1} (PID: ${worker.process.pid}) exited (code: ${exited}), restarting...`,
        );
        const newWorker = spawnWorker(i);
        newWorker.restarts = worker.restarts + 1;

        if (newWorker.restarts > 10) {
          console.error(`\x1b[31m[cluster]\x1b[0m Worker ${i + 1} restarted ${newWorker.restarts} times — possible crash loop`);
        }
      }
    } catch {
      // Worker still running
    }
  }
}, 5_000);

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  logStore.log('debug', 'cluster', `\n\x1b[33m[cluster]\x1b[0m Shutting down all workers...`);
  clearInterval(monitor);

  for (const worker of workers) {
    if (worker?.process) {
      try {
        worker.process.kill();
      } catch {
        /* already dead */
      }
    }
  }

  // Give workers time to clean up
  setTimeout(() => process.exit(0), 3_000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
