import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { COLORS, GRADIENTS } from "../constants";

// Scene 6: Policy Comparison — Side-by-side with gap highlighting
// Duration: 750 frames (25 seconds)

const policyA = {
  name: "Current Policy — Hartford",
  sections: [
    { label: "GL Each Occurrence", value: "$1,000,000", match: true },
    { label: "GL Aggregate", value: "$2,000,000", match: true },
    { label: "Products/Completed Ops", value: "$1,000,000", match: false, gap: true },
    { label: "Professional Liability", value: "NOT INCLUDED", match: false, gap: true },
    { label: "Cyber Liability", value: "NOT INCLUDED", match: false, gap: true },
    { label: "Umbrella", value: "$5,000,000", match: false },
    { label: "Workers Comp", value: "Statutory", match: true },
    { label: "Commercial Auto", value: "$500,000 CSL", match: false },
  ],
};

const policyB = {
  name: "Proposed Policy — Travelers",
  sections: [
    { label: "GL Each Occurrence", value: "$1,000,000", match: true },
    { label: "GL Aggregate", value: "$2,000,000", match: true },
    { label: "Products/Completed Ops", value: "$2,000,000", match: false, better: true },
    { label: "Professional Liability", value: "$1,000,000", match: false, better: true },
    { label: "Cyber Liability", value: "$500,000", match: false, better: true },
    { label: "Umbrella", value: "$10,000,000", match: false, better: true },
    { label: "Workers Comp", value: "Statutory", match: true },
    { label: "Commercial Auto", value: "$1,000,000 CSL", match: false, better: true },
  ],
};

