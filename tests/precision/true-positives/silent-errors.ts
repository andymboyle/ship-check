// TRUE POSITIVES — these should be flagged

// Empty catch in a payment flow — user gets stuck
async function checkPayment() {
  try {
    const status = await api.getPaymentStatus();
    if (status === "complete") redirect("/success");
  } catch (e) {
  }
}

// Catch returns null in a data-fetching function — callers get null instead of errors
async function loadUserProfile(id: string) {
  try {
    return await db.users.findUnique({ where: { id } });
  } catch (e) {
    return null;
  }
}
