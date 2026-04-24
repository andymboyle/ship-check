// FALSE POSITIVES — these should NOT be flagged

// Server-side logging — not shown to users
function handleApiError(error: Error) {
  logger.error(`Request failed: ${error.message}`);
  this.logger.error("PrismaError:", { message: error.message, stack: error.stack });
  console.error("Handler error:", error.message);
}

// Generic user-facing message — no raw error
function GoodErrorDisplay() {
  return (
    <div className="error-page">
      <p>Something went wrong. Please try again.</p>
    </div>
  );
}

// Error message passed through i18n translation
function TranslatedError({ error }: { error: Error }) {
  return (
    <div className="error-page">
      <p>{t(error.message)}</p>
    </div>
  );
}
