import { useCallback, useMemo, useState } from "react";
import { SidebarSection } from "../common/SidebarSection";
import { Button, RowSlider } from "../ui";
import { useReferenceFace } from "../../state/ReferenceFaceContext";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import type { StandardRigInput } from "@vizij/utils";
import { normalizeStandardRigInputPath } from "@vizij/utils";
import { GroupMappingEditor } from "./StdFeatureSpacesMappingEditor";

/**
 * Status indicator for a single face or channel:
 * - Grey (missing): Track is missing (input doesn't exist in this face)
 * - Blue (unbound): Exists but unbound (input exists but has no binding)
 * - Green (bound): Exists and has a mapping binding
 */
type FaceStatus = "missing" | "unbound" | "bound";

function getFaceStatusClass(status: FaceStatus): string {
  switch (status) {
    case "missing":
      return "status-indicator--grey";
    case "unbound":
      return "status-indicator--blue";
    case "bound":
      return "status-indicator--green";
  }
}

/**
 * Derives namespace and channel from a standard input path.
 * Path structure with namespace: /standard/<namespace>/<channel>/<track>/<attribute>
 * Path structure without namespace: /standard/<channel>/<track>/<attribute>
 *
 * For paths like "/standard/semio/left_eye/pos/x", returns { namespace: "semio", channel: "left_eye" }
 * For paths like "/standard/left_eye/pos/x", returns { namespace: "", channel: "left_eye" }
 */
function deriveNamespaceAndChannelFromPath(path: string): {
  namespace: string;
  channel: string;
} {
  // Extract the /standard/... portion from the path
  const standardMatch = path.match(/\/standard\/(.+)/);
  if (!standardMatch || !standardMatch[1]) {
    // Fallback: try normalizing and splitting
    const normalized = normalizeStandardRigInputPath(path);
    const withoutLeading = normalized.startsWith("/")
      ? normalized.slice(1)
      : normalized;
    if (!withoutLeading) return { namespace: "", channel: "custom" };
    const segments = withoutLeading.split("/");
    if (segments[0] === "standard" && segments.length > 1) {
      // Check if there's a namespace (4+ parts after standard means namespace exists)
      const afterStandard = segments.slice(1);
      if (afterStandard.length >= 4) {
        return {
          namespace: afterStandard[0] || "",
          channel: afterStandard[1] || "custom",
        };
      }
      return { namespace: "", channel: afterStandard[0] || "custom" };
    }
    return { namespace: "", channel: segments[0] || "custom" };
  }

  const afterStandard = standardMatch[1];
  const segments = afterStandard.split("/");

  // Path structure: namespace/channel/track/attribute (4+ segments after /standard/)
  // Or: channel/track/attribute (3 segments - no namespace)
  if (segments.length >= 4) {
    // Has namespace: namespace/channel/track/attribute
    return { namespace: segments[0], channel: segments[1] || "custom" };
  } else {
    // No namespace: channel/track/attribute
    return { namespace: "", channel: segments[0] || "custom" };
  }
}

