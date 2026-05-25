import { Composition } from "remotion";
import { MainVideo } from "./MainVideo";

// Full video: 4 min 20 sec at 30fps
// 260 seconds × 30 = 7800 frames
export const RemotionRoot = () => (
  <Composition
    id="main"
    component={MainVideo}
    durationInFrames={7800}
    fps={30}
    width={1920}
    height={1080}
  />
);
