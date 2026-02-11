import type {
  AnimatableBinding,
  BindingMap,
  InputBindingMap,
} from "@vizij/node-graph-authoring";
import { SELF_BINDING_ID, type StandardRigInput } from "@vizij/utils";
import type { PoseDefinition } from "../../poseRig/types";
import type { SceneObjectNode } from "../../scene/sceneGraph";

interface RigDependentTarget {
  name: string;
  targetId: string;
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
  matchedPoseOutputs: PoseTraceOutput[];
  diagnostics: string[];
}

export interface PoseRigFaceTrace {
  targets: PoseRigFaceTraceTarget[];
  unmatchedPoseOutputs: PoseTraceOutput[];
  suggestedFixes: PoseRigTraceSuggestion[];
  diagnostics: string[];
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

export function collectDownstreamRigInputIds(
  selectedRigId: string,
  inputBindings: InputBindingMap,
): Set<string> {
  const downstream = new Set<string>([selectedRigId]);
  let changed = true;

  while (changed) {
    changed = false;
    Object.entries(inputBindings).forEach(([targetInputId, binding]) => {
      const bindingInputIds = collectBindingInputIds(binding);
      const dependsOnDownstream = bindingInputIds.some((inputId) =>
        downstream.has(inputId),
      );
      if (dependsOnDownstream && !downstream.has(targetInputId)) {
        downstream.add(targetInputId);
        changed = true;
      }
    });
  }

  return downstream;
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
}): RigDependentTarget[] {
  const { selectedRigId, bindings, inputBindings, objects } = params;
  const drivenRigIds = collectDownstreamRigInputIds(
    selectedRigId,
    inputBindings,
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

function similarityBetweenInputIds(left: string, right: string): number {
  const leftTokens = tokenizeInputId(left);
  const rightTokens = tokenizeInputId(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0;
  }
  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  const union = new Set([...leftSet, ...rightSet]);
  if (union.size === 0) {
    return 0;
  }
  let overlap = 0;
  leftSet.forEach((token) => {
    if (rightSet.has(token)) {
      overlap += 1;
    }
  });
  const jaccard = overlap / union.size;
  const suffixBonus =
    left === right
      ? 0.4
      : left.endsWith(right) || right.endsWith(left)
        ? 0.2
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

      if (bestTarget && bestChildInputId && bestTargetScore >= 0.2) {
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
    if (bestRetargetInputId && bestRetargetScore >= 0.25) {
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
}): PoseRigFaceTrace {
  const {
    node,
    objects,
    bindings,
    inputBindings,
    poses,
    neutralInputs,
    standardInputsById,
  } = params;
  const activePoseOutputs = collectActivePoseOutputs(poses, neutralInputs);
  const nodesById = buildNodeLookup(objects);
  const targetBindings = collectTargetBindingsForNodeTree(
    node,
    nodesById,
    bindings,
  );
  const traceTargets: PoseRigFaceTraceTarget[] = [];
  const allReachableRigInputIds = new Set<string>();

  targetBindings.forEach((target) => {
    const directRigInputIds = collectBindingInputIds(target.binding).sort(
      (a, b) => a.localeCompare(b),
    );
    const upstreamRigInputIds = new Set<string>();
    directRigInputIds.forEach((inputId) => {
      collectUpstreamRigInputIds(inputId, inputBindings).forEach(
        (upstreamId) => {
          upstreamRigInputIds.add(upstreamId);
          allReachableRigInputIds.add(upstreamId);
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
      matchedPoseOutputs,
      diagnostics,
    });
  });

  const unmatchedPoseOutputs = activePoseOutputs.filter(
    (output) => !allReachableRigInputIds.has(output.inputId),
  );
  const diagnostics: string[] = [];
  if (traceTargets.length === 0) {
    diagnostics.push(
      "No animatable rig targets were found on the selected element hierarchy.",
    );
  }
  if (unmatchedPoseOutputs.length > 0) {
    diagnostics.push(
      `${unmatchedPoseOutputs.length} active pose outputs are not mapped to this element's rig chain.`,
    );
  }
  const suggestedFixes = buildTraceSuggestions({
    traceTargets,
    unmatchedPoseOutputs,
    allReachableRigInputIds,
    standardInputsById,
  });
  if (suggestedFixes.length > 0) {
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