export function StdFeatureSpacesControls() {
  const referenceFace = useReferenceFace();
  const [selectedNamespace, setSelectedNamespace] = useState<string | null>(
    null,
  );
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);

  // Get main face data for existence and binding checks
  const mainFaceStandardInputs = useBindingAuthoring(
    (state) => state.standardInputs,
  );
  const mainFaceStandardInputsById = useBindingAuthoring(
    (state) => state.standardInputsById,
  );
  // bindings maps targetId -> AnimatableBinding, where binding.inputId or slot.inputId references a standard input
  const mainFaceBindings = useBindingAuthoring((state) => state.bindings);
  // Check if main face is actually loaded (animatableComponents only populated when a face with geometry is loaded)
  const mainFaceAnimatableComponents = useBindingAuthoring(
    (state) => state.animatableComponents,
  );
  const mainFaceIsLoaded = mainFaceAnimatableComponents.length > 0;

  // Get main face input values and handler
  const mainFaceInputValues = useBindingAuthoring((state) => state.inputValues);
  const mainFaceHandleInputValueChange = useBindingAuthoring(
    (state) => state.handleInputValueChange,
  );

  // Get binding handlers for the mapping editor - use proper handlers to ensure correct structure
  const handleBindingInputChange = useBindingAuthoring(
    (state) => state.handleBindingInputChange,
  );
  const handleAddBindingSlot = useBindingAuthoring(
    (state) => state.handleAddBindingSlot,
  );
  const handleRemoveBindingSlot = useBindingAuthoring(
    (state) => state.handleRemoveBindingSlot,
  );
  const handleUpdateBindingExpression = useBindingAuthoring(
    (state) => state.handleUpdateBindingExpression,
  );
  const handleUpdateBindingSlotAlias = useBindingAuthoring(
    (state) => state.handleUpdateBindingSlotAlias,
  );
  const handleResetBinding = useBindingAuthoring(
    (state) => state.handleResetBinding,
  );

  // Compute which standard input IDs are used in bindings by checking slot.inputId values
  // This uses the same binding data that the Rigging tab uses - no bundle analysis needed
  const mainFaceInputIdsWithBindings = useMemo(() => {
    const ids = new Set<string>();
    for (const binding of Object.values(mainFaceBindings)) {
      for (const slot of binding.slots ?? []) {
        if (slot.inputId) {
          ids.add(slot.inputId);
        }
      }
    }
    return ids;
  }, [mainFaceBindings]);

  // Build a union of standard inputs from both reference and main face
  // Deduplicate by normalized path (not id) since the same logical input may have different IDs in each face
  const combinedInputsByPath = useMemo(() => {
    const byPath = new Map<string, StandardRigInput>();
    const isStandardInput = (input: StandardRigInput) =>
      input.path.includes("/standard/");

    // Add reference face inputs first (only /standard/ paths)
    for (const input of referenceFace.standardInputs) {
      if (isStandardInput(input)) {
        const normalizedPath = normalizeStandardRigInputPath(input.path);
        byPath.set(normalizedPath, input);
      }
    }
    // Add main face inputs (only /standard/ paths, won't override if already exists)
    for (const input of mainFaceStandardInputs) {
      if (isStandardInput(input)) {
        const normalizedPath = normalizeStandardRigInputPath(input.path);
        if (!byPath.has(normalizedPath)) {
          byPath.set(normalizedPath, input);
        }
      }
    }
    return byPath;
  }, [referenceFace.standardInputs, mainFaceStandardInputs]);

  // Build lookup maps by normalized path for each face
  // Use the ById maps (authoritative source) rather than arrays
  const refInputsByPath = useMemo(() => {
    const byPath = new Map<string, StandardRigInput>();
    for (const input of referenceFace.standardInputsById.values()) {
      if (input.path.includes("/standard/")) {
        byPath.set(normalizeStandardRigInputPath(input.path), input);
      }
    }
    return byPath;
  }, [referenceFace.standardInputsById]);

  const mainInputsByPath = useMemo(() => {
    const byPath = new Map<string, StandardRigInput>();
    for (const input of mainFaceStandardInputsById.values()) {
      if (input.path.includes("/standard/")) {
        byPath.set(normalizeStandardRigInputPath(input.path), input);
      }
    }
    return byPath;
  }, [mainFaceStandardInputsById]);

  // Group standard inputs by namespace and channel
  // Structure: Map<namespace, Map<channel, StandardRigInput[]>>
  const groupedByNamespaceAndChannel = useMemo(() => {
    const namespaces = new Map<string, Map<string, StandardRigInput[]>>();
    for (const input of combinedInputsByPath.values()) {
      const { namespace, channel } = deriveNamespaceAndChannelFromPath(
        input.path,
      );
      if (!namespaces.has(namespace)) {
        namespaces.set(namespace, new Map());
      }
      const channels = namespaces.get(namespace)!;
      if (!channels.has(channel)) {
        channels.set(channel, []);
      }
      channels.get(channel)!.push(input);
    }
    // Sort inputs within each channel by label
    for (const channels of namespaces.values()) {
      for (const inputs of channels.values()) {
        inputs.sort((a, b) => a.label.localeCompare(b.label));
      }
    }
    return namespaces;
  }, [combinedInputsByPath]);

  const namespaceNames = useMemo(
    () => Array.from(groupedByNamespaceAndChannel.keys()),
    [groupedByNamespaceAndChannel],
  );

  // Default to first namespace if none selected
  const activeNamespace = selectedNamespace ?? namespaceNames[0] ?? null;

  // Get channels for the active namespace
  const channelsForActiveNamespace = useMemo(() => {
    if (activeNamespace === null) return [];
    const channels = groupedByNamespaceAndChannel.get(activeNamespace);
    return channels ? Array.from(channels.keys()) : [];
  }, [activeNamespace, groupedByNamespaceAndChannel]);

  // Default to first channel if none selected or if selected channel doesn't exist in current namespace
  const activeChannel = useMemo(() => {
    if (
      selectedChannel &&
      channelsForActiveNamespace.includes(selectedChannel)
    ) {
      return selectedChannel;
    }
    return channelsForActiveNamespace[0] ?? null;
  }, [selectedChannel, channelsForActiveNamespace]);

  // Get inputs for the active namespace and channel
  const activeInputs = useMemo(() => {
    if (activeNamespace === null || activeChannel === null) return [];
    const channels = groupedByNamespaceAndChannel.get(activeNamespace);
    if (!channels) return [];
    return channels.get(activeChannel) ?? [];
  }, [activeNamespace, activeChannel, groupedByNamespaceAndChannel]);

  // Use the binding information from the context to determine which inputs have bindings
  // This checks if the input node has outgoing edges in the graph
  const inputIdsWithBindings = referenceFace.inputIdsWithBindings;

  // Compute aggregate status for each channel
  // - Grey: any track is missing from either face
  // - Blue: any track exists but is missing a binding in either face
  // - Green: all tracks have bindings in both faces
  const getChannelStatus = useCallback(
    (channelName: string): FaceStatus => {
      if (activeNamespace === null) return "missing";
      const channels = groupedByNamespaceAndChannel.get(activeNamespace);
      if (!channels) return "missing";
      const inputs = channels.get(channelName);
      if (!inputs || inputs.length === 0) return "missing";

      let hasAnyMissing = false;
      let hasAnyUnbound = false;

      for (const input of inputs) {
        const normalizedPath = normalizeStandardRigInputPath(input.path);
        const refInput = refInputsByPath.get(normalizedPath);
        const mainInput = mainInputsByPath.get(normalizedPath);

        const existsInRef = referenceFace.isLoaded && refInput !== undefined;
        const existsInMain = mainFaceIsLoaded && mainInput !== undefined;

        // Check if track is missing from either face
        if (
          (referenceFace.isLoaded && !existsInRef) ||
          (mainFaceIsLoaded && !existsInMain)
        ) {
          hasAnyMissing = true;
        }

        // Check bindings
        const hasRefBinding =
          existsInRef && refInput && inputIdsWithBindings.has(refInput.id);
        const hasMainBinding =
          existsInMain &&
          mainInput &&
          mainFaceInputIdsWithBindings.has(mainInput.id);

        // Check if any track is unbound in either face
        if (
          (existsInRef && !hasRefBinding) ||
          (existsInMain && !hasMainBinding)
        ) {
          hasAnyUnbound = true;
        }
      }

      if (hasAnyMissing) return "missing";
      if (hasAnyUnbound) return "unbound";
      return "bound";
    },
    [
      activeNamespace,
      groupedByNamespaceAndChannel,
      refInputsByPath,
      mainInputsByPath,
      referenceFace.isLoaded,
      mainFaceIsLoaded,
      inputIdsWithBindings,
      mainFaceInputIdsWithBindings,
    ],
  );

  const formatGroupName = (name: string) => {
    return name
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  // Check if at least one face is loaded
  const anyFaceLoaded = referenceFace.isLoaded || mainFaceIsLoaded;
  const anyFaceLoading = referenceFace.isLoading;

  // Handler to reset all control channels to their neutral/default values
  const handleResetPose = useCallback(() => {
    for (const input of combinedInputsByPath.values()) {
      const normalizedPath = normalizeStandardRigInputPath(input.path);

      // Look up each face's actual input by path to get the correct ID
      const refInput = refInputsByPath.get(normalizedPath);
      const mainInput = mainInputsByPath.get(normalizedPath);

      if (referenceFace.isLoaded && refInput) {
        referenceFace.handleInputValueChange(refInput.id, input.defaultValue);
      }
      if (mainFaceIsLoaded && mainInput) {
        mainFaceHandleInputValueChange(mainInput.id, input.defaultValue);
      }
    }
  }, [
    combinedInputsByPath,
    refInputsByPath,
    mainInputsByPath,
    referenceFace.isLoaded,
    referenceFace.handleInputValueChange,
    mainFaceIsLoaded,
    mainFaceHandleInputValueChange,
  ]);

  return (
    <div className="mapping-controls-layout">
      <div className="mapping-controls-layout__section mapping-controls-layout__section--reference">
        <SidebarSection
          title="Matching Control"
          description="Control both faces simultaneously to compare their features."
        >
          {!anyFaceLoaded && !anyFaceLoading && (
            <p className="sidebar__placeholder-text">
              Load a face to control it here.
            </p>
          )}
          {anyFaceLoading && (
            <p className="sidebar__placeholder-text">Loading face...</p>
          )}
          {anyFaceLoaded && (
            <div className="sidebar__stack">
              {/* Namespace selector */}
              {namespaceNames.length > 0 && (
                <div className="group-selector-section">
                  <span className="group-selector-section__label">
                    Standard Feature Space:
                  </span>
                  <div className="group-selector">
                    {namespaceNames.map((ns) => (
                      <button
                        key={ns}
                        type="button"
                        className={`group-selector__btn ${activeNamespace === ns ? "group-selector__btn--active" : ""}`}
                        onClick={() => {
                          setSelectedNamespace(ns);
                          setSelectedChannel(null); // Reset channel when namespace changes
                        }}
                      >
                        {ns === "" ? "Root" : formatGroupName(ns)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Channel selector */}
              {channelsForActiveNamespace.length > 0 && (
                <div className="group-selector-section">
                  <span className="group-selector-section__label">
                    Channel selection:
                  </span>
                  <div className="group-selector">
                    {channelsForActiveNamespace.map((channel) => {
                      const channelStatus = getChannelStatus(channel);
                      return (
                        <button
                          key={channel}
                          type="button"
                          className={`group-selector__btn ${activeChannel === channel ? "group-selector__btn--active" : ""}`}
                          onClick={() => setSelectedChannel(channel)}
                        >
                          {formatGroupName(channel)}
                          <span
                            className={`status-indicator ${getFaceStatusClass(channelStatus)}`}
                            title={`Channel status: ${channelStatus}`}
                          >
                            <span className="status-indicator__dot" />
                          </span>
                        </button>
                      );
                    })}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleResetPose}
                    >
                      Reset Pose
                    </Button>
                  </div>
                </div>
              )}
              {activeInputs.length > 0 && (
                <MatchingInputGroup
                  inputs={activeInputs}
                  refInputIdsWithBindings={inputIdsWithBindings}
                  refInputsByPath={refInputsByPath}
                  refInputValues={referenceFace.inputValues}
                  onRefInputChange={referenceFace.handleInputValueChange}
                  refIsLoaded={referenceFace.isLoaded}
                  mainInputIdsWithBindings={mainFaceInputIdsWithBindings}
                  mainInputsByPath={mainInputsByPath}
                  mainInputValues={mainFaceInputValues}
                  onMainInputChange={mainFaceHandleInputValueChange}
                  mainIsLoaded={mainFaceIsLoaded}
                />
              )}
            </div>
          )}
        </SidebarSection>
      </div>

      <div className="mapping-controls-layout__section mapping-controls-layout__section--mapping">
        <SidebarSection
          title="Mapping Editor"
          description="Configure bindings for your main face's standard inputs."
        >
          {!mainFaceIsLoaded ? (
            <p className="sidebar__placeholder-text">
              Load a main face to begin mapping.
            </p>
          ) : !activeChannel ? (
            <p className="sidebar__placeholder-text">
              Select a channel above to see mapping options.
            </p>
          ) : (
            <div className="mapping-controls-layout__scroll">
              <GroupMappingEditor
                key={`${activeNamespace ?? ""}-${activeChannel}`}
                inputs={activeInputs}
                mainFaceIsLoaded={mainFaceIsLoaded}
                refIsLoaded={referenceFace.isLoaded}
                mainFaceStandardInputsById={mainFaceStandardInputsById}
                mainFaceInputIdsWithBindings={mainFaceInputIdsWithBindings}
                mainFaceAnimatableComponents={mainFaceAnimatableComponents}
                mainFaceBindings={mainFaceBindings}
                mainInputsByPath={mainInputsByPath}
                onBindingInputChange={handleBindingInputChange}
                onAddBindingSlot={handleAddBindingSlot}
                onRemoveBindingSlot={handleRemoveBindingSlot}
                onUpdateBindingExpression={handleUpdateBindingExpression}
                onUpdateBindingSlotAlias={handleUpdateBindingSlotAlias}
                onResetBinding={handleResetBinding}
              />
            </div>
          )}
        </SidebarSection>
      </div>
    </div>
  );
}

interface MatchingInputGroupProps {
  inputs: StandardRigInput[];
  // Reference face - use path-based lookups
  refInputIdsWithBindings: Set<string>;
  refInputsByPath: Map<string, StandardRigInput>;
  refInputValues: Record<string, number>;
  onRefInputChange: (inputId: string, value: number) => void;
  refIsLoaded: boolean;
  // Main face - use path-based lookups
  mainInputIdsWithBindings: Set<string>;
  mainInputsByPath: Map<string, StandardRigInput>;
  mainInputValues: Record<string, number>;
  onMainInputChange: (inputId: string, value: number) => void;
  mainIsLoaded: boolean;
}

function MatchingInputGroup({
  inputs,
  refInputIdsWithBindings,
  refInputsByPath,
  refInputValues,
  onRefInputChange,
  refIsLoaded,
  mainInputIdsWithBindings,
  mainInputsByPath,
  mainInputValues,
  onMainInputChange,
  mainIsLoaded,
}: MatchingInputGroupProps) {
  return (
    <div className="reference-input-group">
      {/* Header row with column labels */}
      <div className="reference-input-group__header">
        <span className="reference-input-group__header-label">Track</span>
        <span className="reference-input-group__header-status">Main</span>
        <span className="reference-input-group__header-status">Ref</span>
      </div>
      <div className="reference-input-group__inputs">
        {inputs.map((input) => {
          const normalizedPath = normalizeStandardRigInputPath(input.path);

          // Look up inputs by normalized path
          const refInput = refInputsByPath.get(normalizedPath);
          const mainInput = mainInputsByPath.get(normalizedPath);

          // Check which faces have this input
          const existsInRef = refIsLoaded && refInput !== undefined;
          const existsInMain = mainIsLoaded && mainInput !== undefined;

          // Check if each face has a binding for this input (using the face's own input ID)
          const hasRefBinding =
            existsInRef && refInput && refInputIdsWithBindings.has(refInput.id);
          const hasMainBinding =
            existsInMain &&
            mainInput &&
            mainInputIdsWithBindings.has(mainInput.id);
          const hasAnyBinding = hasRefBinding || hasMainBinding;

          // Determine status for each face
          const mainStatus: FaceStatus = !existsInMain
            ? "missing"
            : hasMainBinding
              ? "bound"
              : "unbound";
          const refStatus: FaceStatus = !existsInRef
            ? "missing"
            : hasRefBinding
              ? "bound"
              : "unbound";

          // Get current value (prefer ref if loaded, else main)
          const refValue =
            existsInRef && refInput
              ? (refInputValues[refInput.id] ?? input.defaultValue)
              : input.defaultValue;
          const mainValue =
            existsInMain && mainInput
              ? (mainInputValues[mainInput.id] ?? input.defaultValue)
              : input.defaultValue;
          const value = existsInRef ? refValue : mainValue;

          // Handle change - update both faces if they have this input (using their own IDs)
          const handleChange = (newValue: number) => {
            if (existsInRef && refInput) {
              onRefInputChange(refInput.id, newValue);
            }
            if (existsInMain && mainInput) {
              onMainInputChange(mainInput.id, newValue);
            }
          };

          // If neither face has a binding, show as no-binding row (still show status indicators)
          if (!hasAnyBinding) {
            return (
              <div
                key={normalizedPath}
                className="reference-input-row reference-input-row--no-binding"
              >
                <span className="reference-input-row__label">{input.label}</span>
                <div className="reference-input-row__status-columns">
                  <span
                    className={`status-indicator ${getFaceStatusClass(mainStatus)}`}
                    title={`Main: ${mainStatus}`}
                  >
                    <span className="status-indicator__dot" />
                  </span>
                  <span
                    className={`status-indicator ${getFaceStatusClass(refStatus)}`}
                    title={`Ref: ${refStatus}`}
                  >
                    <span className="status-indicator__dot" />
                  </span>
                </div>
              </div>
            );
          }

          return (
            <div key={normalizedPath} className="reference-input-row">
              <RowSlider
                label={input.label}
                value={value}
                min={input.range.min}
                max={input.range.max}
                step={0.01}
                onChange={handleChange}
              />
              <div className="reference-input-row__status-columns">
                <span
                  className={`status-indicator ${getFaceStatusClass(mainStatus)}`}
                  title={`Main: ${mainStatus}`}
                >
                  <span className="status-indicator__dot" />
                </span>
                <span
                  className={`status-indicator ${getFaceStatusClass(refStatus)}`}
                  title={`Ref: ${refStatus}`}
                >
                  <span className="status-indicator__dot" />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
