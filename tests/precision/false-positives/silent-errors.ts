// FALSE POSITIVES — these should NOT be flagged as HIGH

// localStorage access — can throw in Safari private mode, safe to ignore
function savePreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

// JSON parse with fallback — defensive parsing
function tryParseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
  }
}

// Cleanup/teardown — if disconnect fails, nothing to do
async function cleanup() {
  try {
    await connection.disconnect();
  } catch {}
}

// Proper error handling — has logging and rethrow
async function fetchData() {
  try {
    return await api.get("/data");
  } catch (e) {
    console.error("Failed to fetch:", e);
    throw e;
  }
}

// Narrowly typed with logging — correct pattern
function parseDate(s: string) {
  try {
    return new Date(s);
  } catch (e) {
    logger.warn("Invalid date:", s);
    return null;
  }
}
