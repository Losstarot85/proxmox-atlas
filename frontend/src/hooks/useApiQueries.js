/**
 * React Query hooks for discrete API fetches.
 * SSE streaming (useClusterData) is NOT migrated — it's already optimal.
 * These hooks handle REST calls: settings, alerts, clusters, webhook logs.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { API_BASE } from "../config";

// ── Helpers ──

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Settings ──

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => apiFetch("/settings"),
  });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings) =>
      apiFetch("/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });
}

// ── Alerts ──

export function useAlerts(enabled = true) {
  return useQuery({
    queryKey: ["alerts"],
    queryFn: () => apiFetch("/alerts"),
    refetchInterval: 15_000, // Poll every 15s for new alerts
    enabled,
  });
}

export function useDismissAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (alertId) =>
      apiFetch(`/alerts/${alertId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
}

export function useMarkAlertRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (alertId) =>
      apiFetch(`/alerts/${alertId}/read`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
}

export function useSilenceAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ alertId, minutes = 60 }) =>
      apiFetch(`/alerts/${alertId}/silence?minutes=${minutes}`, { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
}

export function useClearAllAlerts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch("/alerts", { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
}

// ── Clusters ──

export function useClusters() {
  return useQuery({
    queryKey: ["clusters"],
    queryFn: () => apiFetch("/clusters"),
  });
}

// ── Webhook Logs ──

export function useWebhookLogs() {
  return useQuery({
    queryKey: ["webhook_logs"],
    queryFn: () => apiFetch("/alerts/webhook_logs"),
    refetchInterval: 30_000,
  });
}

// ── Alert Rules ──

export function useAlertRules() {
  return useQuery({
    queryKey: ["alertRules"],
    queryFn: () => apiFetch("/alerts/rules"),
  });
}

export function useSaveAlertRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rules) =>
      apiFetch("/alerts/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rules),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alertRules"] });
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
  });
}
