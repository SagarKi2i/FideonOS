import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { COLORS, GRADIENTS } from "../constants";

// Scene 4: AI Marketplace — Three ecosystem columns
// Duration: 750 frames (25 seconds)

const ecosystems = [
  {
    icon: "💼",
    label: "BROKER",
    pods: ["Quote Generation", "Policy Compare", "ACORD Parse", "Doc Retrieval", "Renewal Review"],
    color: COLORS.indigo,
  },
  {
    icon: "🏢",
    label: "MGA",
    pods: ["Submission Intake", "Appetite Match", "Risk Score", "Bind Authority", "Portfolio"],
    color: "#D97706",
  },
  {
    icon: "🛡️",
    label: "CARRIER",
    pods: ["Claims FNOL", "Adjudication", "Fraud Detect", "Subrogation", "Reserve Calc"],
    color: "#059669",
  },
];

export const Scene4_Marketplace: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOpacity = interpolate(frame, [0, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const statsOpacity = interpolate(frame, [350, 420], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: COLORS.background }}>
      <div style={{ position: "absolute", inset: 0, background: GRADIENTS.subtleBg }} />

      {/* Header */}
      <div style={{
        position: "absolute", top: 60, left: 0, right: 0,
        textAlign: "center", opacity: headerOpacity,
      }}>
        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 600,
          color: COLORS.indigo, letterSpacing: 6, marginBottom: 12,
        }}>AI MARKETPLACE</div>
        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 40, fontWeight: 800,
          color: COLORS.textPrimary,
        }}>20+ Specialized AI Pods</div>
      </div>

      {/* Three columns */}
      <div style={{
        position: "absolute", top: 200, left: 100, right: 100, bottom: 160,
        display: "flex", gap: 40, justifyContent: "center",
      }}>
        {ecosystems.map((eco, colIdx) => {
          const colDelay = colIdx * 30 + 60;
          const colScale = spring({ frame: frame - colDelay, fps, config: { damping: 15, stiffness: 120 } });
          const colOpacity = interpolate(frame, [colDelay, colDelay + 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

          return (
            <div key={colIdx} style={{
              flex: 1, maxWidth: 480,
              background: COLORS.white,
              borderRadius: 20,
              border: `1px solid ${COLORS.borderLight}`,
              padding: "30px 24px",
              opacity: colOpacity,
              transform: `scale(${0.85 + colScale * 0.15}) translateY(${(1 - colScale) * 30}px)`,
              boxShadow: `0 10px 40px rgba(91,78,212,0.06), 0 2px 8px rgba(0,0,0,0.04)`,
            }}>
              <div style={{ textAlign: "center", marginBottom: 24 }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>{eco.icon}</div>
                <div style={{
                  fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 800,
                  color: COLORS.textPrimary, letterSpacing: 3,
                }}>{eco.label}</div>
                <div style={{
                  width: 60, height: 3, background: eco.color,
                  margin: "10px auto 0", borderRadius: 2,
                }} />
              </div>

              {eco.pods.map((pod, podIdx) => {
                const podDelay = colDelay + 40 + podIdx * 15;
                const podOpacity = interpolate(frame, [podDelay, podDelay + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
                const podX = interpolate(frame, [podDelay, podDelay + 12], [20, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

                return (
                  <div key={podIdx} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px", marginBottom: 6,
                    background: COLORS.backgroundMuted,
                    borderRadius: 10,
                    borderLeft: `3px solid ${eco.color}`,
                    opacity: podOpacity,
                    transform: `translateX(${podX}px)`,
                  }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: eco.color,
                    }} />
                    <div style={{
                      fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 500,
                      color: COLORS.textPrimary,
                    }}>{pod}</div>
                    <div style={{
                      marginLeft: "auto",
                      fontFamily: "'Inter', sans-serif", fontSize: 11,
                      color: COLORS.emerald, fontWeight: 600,
                    }}>🔒</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Bottom stats bar */}
      <div style={{
        position: "absolute", bottom: 50, left: 0, right: 0,
        display: "flex", justifyContent: "center", gap: 60,
        opacity: statsOpacity,
      }}>
        {["200+ Carriers", "6 AMS Integrations", "One-Click Activation", "Zero Data Exposure"].map((s, i) => (
          <div key={i} style={{
            fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 600,
            color: COLORS.textSecondary, letterSpacing: 1,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ color: COLORS.indigo }}>▪</span> {s}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
