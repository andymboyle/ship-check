// FALSE POSITIVES — these should NOT be flagged

// Enum/error code values
enum ErrorCode {
  IncorrectPassword = "incorrect-password",
  MissingPassword = "missing-password",
}

// Template variable references
const query = `password: "\${AUTH_PASSWORD}"`;

// Reading from env vars
const key = process.env.API_KEY;
const dbUrl = process.env.DATABASE_URL;

// Placeholder values
const example = "your-api-key-here";
const todo = "REPLACE_ME_WITH_REAL_KEY";

// Test file patterns
const testAuth = `Bearer invalid_access_token`;