export const Scene05_PolicyCompare: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOpacity = interpolate(frame, [0, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const policyAX = interpolate(
    spring({ frame: frame - 30, fps, config: { damping: 20, stiffness: 80 } }),
    [0, 1], [-400, 0]
  );
  const policyBX = interpolate(
    spring({ frame: frame - 45, fps, config: { damping: 20, stiffness: 80 } }),
    [0, 1], [400, 0]
  );
  const policyOpacity = interpolate(frame, [30, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const connectPhase = interpolate(frame, [180, 350], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const gapPhase = interpolate(frame, [350, 500], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const summaryOpacity = interpolate(frame, [520, 560], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const bottomOpacity = interpolate(frame, [600, 650], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: COLORS.background }}>
      <div style={{ position: "absolute", inset: 0, background: GRADIENTS.subtleBg }} />

      {/* Header */}
      <div style={{
        position: "absolute", top: 40, left: 0, right: 0,
        textAlign: "center", opacity: headerOpacity,
      }}>
        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 700,
          color: COLORS.indigo, letterSpacing: 5, marginBottom: 8,
        }}>POLICY COMPARISON</div>
        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 36, fontWeight: 800,
          color: COLORS.textPrimary,
        }}>AI-Powered Side-by-Side Analysis</div>
      </div>

      {/* Policy A — Left */}
      <div style={{
        position: "absolute", left: 60, top: 160, width: 550, bottom: 130,
        background: COLORS.white,
        borderRadius: 20,
        border: `1px solid ${COLORS.borderLight}`,
        padding: "24px 28px",
        opacity: policyOpacity,
        transform: `translateX(${policyAX}px)`,
        boxShadow: "0 4px 20px rgba(0,0,0,0.04)",
      }}>
        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 700,
          color: COLORS.amber, letterSpacing: 2, marginBottom: 6,
        }}>POLICY A</div>
        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 800,
          color: COLORS.textPrimary, marginBottom: 20,
        }}>{policyA.name}</div>

        {policyA.sections.map((section, i) => {
          const rowDelay = 80 + i * 20;
          const rowOpacity = interpolate(frame, [rowDelay, rowDelay + 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const isGap = section.gap && gapPhase > i / policyA.sections.length;

          return (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 14px", marginBottom: 6,
              background: isGap ? "rgba(220,38,38,0.06)" : COLORS.backgroundMuted,
              borderRadius: 8,
              borderLeft: isGap ? `3px solid ${COLORS.rose}` : section.match ? `3px solid ${COLORS.emerald}` : `3px solid transparent`,
              opacity: rowOpacity,
            }}>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: COLORS.textSecondary }}>{section.label}</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700, color: isGap ? COLORS.rose : section.match ? COLORS.emerald : COLORS.textPrimary }}>{section.value}</div>
            </div>
          );
        })}
      </div>

      {/* Policy B — Right */}
      <div style={{
        position: "absolute", right: 60, top: 160, width: 550, bottom: 130,
        background: COLORS.white,
        borderRadius: 20,
        border: `1px solid ${COLORS.borderSubtle}`,
        padding: "24px 28px",
        opacity: policyOpacity,
        transform: `translateX(${policyBX}px)`,
        boxShadow: "0 4px 20px rgba(91,78,212,0.06)",
      }}>
        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 700,
          color: COLORS.emerald, letterSpacing: 2, marginBottom: 6,
        }}>POLICY B</div>
        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 800,
          color: COLORS.textPrimary, marginBottom: 20,
        }}>{policyB.name}</div>

        {policyB.sections.map((section, i) => {
          const rowDelay = 100 + i * 20;
          const rowOpacity = interpolate(frame, [rowDelay, rowDelay + 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const isBetter = section.better && gapPhase > i / policyB.sections.length;

          return (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 14px", marginBottom: 6,
              background: isBetter ? "rgba(5,150,105,0.06)" : COLORS.backgroundMuted,
              borderRadius: 8,
              borderLeft: isBetter ? `3px solid ${COLORS.emerald}` : section.match ? `3px solid ${COLORS.emerald}` : `3px solid transparent`,
              opacity: rowOpacity,
            }}>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: COLORS.textSecondary }}>{section.label}</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700, color: isBetter ? COLORS.emerald : section.match ? COLORS.emerald : COLORS.textPrimary }}>{section.value}</div>
            </div>
          );
        })}
      </div>

      {/* Center connection lines */}
      <div style={{
        position: "absolute", left: 610, top: 235, width: 140, bottom: 150,
        display: "flex", flexDirection: "column", justifyContent: "space-around",
        alignItems: "center",
      }}>
        {policyA.sections.map((_, i) => {
          const lineDelay = i / policyA.sections.length;
          const lineOpacity = connectPhase > lineDelay ? interpolate(connectPhase, [lineDelay, lineDelay + 0.15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
          const isGap = policyA.sections[i].gap;

          return (
            <div key={i} style={{
              width: "100%", height: 2,
              background: isGap
                ? `linear-gradient(90deg, ${COLORS.rose}, ${COLORS.amber})`
                : policyA.sections[i].match
                  ? `linear-gradient(90deg, ${COLORS.emerald}66, ${COLORS.emerald}66)`
                  : COLORS.borderLight,
              opacity: lineOpacity, borderRadius: 1,
            }} />
          );
        })}
      </div>

      {/* Gap summary */}
      <div style={{
        position: "absolute", left: "50%", transform: "translate(-50%, 0)",
        bottom: 45, opacity: summaryOpacity,
        display: "flex", gap: 30,
      }}>
        {[
          { label: "Coverage Gaps Found", value: "3", color: COLORS.rose },
          { label: "Improvements", value: "5", color: COLORS.emerald },
          { label: "Analysis Time", value: "12 sec", color: COLORS.indigo },
        ].map((stat, i) => (
          <div key={i} style={{
            background: COLORS.white, borderRadius: 12,
            padding: "12px 24px", border: `1px solid ${COLORS.borderLight}`,
            textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 28, fontWeight: 900, color: stat.color }}>{stat.value}</div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: COLORS.textMuted, letterSpacing: 1 }}>{stat.label}</div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
