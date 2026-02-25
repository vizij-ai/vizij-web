import type {
  AnimatableBinding,
  BindingMap,
  InputBindingMap,
} from "@vizij/node-graph-authoring";
import { SELF_BINDING_ID, type StandardRigInput } from "@vizij/utils";
import { isPropsRigStandardInputPath } from "../../utils/rigElementInputs";
import { getStandardInputResolutionIndex } from "../../utils/standardInputResolutionIndex";
import type { PoseDefinition } from "../../poseRig/types";
import type { SceneObjectNode } from "../../scene/sceneGraph";

interface RigDependentTarget {
  name: string;
  targetId: string;
}

export interface DirectRigInputDependent {
  id: string;
  label: string;
  layer: "rig" | "propsrig";
}

export type PoseRigSourceKind =
  | "pose-entry"
  | "pose-group-output"
  | "pose-aggregate-output";

export interface TraceConnectionsSummary {
  rigs: Array<{
    id: string;
    label: string;
    features: string[];
    sourceKinds: PoseRigSourceKind[];
  }>;
  poses: Array<{ id: string; label: string; features: string[] }>;
}

export interface PoseTraceOutput {
  poseId: string;
  poseName: string;
  inputId: string;
  value: number;
  neutral: number;
}

export interface PoseRigFaceTraceTarget {
  targetId: string;
  targetLabel: string;
  directRigInputIds: string[];
  upstreamRigInputIds: string[];
  orderedRigInputIds: string[];
  matchedPoseOutputs: PoseTraceOutput[];
  diagnostics: string[];
}

export interface PoseRigFaceTrace {
  targets: PoseRigFaceTraceTarget[];
  unmatchedPoseOutputs: PoseTraceOutput[];
  suggestedFixes: PoseRigTraceSuggestion[];
  diagnostics: string[];
}

export type PoseRigTraversalNodeKind =
  | "pose"
  | "rig"
  | "propsrig"
  | "animatable";

export interface PoseRigTraversalNode {
  id: string;
  kind: PoseRigTraversalNodeKind;
  label: string;
  poseId?: string;
  rigId?: string;
  targetId?: string;
}

export interface PoseRigTraversalPath {
  targetId: string;
  targetLabel: string;
  nodes: PoseRigTraversalNode[];
}

export interface PoseRigTraversalSelection {
  targetId: string;
  nodeId: string;
}

export interface PoseRigTraversalIndex {
  firstPath: PoseRigTraversalPath | null;
  pathByTargetId: Map<string, PoseRigTraversalPath>;
  nodeByTargetAndNodeId: Map<string, Map<string, PoseRigTraversalNode>>;
  firstPathByNodeId: Map<string, PoseRigTraversalPath>;
}

export type PoseRigTraceSuggestion =
  | {
      id: string;
      kind: "link-parent-binding";
      poseId: string;
      poseName: string;
      childInputId: string;
      upstreamInputId: string;
      targetId: string;
      targetLabel: string;
      confidence: number;
      reason: string;
    }
  | {
      id: string;
      kind: "retarget-pose-output";
      poseId: string;
      poseName: string;
      fromInputId: string;
      toInputId: string;
      confidence: number;
      reason: string;
    };

export function selectSafePoseRigTraceSuggestions(
  suggestions: PoseRigTraceSuggestion[],
  minConfidence = 0.6,
): PoseRigTraceSuggestion[] {
  const ordered = [...suggestions].sort(
    (a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id),
  );
  const selected: PoseRigTraceSuggestion[] = [];
  const usedLinkChildren = new Set<string>();
  const usedRetargetSources = new Set<string>();
  const usedRetargetTargets = new Set<string>();

  ordered.forEach((suggestion) => {
    if (suggestion.confidence < minConfidence) {
      return;
    }
    if (suggestion.kind === "link-parent-binding") {
      if (usedLinkChildren.has(suggestion.childInputId)) {
        return;
      }
      usedLinkChildren.add(suggestion.childInputId);
      selected.push(suggestion);
      return;
    }

    const sourceKey = `${suggestion.poseId}::${suggestion.fromInputId}`;
    if (usedRetargetSources.has(sourceKey)) {
      return;
    }
    const targetKey = `${suggestion.poseId}::${suggestion.toInputId}`;
    if (usedRetargetTargets.has(targetKey)) {
      return;
    }

    usedRetargetSources.add(sourceKey);
    usedRetargetTargets.add(targetKey);
    selected.push(suggestion);
  });

  return selected;
}

