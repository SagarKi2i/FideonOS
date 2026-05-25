import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { COLORS, GRADIENTS } from "../constants";

// Scene 2: Stats Slam — Impact statistics
// Duration: 750 frames (25 seconds)

const stats = [
  { value: "60%", label: "of underwriter time WASTED on manual tasks", delay: 0 },
  { value: "3 DAYS", label: "to generate ONE quote", delay: 60 },
  { value: "$15B", label: "annual cost of doing NOTHING", delay: 120 },
];

export const Scene2_Stats: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: COLORS.background }}>
      <div style={{ position: "absolute", inset: 0, background: GRADIENTS.subtleBg }} />

      <AbsoluteFill style={{
        justifyContent: "center",
        alignItems: "center",
        gap: 60,
        flexDirection: "column",
        padding: "0 200px",
      }}>
        {stats.map((stat, i) => {
          const entryFrame = stat.delay + 30;
          const progress = spring({ frame: frame - entryFrame, fps, config: { damping: 12, stiffness: 180 } });
          const opacity = interpolate(frame, [entryFrame, entryFrame + 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

          const shakeX = frame >= entryFrame && frame < entryFrame + 8
            ? Math.sin(frame * 20) * (8 - (frame - entryFrame)) * 2
            : 0;

          const barWidth = interpolate(frame, [entryFrame + 15, entryFrame + 80], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

          return (
            <div key={i} style={{
              display: "flex",
              alignItems: "center",
              gap: 40,
              opacity,
              transform: `translateX(${shakeX}px) scale(${0.5 + progress * 0.5})`,
              width: "100%",
            }}>
              <div style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 72,
                fontWeight: 900,
                color: COLORS.indigo,
                minWidth: 280,
                textAlign: "right",
              }}>
                {stat.value}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 26,
                  fontWeight: 500,
                  color: COLORS.textSecondary,
                  marginBottom: 8,
                }}>
                  {stat.label}
                </div>
                <div style={{
                  height: 3,
                  background: COLORS.borderLight,
                  borderRadius: 2,
                  overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%",
                    width: `${barWidth}%`,
                    background: `linear-gradient(90deg, ${COLORS.indigo}, ${COLORS.amber})`,
                    borderRadius: 2,
                  }} />
                </div>
              </div>
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
