import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { COLORS } from "../constants";

// Scene 8: Agent Workflows — Pipeline builder
// Duration: 750 frames (25 seconds)

const pipelineNodes = [
  { icon: "📧", label: "Email\nTrigger", x: 120, y: 280 },
  { icon: "📄", label: "Parse\nACORD", x: 420, y: 280 },
  { icon: "🔍", label: "Extract\nData", x: 720, y: 280 },
  { icon: "👤", label: "Match\nClient", x: 1020, y: 280 },
  { icon: "📊", label: "Update\nAMS", x: 1320, y: 280 },
  { icon: "🔔", label: "Notify\nProducer", x: 1620, y: 280 },
];

export const Scene7_Workflows: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOpacity = interpolate(frame, [0, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const flowProgress = interpolate(frame, [150, 500], [0, 5], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const activeNodeIndex = Math.floor(flowProgress);

  return (
    <AbsoluteFill style={{ background: COLORS.background }}>
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse at 50% 40%, rgba(91,78,212,0.04) 0%, ${COLORS.background} 60%)`,
      }} />

      {/* Header */}
      <div style={{
        position: "absolute", top: 50, left: 0, right: 0,
        textAlign: "center", opacity: headerOpacity,
      }}>
        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 700,
          color: COLORS.indigo, letterSpacing: 5, marginBottom: 8,
        }}>AGENT WORKFLOWS</div>
        <div style={{
          fontFamily: "'Inter', sans-serif", fontSize: 36, fontWeight: 800,
          color: COLORS.textPrimary,
        }}>Visual Pipeline Builder</div>
      </div>

      {/* Pipeline nodes */}
      {pipelineNodes.map((node, i) => {
        const nodeDelay = i * 20 + 40;
        const nodeScale = spring({ frame: frame - nodeDelay, fps, config: { damping: 14, stiffness: 150 } });
        const nodeOpacity = interpolate(frame, [nodeDelay, nodeDelay + 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const isActive = i <= activeNodeIndex;
        const isCurrentlyActive = i === activeNodeIndex && flowProgress % 1 > 0.2;

        return (
          <div key={i}>
            <div style={{
              position: "absolute",
              left: node.x - 55, top: node.y - 55,
              width: 110, height: 110,
              background: isActive ? COLORS.white : COLORS.backgroundMuted,
              borderRadius: 20,
              border: isCurrentlyActive
                ? `2px solid ${COLORS.indigo}`
                : isActive ? `1px solid ${COLORS.borderSubtle}` : `1px solid ${COLORS.borderLight}`,
              display: "flex", flexDirection: "column",
              justifyContent: "center", alignItems: "center",
              opacity: nodeOpacity,
              transform: `scale(${0.7 + nodeScale * 0.3})`,
              boxShadow: isCurrentlyActive ? `0 4px 20px rgba(91,78,212,0.15)` : "0 2px 8px rgba(0,0,0,0.04)",
            }}>
              <div style={{ fontSize: 30, marginBottom: 4 }}>{node.icon}</div>
              <div style={{
                fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600,
                color: isActive ? COLORS.textPrimary : COLORS.textMuted,
                textAlign: "center", lineHeight: 1.2, whiteSpace: "pre-line",
              }}>{node.label}</div>
            </div>

            {i < pipelineNodes.length - 1 && (
              <div style={{
                position: "absolute",
                left: node.x + 55, top: node.y - 2,
                width: pipelineNodes[i + 1].x - node.x - 110,
                height: 4,
                overflow: "hidden",
                opacity: interpolate(frame, [nodeDelay + 10, nodeDelay + 25], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
              }}>
                <div style={{
                  width: "100%", height: "100%",
                  background: i < activeNodeIndex
                    ? `linear-gradient(90deg, ${COLORS.indigo}, ${COLORS.indigoLight})`
                    : COLORS.borderLight,
                  borderRadius: 2,
                }} />
                {i === activeNodeIndex && (
                  <div style={{
                    position: "absolute", top: -3,
                    left: `${(flowProgress % 1) * 100}%`,
                    width: 10, height: 10, borderRadius: "50%",
                    background: COLORS.amber,
                    boxShadow: `0 0 10px ${COLORS.amber}`,
                  }} />
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Bottom stats */}
      <div style={{
        position: "absolute", bottom: 80, left: 0, right: 0,
        display: "flex", justifyContent: "center", gap: 50,
        opacity: interpolate(frame, [400, 480], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      }}>
        {[
          { label: "Schedule", value: "Weekdays 9 AM", icon: "⏰" },
          { label: "Processed Today", value: "47 submissions", icon: "📊" },
          { label: "Success Rate", value: "99.2%", icon: "✅" },
          { label: "Data Sent Externally", value: "Zero", icon: "🔒" },
        ].map((stat, i) => (
          <div key={i} style={{
            background: COLORS.white, borderRadius: 12,
            padding: "12px 20px", border: `1px solid ${COLORS.borderLight}`,
            textAlign: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>{stat.icon}</div>
            <div style={{
              fontFamily: "'Inter', sans-serif", fontSize: 11,
              color: COLORS.textMuted, fontWeight: 600, letterSpacing: 1, marginBottom: 2,
            }}>{stat.label}</div>
            <div style={{
              fontFamily: "'Inter', sans-serif", fontSize: 18,
              color: stat.label === "Data Sent Externally" ? COLORS.emerald : COLORS.textPrimary,
              fontWeight: 800,
            }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Privacy badge */}
      <div style={{
        position: "absolute", bottom: 30, left: 0, right: 0,
        textAlign: "center",
        opacity: interpolate(frame, [500, 550], [0, 0.7], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      }}>
        <span style={{
          fontFamily: "'Inter', sans-serif", fontSize: 14,
          color: COLORS.emerald, fontWeight: 600,
        }}>🔒 Entire pipeline runs within your environment</span>
      </div>
    </AbsoluteFill>
  );
};