function collectBindingInputIds(binding: AnimatableBinding): string[] {
  const ids = new Set<string>();
  if (
    binding.inputId &&
    binding.inputId !== SELF_BINDING_ID &&
    binding.inputId.trim().length > 0
  ) {
    ids.add(binding.inputId);
  }
  (binding.slots ?? []).forEach((slot) => {
    if (
      slot.inputId &&
      slot.inputId !== SELF_BINDING_ID &&
      slot.inputId.trim().length > 0
    ) {
      ids.add(slot.inputId);
    }
  });
  return Array.from(ids);
}

function createCanonicalRigIdMatcher(
  selectedRigId: string,
  standardInputsById?: Map<string, StandardRigInput>,
): {
  canonicalSelectedRigId: string;
  isMatch: (candidateId: string) => boolean;
} {
  if (!standardInputsById) {
    return {
      canonicalSelectedRigId: selectedRigId,
      isMatch: (candidateId: string) => candidateId === selectedRigId,
    };
  }
  const resolutionIndex = getStandardInputResolutionIndex(standardInputsById);
  const canonicalSelectedRigId =
    resolutionIndex.resolveCanonicalId(selectedRigId);
  return {
    canonicalSelectedRigId,
    isMatch: (candidateId: string) =>
      candidateId === selectedRigId ||
      candidateId === canonicalSelectedRigId ||
      resolutionIndex.resolveCanonicalId(candidateId) ===
        canonicalSelectedRigId,
  };
}

export function collectDownstreamRigInputIds(
  selectedRigId: string,
  inputBindings: InputBindingMap,
  standardInputsById?: Map<string, StandardRigInput>,
): Set<string> {
  const { canonicalSelectedRigId, isMatch } = createCanonicalRigIdMatcher(
    selectedRigId,
    standardInputsById,
  );
  const downstream = new Set<string>(
    canonicalSelectedRigId ? [canonicalSelectedRigId] : [selectedRigId],
  );
  let changed = true;

  while (changed) {
    changed = false;
    Object.entries(inputBindings).forEach(([targetInputId, binding]) => {
      const bindingInputIds = collectBindingInputIds(binding);
      const dependsOnDownstream = bindingInputIds.some(
        (inputId) => downstream.has(inputId) || isMatch(inputId),
      );
      if (dependsOnDownstream && !downstream.has(targetInputId)) {
        downstream.add(targetInputId);
        changed = true;
      }
    });
  }

  return downstream;
}

export function collectDirectDownstreamRigInputs(params: {
  selectedRigId: string;
  inputBindings: InputBindingMap;
  standardInputsById: Map<string, StandardRigInput>;
  includePropsRig?: boolean;
}): DirectRigInputDependent[] {
  const {
    selectedRigId,
    inputBindings,
    standardInputsById,
    includePropsRig = false,
  } = params;
  const { canonicalSelectedRigId, isMatch } = createCanonicalRigIdMatcher(
    selectedRigId,
    standardInputsById,
  );
  const results = new Map<string, DirectRigInputDependent>();
  if (!canonicalSelectedRigId) {
    return [];
  }

  Object.entries(inputBindings).forEach(([targetInputId, binding]) => {
    if (isMatch(targetInputId)) {
      return;
    }
    const targetInput = standardInputsById.get(targetInputId);
    const isPropsRig = isPropsRigStandardInputPath(targetInput?.path);
    if (isPropsRig && !includePropsRig) {
      return;
    }
    const inputIds = collectBindingInputIds(binding);
    if (!inputIds.some(isMatch)) {
      return;
    }
    const input = standardInputsById.get(targetInputId);
    results.set(targetInputId, {
      id: targetInputId,
      label: input?.label || input?.path || targetInputId,
      layer: isPropsRig ? "propsrig" : "rig",
    });
  });

  return Array.from(results.values()).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
}

function resolveTargetName(
  targetId: string,
  objects: SceneObjectNode[],
): string {
  for (const obj of objects) {
    for (const feat of obj.features) {
      for (const comp of feat.components) {
        if (comp.targetId === targetId) {
          return `${obj.name} · ${feat.label}${feat.components.length > 1 ? ` ${comp.label}` : ""}`;
        }
      }
    }
  }
  return targetId;
}

