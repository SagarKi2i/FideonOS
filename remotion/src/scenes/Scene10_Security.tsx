import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { COLORS } from "../constants";

// Scene 11: Enterprise Security
// Duration: 600 frames (20 seconds)

const securityLayers = [
  { label: "End-to-End Encryption", icon: "🔐", detail: "AES-256 · TLS 1.3 · Zero plaintext storage" },
  { label: "Role-Based Access Control", icon: "👤", detail: "Granular permissions · SSO · MFA enforced" },
  { label: "Full Audit Logging", icon: "📋", detail: "Every query, decision, and access logged" },
  { label: "Edge Deployment", icon: "🏠", detail: "Models run locally · No data leaves your network" },
];

const complianceBadges = [
  { label: "HIPAA", color: "#3B82F6" },
  { label: "SOC 2", color: "#7C3AED" },
  { label: "GDPR", color: "#EC4899" },
  { label: "ISO 27001", color: "#D97706" },
];

export const Scene10_Security: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOpacity = interpolate(frame, [0, 25], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const shieldScale = spring({ frame: frame - 15, fps, config: { damping: 12, stiffness: 80, mass: 2 } });

  const badgePhaseStart = 300;

  return (
    <AbsoluteFill style={{ background: COLORS.backgroundSoft }}>
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse at 50% 45%, rgba(91,78,212,0.06) 0%, ${COLORS.backgroundSoft} 55%)`,
      }} />

      {/* Header */}
      <div style={{
        position: "absolute", top: 40, left: 0, right: 0,
        textAlign: "center", opacity: headerOpacity,
      }}>
        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 700,
          color: COLORS.indigo, letterSpacing: 5, marginBottom: 8,
        }}>ENTERPRISE SECURITY</div>
        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 36, fontWeight: 800,
          color: COLORS.textPrimary,
        }}>Zero-Trust Architecture</div>
      </div>

      {/* Central Shield */}
      <div style={{
        position: "absolute", left: "50%", top: "42%",
        transform: `translate(-50%, -50%) scale(${shieldScale})`,
      }}>
        <div style={{
          width: 160, height: 180,
          display: "flex", justifyContent: "center", alignItems: "center",
          fontSize: 100,
          filter: `drop-shadow(0 4px 20px rgba(91,78,212,0.15))`,
        }}>🛡️</div>
      </div>

      {/* Security layers — positioned around shield */}
      {securityLayers.map((layer, i) => {
        const isLeft = i < 2;
        const layerDelay = 60 + i * 30;
        const layerScale = spring({ frame: frame - layerDelay, fps, config: { damping: 15, stiffness: 120 } });
        const layerOpacity = interpolate(frame, [layerDelay, layerDelay + 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

        const posX = isLeft ? 80 : 1080;
        const posY = (i % 2) === 0 ? 200 : 440;

        return (
          <div key={i} style={{
            position: "absolute",
            left: posX, top: posY,
            width: 420,
            background: COLORS.white,
            borderRadius: 16, padding: "20px 24px",
            border: `1px solid ${COLORS.borderLight}`,
            opacity: layerOpacity,
            transform: `scale(${0.9 + layerScale * 0.1}) translateX(${(1 - layerScale) * (isLeft ? -30 : 30)}px)`,
            boxShadow: "0 4px 16px rgba(91,78,212,0.06)",
          }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <div style={{ fontSize: 32 }}>{layer.icon}</div>
              <div>
                <div style={{
                  fontFamily: "'Inter', sans-serif", fontSize: 17, fontWeight: 800,
                  color: COLORS.textPrimary, marginBottom: 4,
                }}>{layer.label}</div>
                <div style={{
                  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500,
                  color: COLORS.textSecondary,
                }}>{layer.detail}</div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Compliance badges */}
      <div style={{
        position: "absolute", bottom: 80, left: 0, right: 0,
        display: "flex", justifyContent: "center", gap: 30,
      }}>
        {complianceBadges.map((badge, i) => {
          const bDelay = badgePhaseStart + i * 20;
          const bScale = spring({ frame: frame - bDelay, fps, config: { damping: 12, stiffness: 180 } });
          const bOpacity = interpolate(frame, [bDelay, bDelay + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

          return (
            <div key={i} style={{
              background: COLORS.white,
              border: `2px solid ${badge.color}44`,
              borderRadius: 14, padding: "14px 28px",
              opacity: bOpacity,
              transform: `scale(${0.7 + bScale * 0.3})`,
              boxShadow: `0 4px 16px ${badge.color}11`,
            }}>
              <div style={{
                fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 900,
                color: badge.color, letterSpacing: 2,
              }}>{badge.label}</div>
            </div>
          );
        })}
      </div>

      {/* Bottom */}
      <div style={{
        position: "absolute", bottom: 30, left: 0, right: 0,
        textAlign: "center",
        opacity: interpolate(frame, [400, 450], [0, 0.7], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      }}>
        <span style={{
          fontFamily: "'Inter', sans-serif", fontSize: 16,
          color: "#059669", fontWeight: 600,
        }}>🔒 Your data never leaves your control</span>
      </div>
    </AbsoluteFill>
  );
};
