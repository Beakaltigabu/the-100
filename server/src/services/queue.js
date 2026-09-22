// Generic FIFO that serializes outbound Telegram (and webhook) work. Jobs retry
// up to `maxAttempts` times with exponential backoff on ANY error — a transient
// network blip must not permanently drop a DM or broadcast. Webhook-processing
// jobs that write to the DB should stay at maxAttempts 1 (no retry) to avoid
// double-processing.
const listeners = [];

// Hard cap on queued work (including delayed retries) — an unbounded in-memory
// queue would grow without limit if Telegram/Strava stay down for hours.
const MAX_BACKLOG = 5000;
let pending = 0;

function push(task) {
  if (task.delay > 0) {
    setTimeout(() => {
      listeners.push(task);
      processJob().catch((err) => console.error('Queue job failed:', err));
    }, task.delay);
  } else {
    listeners.push(task);
    processJob().catch((err) => console.error('Queue job failed:', err));
  }
}

function enqueue(job, opts = {}) {
  if (pending >= MAX_BACKLOG) {
    console.error(`Queue backlog full (${MAX_BACKLOG}) — dropping job`);
    return false;
  }
  pending += 1;
  push({
    job,
    attempts: 0,
    maxAttempts: opts.maxAttempts ?? 1,
    baseDelay: opts.delay ?? 0,
    delay: opts.delay ?? 0
  });
  return true;
}

let processing = false;
async function processJob() {
  if (processing) return;
  processing = true;
  while (listeners.length) {
    const task = listeners.shift();
    pending -= 1;
    try {
      await task.job();
    } catch (err) {
      task.attempts += 1;
      if (task.attempts < task.maxAttempts) {
        task.delay = task.baseDelay * Math.pow(2, task.attempts);
        pending += 1; // re-queued for a delayed retry — keep the backlog count honest
        push(task);
      } else {
        console.error('Queue job error:', err.message);
      }
    }
  }
  processing = false;
}

function backlog() {
  return pending;
}

module.exports = { enqueue, backlog, MAX_BACKLOG };