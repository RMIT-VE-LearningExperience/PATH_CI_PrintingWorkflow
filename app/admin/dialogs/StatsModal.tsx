"use client";

import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import type { TutorialState } from "../../../lib/tutorial-store";

type AnalyticsData = {
  summary: {
    pageViews: number;
    activeUsers: number;
    sessions: number;
    bounceRate: number;
    avgSessionDuration: number;
  };
  topPages: { path: string; views: number }[];
  dailyViews: { date: string; views: number }[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  getAuthToken: () => Promise<string>;
  state: TutorialState | null;
};

function DailyViewsChart({ rows }: { rows: { date: string; views: number }[] }) {
  const max = Math.max(...rows.map((r) => r.views), 1);
  const chartH = 120;
  const barW = 14;
  const gap = 4;
  const chartW = rows.length * (barW + gap);

  return (
    <Box sx={{ overflowX: "auto" }}>
      <svg width={chartW} height={chartH + 20} style={{ display: "block" }}>
        {rows.map((row, i) => {
          const barH = Math.max(2, Math.round((row.views / max) * chartH));
          const x = i * (barW + gap);
          const y = chartH - barH;
          return (
            <g key={row.date}>
              <rect x={x} y={y} width={barW} height={barH} rx={2} fill="#3D8078" />
              <title>{`${row.date}: ${row.views}`}</title>
              <text
                x={x + barW / 2}
                y={chartH + 14}
                textAnchor="middle"
                fontSize={9}
                fill="#888"
              >
                {row.date.slice(5)}
              </text>
            </g>
          );
        })}
      </svg>
    </Box>
  );
}

function ViewsTable({ rows }: { rows: { label: string; sublabel?: string; views: number }[] }) {
  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
        No data yet — will appear once users navigate to these pages.
      </Typography>
    );
  }
  return (
    <Stack spacing={0}>
      {rows.map(({ label, sublabel, views }, i) => (
        <Stack
          key={i}
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ py: 0.75, borderBottom: "1px solid", borderColor: "divider" }}
        >
          <Box>
            <Typography variant="body2">{label}</Typography>
            {sublabel && (
              <Typography variant="caption" color="text.secondary">{sublabel}</Typography>
            )}
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ ml: 2, flexShrink: 0 }}>
            {views.toLocaleString()} views
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

export default function StatsModal({ open, onClose, getAuthToken, state }: Props) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError("");
    setData(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    getAuthToken()
      .then((token) =>
        fetch("/api/analytics", {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        }),
      )
      .then(async (res) => {
        clearTimeout(timeout);
        if (!res.ok) {
          const d = (await res.json()) as { error?: string };
          setError(d.error ?? "Failed to load analytics");
          return;
        }
        const d = (await res.json()) as AnalyticsData;
        setData(d);
      })
      .catch((err: unknown) => {
        clearTimeout(timeout);
        if ((err as { name?: string }).name !== "AbortError") {
          setError("Failed to load analytics");
        }
      })
      .finally(() => setLoading(false));

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [open, getAuthToken]);

  // ── Derive slug→name maps from Firestore state ────────────────────────

  const { printerBySlug, paperBySlug, level0Name, level1Name } = useMemo(() => {
    const levels = (state?.hierarchy.levels ?? [])
      .filter((l) => l.enabled)
      .sort((a, b) => a.order - b.order);
    const level0 = levels[0];
    const level1 = levels[1];
    const printerBySlug: Record<string, string> = Object.fromEntries(
      (state?.items[level0?.id ?? ""] ?? []).map((i) => [i.slug, i.name]),
    );
    const paperBySlug: Record<string, string> = Object.fromEntries(
      (state?.items[level1?.id ?? ""] ?? []).map((i) => [i.slug, i.name]),
    );
    return {
      printerBySlug,
      paperBySlug,
      level0Name: level0?.name ?? "Printers",
      level1Name: level1?.name ?? "Papers",
    };
  }, [state]);

  // ── Parse topPages into per-level rows ────────────────────────────────

  const { printerRows, paperRows } = useMemo(() => {
    const printerRows: { label: string; views: number }[] = [];
    const paperRows: { label: string; sublabel: string; views: number }[] = [];

    for (const { path, views } of data?.topPages ?? []) {
      const parts = path.split("/").filter(Boolean);
      if (parts.length === 1) {
        const name = printerBySlug[parts[0]];
        if (name) printerRows.push({ label: name, views });
      } else if (parts.length === 2) {
        const paperName = paperBySlug[parts[1]];
        if (paperName) {
          const printerName = printerBySlug[parts[0]] ?? parts[0];
          paperRows.push({ label: paperName, sublabel: `Under ${printerName}`, views });
        }
      }
    }

    // Sort by views descending
    printerRows.sort((a, b) => b.views - a.views);
    paperRows.sort((a, b) => b.views - a.views);

    return { printerRows, paperRows };
  }, [data, printerBySlug, paperBySlug]);

  function fmtDuration(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${s}s`;
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Statistics</DialogTitle>
      <DialogContent>
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress size={36} />
          </Box>
        )}

        {!loading && error && (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
            {error === "Analytics not configured on this environment"
              ? "Analytics is not configured for this environment."
              : error}
          </Typography>
        )}

        {!loading && data && (
          <Stack spacing={3}>
            {/* Summary metrics */}
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              {[
                { label: "Page Views", value: data.summary.pageViews.toLocaleString() },
                { label: "Active Users", value: data.summary.activeUsers.toLocaleString() },
                { label: "Sessions", value: data.summary.sessions.toLocaleString() },
                { label: "Bounce Rate", value: `${(data.summary.bounceRate * 100).toFixed(1)}%` },
                { label: "Avg. Session", value: fmtDuration(data.summary.avgSessionDuration) },
              ].map(({ label, value }) => (
                <Box
                  key={label}
                  sx={{
                    flex: "1 1 140px",
                    p: 2,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1,
                    textAlign: "center",
                  }}
                >
                  <Typography variant="h6" fontWeight={600}>
                    {value}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {label}
                  </Typography>
                </Box>
              ))}
            </Stack>

            <Divider />

            {/* 14-day chart */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
                Daily Views (last 14 days)
              </Typography>
              <DailyViewsChart rows={data.dailyViews} />
            </Box>

            <Divider />

            {/* Printers breakdown */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {level0Name} — Page Views (last 30 days)
              </Typography>
              <ViewsTable rows={printerRows} />
            </Box>

            <Divider />

            {/* Papers breakdown */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {level1Name} — Page Views (last 30 days)
              </Typography>
              <ViewsTable rows={paperRows} />
            </Box>

            <Divider />

            {/* Top pages (raw paths) */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Top Pages (last 30 days)
              </Typography>
              <Stack spacing={0.5}>
                {data.topPages.map(({ path, views }) => (
                  <Stack
                    key={path}
                    direction="row"
                    justifyContent="space-between"
                    sx={{ py: 0.5, borderBottom: "1px solid", borderColor: "divider" }}
                  >
                    <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                      {path}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {views.toLocaleString()}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
