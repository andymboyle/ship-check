// This file should produce zero findings

async function fetchWithTimeout() {
  const response = await fetch("https://api.example.com", {
    signal: AbortSignal.timeout(30000),
  });
  return response.json();
}

async function handleError() {
  try {
    return await fetchWithTimeout();
  } catch (e) {
    console.error("Failed to fetch:", e);
    throw e;
  }
}

const users = await prisma.user.findMany({
  where: { active: true },
  select: { id: true, name: true },
  take: 50,
});
