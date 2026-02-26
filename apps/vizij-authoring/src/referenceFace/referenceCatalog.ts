import type { VizijBundleExtension } from "@vizij/render";
import { SELF_BINDING_ID } from "@vizij/utils";
import type {
  ReferenceCatalog,
  ReferenceCatalogChildLink,
  ReferenceCatalogInput,
  ReferenceCatalogParentLink,
  ReferenceCatalogPipelineLink,
  ReferencePoseDefinition,
} from "./types";

type UnknownRecord = Record<string, unknown>;

interface ParsedInputDescriptor {
  id: string;
  path: string;
  label: string;
  defaultValue: number;
  range: {
    min: number;
    max: number;
  };
}

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as UnknownRecord;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function parsePoseTargetValue(value: unknown): number | null {
  const direct = asFiniteNumber(value);
  if (direct !== null) {
    return direct;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const floatValue = asFiniteNumber(record.float);
  if (floatValue !== null) {
    return floatValue;
  }
  const numberValue = asFiniteNumber(record.value);
  if (numberValue !== null) {
    return numberValue;
  }
  if (typeof record.float === "string") {
    const parsedFloat = Number(record.float.trim());
    if (Number.isFinite(parsedFloat)) {
      return parsedFloat;
    }
  }
  if (typeof record.value === "string") {
    const parsedValue = Number(record.value.trim());
    if (Number.isFinite(parsedValue)) {
      return parsedValue;
    }
  }
  return null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeCatalogPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return "";
  }
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+/g, "/").replace(/\/$/, "").toLowerCase();
}

function buildSyntheticLinkId(
  parentInputId: string,
  childInputId: string,
): string {
  return `link/${encodeURIComponent(parentInputId)}->${encodeURIComponent(childInputId)}`;
}

function sortInputs(
  left: Pick<ReferenceCatalogInput, "path" | "id">,
  right: Pick<ReferenceCatalogInput, "path" | "id">,
): number {
  const byPath = left.path.localeCompare(right.path);
  if (byPath !== 0) {
    return byPath;
  }
  return left.id.localeCompare(right.id);
}

function extractVizijMetadata(
  bundle: VizijBundleExtension,
): UnknownRecord | null {
  const graphs = Array.isArray(bundle.graphs) ? bundle.graphs : [];
  const prioritized = [...graphs].sort((left, right) => {
    const leftRank = left.kind === "rig" ? 0 : 1;
    const rightRank = right.kind === "rig" ? 0 : 1;
    return leftRank - rightRank;
  });

  for (const graph of prioritized) {
    const spec = asRecord(graph.spec);
    const metadata = asRecord(spec?.metadata);
    const vizij = asRecord(metadata?.vizij);
    if (vizij) {
      return vizij;
    }
  }
  return null;
}

function extractInputDescriptors(
  vizij: UnknownRecord | null,
): ParsedInputDescriptor[] {
  const rawInputs = Array.isArray(vizij?.inputs) ? vizij.inputs : [];
  const entries: ParsedInputDescriptor[] = [];

  for (const rawEntry of rawInputs) {
    const entry = asRecord(rawEntry);
    if (!entry) {
      continue;
    }
    const id = asString(entry.id);
    const path = asString(entry.path);
    if (!id || !path) {
      continue;
    }
    const label = asString(entry.label) ?? id;
    const defaultValue = asFiniteNumber(entry.defaultValue) ?? 0;
    const rangeRecord = asRecord(entry.range);
    const rangeMin = asFiniteNumber(rangeRecord?.min) ?? defaultValue - 1;
    const rangeMax = asFiniteNumber(rangeRecord?.max) ?? defaultValue + 1;
    const normalizedRange =
      rangeMin <= rangeMax
        ? { min: rangeMin, max: rangeMax }
        : { min: rangeMax, max: rangeMin };

    entries.push({
      id,
      path,
      label,
      defaultValue,
      range: normalizedRange,
    });
  }

  return entries.sort(sortInputs);
}

function pairKey(parentInputId: string, childInputId: string): string {
  return `${parentInputId}::${childInputId}`;
}

function sortPipelineLinks(
  left: Pick<
    ReferenceCatalogPipelineLink,
    "childInputId" | "parentInputId" | "linkId"
  >,
  right: Pick<
    ReferenceCatalogPipelineLink,
    "childInputId" | "parentInputId" | "linkId"
  >,
): number {
  const byChild = left.childInputId.localeCompare(right.childInputId);
  if (byChild !== 0) {
    return byChild;
  }
  const byParent = left.parentInputId.localeCompare(right.parentInputId);
  if (byParent !== 0) {
    return byParent;
  }
  return left.linkId.localeCompare(right.linkId);
}

