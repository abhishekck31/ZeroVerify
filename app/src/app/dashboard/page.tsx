"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RedirectToSignIn, useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Inbox,
  RefreshCw,
  Send,
  Shield,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOverview, type OverviewRequest } from "@/actions/overviewActions";

const KIND_LABEL: Record<OverviewRequest["kind"], string> = {
  name: "Name",
  pan: "Name & PAN",
  academic: "Academic",
};

type Filter = "all" | "sent" | "received";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-none">{value}</p>
          <p className="mt-1 truncate text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function RequestRow({ request }: { request: OverviewRequest }) {
  const counterparty = request.sent ? request.recieverEmail : request.email;
  const href = "/" + request.kind + "/" + request.id;

  return (
    <Link
      href={href}
      className="flex flex-col gap-3 rounded-xl border p-4 transition-colors hover:border-primary/50 hover:bg-accent/40 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{KIND_LABEL[request.kind]}</Badge>
          {request.sent ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Send className="h-3 w-3" /> Sent
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Inbox className="h-3 w-3" /> Received
            </span>
          )}
        </div>

        <p className="truncate font-semibold">{request.proverName}</p>

        {request.details.length > 0 && (
          <p className="truncate text-sm text-muted-foreground">
            {request.details
              .filter((d) => d.value)
              .map((d) => d.label + ": " + d.value)
              .join("  ·  ")}
          </p>
        )}

        <p className="truncate text-xs text-muted-foreground">
          {request.sent ? "To" : "From"} {counterparty} ·{" "}
          {formatDate(request.createdAt)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <Badge variant={request.isVerified ? "default" : "secondary"}>
          {request.isVerified ? "Verified" : "Pending"}
        </Badge>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const { isLoaded, isSignedIn } = useUser();

  const [requests, setRequests] = useState<OverviewRequest[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    verified: 0,
    pending: 0,
    sent: 0,
    received: 0,
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getOverview();
      if (!res.success || !res.data) {
        toast.error(res.message);
        return;
      }
      setRequests(res.data.requests);
      setStats(res.data.stats);
    } catch {
      toast.error("Could not load your dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSignedIn) load();
  }, [isSignedIn, load]);

  if (isLoaded && !isSignedIn) return <RedirectToSignIn />;

  const visible = requests.filter((r) =>
    filter === "all" ? true : filter === "sent" ? r.sent : !r.sent
  );

  const tabClass = (active: boolean) =>
    "rounded-md px-3 py-1 text-sm font-medium capitalize transition-colors " +
    (active
      ? "bg-background shadow-sm"
      : "text-muted-foreground hover:text-foreground");

  return (
    <div className="container mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </span>
            Dashboard
          </h1>
          <p className="mt-2 text-muted-foreground">
            Every verification request you have sent or received.
          </p>
        </div>

        <Button onClick={load} variant="outline" disabled={loading}>
          <RefreshCw
            className={"mr-2 h-4 w-4 " + (loading ? "animate-spin" : "")}
          />
          Refresh
        </Button>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Shield className="h-5 w-5 text-primary" />}
          label="Total requests"
          value={stats.total}
        />
        <StatCard
          icon={<CheckCircle2 className="h-5 w-5 text-primary" />}
          label="Verified"
          value={stats.verified}
        />
        <StatCard
          icon={<Clock className="h-5 w-5 text-primary" />}
          label="Pending"
          value={stats.pending}
        />
        <StatCard
          icon={<Send className="h-5 w-5 text-primary" />}
          label="Sent by you"
          value={stats.sent}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>Requests</CardTitle>
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {(["all", "sent", "received"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={tabClass(filter === f)}
              >
                {f}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {loading ? (
            <p className="py-10 text-center text-muted-foreground">Loading…</p>
          ) : visible.length === 0 ? (
            <div className="py-12 text-center">
              <p className="mb-4 text-muted-foreground">
                {requests.length === 0
                  ? "You have no verification requests yet."
                  : "No " + filter + " requests."}
              </p>
              {requests.length === 0 && (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button asChild size="sm">
                    <Link href="/name">Request a name check</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/pan">Request a PAN check</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/academic">Request an academic check</Link>
                  </Button>
                </div>
              )}
            </div>
          ) : (
            visible.map((r) => (
              <RequestRow key={r.kind + "-" + r.id} request={r} />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
