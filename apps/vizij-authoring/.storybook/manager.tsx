import React from "react";
import { addons, types, useGlobals, useParameter } from "@storybook/manager-api";
import { AddonPanel } from "@storybook/components";

/**
 * Theme-aware Figma "Design" panel.
 *
 * The stock @storybook/addon-designs panel reads `parameters.design` via
 * `useParameter` only — it never looks at globals, so it can't follow the
 * Light/Dark toolbar toggle. This panel does: it reads the story's existing
 * `design.url` (the LIGHT node) and, when the toolbar theme is Dark, swaps the
 * node-id for the matching dark-mode tile in Figma (a frame with the Theme
 * collection's Dark mode applied) so the embed renders in the same mode the
 * story is showing. Net: Storybook theme ↔ Figma mode.
 */

const FILE =
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=";

// light node-id (as used in each story's design.url) -> dark-mode tile node-id
const DARK_TILE: Record<string, string> = {
  "12-16": "88-114", "12-22": "88-117", "12-30": "88-120", "12-37": "88-124",
  "12-42": "88-127", "12-50": "88-130", "12-52": "88-133", "19-44": "88-137",
  "19-48": "88-141", "19-52": "88-144", "19-55": "88-149", "19-60": "88-156",
  "19-67": "88-160", "20-3": "88-164", "20-7": "88-173", "20-16": "88-181",
  "20-24": "88-185", "20-37": "88-190", "20-39": "88-195", "20-44": "88-201",
  "20-50": "88-206", "20-56": "88-210",
};

const PANEL_ID = "vizij/figma-themed";

const embedFor = (figmaUrl: string) =>
  `https://www.figma.com/embed?embed_host=storybook&url=${encodeURIComponent(figmaUrl)}`;

const FigmaPanel: React.FC = () => {
  const [globals] = useGlobals();
  const design = useParameter<{ type?: string; url?: string } | null>("design", null);

  if (!design?.url) {
    return <div style={{ padding: 16, color: "#888" }}>No Figma design linked for this story.</div>;
  }

  const dark = globals.theme === "dark";
  const m = design.url.match(/node-id=([\w-]+)/);
  const lightNode = m ? m[1] : null;
  const url = dark && lightNode && DARK_TILE[lightNode] ? FILE + DARK_TILE[lightNode] : design.url;

  return (
    <iframe
      key={url}
      title="Figma design"
      src={embedFor(url)}
      style={{ width: "100%", height: "100%", border: 0, display: "block" }}
      allowFullScreen
    />
  );
};

addons.register(PANEL_ID, () => {
  addons.add(PANEL_ID, {
    type: types.PANEL,
    title: "Design",
    match: ({ viewMode }) => viewMode === "story",
    render: ({ active }) => (
      <AddonPanel active={!!active}>
        <FigmaPanel />
      </AddonPanel>
    ),
  });
});
