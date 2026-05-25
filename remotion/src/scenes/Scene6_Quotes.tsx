import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { COLORS } from "../constants";

// Scene 7: Quote Generation — Multi-carrier comparison
// Duration: 750 frames (25 seconds)

const carriers = [
  { name: "Hartford", premium: 12400, score: 87, appetite: 75, color: "#3B82F6" },
  { name: "Travelers", premium: 11800, score: 91, appetite: 88, color: "#7C3AED" },
  { name: "Liberty Mutual", premium: 13200, score: 78, appetite: 60, color: "#EC4899" },
  { name: "CNA", premium: 10900, score: 94, appetite: 95, color: COLORS.emerald, recommended: true },
];

export const Scene6_Quotes: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOpacity = interpolate(frame, [0, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const recommendOpacity = interpolate(frame, [350, 420], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: COLORS.background }}>
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse at 50% 50%, rgba(91,78,212,0.04) 0%, ${COLORS.background} 65%)`,
      }} />

      {/* Header */}
      <div style={{
        position: "absolute", top: 50, left: 0, right: 0,
        textAlign: "center", opacity: headerOpacity,
      }}>
        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 700,
          color: COLORS.indigo, letterSpacing: 5, marginBottom: 8,
        }}>QUOTE GENERATION</div>
        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 36, fontWeight: 800,
          color: COLORS.textPrimary,
        }}>4 Carriers · AI-Scored Rankings</div>
        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 500,
          color: COLORS.textSecondary, marginTop: 6,
        }}>From 200+ supported carriers · Top matches for Meridian Construction</div>
      </div>

      {/* Carrier cards */}
      <div style={{
        position: "absolute", top: 200, left: 80, right: 80, bottom: 130,
        display: "flex", gap: 24, justifyContent: "center",
      }}>
        {carriers.map((carrier, i) => {
          const delay = i * 25 + 50;
          const cardScale = spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 140 } });
          const cardOpacity = interpolate(frame, [delay, delay + 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const barHeight = interpolate(frame, [delay + 30, delay + 100], [0, (carrier.premium / 14000) * 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const scoreVal = Math.floor(interpolate(frame, [delay + 40, delay + 120], [0, carrier.score], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));

          return (
            <div key={i} style={{
              flex: 1, maxWidth: 380,
              background: COLORS.white,
              borderRadius: 20,
              border: carrier.recommended
                ? `2px solid ${COLORS.emerald}`
                : `1px solid ${COLORS.borderLight}`,
              padding: 28,
              opacity: cardOpacity,
              transform: `scale(${0.85 + cardScale * 0.15})`,
              boxShadow: carrier.recommended
                ? `0 8px 30px rgba(5,150,105,0.12)`
                : `0 4px 20px rgba(0,0,0,0.04)`,
              position: "relative",
            }}>
              {carrier.recommended && (
                <div style={{
                  position: "absolute", top: -14, left: "50%",
                  transform: "translateX(-50%)",
                  background: COLORS.emerald,
                  color: COLORS.white,
                  fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 800,
                  padding: "4px 16px", borderRadius: 20, letterSpacing: 1,
                  opacity: recommendOpacity,
                }}>⭐ AI RECOMMENDED</div>
              )}

              <div style={{
                fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 800,
                color: COLORS.textPrimary, textAlign: "center", marginBottom: 20,
              }}>{carrier.name}</div>

              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{
                  fontFamily: "'Inter', sans-serif", fontSize: 42, fontWeight: 900,
                  color: COLORS.textPrimary,
                }}>${carrier.premium.toLocaleString()}</div>
                <div style={{
                  fontFamily: "'Inter', sans-serif", fontSize: 13,
                  color: COLORS.textMuted,
                }}>annual premium</div>
              </div>

              <div style={{
                height: 120, display: "flex", alignItems: "flex-end",
                justifyContent: "center", marginBottom: 20,
              }}>
                <div style={{
                  width: 60, borderRadius: "8px 8px 0 0",
                  height: `${barHeight}%`,
                  background: `linear-gradient(180deg, ${carrier.color}, ${carrier.color}88)`,
                }} />
              </div>

              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: COLORS.backgroundMuted, borderRadius: 10,
                padding: "10px 14px",
              }}>
                <div style={{
                  fontFamily: "'Inter', sans-serif", fontSize: 13,
                  color: COLORS.textMuted, fontWeight: 600,
                }}>AI Score</div>
                <div style={{
                  fontFamily: "'Inter', sans-serif", fontSize: 28,
                  color: carrier.recommended ? COLORS.emerald : COLORS.textPrimary,
                  fontWeight: 900,
                }}>{scoreVal}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom */}
      <div style={{
        position: "absolute", bottom: 40, left: 0, right: 0,
        textAlign: "center",
        opacity: interpolate(frame, [450, 520], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      }}>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, color: COLORS.textMuted, fontWeight: 500 }}>
          3 days →{" "}
        </span>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 28, color: COLORS.indigo, fontWeight: 900 }}>
          3 minutes
        </span>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, color: COLORS.emerald, fontWeight: 600, marginLeft: 20 }}>
          🔒 All processing local
        </span>
      </div>
    </AbsoluteFill>
  );
};