function extractPipelineLinks(
  vizij: UnknownRecord | null,
): ReferenceCatalogPipelineLink[] {
  const pipelineV1 = asRecord(vizij?.pipelineV1);
  const byLinkId = new Map<string, ReferenceCatalogPipelineLink>();
  const pairToLinkId = new Map<string, string>();

  const links = asRecord(pipelineV1?.links);
  if (links) {
    Object.entries(links).forEach(([rawLinkId, rawConfig]) => {
      const config = asRecord(rawConfig);
      if (!config) {
        return;
      }
      const linkId = asString(config.linkId) ?? asString(rawLinkId);
      const parentInputId = asString(config.parentInputId);
      const childInputId = asString(config.childInputId);
      if (!linkId || !parentInputId || !childInputId) {
        return;
      }
      const scale = asFiniteNumber(config.scale) ?? 1;
      const offset = asFiniteNumber(config.offset) ?? 0;
      const enabled = asBoolean(config.enabled, true);
      byLinkId.set(linkId, {
        linkId,
        parentInputId,
        childInputId,
        scale,
        offset,
        enabled,
        source: "pipeline-link",
      });
      pairToLinkId.set(pairKey(parentInputId, childInputId), linkId);
    });
  }

  const byInputId = asRecord(pipelineV1?.byInputId);
  if (byInputId) {
    Object.entries(byInputId)
      .sort(([left], [right]) => left.localeCompare(right))
      .forEach(([rawChildInputId, rawConfig]) => {
        const config = asRecord(rawConfig);
        const childInputId =
          asString(rawChildInputId) ?? asString(config?.inputId);
        if (!config || !childInputId) {
          return;
        }
        const parents = Array.isArray(config.parents) ? config.parents : [];
        parents.forEach((rawParent) => {
          const parent = asRecord(rawParent);
          if (!parent) {
            return;
          }
          const parentInputId = asString(parent.inputId);
          if (!parentInputId) {
            return;
          }
          const parentPairKey = pairKey(parentInputId, childInputId);
          let linkId =
            asString(parent.linkId) ??
            pairToLinkId.get(parentPairKey) ??
            buildSyntheticLinkId(parentInputId, childInputId);

          const existing = byLinkId.get(linkId);
          if (
            existing &&
            (existing.parentInputId !== parentInputId ||
              existing.childInputId !== childInputId)
          ) {
            linkId = `${linkId}#${encodeURIComponent(parentInputId)}->${encodeURIComponent(childInputId)}`;
          }

          const mergedExisting = byLinkId.get(linkId);
          const scale =
            asFiniteNumber(parent.scale) ?? mergedExisting?.scale ?? 1;
          const offset =
            asFiniteNumber(parent.offset) ?? mergedExisting?.offset ?? 0;
          const enabled = asBoolean(
            parent.enabled,
            mergedExisting?.enabled ?? true,
          );
          byLinkId.set(linkId, {
            linkId,
            parentInputId,
            childInputId,
            scale,
            offset,
            enabled,
            source: mergedExisting ? "merged" : "by-input-parent",
          });
          pairToLinkId.set(parentPairKey, linkId);
        });
      });
  }

  return Array.from(byLinkId.values()).sort(sortPipelineLinks);
}

function extractBindingFallbackLinks(
  vizij: UnknownRecord | null,
  knownInputIds: ReadonlySet<string>,
): ReferenceCatalogPipelineLink[] {
  const rawBindings = Array.isArray(vizij?.bindings) ? vizij.bindings : [];
  const linksByPair = new Map<string, ReferenceCatalogPipelineLink>();

  rawBindings.forEach((rawBinding) => {
    const binding = asRecord(rawBinding);
    if (!binding) {
      return;
    }
    const childInputId = asString(binding.targetId);
    const parentInputId = asString(binding.inputId);
    if (!childInputId || !parentInputId || parentInputId === SELF_BINDING_ID) {
      return;
    }
    if (
      !knownInputIds.has(parentInputId) ||
      !knownInputIds.has(childInputId) ||
      parentInputId === childInputId
    ) {
      return;
    }
    const key = pairKey(parentInputId, childInputId);
    if (linksByPair.has(key)) {
      return;
    }
    linksByPair.set(key, {
      linkId: buildSyntheticLinkId(parentInputId, childInputId),
      parentInputId,
      childInputId,
      scale: 1,
      offset: 0,
      enabled: true,
      source: "by-input-parent",
    });
  });

  return Array.from(linksByPair.values()).sort(sortPipelineLinks);
}

function mergePipelineAndFallbackLinks(params: {
  primaryLinks: readonly ReferenceCatalogPipelineLink[];
  fallbackLinks: readonly ReferenceCatalogPipelineLink[];
}): ReferenceCatalogPipelineLink[] {
  if (params.fallbackLinks.length === 0) {
    return [...params.primaryLinks];
  }
  const existingPairs = new Set(
    params.primaryLinks.map((link) =>
      pairKey(link.parentInputId, link.childInputId),
    ),
  );
  const merged = [...params.primaryLinks];
  params.fallbackLinks.forEach((link) => {
    const key = pairKey(link.parentInputId, link.childInputId);
    if (existingPairs.has(key)) {
      return;
    }
    existingPairs.add(key);
    merged.push(link);
  });
  return merged.sort(sortPipelineLinks);
}

