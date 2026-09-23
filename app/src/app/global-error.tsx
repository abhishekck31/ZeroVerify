"use client";

/**
 * Last-resort boundary for errors thrown in the root layout itself.
 *
 * It replaces the whole document, so it has to render its own <html> and
 * <body> and cannot rely on the app's providers, fonts or global stylesheet —
 * hence the inline styles.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          background: "#0a0a0a",
          color: "#fafafa",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "28rem" }}>
          <h1 style={{ fontSize: "1.75rem", marginBottom: "0.75rem" }}>
            ZeroVerify could not start
          </h1>
          <p
            style={{
              color: "#a1a1aa",
              lineHeight: 1.6,
              marginBottom: "2rem",
            }}
          >
            A problem prevented the application from loading. Reloading usually
            resolves it.
          </p>

          {error.digest && (
            <p
              style={{
                color: "#71717a",
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.75rem",
                marginBottom: "2rem",
              }}
            >
              Reference: {error.digest}
            </p>
          )}

          <button
            onClick={reset}
            style={{
              background: "#fafafa",
              color: "#0a0a0a",
              border: "none",
              borderRadius: "9999px",
              padding: "0.7rem 1.6rem",
              fontSize: "0.9rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
