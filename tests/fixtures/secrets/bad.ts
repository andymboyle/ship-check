const password = "realp@ssw0rd123!";
const slackToken = "xoxb-not-a-real-token-but-matches-pattern";
const dbUrl = "postgres://admin:supersecretpassword@db.prod.internal:5432/app";

// These should NOT be flagged
const key = process.env.API_KEY;
const placeholder = "your-api-key-here";
const fromConfig = config.apiKey;
