const { RateLimitedError } = require('./stravaRateLimit');

const listeners = [];

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
  push({
    job,
    attempts: 0,
    maxAttempts: opts.maxAttempts ?? 1,
    baseDelay: opts.delay ?? 0,
    delay: opts.delay ?? 0
  });
}

let processing = false;
async function processJob() {
  if (processing) return;
  processing = true;
  while (listeners.length) {
    const task = listeners.shift();
    try {
      await task.job();
    } catch (err) {
      task.attempts += 1;
      if (err instanceof RateLimitedError && task.attempts < task.maxAttempts) {
        task.delay = task.baseDelay * Math.pow(2, task.attempts);
        push(task);
      } else {
        console.error('Queue job error:', err.message);
      }
    }
  }
  processing = false;
}

module.exports = { enqueue };