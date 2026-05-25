import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { COLORS, GRADIENTS } from "../constants";

// Scene 1: Cold Open — "YOUR DATA NEVER LEAVES" text shatter reveal
// Duration: 600 frames (20 seconds)

export const Scene1_ColdOpen: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fullText = "YOUR DATA LEAVES YOUR ENVIRONMENT.";
  const charsToShow = Math.min(
    Math.floor(interpolate(frame, [30, 180], [0, fullText.length], { extrapolateRight: "clamp", extrapolateLeft: "clamp" })),
    fullText.length
  );
  const typedText = fullText.slice(0, charsToShow);
  const cursorOpacity = Math.sin(frame * 0.3) > 0 ? 1 : 0;

  // Shatter at frame 220
  const shatterProgress = interpolate(frame, [210, 240], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // New text fades in (260-340)
  const newTextOpacity = interpolate(frame, [260, 320], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const newTextScale = spring({ frame: frame - 260, fps, config: { damping: 15, stiffness: 100 } });

  const glowOpacity = interpolate(frame, [320, 450], [0, 0.4], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Fragments
  const fragments = [];
  if (shatterProgress > 0 && shatterProgress < 1) {
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2 + i * 0.5;
      const distance = shatterProgress * 400 * (0.5 + Math.random());
      const fragOpacity = 1 - shatterProgress;
      fragments.push(
        <div key={i} style={{
          position: "absolute",
          left: `${50 + Math.cos(angle) * distance * 0.05}%`,
          top: `${50 + Math.sin(angle) * distance * 0.1}%`,
          width: 4 + Math.random() * 8,
          height: 2 + Math.random() * 4,
          background: COLORS.indigo,
          opacity: fragOpacity,
          transform: `rotate(${angle * 57}deg)`,
        }} />
      );
    }
  }

  return (
    <AbsoluteFill style={{ background: COLORS.backgroundSoft }}>
      {/* Subtle dot pattern */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `radial-gradient(circle, rgba(91,78,212,0.06) 1px, transparent 1px)`,
        backgroundSize: "30px 30px",
      }} />

      {/* Phase 1 + 2: Original text */}
      {shatterProgress < 1 && (
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <div style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 38,
            color: COLORS.textPrimary,
            letterSpacing: 2,
            fontWeight: 700,
            opacity: 1 - shatterProgress,
            transform: shatterProgress > 0 ? `scale(${1 + shatterProgress * 0.3})` : undefined,
            filter: shatterProgress > 0 ? `blur(${shatterProgress * 4}px)` : undefined,
          }}>
            {typedText}
            <span style={{ opacity: cursorOpacity, color: COLORS.indigo }}>▎</span>
          </div>
        </AbsoluteFill>
      )}

      {fragments}

      {/* Phase 3: New text */}
      {frame > 255 && (
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <div style={{
            position: "absolute",
            width: 800, height: 200,
            background: GRADIENTS.shieldGlow,
            opacity: glowOpacity,
            borderRadius: "50%",
            filter: "blur(40px)",
          }} />

          <div style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 44,
            fontWeight: 800,
            color: COLORS.textPrimary,
            letterSpacing: 3,
            opacity: newTextOpacity,
            transform: `scale(${0.8 + newTextScale * 0.2})`,
            textAlign: "center",
          }}>
            YOUR DATA{" "}
            <span style={{ color: COLORS.indigo }}>NEVER</span>{" "}
            LEAVES YOUR ENVIRONMENT.
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
