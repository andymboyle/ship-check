// FALSE POSITIVES — these should NOT be flagged

// tRPC client calls (not raw fetch)
const result = await utils.viewer.bookings.find.fetch({ id: bookingId });

// Same-origin / internal fetches
const res = await fetch("/api/auth/session");
const fonts = await fetch("/fonts/Inter-Medium.ttf");

// Fetch with timeout already set
const safe = await fetch("https://api.example.com", {
  signal: AbortSignal.timeout(30_000),
});

// Type definitions (not real calls)
declare function fetch(url: string): Promise<Response>;

// String mentions of fetch (not calls)
const helpText = "Use fetch() to make HTTP requests";
return "hopp.fetch()";

// tRPC client setup (no network call)
const trpcClient = trpc.createClient({
  links: [httpLink({ url: "/api/trpc" })],
});

// Axios with timeout
const client = axios.create({
  baseURL: "https://api.example.com",
  timeout: 30_000,
});
