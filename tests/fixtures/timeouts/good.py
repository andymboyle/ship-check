import httpx

# These all have timeouts — should not be flagged
safe_client = httpx.AsyncClient(timeout=30.0)
