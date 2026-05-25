import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, staticFile, Img } from "remotion";
import { COLORS } from "../constants";

// Scene 12: Closing Crescendo
// Duration: 450 frames (15 seconds)

const features = [
  "20+ Private AI Pods",
  "200+ Carriers Supported",
  "6 AMS Integrations",
  "Automated Agent Workflows",
  "Human-in-the-Loop Review",
  "Edge Deployment",
  "Enterprise Security",
];

const taglineWords = ["Your.", "Data.", "Your.", "AI.", "Your.", "Control."];

export const Scene9_Closing: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame: frame - 5, fps, config: { damping: 10, stiffness: 60, mass: 2 } });

  const titleOpacity = interpolate(frame, [30, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const titleY = interpolate(frame, [30, 50], [20, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const sloganOpacity = interpolate(frame, [55, 75], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const featuresStart = 80;
  const taglineStart = 145;

  const finalPulse = frame > 185 ? interpolate(frame, [185, 200], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;

  // Subtle particle burst
  const burstParticles = frame > 185 ? Array.from({ length: 30 }, (_, i) => {
    const angle = (i / 30) * Math.PI * 2;
    const speed = 3 + Math.random() * 5;
    const dist = (frame - 185) * speed;
    const opacity = Math.max(0, 1 - dist / 300);
    return (
      <div key={i} style={{
        position: "absolute",
        left: `calc(50% + ${Math.cos(angle) * dist}px)`,
        top: `calc(22% + ${Math.sin(angle) * dist}px)`,
        width: 3, height: 3, borderRadius: "50%",
        background: i % 2 === 0 ? COLORS.indigo : COLORS.amber,
        opacity: opacity * 0.5,
      }} />
    );
  }) : null;

  return (
    <AbsoluteFill style={{ background: COLORS.backgroundSoft }}>
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse at 50% 25%, rgba(91,78,212,0.08) 0%, ${COLORS.backgroundSoft} 55%)`,
      }} />

      {burstParticles}

      {/* Fideon Logo */}
      <div style={{
        position: "absolute", left: "50%", top: "18%",
        transform: `translate(-50%, -50%) scale(${logoScale * (1 + finalPulse * 0.1)})`,
      }}>
        <div style={{
          width: 110, height: 110,
          display: "flex", justifyContent: "center", alignItems: "center",
          filter: `drop-shadow(0 4px 20px rgba(91,78,212,0.15))`,
        }}>
          <Img
            src={staticFile("images/fideon-logo.png")}
            style={{ width: 100, height: 100, objectFit: "contain" }}
          />
        </div>
      </div>

      {/* FIDEON OS */}
      <div style={{
        position: "absolute", left: "50%", top: "32%",
        transform: `translate(-50%, 0) translateY(${titleY}px)`,
        opacity: titleOpacity, textAlign: "center",
      }}>
        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 56, fontWeight: 900,
          color: COLORS.textPrimary, letterSpacing: 10,
        }}>FIDEON OS</div>
      </div>

      {/* Slogan */}
      <div style={{
        position: "absolute", left: "50%", top: "42%",
        transform: "translate(-50%, 0)",
        opacity: sloganOpacity, textAlign: "center",
      }}>
        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 24, fontWeight: 600,
          color: COLORS.indigo, marginBottom: 4,
        }}>Insurance Runs on Nuance, Trust & Speed.</div>
        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 24, fontWeight: 600,
          color: COLORS.textPrimary,
        }}>Now It Runs with Fideon.</div>
      </div>

      {/* Feature bullets */}
      <div style={{
        position: "absolute", left: "50%", top: "53%",
        transform: "translate(-50%, 0)",
        textAlign: "center",
      }}>
        {features.map((feat, i) => {
          const featDelay = featuresStart + i * 6;
          const featOpacity = interpolate(frame, [featDelay, featDelay + 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <div key={i} style={{
              fontFamily: "'Inter', sans-serif", fontSize: 17, fontWeight: 500,
              color: COLORS.textSecondary, marginBottom: 6, opacity: featOpacity,
              display: "flex", justifyContent: "center", alignItems: "center", gap: 8,
            }}>
              <span style={{ color: COLORS.indigo, fontSize: 8 }}>▪</span>
              {feat}
            </div>
          );
        })}
      </div>

      {/* Final tagline */}
      <div style={{
        position: "absolute", left: "50%", bottom: 100,
        transform: "translate(-50%, 0)",
        display: "flex", gap: 12,
      }}>
        {taglineWords.map((word, i) => {
          const wordDelay = taglineStart + i * 7;
          const wordOpacity = interpolate(frame, [wordDelay, wordDelay + 5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const wordScale = spring({ frame: frame - wordDelay, fps, config: { damping: 10, stiffness: 200 } });
          const isAccent = i % 2 === 0;

          return (
            <div key={i} style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 36, fontWeight: 900,
              color: isAccent ? COLORS.textPrimary : COLORS.indigo,
              opacity: wordOpacity,
              transform: `scale(${0.5 + wordScale * 0.5})`,
            }}>{word}</div>
          );
        })}
      </div>

      {/* URL */}
      <div style={{
        position: "absolute", left: "50%", bottom: 50,
        transform: "translate(-50%, 0)",
        opacity: interpolate(frame, [190, 205], [0, 0.6], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      }}>
        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 500,
          color: COLORS.textMuted, letterSpacing: 4,
        }}>fideon.ai</div>
      </div>
    </AbsoluteFill>
  );
};