export function collectRigDependents(params: {
  selectedRigId: string;
  bindings: BindingMap;
  inputBindings: InputBindingMap;
  objects: SceneObjectNode[];
  standardInputsById?: Map<string, StandardRigInput>;
}): RigDependentTarget[] {
  const {
    selectedRigId,
    bindings,
    inputBindings,
    objects,
    standardInputsById,
  } = params;
  const drivenRigIds = collectDownstreamRigInputIds(
    selectedRigId,
    inputBindings,
    standardInputsById,
  );
  const targets = new Map<string, RigDependentTarget>();

  Object.entries(bindings).forEach(([targetId, binding]) => {
    const bindingInputIds = collectBindingInputIds(binding);
    const matchesDrivenPath = bindingInputIds.some((inputId) =>
      drivenRigIds.has(inputId),
    );
    if (!matchesDrivenPath) {
      return;
    }
    targets.set(targetId, {
      targetId,
      name: resolveTargetName(targetId, objects),
    });
  });

  return Array.from(targets.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export function collectDirectRigDependents(params: {
  selectedRigId: string;
  bindings: BindingMap;
  objects: SceneObjectNode[];
  standardInputsById?: Map<string, StandardRigInput>;
}): RigDependentTarget[] {
  const { selectedRigId, bindings, objects, standardInputsById } = params;
  const { canonicalSelectedRigId, isMatch } = createCanonicalRigIdMatcher(
    selectedRigId,
    standardInputsById,
  );
  const targets = new Map<string, RigDependentTarget>();
  if (!canonicalSelectedRigId) {
    return [];
  }

  Object.entries(bindings).forEach(([targetId, binding]) => {
    const bindingInputIds = collectBindingInputIds(binding);
    if (!bindingInputIds.some(isMatch)) {
      return;
    }
    targets.set(targetId, {
      targetId,
      name: resolveTargetName(targetId, objects),
    });
  });

  return Array.from(targets.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export function summarizeTraceConnections(
  traceTargets: PoseRigFaceTraceTarget[],
  standardInputsById: Map<string, StandardRigInput>,
): TraceConnectionsSummary {
  const rigMap = new Map<
    string,
    {
      id: string;
      label: string;
      features: Set<string>;
      sourceKinds: Set<PoseRigSourceKind>;
    }
  >();
  const poseMap = new Map<
    string,
    { id: string; label: string; features: Set<string> }
  >();

  traceTargets.forEach((target) => {
    const chainInputIds =
      target.upstreamRigInputIds.length > 0
        ? target.upstreamRigInputIds
        : target.directRigInputIds;
    const directSet = new Set(target.directRigInputIds);
    const upstreamSet = new Set(target.upstreamRigInputIds);
    const aggregateRigInputId =
      target.upstreamRigInputIds.length > 0
        ? target.upstreamRigInputIds[target.upstreamRigInputIds.length - 1]
        : null;

    chainInputIds.forEach((inputId) => {
      const input = standardInputsById.get(inputId);
      const label = input?.label || input?.path || inputId;
      const sourceKinds = new Set<PoseRigSourceKind>();
      if (directSet.has(inputId)) {
        sourceKinds.add("pose-entry");
      }
      if (upstreamSet.has(inputId) && sourceKinds.size === 0) {
        if (
          inputId === aggregateRigInputId &&
          target.directRigInputIds.length > 0
        ) {
          sourceKinds.add("pose-aggregate-output");
        } else {
          sourceKinds.add("pose-group-output");
        }
      }
      if (sourceKinds.size === 0) {
        sourceKinds.add("pose-group-output");
      }

      const existing = rigMap.get(inputId);
      if (existing) {
        existing.features.add(target.targetLabel);
        sourceKinds.forEach((kind) => existing.sourceKinds.add(kind));
      } else {
        rigMap.set(inputId, {
          id: inputId,
          label,
          features: new Set([target.targetLabel]),
          sourceKinds,
        });
      }
    });

    target.matchedPoseOutputs.forEach((output) => {
      const existing = poseMap.get(output.poseId);
      if (existing) {
        existing.features.add(target.targetLabel);
      } else {
        poseMap.set(output.poseId, {
          id: output.poseId,
          label: output.poseName,
          features: new Set([target.targetLabel]),
        });
      }
    });
  });

  const rigs = Array.from(rigMap.values())
    .map((entry) => ({
      id: entry.id,
      label: entry.label,
      features: Array.from(entry.features).sort((a, b) => a.localeCompare(b)),
      sourceKinds: Array.from(entry.sourceKinds).sort((a, b) =>
        a.localeCompare(b),
      ),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const poses = Array.from(poseMap.values())
    .map((entry) => ({
      id: entry.id,
      label: entry.label,
      features: Array.from(entry.features).sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return { rigs, poses };
}

function collectActivePoseOutputs(
  poses: PoseDefinition[],
  neutralInputs: Record<string, number>,
): PoseTraceOutput[] {
  const outputs: PoseTraceOutput[] = [];
  poses.forEach((pose) => {
    Object.entries(pose.values).forEach(([inputId, value]) => {
      const neutral = neutralInputs[inputId] ?? 0;
      if (Math.abs(value - neutral) < 1e-6) {
        return;
      }
      outputs.push({
        poseId: pose.id,
        poseName: pose.name,
        inputId,
        value,
        neutral,
      });
    });
  });
  return outputs.sort((a, b) => {
    const poseNameCompare = a.poseName.localeCompare(b.poseName);
    if (poseNameCompare !== 0) {
      return poseNameCompare;
    }
    return a.inputId.localeCompare(b.inputId);
  });
}

function tokenizeInputId(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);
}

const GENERIC_INPUT_TOKENS = new Set<string>([
  "propsrig",
  "rig",
  "parent",
  "child",
  "value",
  "translation",
  "rotation",
  "scale",
  "x",
  "y",
  "z",
  "in",
  "out",
  "mid",
  "inner",
  "outer",
  "left",
  "right",
  "l",
  "r",
]);

const FACE_REGION_TOKENS = new Set<string>([
  "eye",
  "eyewhite",
  "lid",
  "blid",
  "tlid",
  "brow",
  "mouth",
  "jaw",
  "lip",
  "sneer",
  "chin",
  "nose",
  "cheek",
  "tongue",
]);

const FACE_REGION_GROUP_BY_TOKEN: Record<string, string> = {
  mouth: "oral",
  jaw: "oral",
  lip: "oral",
  sneer: "oral",
  chin: "oral",
  tongue: "oral",
  eye: "ocular",
  eyewhite: "ocular",
  lid: "ocular",
  blid: "ocular",
  tlid: "ocular",
  brow: "ocular",
  nose: "nasal",
  cheek: "nasal",
};

function collectMeaningfulTokens(tokens: string[]): Set<string> {
  return new Set(tokens.filter((token) => !GENERIC_INPUT_TOKENS.has(token)));
}

function collectRegionTokens(tokens: string[]): Set<string> {
  const regions = new Set<string>();
  tokens.forEach((token) => {
    FACE_REGION_TOKENS.forEach((region) => {
      if (token.includes(region)) {
        regions.add(region);
      }
    });
  });
  return regions;
}

function countOverlap(left: Set<string>, right: Set<string>): number {
  let overlap = 0;
  left.forEach((token) => {
    if (right.has(token)) {
      overlap += 1;
    }
  });
  return overlap;
}

function collectRegionGroups(regions: Set<string>): Set<string> {
  const groups = new Set<string>();
  regions.forEach((region) => {
    const group = FACE_REGION_GROUP_BY_TOKEN[region];
    if (group) {
      groups.add(group);
    }
  });
  return groups;
}

function areInputIdsSemanticallyCompatible(
  left: string,
  right: string,
): boolean {
  const leftTokens = tokenizeInputId(left);
  const rightTokens = tokenizeInputId(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return false;
  }
  const leftMeaningful = collectMeaningfulTokens(leftTokens);
  const rightMeaningful = collectMeaningfulTokens(rightTokens);
  const meaningfulOverlap = countOverlap(leftMeaningful, rightMeaningful);

  const leftRegions = collectRegionTokens(leftTokens);
  const rightRegions = collectRegionTokens(rightTokens);
  const hasRegionSignals = leftRegions.size > 0 && rightRegions.size > 0;
  const regionOverlap = countOverlap(leftRegions, rightRegions);
  if (hasRegionSignals && regionOverlap === 0) {
    const leftRegionGroups = collectRegionGroups(leftRegions);
    const rightRegionGroups = collectRegionGroups(rightRegions);
    const regionGroupOverlap = countOverlap(
      leftRegionGroups,
      rightRegionGroups,
    );
    if (regionGroupOverlap > 0) {
      return meaningfulOverlap > 0;
    }
    return false;
  }

  return meaningfulOverlap > 0 || regionOverlap > 0;
}

function similarityBetweenInputIds(left: string, right: string): number {
  if (!areInputIdsSemanticallyCompatible(left, right)) {
    return 0;
  }
  const leftTokens = tokenizeInputId(left);
  const rightTokens = tokenizeInputId(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0;
  }
  const leftSet = collectMeaningfulTokens(leftTokens);
  const rightSet = collectMeaningfulTokens(rightTokens);
  const union = new Set([...leftSet, ...rightSet]);
  if (union.size === 0) {
    return 0;
  }
  const overlap = countOverlap(leftSet, rightSet);
  const jaccard = overlap / union.size;
  const suffixBonus =
    left === right
      ? 0.25
      : left.endsWith(right) || right.endsWith(left)
        ? 0.1
        : 0;
  return Math.max(0, Math.min(jaccard + suffixBonus, 1));
}

function buildTraceSuggestions(params: {
  traceTargets: PoseRigFaceTraceTarget[];
  unmatchedPoseOutputs: PoseTraceOutput[];
  allReachableRigInputIds: Set<string>;
  standardInputsById: Map<string, StandardRigInput>;
}): PoseRigTraceSuggestion[] {
  const {
    traceTargets,
    unmatchedPoseOutputs,
    allReachableRigInputIds,
    standardInputsById,
  } = params;

  const suggestions: PoseRigTraceSuggestion[] = [];
  const reachableRigIds = Array.from(allReachableRigInputIds);

  unmatchedPoseOutputs.forEach((output) => {
    if (standardInputsById.has(output.inputId)) {
      let bestTarget: PoseRigFaceTraceTarget | null = null;
      let bestChildInputId: string | null = null;
      let bestTargetScore = 0;

      traceTargets.forEach((target) => {
        if (target.directRigInputIds.length === 0) {
          return;
        }
        target.directRigInputIds.forEach((childInputId) => {
          const score = similarityBetweenInputIds(output.inputId, childInputId);
          if (!bestTarget || score > bestTargetScore) {
            bestTarget = target;
            bestChildInputId = childInputId;
            bestTargetScore = score;
          }
        });
      });

      if (bestTarget && bestChildInputId && bestTargetScore >= 0.3) {
        const resolvedTarget = bestTarget as PoseRigFaceTraceTarget;
        suggestions.push({
          id: `link:${output.poseId}:${bestChildInputId}:${output.inputId}`,
          kind: "link-parent-binding",
          poseId: output.poseId,
          poseName: output.poseName,
          childInputId: bestChildInputId,
          upstreamInputId: output.inputId,
          targetId: resolvedTarget.targetId,
          targetLabel: resolvedTarget.targetLabel,
          confidence: bestTargetScore,
          reason:
            "Output is valid but not connected into this target's rig chain.",
        });
        return;
      }
    }

    let bestRetargetInputId: string | null = null;
    let bestRetargetScore = 0;
    reachableRigIds.forEach((candidateId) => {
      const score = similarityBetweenInputIds(output.inputId, candidateId);
      if (!bestRetargetInputId || score > bestRetargetScore) {
        bestRetargetInputId = candidateId;
        bestRetargetScore = score;
      }
    });
    if (bestRetargetInputId && bestRetargetScore >= 0.45) {
      suggestions.push({
        id: `retarget:${output.poseId}:${output.inputId}:${bestRetargetInputId}`,
        kind: "retarget-pose-output",
        poseId: output.poseId,
        poseName: output.poseName,
        fromInputId: output.inputId,
        toInputId: bestRetargetInputId,
        confidence: bestRetargetScore,
        reason:
          "Legacy pose output id likely needs retargeting to a current rig input.",
      });
    }
  });

  return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 8);
}

function collectUpstreamRigInputIds(
  rootInputId: string,
  inputBindings: InputBindingMap,
): Set<string> {
  const upstream = new Set<string>([rootInputId]);
  const queue = [rootInputId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) {
      continue;
    }
    const binding = inputBindings[currentId];
    if (!binding) {
      continue;
    }
    const parentIds = collectBindingInputIds(binding);
    parentIds.forEach((parentId) => {
      if (upstream.has(parentId)) {
        return;
      }
      upstream.add(parentId);
      queue.push(parentId);
    });
  }

  return upstream;
}

function collectOrderedUpstreamRigInputIds(
  rootInputId: string,
  inputBindings: InputBindingMap,
): string[] {
  const ordered: string[] = [];
  const visited = new Set<string>();
  let currentId: string | null = rootInputId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    ordered.push(currentId);
    const binding: AnimatableBinding | undefined = inputBindings[currentId];
    if (!binding) {
      break;
    }
    const parentIds: string[] = collectBindingInputIds(binding).sort(
      (left: string, right: string) => left.localeCompare(right),
    );
    const nextParentId: string | null =
      parentIds.find((parentId: string) => !visited.has(parentId)) ?? null;
    currentId = nextParentId;
  }

  return ordered;
}

function collectReachableRigInputIdsFromBindings(
  bindings: BindingMap,
  inputBindings: InputBindingMap,
): Set<string> {
  const reachable = new Set<string>();
  Object.values(bindings).forEach((binding) => {
    const directRigInputIds = collectBindingInputIds(binding);
    directRigInputIds.forEach((inputId) => {
      collectUpstreamRigInputIds(inputId, inputBindings).forEach((upstreamId) =>
        reachable.add(upstreamId),
      );
    });
  });
  return reachable;
}

export function collectGlobalUnmatchedPoseOutputs(params: {
  poses: PoseDefinition[];
  neutralInputs: Record<string, number>;
  bindings: BindingMap;
  inputBindings: InputBindingMap;
}): PoseTraceOutput[] {
  const activePoseOutputs = collectActivePoseOutputs(
    params.poses,
    params.neutralInputs,
  );
  const globallyReachableRigInputIds = collectReachableRigInputIdsFromBindings(
    params.bindings,
    params.inputBindings,
  );
  return activePoseOutputs.filter(
    (output) => !globallyReachableRigInputIds.has(output.inputId),
  );
}

function buildNodeLookup(
  objects: SceneObjectNode[],
): Map<string, SceneObjectNode> {
  return new Map(objects.map((node) => [node.id, node]));
}

function collectTargetBindingsForNodeTree(
  node: SceneObjectNode,
  nodesById: Map<string, SceneObjectNode>,
  bindings: BindingMap,
): Array<{
  targetId: string;
  targetLabel: string;
  binding: AnimatableBinding;
}> {
  const queue = [node.id];
  const visited = new Set<string>();
  const targets = new Map<
    string,
    { targetId: string; targetLabel: string; binding: AnimatableBinding }
  >();

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId || visited.has(nodeId)) {
      continue;
    }
    visited.add(nodeId);
    const currentNode = nodesById.get(nodeId);
    if (!currentNode) {
      continue;
    }

    currentNode.features.forEach((feature) => {
      feature.components.forEach((component) => {
        if (!component.targetId) {
          return;
        }
        const binding = bindings[component.targetId];
        if (!binding) {
          return;
        }
        targets.set(component.targetId, {
          targetId: component.targetId,
          targetLabel: `${currentNode.name} · ${feature.label}${feature.components.length > 1 ? ` ${component.label}` : ""}`,
          binding,
        });
      });
    });

    currentNode.childIds.forEach((childId) => queue.push(childId));
  }

  return Array.from(targets.values());
}

export function buildPoseRigFaceTrace(params: {
  node: SceneObjectNode;
  objects: SceneObjectNode[];
  bindings: BindingMap;
  inputBindings: InputBindingMap;
  poses: PoseDefinition[];
  neutralInputs: Record<string, number>;
  standardInputsById: Map<string, StandardRigInput>;
  includeSuggestedFixes?: boolean;
}): PoseRigFaceTrace {
  const {
    node,
    objects,
    bindings,
    inputBindings,
    poses,
    neutralInputs,
    standardInputsById,
    includeSuggestedFixes = true,
  } = params;
  const activePoseOutputs = collectActivePoseOutputs(poses, neutralInputs);
  const nodesById = buildNodeLookup(objects);
  const targetBindings = collectTargetBindingsForNodeTree(
    node,
    nodesById,
    bindings,
  );
  const traceTargets: PoseRigFaceTraceTarget[] = [];

  targetBindings.forEach((target) => {
    const directRigInputIds = collectBindingInputIds(target.binding).sort(
      (a, b) => a.localeCompare(b),
    );
    const orderedRigInputIds =
      directRigInputIds
        .map((inputId) =>
          collectOrderedUpstreamRigInputIds(inputId, inputBindings),
        )
        .sort(
          (left, right) =>
            right.length - left.length ||
            left.join(">").localeCompare(right.join(">")),
        )[0] ?? [];
    const upstreamRigInputIds = new Set<string>();
    directRigInputIds.forEach((inputId) => {
      collectUpstreamRigInputIds(inputId, inputBindings).forEach(
        (upstreamId) => {
          upstreamRigInputIds.add(upstreamId);
        },
      );
    });

    const upstreamList = Array.from(upstreamRigInputIds).sort((a, b) =>
      a.localeCompare(b),
    );
    const matchedPoseOutputs = activePoseOutputs.filter((output) =>
      upstreamRigInputIds.has(output.inputId),
    );
    const diagnostics: string[] = [];
    if (directRigInputIds.length === 0) {
      diagnostics.push("No rig input bindings were found for this target.");
    }
    const missingRigInputs = upstreamList.filter(
      (inputId) => !standardInputsById.has(inputId),
    );
    if (missingRigInputs.length > 0) {
      diagnostics.push(
        `Unknown rig input ids in dependency chain: ${missingRigInputs.join(", ")}.`,
      );
    }
    if (matchedPoseOutputs.length === 0) {
      diagnostics.push(
        "No active pose outputs currently map into this rig input chain.",
      );
    }

    traceTargets.push({
      targetId: target.targetId,
      targetLabel: target.targetLabel,
      directRigInputIds,
      upstreamRigInputIds: upstreamList,
      orderedRigInputIds,
      matchedPoseOutputs,
      diagnostics,
    });
  });

  const globallyReachableRigInputIds = collectReachableRigInputIdsFromBindings(
    bindings,
    inputBindings,
  );
  const unmatchedPoseOutputs = activePoseOutputs.filter(
    (output) => !globallyReachableRigInputIds.has(output.inputId),
  );
  const diagnostics: string[] = [];
  if (traceTargets.length === 0) {
    diagnostics.push(
      "No animatable rig targets were found on the selected element hierarchy.",
    );
  }
  if (unmatchedPoseOutputs.length > 0) {
    diagnostics.push(
      `${unmatchedPoseOutputs.length} active pose outputs are not mapped to any reachable rig chain.`,
    );
  }
  const suggestedFixes = includeSuggestedFixes
    ? buildTraceSuggestions({
        traceTargets,
        unmatchedPoseOutputs,
        allReachableRigInputIds: globallyReachableRigInputIds,
        standardInputsById,
      })
    : [];
  if (includeSuggestedFixes && suggestedFixes.length > 0) {
    diagnostics.push(
      `${suggestedFixes.length} suggested migration fixes are available.`,
    );
  }

  return {
    targets: traceTargets.sort((a, b) =>
      a.targetLabel.localeCompare(b.targetLabel),
    ),
    unmatchedPoseOutputs,
    suggestedFixes,
    diagnostics,
  };
}

function rigInputLabel(
  inputId: string,
  standardInputsById: Map<string, StandardRigInput>,
): string {
  const input = standardInputsById.get(inputId);
  return input?.label || input?.path || inputId;
}

export function buildPoseRigTraversalPaths(params: {
  traceTargets: PoseRigFaceTraceTarget[];
  standardInputsById: Map<string, StandardRigInput>;
}): PoseRigTraversalPath[] {
  const { traceTargets, standardInputsById } = params;
  return traceTargets.map((target) => {
    const nodes: PoseRigTraversalNode[] = [];

    const poseById = new Map<string, PoseTraceOutput>();
    target.matchedPoseOutputs.forEach((output) => {
      if (!poseById.has(output.poseId)) {
        poseById.set(output.poseId, output);
      }
    });
    Array.from(poseById.values())
      .sort((a, b) => a.poseName.localeCompare(b.poseName))
      .forEach((output) => {
        nodes.push({
          id: `pose:${output.poseId}`,
          kind: "pose",
          label: output.poseName,
          poseId: output.poseId,
        });
      });

    const orderedRigInputIds =
      target.orderedRigInputIds.length > 0
        ? target.orderedRigInputIds
        : target.upstreamRigInputIds.length > 0
          ? target.upstreamRigInputIds
          : target.directRigInputIds;

    const directRigInputId =
      orderedRigInputIds[0] ?? target.directRigInputIds[0] ?? null;
    const upstreamRigInputIds = directRigInputId
      ? orderedRigInputIds.slice(1).reverse()
      : [...orderedRigInputIds].reverse();

    upstreamRigInputIds.forEach((rigId) => {
      nodes.push({
        id: `rig:${rigId}`,
        kind: "rig",
        label: rigInputLabel(rigId, standardInputsById),
        rigId,
      });
    });

    if (directRigInputId) {
      const directInput = standardInputsById.get(directRigInputId);
      const directKind = isPropsRigStandardInputPath(directInput?.path)
        ? "propsrig"
        : "rig";
      nodes.push({
        id: `${directKind}:${directRigInputId}`,
        kind: directKind,
        label: rigInputLabel(directRigInputId, standardInputsById),
        rigId: directRigInputId,
      });
    }

    nodes.push({
      id: `animatable:${target.targetId}`,
      kind: "animatable",
      label: target.targetLabel,
      targetId: target.targetId,
    });

    return {
      targetId: target.targetId,
      targetLabel: target.targetLabel,
      nodes,
    };
  });
}

function findTraversalPath(
  paths: PoseRigTraversalPath[],
  selection: PoseRigTraversalSelection | null,
  traversalIndex?: PoseRigTraversalIndex,
): PoseRigTraversalPath | null {
  const index = traversalIndex ?? buildPoseRigTraversalIndex(paths);
  if (!index.firstPath) {
    return null;
  }
  if (!selection) {
    return index.firstPath;
  }
  return index.pathByTargetId.get(selection.targetId) ?? index.firstPath;
}

export function buildPoseRigTraversalIndex(
  paths: PoseRigTraversalPath[],
): PoseRigTraversalIndex {
  const pathByTargetId = new Map<string, PoseRigTraversalPath>();
  const nodeByTargetAndNodeId = new Map<
    string,
    Map<string, PoseRigTraversalNode>
  >();
  const firstPathByNodeId = new Map<string, PoseRigTraversalPath>();

  paths.forEach((path) => {
    pathByTargetId.set(path.targetId, path);
    const nodeLookup = new Map<string, PoseRigTraversalNode>();
    path.nodes.forEach((node) => {
      nodeLookup.set(node.id, node);
      if (!firstPathByNodeId.has(node.id)) {
        firstPathByNodeId.set(node.id, path);
      }
    });
    nodeByTargetAndNodeId.set(path.targetId, nodeLookup);
  });

  return {
    firstPath: paths[0] ?? null,
    pathByTargetId,
    nodeByTargetAndNodeId,
    firstPathByNodeId,
  };
}

export function findPoseRigTraversalNode(
  paths: PoseRigTraversalPath[],
  selection: PoseRigTraversalSelection | null,
  traversalIndex?: PoseRigTraversalIndex,
): PoseRigTraversalNode | null {
  if (!selection) {
    return null;
  }
  const index = traversalIndex ?? buildPoseRigTraversalIndex(paths);
  return (
    index.nodeByTargetAndNodeId
      .get(selection.targetId)
      ?.get(selection.nodeId) ?? null
  );
}

export function resolvePoseRigTraversalSelection(
  paths: PoseRigTraversalPath[],
  previous: PoseRigTraversalSelection | null,
  traversalIndex?: PoseRigTraversalIndex,
): PoseRigTraversalSelection | null {
  const index = traversalIndex ?? buildPoseRigTraversalIndex(paths);
  if (!index.firstPath) {
    return null;
  }
  if (previous) {
    const exactPath = index.pathByTargetId.get(previous.targetId);
    const exactNodeLookup = exactPath
      ? index.nodeByTargetAndNodeId.get(exactPath.targetId)
      : null;
    if (exactNodeLookup?.has(previous.nodeId)) {
      return previous;
    }
    const pathWithNode = index.firstPathByNodeId.get(previous.nodeId);
    if (pathWithNode) {
      return {
        targetId: pathWithNode.targetId,
        nodeId: previous.nodeId,
      };
    }
  }

  const firstPath = index.firstPath;
  const defaultNode =
    firstPath.nodes[firstPath.nodes.length - 1] ?? firstPath.nodes[0] ?? null;
  if (!defaultNode) {
    return null;
  }
  return {
    targetId: firstPath.targetId,
    nodeId: defaultNode.id,
  };
}

export function movePoseRigTraversalSelection(
  paths: PoseRigTraversalPath[],
  current: PoseRigTraversalSelection | null,
  direction: "upstream" | "downstream",
  traversalIndex?: PoseRigTraversalIndex,
): PoseRigTraversalSelection | null {
  const index = traversalIndex ?? buildPoseRigTraversalIndex(paths);
  const resolved = resolvePoseRigTraversalSelection(paths, current, index);
  const path = findTraversalPath(paths, resolved, index);
  if (!resolved || !path || path.nodes.length === 0) {
    return resolved;
  }
  const currentIndex = path.nodes.findIndex(
    (node) => node.id === resolved.nodeId,
  );
  const safeIndex = currentIndex >= 0 ? currentIndex : path.nodes.length - 1;
  const nextIndex =
    direction === "upstream"
      ? Math.max(0, safeIndex - 1)
      : Math.min(path.nodes.length - 1, safeIndex + 1);
  const nextNode = path.nodes[nextIndex];
  if (!nextNode) {
    return resolved;
  }
  return {
    targetId: path.targetId,
    nodeId: nextNode.id,
  };
}
