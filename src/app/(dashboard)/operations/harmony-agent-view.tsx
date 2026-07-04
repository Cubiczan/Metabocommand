"use client";

import { useEffect, useState } from "react";
import { AlertCircle, TrendingUp, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { KpiCard } from "@/components/kpi-card";
import {
  harmonyKpis,
  harmonyBottlenecks,
  type OperatingMode,
} from "@/lib/dummy-data-lifetime";
import { resolveHarmonyConflicts } from "@/lib/stigmergy";
import { formatDateTime, cn } from "@/lib/utils";

// Cross-agent conflicts. With STIGMERGY_COORDINATION enabled these are derived
// from the stigmergy board (zero LLM calls); otherwise the static list is used,
// so default behaviour is unchanged. Computed once at module load for a stable,
// deterministic render.
const stigmergyEnabled = process.env.NEXT_PUBLIC_STIGMERGY_COORDINATION === "1";
const harmonyConflicts = resolveHarmonyConflicts(stigmergyEnabled);

export function HarmonyAgentView({ initialMode }: { initialMode: OperatingMode }) {
  const [isActive, setIsActive] = useState(true);
  const [mode, setMode] = useState<OperatingMode>(initialMode);
  const [pendingMode, setPendingMode] = useState<OperatingMode | null>(null);
  const [saving, setSaving] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [submittedIds, setSubmittedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  // Subscribe to mode changes broadcast by other tabs/users
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("harmony-mode-sync")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "app_settings", filter: "key=eq.operating_mode" },
        (payload) => {
          const newValue = (payload.new as { value: string }).value;
          if (newValue === "growth" || newValue === "efficiency") {
            setMode(newValue);
            setToast(`Operating mode changed to ${newValue === "growth" ? "Growth" : "Efficiency"}`);
            setTimeout(() => setToast(null), 3000);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function confirmModeChange() {
    if (!pendingMode) return;
    setSaving(true);
    try {
      const res = await fetch("/api/operating-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: pendingMode }),
      });
      if (res.ok) {
        setMode(pendingMode);
        setPendingMode(null);
      } else {
        setToast("Failed to update operating mode");
        setTimeout(() => setToast(null), 3000);
      }
    } finally {
      setSaving(false);
    }
  }

  async function submitBottleneck(b: typeof harmonyBottlenecks[number]) {
    setSubmittingId(b.id);
    try {
      const res = await fetch("/api/approvals/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_name: "Harmony Agent",
          queue: "operations",
          action_description: `Resolve ${b.area} bottleneck: ${b.proposedResolution} (impact: ${b.impact})`,
          financial_impact: b.impact,
          impact_amount: null,
        }),
      });
      if (res.ok) setSubmittedIds((prev) => new Set(prev).add(b.id));
    } finally {
      setSubmittingId(null);
    }
  }

  const modeLabel = mode === "growth" ? "Growth" : "Efficiency";
  const modeColor = mode === "growth" ? "text-emerald-700" : "text-indigo-700";
  const modeIcon = mode === "growth" ? TrendingUp : Zap;
  const ModeIcon = modeIcon;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Harmony Agent</CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              Cross-agent conflict resolution and operating mode orchestration
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("text-xs font-medium", isActive ? "text-emerald-700" : "text-slate-500")}>
              {isActive ? "Active" : "Paused"}
            </span>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard
              label="Active Conflicts"
              value={String(harmonyKpis.activeConflicts)}
              trend="down"
              subtext="Requires review"
            />
            <KpiCard
              label="System Velocity Score"
              value={harmonyKpis.systemVelocityScore.toFixed(2)}
              trend="up"
              subtext="Weighted avg of all agents"
            />
            <div>
              <Card className="h-full">
                <CardContent className="p-5 flex flex-col">
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Current Operating Mode
                  </div>
                  <div className={cn("mt-2 text-2xl font-semibold flex items-center gap-2", modeColor)}>
                    <ModeIcon className="h-5 w-5" />
                    {modeLabel}
                  </div>
                  <div className="mt-auto pt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant={mode === "growth" ? "default" : "outline"}
                      disabled={!isActive || saving || mode === "growth"}
                      onClick={() => setPendingMode("growth")}
                    >
                      <TrendingUp className="h-3.5 w-3.5" />
                      Growth
                    </Button>
                    <Button
                      size="sm"
                      variant={mode === "efficiency" ? "default" : "outline"}
                      disabled={!isActive || saving || mode === "efficiency"}
                      onClick={() => setPendingMode("efficiency")}
                    >
                      <Zap className="h-3.5 w-3.5" />
                      Efficiency
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Active agent conflicts</h3>
            <div className="space-y-3">
              {harmonyConflicts.map((c) => (
                <div key={c.id} className="rounded-md border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {c.agents.map((a) => (
                          <Badge key={a} variant="pending">{a}</Badge>
                        ))}
                        <span className="text-xs text-slate-500">· detected {formatDateTime(c.detectedAt)}</span>
                      </div>
                      <div className="mt-2 text-sm">
                        <span className="text-xs font-medium text-rose-700 uppercase tracking-wider">Conflict</span>
                        <p className="text-slate-700 mt-0.5">{c.conflictingActions}</p>
                      </div>
                      <div className="mt-2 text-sm">
                        <span className="text-xs font-medium text-emerald-700 uppercase tracking-wider">Harmony resolution</span>
                        <p className="text-slate-700 mt-0.5">{c.resolution}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">System bottlenecks</h3>
            <div className="space-y-3">
              {harmonyBottlenecks.map((b) => {
                const submitted = submittedIds.has(b.id);
                return (
                  <div key={b.id} className="rounded-md border border-slate-200 bg-white p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="reviewing">{b.area}</Badge>
                        </div>
                        <p className="text-sm text-slate-700 mt-2">{b.description}</p>
                        <div className="mt-2 text-xs">
                          <span className="text-slate-500">Impact: </span>
                          <span className="text-rose-700 font-medium">{b.impact}</span>
                        </div>
                        <div className="mt-2 text-sm">
                          <span className="text-xs font-medium text-emerald-700 uppercase tracking-wider">Proposed</span>
                          <p className="text-slate-700 mt-0.5">{b.proposedResolution}</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        disabled={!isActive || submitted || submittingId === b.id}
                        onClick={() => submitBottleneck(b)}
                      >
                        {submitted ? "Queued" : submittingId === b.id ? "Submitting…" : "Submit for Approval"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <Modal
        open={pendingMode !== null}
        onOpenChange={(open) => !open && setPendingMode(null)}
        title={`Switch to ${pendingMode === "growth" ? "Growth" : "Efficiency"} mode?`}
        description="Operating mode changes affect default parameters across all agents (spend aggressiveness, inventory targets, Sniper thresholds). All active users will be notified."
        footer={
          <>
            <Button variant="outline" onClick={() => setPendingMode(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={confirmModeChange} disabled={saving}>
              {saving ? "Switching…" : `Confirm ${pendingMode === "growth" ? "Growth" : "Efficiency"}`}
            </Button>
          </>
        }
      >
        {pendingMode === "growth" ? (
          <div className="text-sm text-slate-700 space-y-2">
            <p><strong>Growth Mode</strong> enables aggressive expansion defaults:</p>
            <ul className="list-disc list-inside text-slate-600 space-y-1">
              <li>Acquisition spend caps increase by 25%</li>
              <li>Inventory targets extended to 8-week coverage</li>
              <li>Sniper threshold raised to $800/mo (less aggressive cancellation)</li>
            </ul>
          </div>
        ) : (
          <div className="text-sm text-slate-700 space-y-2">
            <p><strong>Efficiency Mode</strong> tightens capital discipline:</p>
            <ul className="list-disc list-inside text-slate-600 space-y-1">
              <li>Acquisition spend caps decrease by 15%</li>
              <li>Inventory targets compressed to 4-week coverage</li>
              <li>Sniper threshold lowered to $300/mo (more aggressive cancellation)</li>
            </ul>
          </div>
        )}
      </Modal>

      {toast && (
        <div className="fixed top-6 right-6 z-50 rounded-md bg-slate-900 text-white text-sm px-4 py-3 shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}