function toReferenceInput(
  descriptor: ParsedInputDescriptor,
  parents: readonly ReferenceCatalogParentLink[],
  children: readonly ReferenceCatalogChildLink[],
): ReferenceCatalogInput {
  return {
    id: descriptor.id,
    path: descriptor.path,
    label: descriptor.label,
    defaultValue: descriptor.defaultValue,
    range: descriptor.range,
    parents,
    children,
  };
}

function extractPoseDefinitions(
  bundle: VizijBundleExtension,
): ReferencePoseDefinition[] {
  const poseSection = asRecord(bundle.poses);
  const poseConfig = asRecord(poseSection?.config);
  const rawPoses = Array.isArray(poseConfig?.poses) ? poseConfig.poses : [];

  const poses: ReferencePoseDefinition[] = rawPoses.map((rawPose, index) => {
    const pose = asRecord(rawPose);
    const id = asString(pose?.id) ?? `pose_${index + 1}`;
    const name = asString(pose?.name) ?? id;
    const values = asRecord(pose?.values);
    const targets =
      values === null
        ? []
        : Object.entries(values)
            .map(([inputId, rawValue]) => {
              const value = parsePoseTargetValue(rawValue);
              if (value === null) {
                return null;
              }
              return {
                inputId,
                value,
              };
            })
            .filter(
              (entry): entry is { inputId: string; value: number } =>
                entry !== null,
            )
            .sort((left, right) => left.inputId.localeCompare(right.inputId));

    return {
      id,
      name,
      targets,
    };
  });

  return poses;
}

export function extractReferenceCatalog(
  bundle: VizijBundleExtension | null | undefined,
): ReferenceCatalog {
  if (!bundle) {
    return {
      inputs: [],
      inputsById: new Map(),
      inputsByPath: new Map(),
      pipelineLinks: [],
      poses: [],
      posesById: new Map(),
    };
  }

  const vizij = extractVizijMetadata(bundle);
  const inputDescriptors = extractInputDescriptors(vizij);
  const inputIds = new Set(inputDescriptors.map((descriptor) => descriptor.id));
  const pipelineLinks = mergePipelineAndFallbackLinks({
    primaryLinks: extractPipelineLinks(vizij),
    fallbackLinks: extractBindingFallbackLinks(vizij, inputIds),
  });

  const parentsByInputId = new Map<string, ReferenceCatalogParentLink[]>();
  const childrenByInputId = new Map<string, ReferenceCatalogChildLink[]>();

  pipelineLinks.forEach((link) => {
    const parents = parentsByInputId.get(link.childInputId) ?? [];
    parents.push({
      linkId: link.linkId,
      parentInputId: link.parentInputId,
      scale: link.scale,
      offset: link.offset,
      enabled: link.enabled,
    });
    parentsByInputId.set(link.childInputId, parents);

    const children = childrenByInputId.get(link.parentInputId) ?? [];
    children.push({
      linkId: link.linkId,
      childInputId: link.childInputId,
      scale: link.scale,
      offset: link.offset,
      enabled: link.enabled,
    });
    childrenByInputId.set(link.parentInputId, children);
  });

  const inputs = inputDescriptors.map((descriptor) => {
    const parents = (parentsByInputId.get(descriptor.id) ?? []).sort(
      (left, right) => {
        const byParent = left.parentInputId.localeCompare(right.parentInputId);
        if (byParent !== 0) {
          return byParent;
        }
        return left.linkId.localeCompare(right.linkId);
      },
    );
    const children = (childrenByInputId.get(descriptor.id) ?? []).sort(
      (left, right) => {
        const byChild = left.childInputId.localeCompare(right.childInputId);
        if (byChild !== 0) {
          return byChild;
        }
        return left.linkId.localeCompare(right.linkId);
      },
    );
    return toReferenceInput(descriptor, parents, children);
  });

  const inputsById = new Map(inputs.map((input) => [input.id, input]));
  const inputsByPath = new Map<string, readonly ReferenceCatalogInput[]>();
  inputs.forEach((input) => {
    const key = normalizeCatalogPath(input.path);
    const current = inputsByPath.get(key) ?? [];
    inputsByPath.set(key, [...current, input].sort(sortInputs));
  });

  const poses = extractPoseDefinitions(bundle);
  const posesById = new Map(poses.map((pose) => [pose.id, pose]));

  return {
    inputs,
    inputsById,
    inputsByPath,
    pipelineLinks,
    poses,
    posesById,
  };
}
