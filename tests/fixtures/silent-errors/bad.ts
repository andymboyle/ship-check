async function fetchData() {
  try {
    return await api.get("/data");
  } catch (e) {
  }
}

async function loadUser(id: string) {
  try {
    return await db.findUser(id);
  } catch (e) {
    console.log("error loading user");
  }
}

async function safeLoad() {
  try {
    return await db.load();
  } catch (e) {
    return null;
  }
}

async function properHandling() {
  try {
    return await api.get("/data");
  } catch (e) {
    console.error("Failed to fetch data", e);
    throw e;
  }
}
