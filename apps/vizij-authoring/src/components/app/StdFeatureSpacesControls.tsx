import { useCallback, useMemo, useState } from "react";
import type { StandardRigInput } from "@vizij/utils";
import { SidebarSection } from "../common/SidebarSection";
import { Button, RowSlider } from "../ui";
import { useReferenceFace } from "../../state/ReferenceFaceContext";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import {
  buildStandardInputMapByNormalizedPath,
  mergeReferenceAndMainStandardInputs,
} from "../../utils/standardInputMerge";
import {
  deriveStandardNamespaceAndChannel,
  formatStandardSegmentName,
} from "../../utils/standardInputSegments";
import { describeStandardInputPresence } from "../../utils/standardInputComparison";
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
    return mergeReferenceAndMainStandardInputs(
      referenceFace.standardInputs,
      mainFaceStandardInputs,
    );
  }, [referenceFace.standardInputs, mainFaceStandardInputs]);

  // Build lookup maps by normalized path for each face
  // Use the ById maps (authoritative source) rather than arrays
  const refInputsByPath = useMemo(() => {
    return buildStandardInputMapByNormalizedPath(
      referenceFace.standardInputsById.values(),
    );
  }, [referenceFace.standardInputsById]);

  const mainInputsByPath = useMemo(() => {
    return buildStandardInputMapByNormalizedPath(
      mainFaceStandardInputsById.values(),
    );
  }, [mainFaceStandardInputsById]);

  // Group standard inputs by namespace and channel
  // Structure: Map<namespace, Map<channel, StandardRigInput[]>>
  const groupedByNamespaceAndChannel = useMemo(() => {
    const namespaces = new Map<string, Map<string, StandardRigInput[]>>();
    for (const input of combinedInputsByPath.values()) {
      const { namespace, channel } = deriveStandardNamespaceAndChannel(
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
        const presence = describeStandardInputPresence(input.path, {
          reference: {
            inputsByPath: refInputsByPath,
            inputIdsWithBindings,
            isLoaded: referenceFace.isLoaded,
          },
          main: {
            inputsByPath: mainInputsByPath,
            inputIdsWithBindings: mainFaceInputIdsWithBindings,
            isLoaded: mainFaceIsLoaded,
          },
        });

        // Check if track is missing from either face
        if (
          (referenceFace.isLoaded && !presence.reference.exists) ||
          (mainFaceIsLoaded && !presence.main.exists)
        ) {
          hasAnyMissing = true;
        }

        // Check if any track is unbound in either face
        if (
          (presence.reference.exists && !presence.reference.hasBinding) ||
          (presence.main.exists && !presence.main.hasBinding)
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

  // Check if at least one face is loaded
  const anyFaceLoaded = referenceFace.isLoaded || mainFaceIsLoaded;
  const anyFaceLoading = referenceFace.isLoading;

  // Handler to reset all control channels to their neutral/default values
  const handleResetPose = useCallback(() => {
    for (const input of combinedInputsByPath.values()) {
      const presence = describeStandardInputPresence(input.path, {
        reference: {
          inputsByPath: refInputsByPath,
          inputIdsWithBindings,
          isLoaded: referenceFace.isLoaded,
        },
        main: {
          inputsByPath: mainInputsByPath,
          inputIdsWithBindings: mainFaceInputIdsWithBindings,
          isLoaded: mainFaceIsLoaded,
        },
      });

      if (referenceFace.isLoaded && presence.reference.input) {
        referenceFace.handleInputValueChange(
          presence.reference.input.id,
          input.defaultValue,
        );
      }
      if (mainFaceIsLoaded && presence.main.input) {
        mainFaceHandleInputValueChange(
          presence.main.input.id,
          input.defaultValue,
        );
      }
    }
  }, [
    combinedInputsByPath,
    refInputsByPath,
    mainInputsByPath,
    inputIdsWithBindings,
    mainFaceInputIdsWithBindings,
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
                        {ns === "" ? "Root" : formatStandardSegmentName(ns)}
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
                          {formatStandardSegmentName(channel)}
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
          const presence = describeStandardInputPresence(input.path, {
            reference: {
              inputsByPath: refInputsByPath,
              inputIdsWithBindings: refInputIdsWithBindings,
              isLoaded: refIsLoaded,
            },
            main: {
              inputsByPath: mainInputsByPath,
              inputIdsWithBindings: mainInputIdsWithBindings,
              isLoaded: mainIsLoaded,
            },
          });

          const refInput = presence.reference.input;
          const mainInput = presence.main.input;
          const existsInRef = presence.reference.exists;
          const existsInMain = presence.main.exists;
          const hasAnyBinding =
            presence.reference.hasBinding || presence.main.hasBinding;
          const mainStatus: FaceStatus = presence.main.status;
          const refStatus: FaceStatus = presence.reference.status;

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
                key={presence.normalizedPath}
                className="reference-input-row reference-input-row--no-binding"
              >
                <span className="reference-input-row__label">
                  {input.label}
                </span>
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
            <div key={presence.normalizedPath} className="reference-input-row">
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
