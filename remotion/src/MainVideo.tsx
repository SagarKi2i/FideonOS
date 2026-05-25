import { AbsoluteFill, Series } from "remotion";
import { Scene1_ColdOpen } from "./scenes/Scene1_ColdOpen";
import { Scene2_Stats } from "./scenes/Scene2_Stats";
import { Scene3_Reveal } from "./scenes/Scene3_Reveal";
import { Scene4_Marketplace } from "./scenes/Scene4_Marketplace";
import { Scene5_DocumentAI } from "./scenes/Scene5_DocumentAI";
import { Scene05_PolicyCompare } from "./scenes/Scene05_PolicyCompare";
import { Scene6_Quotes } from "./scenes/Scene6_Quotes";
import { Scene7_Workflows } from "./scenes/Scene7_Workflows";
import { Scene8_ReviewQueue } from "./scenes/Scene8_ReviewQueue";
import { Scene09_Dashboard } from "./scenes/Scene09_Dashboard";
import { Scene10_Security } from "./scenes/Scene10_Security";
import { Scene9_Closing } from "./scenes/Scene9_Closing";

// Full video: ~4 min 20 sec = 7800 frames at 30fps
// Scene durations match VIDEO_SCRIPT.md
export const MainVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: "#FFFFFF" }}>
      <Series>
        {/* Scene 1: Title / Brand Intro — 20s */}
        <Series.Sequence durationInFrames={600}>
          <Scene1_ColdOpen />
        </Series.Sequence>

        {/* Scene 2: The Problem — 25s */}
        <Series.Sequence durationInFrames={750}>
          <Scene2_Stats />
        </Series.Sequence>

        {/* Scene 3: Fideon Reveal — 25s */}
        <Series.Sequence durationInFrames={750}>
          <Scene3_Reveal />
        </Series.Sequence>

        {/* Scene 4: AI Marketplace — 25s */}
        <Series.Sequence durationInFrames={750}>
          <Scene4_Marketplace />
        </Series.Sequence>

        {/* Scene 5: Document Intelligence — 30s */}
        <Series.Sequence durationInFrames={900}>
          <Scene5_DocumentAI />
        </Series.Sequence>

        {/* Scene 6: Policy Comparison — 25s */}
        <Series.Sequence durationInFrames={750}>
          <Scene05_PolicyCompare />
        </Series.Sequence>

        {/* Scene 7: Quote Generation — 25s */}
        <Series.Sequence durationInFrames={750}>
          <Scene6_Quotes />
        </Series.Sequence>

        {/* Scene 8: Agent Workflows — 25s */}
        <Series.Sequence durationInFrames={750}>
          <Scene7_Workflows />
        </Series.Sequence>

        {/* Scene 9: Claims FNOL / Review Queue — 30s */}
        <Series.Sequence durationInFrames={900}>
          <Scene8_ReviewQueue />
        </Series.Sequence>

        {/* Scene 10: Dashboard & Analytics — 20s */}
        <Series.Sequence durationInFrames={600}>
          <Scene09_Dashboard />
        </Series.Sequence>

        {/* Scene 11: Enterprise Security — 20s */}
        <Series.Sequence durationInFrames={600}>
          <Scene10_Security />
        </Series.Sequence>

        {/* Scene 12: Closing / CTA — 15s */}
        <Series.Sequence durationInFrames={450}>
          <Scene9_Closing />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
