import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { COLORS } from "../constants";

// Scene 5: Document Intelligence — ACORD parsing + data extraction
// Duration: 900 frames (30 seconds)

const fields = [
  { label: "Named Insured", value: "Meridian Construction LLC", delay: 80 },
  { label: "Policy Period", value: "01/01/2025 → 01/01/2026", delay: 120 },
  { label: "GL Limits", value: "$1M occ / $2M aggregate", delay: 160 },
  { label: "Prof Liability", value: "$500,000 per claim", delay: 200 },
  { label: "Workers Comp", value: "Statutory / $250K EL", delay: 240 },
  { label: "Commercial Auto", value: "$1,000,000 CSL · 12 vehicles", delay: 280 },
];

export const Scene5_DocumentAI: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scanProgress = interpolate(frame, [20, 200], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const scanOpacity = frame > 200 ? Math.max(0, 1 - (frame - 200) / 20) : (frame > 20 ? 1 : 0);

  const timeValue = interpolate(frame, [30, 250], [0, 4.2], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fieldsExtracted = Math.floor(interpolate(frame, [60, 300], [0, 47], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));

  const badgeOpacity = interpolate(frame, [350, 420], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const badgeScale = spring({ frame: frame - 360, fps, config: { damping: 12, stiffness: 150 } });

  return (
    <AbsoluteFill style={{ background: COLORS.background }}>
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse at 30% 50%, rgba(91,78,212,0.05) 0%, ${COLORS.background} 60%)`,
      }} />

      {/* Left side: ACORD form */}
      <div style={{
        position: "absolute", left: 80, top: 100, bottom: 100, width: 600,
        background: COLORS.backgroundMuted,
        border: `1px solid ${COLORS.borderLight}`,
        borderRadius: 16,
        overflow: "hidden",
        padding: 30,
      }}>
        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 700,
          color: COLORS.textMuted, letterSpacing: 2, marginBottom: 8,
        }}>ACORD 125</div>
        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 24, fontWeight: 800,
          color: COLORS.textPrimary, marginBottom: 20,
        }}>Commercial Insurance Application</div>

        {Array.from({ length: 18 }, (_, i) => {
          const lineWidth = 40 + Math.sin(i * 2.3) * 30;
          const isScanned = scanProgress > (i / 18) * 100;
          return (
            <div key={i} style={{
              height: 12, marginBottom: 14,
              width: `${lineWidth}%`,
              background: isScanned ? `rgba(91,78,212,0.15)` : COLORS.borderLight,
              borderRadius: 3,
            }} />
          );
        })}

        {/* Scan line */}
        <div style={{
          position: "absolute", left: 0, right: 0,
          top: `${8 + scanProgress * 0.85}%`,
          height: 3,
          background: `linear-gradient(90deg, transparent, ${COLORS.indigo}, ${COLORS.amber}, transparent)`,
          opacity: scanOpacity,
          boxShadow: `0 0 20px rgba(91,78,212,0.3)`,
        }} />
      </div>

      {/* Right side: Extracted data */}
      <div style={{
        position: "absolute", right: 80, top: 100, bottom: 100, width: 600,
        display: "flex", flexDirection: "column", gap: 10,
        padding: "20px 0",
      }}>
        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 700,
          color: COLORS.emerald, letterSpacing: 3, marginBottom: 10,
          opacity: interpolate(frame, [60, 90], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}>🔒 EXTRACTED — PROCESSED LOCALLY</div>

        {fields.map((field, i) => {
          const fieldProgress = spring({ frame: frame - field.delay, fps, config: { damping: 15, stiffness: 150 } });
          const fieldOpacity = interpolate(frame, [field.delay, field.delay + 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

          return (
            <div key={i} style={{
              background: COLORS.white,
              borderRadius: 12,
              padding: "14px 20px",
              borderLeft: `3px solid ${COLORS.indigo}`,
              border: `1px solid ${COLORS.borderLight}`,
              borderLeftWidth: 3,
              borderLeftColor: COLORS.indigo,
              opacity: fieldOpacity,
              transform: `translateX(${(1 - fieldProgress) * 40}px)`,
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            }}>
              <div style={{
                fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600,
                color: COLORS.textMuted, letterSpacing: 1, marginBottom: 4,
              }}>{field.label}</div>
              <div style={{
                fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 700,
                color: COLORS.textPrimary,
              }}>{field.value}</div>
            </div>
          );
        })}

        {/* Stats row */}
        <div style={{
          display: "flex", gap: 20, marginTop: 10,
          opacity: badgeOpacity,
          transform: `scale(${0.9 + badgeScale * 0.1})`,
        }}>
          {[
            { label: "PROCESSING TIME", value: `${timeValue.toFixed(1)}s`, color: COLORS.emerald, bg: "rgba(5,150,105,0.08)" },
            { label: "FIELDS EXTRACTED", value: `${fieldsExtracted}/47`, color: COLORS.indigo, bg: "rgba(91,78,212,0.08)" },
            { label: "DATA SENT", value: "0 bytes", valueColor: COLORS.emerald, color: COLORS.amber, bg: "rgba(217,119,6,0.08)" },
          ].map((stat, i) => (
            <div key={i} style={{
              background: stat.bg,
              borderRadius: 10, padding: "10px 18px",
              border: `1px solid ${stat.color}22`,
            }}>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: stat.color, fontWeight: 600 }}>{stat.label}</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 28, color: stat.valueColor || COLORS.textPrimary, fontWeight: 800 }}>{stat.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Arrow */}
      <div style={{
        position: "absolute", left: 695, top: "50%",
        transform: "translateY(-50%)",
        opacity: interpolate(frame, [140, 170], [0, 0.6], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      }}>
        <div style={{
          width: 80, height: 3,
          background: `linear-gradient(90deg, ${COLORS.indigo}, ${COLORS.amber})`,
          position: "relative",
        }}>
          <div style={{
            position: "absolute", right: -8, top: -6,
            width: 0, height: 0,
            borderTop: "8px solid transparent",
            borderBottom: "8px solid transparent",
            borderLeft: `12px solid ${COLORS.amber}`,
          }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
