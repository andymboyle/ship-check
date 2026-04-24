// TRUE POSITIVES — these should ALL be flagged as missing-timeouts HIGH

// External API calls without timeout
const response = await fetch("https://login.microsoftonline.com/oauth/token", {
  method: "POST",
  body: JSON.stringify(data),
});

const feishuResult = await fetch(`${this.url}/calendar/events`, {
  headers: { Authorization: `Bearer ${token}` },
});

const dailyResponse = await fetch("https://api.daily.co/v1/rooms", {
  headers: { Authorization: `Bearer ${DAILY_API_KEY}` },
});

const client = axios.create({
  baseURL: "https://api.external-service.com",
});

const webhookResponse = await axios.post("https://api.trigger.dev/v1/deploy", payload);
