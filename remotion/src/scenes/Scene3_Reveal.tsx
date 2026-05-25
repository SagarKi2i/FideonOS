import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, staticFile, Img } from "remotion";
import { COLORS, GRADIENTS } from "../constants";

// Scene 3: Fideon OS Reveal + Tagline
// Duration: 180 frames (6 seconds)

export const Scene3_Reveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo animation
  const logoScale = spring({ frame: frame - 10, fps, config: { damping: 12, stiffness: 80, mass: 1.5 } });
  const logoOpacity = interpolate(frame, [5, 25], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const logoRotate = interpolate(frame, [0, 180], [0, 360], { extrapolateRight: "clamp" }) * 0.03;

  // Glow pulse
  const glowPulse = 0.4 + Math.sin(frame * 0.08) * 0.2;

  // Text reveals
  const titleOpacity = interpolate(frame, [50, 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const titleY = interpolate(frame, [50, 70], [30, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const taglineOpacity = interpolate(frame, [80, 100], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const taglineY = interpolate(frame, [80, 100], [20, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const subtitleOpacity = interpolate(frame, [110, 130], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Particle ring
  const particles = Array.from({ length: 40 }, (_, i) => {
    const angle = (i / 40) * Math.PI * 2 + frame * 0.01;
    const radius = 220 + Math.sin(frame * 0.05 + i) * 20;
    const size = 2 + Math.sin(i * 0.7) * 1.5;
    const particleOpacity = interpolate(frame, [0, 30], [0, 0.6], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
      * (0.3 + Math.sin(frame * 0.1 + i) * 0.3);

    return (
      <div key={i} style={{
        position: "absolute",
        left: `calc(50% + ${Math.cos(angle) * radius}px)`,
        top: `calc(40% + ${Math.sin(angle) * radius}px)`,
        width: size, height: size,
        borderRadius: "50%",
        background: i % 3 === 0 ? COLORS.amber : COLORS.indigoLight,
        opacity: particleOpacity,
        boxShadow: `0 0 ${size * 3}px ${i % 3 === 0 ? COLORS.amber : COLORS.indigo}`,
      }} />
    );
  });

  return (
    <AbsoluteFill style={{ background: COLORS.obsidian }}>
      {/* Radial glow background */}
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse at 50% 40%, rgba(91,78,212,${glowPulse}) 0%, ${COLORS.obsidian} 60%)`,
      }} />

      {/* Particles */}
      {particles}

      {/* Fideon Logo */}
      <div style={{
        position: "absolute",
        left: "50%", top: "38%",
        transform: `translate(-50%, -50%) scale(${logoScale}) rotate(${logoRotate}deg)`,
        opacity: logoOpacity,
      }}>
        <div style={{
          width: 160, height: 160,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          filter: `drop-shadow(0 0 40px ${COLORS.indigoGlow}) drop-shadow(0 0 80px ${COLORS.indigoGlow})`,
        }}>
          <Img
            src={staticFile("images/fideon-logo.png")}
            style={{ width: 140, height: 140, objectFit: "contain" }}
          />
        </div>
      </div>

      {/* Title */}
      <div style={{
        position: "absolute",
        left: "50%", top: "60%",
        transform: `translate(-50%, 0) translateY(${titleY}px)`,
        opacity: titleOpacity,
        textAlign: "center",
      }}>
        <div style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 64,
          fontWeight: 900,
          color: COLORS.white,
          letterSpacing: 12,
          textShadow: `0 0 40px ${COLORS.indigoGlow}`,
        }}>
          FIDEON OS
        </div>
      </div>

      {/* Tagline */}
      <div style={{
        position: "absolute",
        left: "50%", top: "72%",
        transform: `translate(-50%, 0) translateY(${taglineY}px)`,
        opacity: taglineOpacity,
        textAlign: "center",
      }}>
        <div style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 30,
          fontWeight: 600,
          color: COLORS.indigo,
          letterSpacing: 2,
        }}>
          Insurance Runs on Nuance, Trust & Speed.
        </div>
        <div style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 30,
          fontWeight: 600,
          color: COLORS.white,
          letterSpacing: 2,
          marginTop: 8,
        }}>
          Now It Runs with Fideon.
        </div>
      </div>

      {/* Subtitle */}
      <div style={{
        position: "absolute",
        left: "50%", top: "84%",
        transform: "translate(-50%, 0)",
        opacity: subtitleOpacity,
        textAlign: "center",
      }}>
        <div style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 18,
          fontWeight: 400,
          color: COLORS.silver,
          letterSpacing: 4,
        }}>
          THE AGENTIC AI OPERATING SYSTEM
        </div>
      </div>
    </AbsoluteFill>
  );
};
