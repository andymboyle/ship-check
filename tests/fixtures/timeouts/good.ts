// These all have timeouts — should not be flagged
const safeResponse = await fetch("https://api.example.com/data", {
  signal: AbortSignal.timeout(30000),
});
