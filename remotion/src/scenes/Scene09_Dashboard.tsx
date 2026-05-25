import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { COLORS } from "../constants";

// Scene 10: Dashboard & Analytics
// Duration: 600 frames (20 seconds)

const kpis = [
  { label: "Active Pods", value: 12, suffix: "", color: COLORS.indigo },
  { label: "Queries Today", value: 1847, suffix: "", color: "#D97706" },
  { label: "Success Rate", value: 99.2, suffix: "%", color: "#059669" },
  { label: "Avg Response", value: 2.1, suffix: "s", color: "#7B6FE8" },
];

const chartBars = [
  { label: "Mon", value: 85 },
  { label: "Tue", value: 92 },
  { label: "Wed", value: 78 },
  { label: "Thu", value: 95 },
  { label: "Fri", value: 88 },
  { label: "Sat", value: 45 },
  { label: "Sun", value: 30 },
];

const podMetrics = [
  { name: "ACORD Parser", queries: 423, success: "99.8%", avg: "1.2s" },
  { name: "Quote Gen", queries: 312, success: "98.5%", avg: "3.4s" },
  { name: "Claims FNOL", queries: 189, success: "99.1%", avg: "2.8s" },
  { name: "Policy Compare", queries: 156, success: "99.4%", avg: "4.1s" },
  { name: "Submission Intake", queries: 267, success: "97.9%", avg: "2.2s" },
];

export const Scene09_Dashboard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOpacity = interpolate(frame, [0, 25], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: COLORS.background }}>
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse at 50% 30%, rgba(91,78,212,0.04) 0%, ${COLORS.background} 65%)`,
      }} />

      {/* Header */}
      <div style={{
        position: "absolute", top: 35, left: 80, opacity: headerOpacity,
      }}>
        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 700,
          color: COLORS.indigo, letterSpacing: 5, marginBottom: 6,
        }}>COMMAND CENTER</div>
        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 34, fontWeight: 800,
          color: COLORS.textPrimary,
        }}>Real-Time Pod Analytics</div>
      </div>

      {/* KPI Row */}
      <div style={{
        position: "absolute", top: 130, left: 80, right: 80,
        display: "flex", gap: 20,
      }}>
        {kpis.map((kpi, i) => {
          const delay = 20 + i * 12;
          const kpiScale = spring({ frame: frame - delay, fps, config: { damping: 15, stiffness: 140 } });
          const kpiOpacity = interpolate(frame, [delay, delay + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const countUp = interpolate(frame, [delay + 5, delay + 50], [0, kpi.value], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

          return (
            <div key={i} style={{
              flex: 1, background: COLORS.white,
              borderRadius: 16, padding: "20px 24px",
              border: `1px solid ${COLORS.borderLight}`,
              opacity: kpiOpacity,
              transform: `scale(${0.85 + kpiScale * 0.15})`,
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            }}>
              <div style={{
                fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700,
                color: COLORS.textMuted, letterSpacing: 2, marginBottom: 8,
              }}>{kpi.label}</div>
              <div style={{
                fontFamily: "'Inter', sans-serif", fontSize: 38, fontWeight: 900,
                color: kpi.color,
              }}>
                {kpi.value >= 100 ? Math.floor(countUp).toLocaleString() : countUp.toFixed(1)}{kpi.suffix}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bar Chart */}
      <div style={{
        position: "absolute", left: 80, top: 290, width: 700, bottom: 80,
        background: COLORS.white, borderRadius: 16,
        border: `1px solid ${COLORS.borderLight}`,
        padding: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 4 }}>Query Volume (This Week)</div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: COLORS.textMuted, marginBottom: 20 }}>Total: 1,847 queries processed locally</div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 20, height: "calc(100% - 80px)", paddingBottom: 30 }}>
          {chartBars.map((bar, i) => {
            const barDelay = 80 + i * 12;
            const barHeight = interpolate(frame, [barDelay, barDelay + 40], [0, bar.value], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const barOpacity = interpolate(frame, [barDelay, barDelay + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

            return (
              <div key={i} style={{
                flex: 1, display: "flex", flexDirection: "column",
                alignItems: "center", height: "100%", justifyContent: "flex-end",
                opacity: barOpacity,
              }}>
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 6 }}>{Math.floor(barHeight * 20)}</div>
                <div style={{
                  width: "70%", borderRadius: "6px 6px 0 0",
                  height: `${barHeight}%`,
                  background: `linear-gradient(180deg, ${COLORS.indigo}, ${COLORS.indigoLight})`,
                }} />
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: COLORS.textMuted, marginTop: 6, fontWeight: 600 }}>{bar.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pod Table */}
      <div style={{
        position: "absolute", right: 80, top: 290, width: 540, bottom: 80,
        background: COLORS.white, borderRadius: 16,
        border: `1px solid ${COLORS.borderLight}`,
        padding: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 16 }}>Pod Performance</div>

        <div style={{ display: "flex", padding: "8px 12px", marginBottom: 6, borderBottom: `1px solid ${COLORS.borderLight}` }}>
          {["Pod", "Queries", "Success", "Avg Time"].map((h, i) => (
            <div key={i} style={{
              flex: i === 0 ? 2 : 1,
              fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700,
              color: COLORS.textMuted, letterSpacing: 1,
            }}>{h}</div>
          ))}
        </div>

        {podMetrics.map((pod, i) => {
          const rowDelay = 120 + i * 18;
          const rowOpacity = interpolate(frame, [rowDelay, rowDelay + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const rowX = interpolate(frame, [rowDelay, rowDelay + 12], [30, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

          return (
            <div key={i} style={{
              display: "flex", padding: "12px",
              background: i % 2 === 0 ? COLORS.backgroundMuted : "transparent",
              borderRadius: 8, marginBottom: 4,
              opacity: rowOpacity, transform: `translateX(${rowX}px)`,
            }}>
              <div style={{ flex: 2, fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: COLORS.textPrimary }}>{pod.name}</div>
              <div style={{ flex: 1, fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 700, color: COLORS.indigo }}>{pod.queries}</div>
              <div style={{ flex: 1, fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 700, color: "#059669" }}>{pod.success}</div>
              <div style={{ flex: 1, fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: COLORS.textMuted }}>{pod.avg}</div>
            </div>
          );
        })}

        <div style={{
          position: "absolute", bottom: 20, right: 24,
          display: "flex", alignItems: "center", gap: 6,
          opacity: interpolate(frame, [200, 230], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: "#059669",
            opacity: 0.6 + Math.sin(frame * 0.1) * 0.4,
          }} />
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: "#059669" }}>LIVE</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
