import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-3xl bg-muted">
          <FileQuestion className="h-9 w-9 text-muted-foreground" />
        </div>

        <h1 className="mb-3 text-3xl font-bold tracking-tight">
          Page not found
        </h1>
        <p className="mb-8 leading-relaxed text-muted-foreground">
          This page does not exist. If you followed a verification link from an
          email, check that it was copied in full.
        </p>

        <Button asChild size="lg">
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to home
          </Link>
        </Button>
      </div>
    </div>
  );
}
