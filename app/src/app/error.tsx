"use client";

import { useEffect } from "react";
import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Route-level error boundary.
 *
 * Without one, a thrown error in any page renders Next.js's raw overlay in
 * development and an unstyled default in production, leaking stack traces.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep the detail server-side; the page shows only a generic message.
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-3xl bg-destructive/10">
          <AlertTriangle className="h-9 w-9 text-destructive" />
        </div>

        <h1 className="mb-3 text-3xl font-bold tracking-tight">
          Something went wrong
        </h1>
        <p className="mb-8 leading-relaxed text-muted-foreground">
          This page could not be loaded. The problem has been logged — trying
          again often resolves it.
        </p>

        {error.digest && (
          <p className="mb-8 font-mono text-xs text-muted-foreground">
            Reference: {error.digest}
          </p>
        )}

        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button onClick={reset} size="lg">
            <RefreshCw className="mr-2 h-4 w-4" />
            Try again
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to home
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
