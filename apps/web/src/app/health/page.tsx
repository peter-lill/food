import { getLatestHealthSummary } from "@/lib/health/health.repository";
import {
  formatDistance,
  formatLitres,
  formatMinutes,
} from "@/lib/health/health.format";

export const dynamic = "force-dynamic";

export default async function HealthPage() {
  const summary = await getLatestHealthSummary().catch(() => null);

  if (!summary) {
    return (
      <>
        <h1 className="page-title">Health</h1>
        <p className="subtle">Live summaries from the Food Android companion.</p>
        <section className="card" style={{ marginTop: 16 }}>
          <h2 className="section-title">No health data synced</h2>
          <p className="subtle">
            Open the Android companion, enter this Food server address and sync
            token, then tap <strong>Sync to Food</strong>.
          </p>
        </section>
      </>
    );
  }

  const metrics = [
    ["Hydration", formatLitres(summary.hydrationMl)],
    ["Steps", Math.round(summary.steps).toLocaleString("en-AU")],
    ["Active calories", `${Math.round(summary.activeCaloriesKcal)} kcal`],
    ["Total burned", `${Math.round(summary.totalCaloriesKcal)} kcal`],
    ["Exercise", formatMinutes(summary.exerciseMinutes)],
    ["Distance", formatDistance(summary.distanceMetres)],
    ["Sleep", formatMinutes(summary.sleepMinutes)],
    ["Weight", summary.weightKg == null ? "No recent record" : `${summary.weightKg.toFixed(1)} kg`],
  ];

  return (
    <>
      <h1 className="page-title">Health</h1>
      <p className="subtle">
        Live Health Connect summary · last refreshed {new Date(summary.refreshedAt).toLocaleString("en-AU")}
      </p>
      <div className="grid" style={{ marginTop: 16 }}>
        {metrics.map(([label, value]) => (
          <section className="card span-4" key={label}>
            <div className="subtle">{label}</div>
            <div className="metric">{value}</div>
          </section>
        ))}
      </div>
    </>
  );
}
