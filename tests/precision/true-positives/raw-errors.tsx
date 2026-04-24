// TRUE POSITIVES — raw error messages shown to users

function ErrorPage({ error }: { error: Error }) {
  return (
    <div className="error-container">
      <h1>Something went wrong</h1>
      <p>{error.message}</p>
    </div>
  );
}

function showError(error: Error) {
  toast(error.message);
}
