// TRUE POSITIVES — fire-and-forget that loses errors

// Promise.all without await — emails silently fail
Promise.all(users.map(u => sendEmail(u)));

// Promise.all in webhook handler — webhooks never fire
async function handleWebhooks() {
  const fetchPromises = webhooks.map(w => fetch(w.url));
  Promise.all(fetchPromises);
}
