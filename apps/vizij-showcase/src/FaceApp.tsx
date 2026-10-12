import { VizijCanvas } from "@vizij/render";
import { SectionMenu, type SectionMenuItem } from "./components/SectionMenu";
import { HeroSection } from "./sections/HeroSection";
import { AboutSection } from "./sections/AboutSection";
import { ControlsSection } from "./sections/ControlsSection";
import { ExpressionsSection } from "./sections/ExpressionsSection";
import { GazePlaySection } from "./sections/GazePlaySection";
import { VoiceSection } from "./sections/VoiceSection";
import { PersonasSection } from "./sections/PersonasSection";
import { MissionSection } from "./sections/MissionSection";
import { ArchitectureSection } from "./sections/ArchitectureSection";
import { CommunitySection } from "./sections/CommunitySection";
import { RoadmapSection } from "./sections/RoadmapSection";
import { StandardsSection } from "./sections/StandardsSection";
import { FooterSection } from "./sections/FooterSection";
import "./styles.css";

/** The page's one canvas, on which every section's face draws: fixed over
 * the page, its pointer events off. Each face draws where its section's slot
 * lies, cropped at the canvas's edge as the page scrolls. */
const CANVAS_STYLE = {
  position: "fixed",
  inset: 0,
  pointerEvents: "none",
  zIndex: 1,
} as const;

const SECTION_LINKS: SectionMenuItem[] = [
  { id: "hero", label: "Overview" },
  { id: "about", label: "About" },
  { id: "controls", label: "Rig Controls" },
  { id: "expressions", label: "Expressions" },
  { id: "gaze", label: "Gaze Play" },
  { id: "voice", label: "Voice" },
  { id: "personas", label: "Personas" },
  { id: "mission", label: "Mission" },
  { id: "architecture", label: "Architecture" },
  { id: "community", label: "Community" },
  { id: "roadmap", label: "Roadmap" },
  { id: "standards", label: "Standards" },
];

export function FaceApp() {
  return (
    <>
      <VizijCanvas style={CANVAS_STYLE} />
      <SectionMenu sections={SECTION_LINKS} />
      <div className="showcase-shell">
        <HeroSection />
        <AboutSection />
        <ExpressionsSection />
        <GazePlaySection />
        <VoiceSection />
        <ControlsSection />
        <PersonasSection />
        <MissionSection />
        <ArchitectureSection />
        <CommunitySection />
        <RoadmapSection />
        <StandardsSection />
        <FooterSection />
      </div>
    </>
  );
}
