function ErrorDisplay({ error }: { error: Error }) {
  return (
    <div>
      <p>Something went wrong:</p>
      <p>{error.message}</p>
      <pre>{error.stack}</pre>
    </div>
  );
}

function GoodErrorDisplay({ error }: { error: Error }) {
  console.error("UI error:", error);
  return (
    <div>
      <p>Something went wrong. Please try again.</p>
    </div>
  );
}

function showToast(error: Error) {
  toast(error.message);
}
