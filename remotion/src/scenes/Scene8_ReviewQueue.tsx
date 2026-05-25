import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { COLORS } from "../constants";

// Scene 9: Human-in-the-Loop Review Queue
// Duration: 900 frames (30 seconds)

export const Scene8_ReviewQueue: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOpacity = interpolate(frame, [0, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const card1Scale = spring({ frame: frame - 50, fps, config: { damping: 15, stiffness: 120 } });
  const card1Opacity = interpolate(frame, [50, 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const confBar1 = interpolate(frame, [80, 160], [0, 94], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const card2Scale = spring({ frame: frame - 130, fps, config: { damping: 15, stiffness: 120 } });
  const card2Opacity = interpolate(frame, [130, 150], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const confBar2 = interpolate(frame, [160, 230], [0, 67], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const approveFrame = 450;
  const approveProgress = spring({ frame: frame - approveFrame, fps, config: { damping: 10, stiffness: 200 } });
  const showApprove = frame >= approveFrame;

  const metricsOpacity = interpolate(frame, [250, 320], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: COLORS.background }}>
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse at 60% 40%, rgba(91,78,212,0.04) 0%, ${COLORS.background} 60%)`,
      }} />

      {/* Header */}
      <div style={{
        position: "absolute", top: 40, left: 80,
        opacity: headerOpacity,
      }}>
        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 700,
          color: COLORS.indigo, letterSpacing: 5, marginBottom: 8,
        }}>HUMAN-IN-THE-LOOP</div>
        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 36, fontWeight: 800,
          color: COLORS.textPrimary,
        }}>Review Queue</div>
        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 15,
          color: COLORS.textSecondary, marginTop: 4,
        }}>AI recommends · Humans decide · Every decision audited</div>
      </div>

      {/* Pending badge */}
      <div style={{
        position: "absolute", top: 50, right: 80,
        background: COLORS.white, borderRadius: 12,
        padding: "10px 20px", border: `1px solid ${COLORS.borderLight}`,
        opacity: headerOpacity,
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}>
        <span style={{
          fontFamily: "'Inter', sans-serif", fontSize: 32, fontWeight: 900,
          color: COLORS.indigo,
        }}>12</span>
        <span style={{
          fontFamily: "'Inter', sans-serif", fontSize: 14,
          color: COLORS.textMuted, marginLeft: 8,
        }}>pending</span>
      </div>

      {/* Card 1: Quote Approval */}
      <div style={{
        position: "absolute", left: 80, top: 160, right: 420,
        background: COLORS.white, borderRadius: 16,
        border: showApprove ? `2px solid ${COLORS.emerald}` : `1px solid ${COLORS.borderLight}`,
        padding: 24, overflow: "hidden",
        opacity: card1Opacity,
        transform: `scale(${0.9 + card1Scale * 0.1})`,
        boxShadow: showApprove ? `0 4px 20px rgba(5,150,105,0.1)` : "0 2px 8px rgba(0,0,0,0.04)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{
            fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700,
            color: COLORS.amber, letterSpacing: 2,
          }}>⚡ HIGH PRIORITY — QUOTE APPROVAL</div>
          <div style={{
            fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600,
            color: COLORS.emerald, background: "rgba(5,150,105,0.08)",
            padding: "3px 10px", borderRadius: 6,
          }}>🔒 Private</div>
        </div>

        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 700,
          color: COLORS.textPrimary, marginBottom: 6,
        }}>Meridian Construction LLC</div>
        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 13,
          color: COLORS.textSecondary, marginBottom: 16,
        }}>Pod: Quote Generation · CNA $10,900</div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: COLORS.textMuted, fontWeight: 600 }}>Confidence</span>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: COLORS.emerald, fontWeight: 800 }}>{Math.floor(confBar1)}%</span>
          </div>
          <div style={{ height: 8, background: COLORS.backgroundMuted, borderRadius: 4 }}>
            <div style={{
              height: "100%", width: `${confBar1}%`, borderRadius: 4,
              background: `linear-gradient(90deg, ${COLORS.indigo}, ${COLORS.emerald})`,
            }} />
          </div>
        </div>

        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600,
          color: showApprove ? COLORS.emerald : COLORS.textPrimary, marginBottom: 12,
        }}>
          {showApprove ? "✅ APPROVED" : "AI Recommendation: ✅ APPROVE"}
        </div>

        {!showApprove && (
          <div style={{ display: "flex", gap: 10 }}>
            {["✅ Approve", "❌ Reject", "📝 Notes"].map((btn, i) => (
              <div key={i} style={{
                fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600,
                color: i === 0 ? COLORS.white : COLORS.textPrimary,
                background: i === 0 ? COLORS.emerald : COLORS.backgroundMuted,
                padding: "6px 14px", borderRadius: 8,
                border: `1px solid ${i === 0 ? COLORS.emerald : COLORS.borderLight}`,
              }}>{btn}</div>
            ))}
          </div>
        )}
      </div>

      {/* Card 2: Fraud flagged */}
      <div style={{
        position: "absolute", left: 80, top: 520, right: 420,
        background: COLORS.white, borderRadius: 16,
        border: `1px solid rgba(220,38,38,0.2)`,
        padding: 24,
        opacity: card2Opacity,
        transform: `scale(${0.9 + card2Scale * 0.1})`,
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}>
        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700,
          color: COLORS.rose, letterSpacing: 2, marginBottom: 10,
        }}>⚠️ FLAGGED — FRAUD PATTERN DETECTED</div>

        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 700,
          color: COLORS.textPrimary, marginBottom: 6,
        }}>Claim #CLM-2847 — Vehicle Collision</div>
        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 13,
          color: COLORS.textSecondary, marginBottom: 14,
        }}>3 prior claims in 18 months · Same body shop · Escalating amounts</div>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: COLORS.textMuted, fontWeight: 600 }}>Confidence</span>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: COLORS.amber, fontWeight: 800 }}>{Math.floor(confBar2)}%</span>
        </div>
        <div style={{ height: 8, background: COLORS.backgroundMuted, borderRadius: 4, marginBottom: 12 }}>
          <div style={{
            height: "100%", width: `${confBar2}%`, borderRadius: 4,
            background: `linear-gradient(90deg, ${COLORS.rose}, ${COLORS.amber})`,
          }} />
        </div>

        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 13,
          color: COLORS.amber, fontWeight: 600,
        }}>⚠️ Auto-routed: confidence below 95% threshold</div>
      </div>

      {/* Right side: Metrics */}
      <div style={{
        position: "absolute", right: 80, top: 160, width: 300,
        opacity: metricsOpacity,
      }}>
        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 700,
          color: COLORS.textMuted, letterSpacing: 2, marginBottom: 16,
        }}>TODAY'S METRICS</div>

        {[
          { label: "Total Decisions", value: "47", color: COLORS.textPrimary },
          { label: "Auto-approved", value: "35 (74%)", color: COLORS.emerald },
          { label: "Human-reviewed", value: "10 (21%)", color: COLORS.indigo },
          { label: "Escalated", value: "2 (4%)", color: COLORS.amber },
          { label: "AI Accuracy", value: "97%", color: COLORS.emerald },
        ].map((m, i) => (
          <div key={i} style={{
            display: "flex", justifyContent: "space-between",
            padding: "10px 0",
            borderBottom: `1px solid ${COLORS.borderLight}`,
          }}>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: COLORS.textSecondary }}>{m.label}</span>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 800, color: m.color }}>{m.value}</span>
          </div>
        ))}

        {/* Threshold slider */}
        <div style={{
          marginTop: 24, background: COLORS.backgroundMuted,
          borderRadius: 12, padding: 16,
          border: `1px solid ${COLORS.borderLight}`,
        }}>
          <div style={{
            fontFamily: "'Inter', sans-serif", fontSize: 12,
            color: COLORS.textMuted, fontWeight: 600, marginBottom: 10,
          }}>Auto-approve threshold</div>
          <div style={{ height: 6, background: COLORS.borderLight, borderRadius: 3, position: "relative" }}>
            <div style={{
              height: "100%", width: "95%", borderRadius: 3,
              background: `linear-gradient(90deg, ${COLORS.indigo}, ${COLORS.emerald})`,
            }} />
            <div style={{
              position: "absolute", top: -5, left: "95%",
              width: 16, height: 16, borderRadius: "50%",
              background: COLORS.white, border: `3px solid ${COLORS.indigo}`,
              transform: "translateX(-50%)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: COLORS.textMuted }}>0%</span>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: COLORS.indigo, fontWeight: 700 }}>95%</span>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: COLORS.textMuted }}>100%</span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
