// Fire and forget Promise.all
Promise.all(tasks.map(t => processTask(t)));

// void async call
void sendNotification(userId);

// Async event handler without try/catch
element.addEventListener("click", async (e) => {
  const data = await fetchData();
  render(data);
});

// These should NOT be flagged
await Promise.all(tasks.map(t => processTask(t)));

Promise.all(tasks).catch(err => console.error(err));

element.addEventListener("click", async (e) => {
  try {
    const data = await fetchData();
    render(data);
  } catch (err) {
    console.error(err);
  }
});
