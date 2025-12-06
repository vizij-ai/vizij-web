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
import { RuntimeDebugOverlay } from "./components/RuntimeDebugOverlay";

import "./styles.css";

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
      <SectionMenu sections={SECTION_LINKS} />
      <div className="showcase-shell">
        <HeroSection />
        <AboutSection />
        <ControlsSection />
        <ExpressionsSection />
        <GazePlaySection />
        <VoiceSection />
        <PersonasSection />
        <MissionSection />
        <ArchitectureSection />
        <CommunitySection />
        <RoadmapSection />
        <StandardsSection />
        <FooterSection />
      </div>
      <RuntimeDebugOverlay />
    </>
  );
}
