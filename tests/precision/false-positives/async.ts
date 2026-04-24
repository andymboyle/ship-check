// FALSE POSITIVES — these should NOT be flagged

// return Promise.all — properly returned to caller
async function updateAll(items: Item[]) {
  return Promise.all(items.map(i => update(i)));
}

// await Promise.all — properly awaited
async function loadAll() {
  const results = await Promise.all(urls.map(u => processItem(u)));
  return results;
}

// Promise.allSettled — can never reject
Promise.allSettled(cacheKeys.map(k => cache.invalidate(k)));

// Promise.all with .catch
Promise.all(tasks).catch(err => logger.error("Tasks failed", err));

// Assigned to variable — caller handles it
const pending = Promise.all(jobs);
