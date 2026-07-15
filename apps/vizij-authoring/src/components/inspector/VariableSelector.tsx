import React, { useEffect, useMemo, useState } from "react";
import { Box, Zap } from "lucide-react";
import {
  formatStandardRigInputDisplayPath,
  SELF_BINDING_ID,
} from "@vizij/utils";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import { useSceneComposer } from "../../scene/useSceneComposer";
import { cn } from "../../utils/cn";
import { Button, PanelSearch, TreeRow } from "../ui";
import { isPropsRigStandardInputPath } from "../../utils/rigElementInputs";

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type VariableSelection =
  | { type: "variable"; id: string; ids?: string[] }
  | {
      type: "property";
      objectId: string;
      featureId: string;
      label: string;
      inputId?: string;
      inputIds?: string[];
      targetId?: string;
      targetIds?: string[];
    }
  | {
      type: "mixed";
      label: string;
      variableIds: string[];
      propertyInputIds: string[];
      propertyTargetIds: string[];
    };

interface VariableSelectorProps {
  onSelect: (selection: VariableSelection) => void;
  onCancel?: () => void;
}

type SourceFilter = "drivers" | "properties";
type GroupKind = "group" | "path" | "unassigned";

interface TargetMetadata {
  targetId: string;
  objectId: string;
  objectPath: string;
  featureId: string;
  featureLabel: string;
}

interface SelectorGroup {
  key: string;
  label: string;
  kind: GroupKind;
  rows: SelectorRow[];
}

interface SelectorRow {
  rowKey: string;
  sourceFilter: SourceFilter;
  sourceLabel: string;
  id: string;
  label: string;
  path: string;
  displayPath: string;
  sourceId?: string;
  groupKey: string;
  groupLabel: string;
  groupKind: GroupKind;
  searchText: string;
  matchHint: string | null;
  contextText: string;
  contextTitle: string;
  objectId?: string;
  featureId?: string;
  targetId?: string;
  selectionLabel?: string;
  propertyTypeKey?: string;
  propertyLeafKey?: string;
  disabled: boolean;
  disabledReason: string | null;
}

interface FilterOption {
  key: string;
  label: string;
  count: number;
}

const SORTER = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
});

const GROUP_RANK: Record<GroupKind, number> = {
  group: 0,
  path: 1,
  unassigned: 2,
};

const PROPERTY_TYPE_CATALOG: Array<{ key: string; label: string }> = [
  { key: "translation", label: "Translation" },
  { key: "rotation", label: "Rotation" },
  { key: "scale", label: "Scale" },
  { key: "color", label: "Color" },
  { key: "opacity", label: "Opacity" },
  { key: "morph", label: "Morph" },
  { key: "weight", label: "Weight" },
  { key: "material", label: "Material" },
  { key: "emission", label: "Emission" },
  { key: "roughness", label: "Roughness" },
  { key: "metalness", label: "Metalness" },
  { key: "shininess", label: "Shininess" },
  { key: "specular", label: "Specular" },
  { key: "visibility", label: "Visibility" },
  { key: "value", label: "Value" },
  { key: "custom", label: "Custom" },
];

const PROPERTY_LEAF_CATALOG: Array<{ key: string; label: string }> = [
  { key: "x", label: "X" },
  { key: "y", label: "Y" },
  { key: "z", label: "Z" },
  { key: "w", label: "W" },
  { key: "r", label: "R" },
  { key: "g", label: "G" },
  { key: "b", label: "B" },
  { key: "a", label: "A" },
  { key: "u", label: "U" },
  { key: "v", label: "V" },
  { key: "weight", label: "Weight" },
  { key: "value", label: "Value" },
  { key: "opacity", label: "Opacity" },
  { key: "intensity", label: "Intensity" },
  { key: "factor", label: "Factor" },
  { key: "amount", label: "Amount" },
  { key: "pitch", label: "Pitch" },
  { key: "yaw", label: "Yaw" },
  { key: "roll", label: "Roll" },
];

const PROPERTY_TYPE_ALIASES: Record<string, string> = {
  translation: "translation",
  translate: "translation",
  position: "translation",
  positional: "translation",
  rotation: "rotation",
  rotate: "rotation",
  orientation: "rotation",
  euler: "rotation",
  scale: "scale",
  scaling: "scale",
  color: "color",
  colour: "color",
  rgb: "color",
  rgba: "color",
  opacity: "opacity",
  alpha: "opacity",
  morph: "morph",
  blendshape: "morph",
  blend_shape: "morph",
  morph_target: "morph",
  mtarget: "morph",
  material: "material",
  emission: "emission",
  emissive: "emission",
  roughness: "roughness",
  metalness: "metalness",
  shininess: "shininess",
  shiny: "shininess",
  specular: "specular",
  visibility: "visibility",
  visible: "visibility",
  value: "value",
  weight: "weight",
};

const PROPERTY_LEAF_ALIASES: Record<string, string> = {
  x: "x",
  y: "y",
  z: "z",
  w: "w",
  r: "r",
  g: "g",
  b: "b",
  a: "a",
  u: "u",
  v: "v",
  tx: "x",
  ty: "y",
  tz: "z",
  rx: "x",
  ry: "y",
  rz: "z",
  sx: "x",
  sy: "y",
  sz: "z",
  red: "r",
  green: "g",
  blue: "b",
  alpha: "a",
  value: "value",
  weight: "weight",
  opacity: "opacity",
  intensity: "intensity",
  factor: "factor",
  amount: "amount",
  pitch: "pitch",
  yaw: "yaw",
  roll: "roll",
};

const EMPTY_SET: ReadonlySet<string> = Object.freeze(new Set<string>());

function normalizeSearchText(value: string | null | undefined): string {
  return value?.toLowerCase().trim() ?? "";
}

function splitSearchTokens(query: string): string[] {
  const normalized = normalizeSearchText(query);
  if (!normalized) {
    return [];
  }
  return normalized.split(/\s+/).filter(Boolean);
}

function compareText(left: string, right: string): number {
  return SORTER.compare(left, right);
}

function matchesAllTokens(
  searchText: string,
  tokens: readonly string[],
): boolean {
  return tokens.every((token) => searchText.includes(token));
}

function collectBindingInputIds(
  binding:
    | { inputId?: string | null; slots?: Array<{ inputId?: string | null }> }
    | null
    | undefined,
): string[] {
  if (!binding) {
    return [];
  }
  const ids = new Set<string>();
  const maybeInputId = binding.inputId?.trim();
  if (maybeInputId && maybeInputId !== SELF_BINDING_ID) {
    ids.add(maybeInputId);
  }
  (binding.slots ?? []).forEach((slot) => {
    const slotInputId = slot.inputId?.trim();
    if (slotInputId && slotInputId !== SELF_BINDING_ID) {
      ids.add(slotInputId);
    }
  });
  return Array.from(ids);
}

function deriveGroup(
  path: string,
  group: string | null,
): {
  key: string;
  label: string;
  kind: GroupKind;
} {
  if (group && group.trim().length > 0) {
    return {
      key: `group:${group.toLowerCase()}`,
      label: `Group · ${group}`,
      kind: "group",
    };
  }

  const segments = path.split("/").filter(Boolean);
  if (segments.length > 1) {
    const parentPath = `/${segments.slice(0, -1).join("/")}`;
    return {
      key: `path:${parentPath.toLowerCase()}`,
      label: `Path · ${parentPath}`,
      kind: "path",
    };
  }

  return {
    key: "unassigned",
    label: "Unassigned",
    kind: "unassigned",
  };
}

function resolveMatchHint(options: {
  queryTokens: readonly string[];
  label: string;
  id: string;
  path: string;
  group: string;
  sourceId: string;
  targetText: string;
  contextText: string;
}): string | null {
  if (options.queryTokens.length === 0) {
    return null;
  }

  const matchKinds = new Set<string>();
  options.queryTokens.forEach((token) => {
    if (normalizeSearchText(options.label).includes(token)) {
      matchKinds.add("label");
    }
    if (normalizeSearchText(options.id).includes(token)) {
      matchKinds.add("id");
    }
    if (normalizeSearchText(options.path).includes(token)) {
      matchKinds.add("path");
    }
    if (normalizeSearchText(options.group).includes(token)) {
      matchKinds.add("group");
    }
    if (normalizeSearchText(options.sourceId).includes(token)) {
      matchKinds.add("source");
    }
    if (normalizeSearchText(options.targetText).includes(token)) {
      matchKinds.add("target");
    }
    if (normalizeSearchText(options.contextText).includes(token)) {
      matchKinds.add("context");
    }
  });

  const ordered = [
    "label",
    "path",
    "id",
    "group",
    "source",
    "target",
    "context",
  ]
    .filter((kind) => matchKinds.has(kind))
    .filter((kind) => kind !== "label");

  if (ordered.length === 0) {
    return null;
  }
  return `match: ${ordered.slice(0, 2).join("+")}`;
}

function extractComponentIdFromSourceId(
  sourceId: string | null | undefined,
): string | null {
  if (!sourceId) {
    return null;
  }
  const parts = sourceId.split(":");
  if (parts[0] !== "component" || parts.length < 5) {
    return null;
  }
  try {
    return decodeURIComponent(parts[4] ?? "");
  } catch {
    return parts[4] ?? null;
  }
}

function normalizeFacetToken(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized.length > 0 ? normalized : null;
}

function canonicalizePropertyType(
  value: string | null | undefined,
): string | null {
  const normalized = normalizeFacetToken(value);
  if (!normalized) {
    return null;
  }
  return PROPERTY_TYPE_ALIASES[normalized] ?? normalized;
}

function canonicalizePropertyLeaf(
  value: string | null | undefined,
): string | null {
  const normalized = normalizeFacetToken(value);
  if (!normalized) {
    return null;
  }
  return PROPERTY_LEAF_ALIASES[normalized] ?? normalized;
}

function derivePropertyTypeKey(options: {
  metadataFeatureKey?: string;
  metadataFeatureLabel?: string;
  displayPath: string;
}): string | null {
  const segments = options.displayPath.split("/").filter(Boolean);
  const fromPath = segments.length >= 2 ? segments[segments.length - 2] : null;
  const candidates = [
    options.metadataFeatureKey,
    options.metadataFeatureLabel,
    fromPath,
  ];
  for (const candidate of candidates) {
    const canonical = canonicalizePropertyType(candidate);
    if (canonical) {
      return canonical;
    }
  }
  return null;
}

function derivePropertyLeafKey(options: {
  metadataComponentKey?: string;
  displayPath: string;
  label: string;
}): string | null {
  const segments = options.displayPath.split("/").filter(Boolean);
  const fromPath = segments.length > 0 ? segments[segments.length - 1] : null;
  const labelTail = options.label.split(/\s+/).at(-1);
  const candidates = [options.metadataComponentKey, fromPath, labelTail];
  for (const candidate of candidates) {
    const canonical = canonicalizePropertyLeaf(candidate);
    if (canonical) {
      return canonical;
    }
  }
  return null;
}

function formatFacetLabel(key: string): string {
  return key
    .split("_")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function buildFacetOptions(
  catalog: Array<{ key: string; label: string }>,
  counts: Map<string, number>,
): FilterOption[] {
  const catalogKeys = new Set(catalog.map((item) => item.key));
  const options: FilterOption[] = catalog.map((item) => ({
    key: item.key,
    label: item.label,
    count: counts.get(item.key) ?? 0,
  }));

  const extras = Array.from(counts.entries())
    .filter(([key]) => !catalogKeys.has(key))
    .sort(([left], [right]) => compareText(left, right))
    .map(([key, count]) => ({
      key,
      label: formatFacetLabel(key),
      count,
    }));

  return [...options, ...extras];
}

// ----------------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------------

export function VariableSelector({
  onSelect,
  onCancel,
}: VariableSelectorProps) {
  const [search, setSearch] = useState("");

  return (
    <div className="flex flex-col h-[80vh] max-h-[980px] w-full bg-bg-app text-text-primary overflow-hidden rounded-xl border border-border-default shadow-2xl">
      <div className="p-3 border-b border-border-default flex flex-col gap-3 bg-bg-panel/50 backdrop-blur-md">
        <PanelSearch
          value={search}
          onChange={setSearch}
          placeholder="Search drivers or properties..."
          className="h-9"
        />
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar bg-bg-input/20">
        <InputList search={search} onSelect={onSelect} />
      </div>

      {onCancel && (
        <div className="p-3 border-t border-border-default flex justify-end bg-bg-panel/50">
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancel}
            className="text-text-muted hover:text-text-primary"
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Shared List Renderer
// ----------------------------------------------------------------------------

function InputList({
  search,
  onSelect,
}: {
  search: string;
  onSelect: (selection: VariableSelection) => void;
}) {
  const managedStandardInputs = useBindingAuthoring(
    (state) => state.managedStandardInputs,
  );
  const bindings = useBindingAuthoring((state) => state.bindings);
  const lockedInspectorTargetIds =
    useBindingAuthoring((state) => state.lockedInspectorTargetIds) ?? EMPTY_SET;
  const lockedPropsRigInputIds =
    useBindingAuthoring((state) => state.lockedPropsRigInputIds) ?? EMPTY_SET;
  const { objects } = useSceneComposer();

  const queryTokens = useMemo(() => splitSearchTokens(search), [search]);

  const targetMetadataByTargetId = useMemo(() => {
    const objectById = new Map(
      objects.map((objectNode) => [objectNode.id, objectNode]),
    );
    const objectPathCache = new Map<string, string>();

    const resolveObjectPath = (objectId: string): string => {
      const existing = objectPathCache.get(objectId);
      if (existing) {
        return existing;
      }
      const objectNode = objectById.get(objectId);
      if (!objectNode) {
        objectPathCache.set(objectId, objectId);
        return objectId;
      }

      const names: string[] = [];
      let current: typeof objectNode | undefined = objectNode;
      while (current) {
        names.unshift(current.name || current.id);
        if (!current.parentId) {
          break;
        }
        current = objectById.get(current.parentId);
      }

      const resolved = names.join(" / ");
      objectPathCache.set(objectId, resolved);
      return resolved;
    };

    const metadata = new Map<string, TargetMetadata>();
    objects.forEach((objectNode) => {
      const objectPath = resolveObjectPath(objectNode.id);
      objectNode.features.forEach((feature) => {
        feature.components.forEach((component) => {
          if (!component.targetId) {
            return;
          }
          metadata.set(component.targetId, {
            targetId: component.targetId,
            objectId: objectNode.id,
            objectPath,
            featureId: feature.id,
            featureLabel: feature.label,
          });
        });
      });
    });

    return metadata;
  }, [objects]);

  const targetMetadataByInputId = useMemo(() => {
    const metadataByInput = new Map<string, TargetMetadata[]>();
    const seenTargetsByInput = new Map<string, Set<string>>();

    Object.entries(bindings).forEach(([targetId, binding]) => {
      const targetMetadata = targetMetadataByTargetId.get(targetId);
      if (!targetMetadata) {
        return;
      }

      collectBindingInputIds(binding).forEach((inputId) => {
        const seenTargets =
          seenTargetsByInput.get(inputId) ?? new Set<string>();
        if (seenTargets.has(targetId)) {
          return;
        }
        seenTargets.add(targetId);
        seenTargetsByInput.set(inputId, seenTargets);

        const entries = metadataByInput.get(inputId) ?? [];
        entries.push(targetMetadata);
        metadataByInput.set(inputId, entries);
      });
    });

    metadataByInput.forEach((entries) => {
      entries.sort((left, right) => {
        const pathDiff = compareText(left.objectPath, right.objectPath);
        if (pathDiff !== 0) {
          return pathDiff;
        }
        const featureDiff = compareText(left.featureLabel, right.featureLabel);
        if (featureDiff !== 0) {
          return featureDiff;
        }
        return compareText(left.targetId, right.targetId);
      });
    });

    return metadataByInput;
  }, [bindings, targetMetadataByTargetId]);

  const propertyFacetData = useMemo(() => {
    const typeCounts = new Map<string, number>();
    const leafCounts = new Map<string, number>();
    const allTargetIds = new Set<string>();
    const targetIdToInputIds = new Map<string, Set<string>>();

    managedStandardInputs.forEach((entry) => {
      const input = entry.input;
      if (!isPropsRigStandardInputPath(input.path)) {
        return;
      }

      const displayPath = formatStandardRigInputDisplayPath(input.path);
      const typeKey = derivePropertyTypeKey({
        metadataFeatureKey: entry.metadata?.featureKey,
        metadataFeatureLabel: entry.metadata?.featureLabel,
        displayPath,
      });
      const leafKey = derivePropertyLeafKey({
        metadataComponentKey:
          entry.metadata?.componentKey !== undefined
            ? String(entry.metadata.componentKey)
            : undefined,
        displayPath,
        label: input.label || input.id,
      });
      const componentId =
        entry.metadata?.componentId ??
        extractComponentIdFromSourceId(input.sourceId ?? null);

      if (componentId) {
        allTargetIds.add(componentId);
        const mappedInputIds = targetIdToInputIds.get(componentId) ?? new Set();
        mappedInputIds.add(input.id);
        targetIdToInputIds.set(componentId, mappedInputIds);
      }

      if (typeKey) {
        typeCounts.set(typeKey, (typeCounts.get(typeKey) ?? 0) + 1);
      }
      if (leafKey) {
        leafCounts.set(leafKey, (leafCounts.get(leafKey) ?? 0) + 1);
      }
    });

    return {
      typeOptions: buildFacetOptions(PROPERTY_TYPE_CATALOG, typeCounts),
      leafOptions: buildFacetOptions(PROPERTY_LEAF_CATALOG, leafCounts),
      allTargetIds,
      targetIdToInputIds: new Map(
        Array.from(targetIdToInputIds.entries()).map(([targetId, inputIds]) => [
          targetId,
          Array.from(inputIds).sort(compareText),
        ]),
      ),
    };
  }, [managedStandardInputs]);

  const [selectedSourceFilters, setSelectedSourceFilters] = useState<
    Set<SourceFilter>
  >(new Set());
  const [selectedPropertyTypeFilters, setSelectedPropertyTypeFilters] =
    useState<Set<string>>(new Set());
  const [selectedPropertyLeafFilters, setSelectedPropertyLeafFilters] =
    useState<Set<string>>(new Set());
  const [selectedVariableInputIds, setSelectedVariableInputIds] = useState<
    Set<string>
  >(new Set());
  const [selectedPropertyTargetIds, setSelectedPropertyTargetIds] = useState<
    Set<string>
  >(new Set());

  const visiblePropertyTypeOptions = useMemo(
    () => propertyFacetData.typeOptions.filter((option) => option.count > 0),
    [propertyFacetData.typeOptions],
  );
  const visiblePropertyLeafOptions = useMemo(
    () => propertyFacetData.leafOptions.filter((option) => option.count > 0),
    [propertyFacetData.leafOptions],
  );

  const driverInputIdOrder = useMemo(
    () =>
      managedStandardInputs
        .filter((entry) => !isPropsRigStandardInputPath(entry.input.path))
        .map((entry) => entry.input.id),
    [managedStandardInputs],
  );

  const allDriverInputIds = useMemo(
    () => new Set(driverInputIdOrder),
    [driverInputIdOrder],
  );

  useEffect(() => {
    setSelectedVariableInputIds((current) => {
      const next = new Set<string>();
      current.forEach((inputId) => {
        if (allDriverInputIds.has(inputId)) {
          next.add(inputId);
        }
      });
      if (next.size === current.size) {
        return current;
      }
      return next;
    });
  }, [allDriverInputIds]);

  useEffect(() => {
    setSelectedPropertyTargetIds((current) => {
      const next = new Set<string>();
      current.forEach((targetId) => {
        if (propertyFacetData.allTargetIds.has(targetId)) {
          next.add(targetId);
        }
      });
      if (next.size === current.size) {
        return current;
      }
      return next;
    });
  }, [propertyFacetData.allTargetIds]);

  useEffect(() => {
    const visibleKeys = new Set(
      visiblePropertyTypeOptions.map((option) => option.key),
    );
    setSelectedPropertyTypeFilters((current) => {
      const next = new Set<string>();
      current.forEach((key) => {
        if (visibleKeys.has(key)) {
          next.add(key);
        }
      });
      if (next.size === current.size) {
        return current;
      }
      return next;
    });
  }, [visiblePropertyTypeOptions]);

  useEffect(() => {
    const visibleKeys = new Set(
      visiblePropertyLeafOptions.map((option) => option.key),
    );
    setSelectedPropertyLeafFilters((current) => {
      const next = new Set<string>();
      current.forEach((key) => {
        if (visibleKeys.has(key)) {
          next.add(key);
        }
      });
      if (next.size === current.size) {
        return current;
      }
      return next;
    });
  }, [visiblePropertyLeafOptions]);

  const groups = useMemo(() => {
    const rows: SelectorRow[] = [];

    managedStandardInputs.forEach((entry) => {
      const input = entry.input;
      const isPropsRig = isPropsRigStandardInputPath(input.path);
      const sourceFilter: SourceFilter = isPropsRig ? "properties" : "drivers";
      if (
        selectedSourceFilters.size > 0 &&
        !selectedSourceFilters.has(sourceFilter)
      ) {
        return;
      }

      const displayPath = isPropsRig
        ? formatStandardRigInputDisplayPath(input.path)
        : input.path;
      const groupText = input.group?.trim() || "";
      const group = deriveGroup(displayPath, groupText);
      const label = input.label?.trim() || input.id;

      const sourceId = input.sourceId ?? "";
      const metadata = entry.metadata;
      const componentId =
        metadata?.componentId ?? extractComponentIdFromSourceId(sourceId);

      if (sourceFilter === "properties" && !componentId) {
        return;
      }

      const propertyTypeKey = isPropsRig
        ? derivePropertyTypeKey({
            metadataFeatureKey: metadata?.featureKey,
            metadataFeatureLabel: metadata?.featureLabel,
            displayPath,
          })
        : undefined;
      const propertyLeafKey = isPropsRig
        ? derivePropertyLeafKey({
            metadataComponentKey:
              metadata?.componentKey !== undefined
                ? String(metadata.componentKey)
                : undefined,
            displayPath,
            label,
          })
        : undefined;

      if (
        sourceFilter === "properties" &&
        selectedPropertyTypeFilters.size > 0 &&
        (!propertyTypeKey || !selectedPropertyTypeFilters.has(propertyTypeKey))
      ) {
        return;
      }

      if (
        sourceFilter === "properties" &&
        selectedPropertyLeafFilters.size > 0 &&
        (!propertyLeafKey || !selectedPropertyLeafFilters.has(propertyLeafKey))
      ) {
        return;
      }

      const variableTargetMetadata = !isPropsRig
        ? (targetMetadataByInputId.get(input.id) ?? [])
        : [];
      const variableTargetText = variableTargetMetadata
        .map((item) => item.targetId)
        .join(" ");
      const variableContext = variableTargetMetadata[0]?.objectPath ?? "";

      const propertyContext =
        metadata?.elementName || metadata?.elementId
          ? `${metadata?.elementName || metadata?.elementId} · ${metadata?.featureLabel || metadata?.featureKey || "Property"}`
          : "";

      const contextText = isPropsRig
        ? displayPath
        : variableContext || displayPath;
      const contextTitle = isPropsRig
        ? `${displayPath}${propertyContext ? ` • ${propertyContext}` : ""}`
        : variableContext
          ? `${variableContext} • ${displayPath}`
          : displayPath;

      const targetText = isPropsRig
        ? [
            componentId,
            metadata?.animatableId,
            metadata?.featureKey,
            propertyTypeKey,
            propertyLeafKey,
          ]
            .filter(Boolean)
            .join(" ")
        : variableTargetText;

      const disabledByTargetLock =
        isPropsRig &&
        componentId !== null &&
        lockedInspectorTargetIds.has(componentId);
      const disabledByPropsRigLock = lockedPropsRigInputIds.has(input.id);
      const rowDisabled = disabledByTargetLock || disabledByPropsRigLock;
      const rowDisabledReason = disabledByTargetLock
        ? "Locked in Face Element inspector."
        : disabledByPropsRigLock
          ? "Direct control disabled from Face Element inspector lock."
          : null;

      const sourceLabel = sourceFilter === "drivers" ? "Driver" : "Property";
      const searchText = normalizeSearchText(
        [
          label,
          input.id,
          input.path,
          displayPath,
          groupText,
          sourceId,
          sourceLabel,
          targetText,
          variableContext,
          propertyContext,
        ].join(" "),
      );

      if (!matchesAllTokens(searchText, queryTokens)) {
        return;
      }

      rows.push({
        rowKey: `${sourceFilter}:${componentId ?? input.id}`,
        sourceFilter,
        sourceLabel,
        id: input.id,
        label,
        path: input.path,
        displayPath,
        sourceId,
        groupKey: group.key,
        groupLabel: group.label,
        groupKind: group.kind,
        searchText,
        matchHint: resolveMatchHint({
          queryTokens,
          label,
          id: input.id,
          path: `${input.path} ${displayPath}`,
          group: groupText,
          sourceId,
          targetText,
          contextText,
        }),
        contextText,
        contextTitle,
        objectId: isPropsRig
          ? (metadata?.elementId ?? "propsrig")
          : (variableTargetMetadata[0]?.objectId ?? undefined),
        featureId: isPropsRig
          ? (metadata?.featureKey ?? "propsrig")
          : (variableTargetMetadata[0]?.featureId ?? undefined),
        targetId: isPropsRig ? (componentId ?? undefined) : undefined,
        selectionLabel: isPropsRig ? `${label} · ${displayPath}` : undefined,
        propertyTypeKey: propertyTypeKey ?? undefined,
        propertyLeafKey: propertyLeafKey ?? undefined,
        disabled: rowDisabled,
        disabledReason: rowDisabledReason,
      });
    });

    rows.sort((left, right) => {
      const groupRankDiff =
        GROUP_RANK[left.groupKind] - GROUP_RANK[right.groupKind];
      if (groupRankDiff !== 0) {
        return groupRankDiff;
      }
      const groupDiff = compareText(left.groupLabel, right.groupLabel);
      if (groupDiff !== 0) {
        return groupDiff;
      }
      const sourceDiff = compareText(left.sourceLabel, right.sourceLabel);
      if (sourceDiff !== 0) {
        return sourceDiff;
      }
      const labelDiff = compareText(left.label, right.label);
      if (labelDiff !== 0) {
        return labelDiff;
      }
      return compareText(left.id, right.id);
    });

    const grouped = new Map<string, SelectorGroup>();
    rows.forEach((row) => {
      const existing = grouped.get(row.groupKey);
      if (existing) {
        existing.rows.push(row);
        return;
      }
      grouped.set(row.groupKey, {
        key: row.groupKey,
        label: row.groupLabel,
        kind: row.groupKind,
        rows: [row],
      });
    });

    return Array.from(grouped.values());
  }, [
    managedStandardInputs,
    queryTokens,
    selectedSourceFilters,
    selectedPropertyLeafFilters,
    selectedPropertyTypeFilters,
    lockedPropsRigInputIds,
    lockedInspectorTargetIds,
    targetMetadataByInputId,
  ]);

  const allRows = useMemo(
    () => groups.flatMap((group) => group.rows),
    [groups],
  );

  const filteredPropertyRows = useMemo(
    () =>
      allRows.filter(
        (row) =>
          row.sourceFilter === "properties" &&
          Boolean(row.targetId) &&
          !row.disabled,
      ),
    [allRows],
  );

  const filteredPropertyTargetIds = useMemo(
    () =>
      Array.from(
        new Set(
          filteredPropertyRows
            .map((row) => row.targetId)
            .filter((targetId): targetId is string => Boolean(targetId)),
        ),
      ).sort(compareText),
    [filteredPropertyRows],
  );

  const propertyRowByTargetId = useMemo(() => {
    const byTarget = new Map<string, SelectorRow>();
    allRows.forEach((row) => {
      if (row.sourceFilter !== "properties" || !row.targetId) {
        return;
      }
      if (!byTarget.has(row.targetId)) {
        byTarget.set(row.targetId, row);
      }
    });
    return byTarget;
  }, [allRows]);

  const filteredVariableRows = useMemo(
    () =>
      allRows.filter((row) => row.sourceFilter === "drivers" && !row.disabled),
    [allRows],
  );

  const filteredVariableInputIds = useMemo(
    () =>
      Array.from(new Set(filteredVariableRows.map((row) => row.id))).sort(
        compareText,
      ),
    [filteredVariableRows],
  );

  const selectedVariableCount = selectedVariableInputIds.size;
  const selectedPropertyCount = selectedPropertyTargetIds.size;
  const totalSelectedCount = selectedVariableCount + selectedPropertyCount;
  const totalFilteredCount =
    filteredVariableInputIds.length + filteredPropertyTargetIds.length;

  const groupKeys = useMemo(() => groups.map((group) => group.key), [groups]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    setExpandedGroups((current) => {
      const allowed = new Set(groupKeys);
      const next = new Set<string>();
      current.forEach((key) => {
        if (allowed.has(key)) {
          next.add(key);
        }
      });
      if (next.size === current.size) {
        return current;
      }
      return next;
    });
  }, [groupKeys]);

  useEffect(() => {
    if (queryTokens.length === 0) {
      return;
    }
    setExpandedGroups(new Set(groupKeys));
  }, [groupKeys, queryTokens]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleFacetFilter = (
    key: string,
    setFilters: React.Dispatch<React.SetStateAction<Set<string>>>,
  ) => {
    setFilters((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleSourceFilter = (sourceFilter: SourceFilter) => {
    setSelectedSourceFilters((current) => {
      const next = new Set(current);
      if (next.has(sourceFilter)) {
        next.delete(sourceFilter);
      } else {
        next.add(sourceFilter);
      }
      return next;
    });
  };

  const hasActivePropertyFilters =
    selectedPropertyTypeFilters.size > 0 ||
    selectedPropertyLeafFilters.size > 0;
  const hasActiveFilters =
    hasActivePropertyFilters || selectedSourceFilters.size > 0;

  const clearFilters = () => {
    setSelectedSourceFilters(new Set());
    setSelectedPropertyTypeFilters(new Set());
    setSelectedPropertyLeafFilters(new Set());
  };

  const toggleVariableSelection = (inputId: string) => {
    setSelectedVariableInputIds((current) => {
      const next = new Set(current);
      if (next.has(inputId)) {
        next.delete(inputId);
      } else {
        next.add(inputId);
      }
      return next;
    });
  };

  const togglePropertySelection = (targetId: string) => {
    setSelectedPropertyTargetIds((current) => {
      const next = new Set(current);
      if (next.has(targetId)) {
        next.delete(targetId);
      } else {
        next.add(targetId);
      }
      return next;
    });
  };

  const addFilteredToSelection = () => {
    if (filteredVariableInputIds.length > 0) {
      setSelectedVariableInputIds((current) => {
        const next = new Set(current);
        filteredVariableInputIds.forEach((inputId) => next.add(inputId));
        return next;
      });
    }
    if (filteredPropertyTargetIds.length > 0) {
      setSelectedPropertyTargetIds((current) => {
        const next = new Set(current);
        filteredPropertyTargetIds.forEach((targetId) => next.add(targetId));
        return next;
      });
    }
  };

  const clearSelection = () => {
    setSelectedVariableInputIds(new Set());
    setSelectedPropertyTargetIds(new Set());
  };

  const handleAddSelected = () => {
    if (totalSelectedCount === 0) {
      return;
    }
    const orderedVariableIds = driverInputIdOrder.filter((inputId) =>
      selectedVariableInputIds.has(inputId),
    );

    const orderedPropertyTargetIds = Array.from(
      selectedPropertyTargetIds.values(),
    ).sort(compareText);

    const selectedPropertyInputIds = Array.from(
      new Set(
        orderedPropertyTargetIds.flatMap(
          (targetId) =>
            propertyFacetData.targetIdToInputIds.get(targetId) ?? [],
        ),
      ),
    ).sort(compareText);

    if (orderedVariableIds.length > 0 && orderedPropertyTargetIds.length > 0) {
      onSelect({
        type: "mixed",
        label: `Selected Drivers (${orderedVariableIds.length}) + Properties (${orderedPropertyTargetIds.length})`,
        variableIds: orderedVariableIds,
        propertyInputIds: selectedPropertyInputIds,
        propertyTargetIds: orderedPropertyTargetIds,
      });
      return;
    }

    if (orderedVariableIds.length > 0) {
      if (orderedVariableIds.length === 1) {
        onSelect({ type: "variable", id: orderedVariableIds[0]! });
        return;
      }
      onSelect({
        type: "variable",
        id: orderedVariableIds[0]!,
        ids: orderedVariableIds,
      });
      return;
    }

    if (orderedPropertyTargetIds.length === 1) {
      const singleRow = propertyRowByTargetId.get(orderedPropertyTargetIds[0]!);
      if (singleRow?.targetId) {
        onSelect({
          type: "property",
          objectId: singleRow.objectId ?? "propsrig",
          featureId: singleRow.featureId ?? "propsrig",
          label: singleRow.selectionLabel ?? singleRow.label,
          inputId: singleRow.id,
          targetId: singleRow.targetId,
        });
      }
      return;
    }

    onSelect({
      type: "property",
      objectId: "propsrig",
      featureId: "propsrig",
      label: `Selected Properties (${orderedPropertyTargetIds.length})`,
      inputIds: selectedPropertyInputIds,
      targetIds: orderedPropertyTargetIds,
    });
  };

  const handleAddSingle = (row: SelectorRow) => {
    if (row.disabled) {
      return;
    }
    if (row.sourceFilter === "drivers") {
      onSelect({
        type: "variable",
        id: row.id,
      });
      return;
    }
    if (!row.targetId) {
      return;
    }
    onSelect({
      type: "property",
      objectId: row.objectId ?? "propsrig",
      featureId: row.featureId ?? "propsrig",
      label: row.selectionLabel ?? row.label,
      inputId: row.id,
      targetId: row.targetId,
    });
  };

  const sourceOptions: Array<{
    key: SourceFilter;
    label: string;
    count: number;
  }> = [
    { key: "drivers", label: "Drivers", count: driverInputIdOrder.length },
    {
      key: "properties",
      label: "Properties",
      count: propertyFacetData.allTargetIds.size,
    },
  ];

  return (
    <div className="flex flex-col p-2 gap-0.5 pb-4">
      <div className="sticky top-0 z-20 mb-2 rounded-lg border border-border-default bg-bg-panel/80 backdrop-blur-md p-2 flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <span className="text-[10px] uppercase tracking-wide text-text-muted w-12 pt-1">
            Source
          </span>
          <div className="flex flex-wrap gap-1 flex-1">
            {sourceOptions.map((option) => {
              const selected = selectedSourceFilters.has(option.key);
              return (
                <button
                  key={`source-${option.key}`}
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1 h-6 px-2 rounded-md border text-[10px] transition-colors",
                    selected
                      ? "border-sky-500/50 bg-sky-500/20 text-text-primary"
                      : "border-border-default bg-bg-input text-text-secondary hover:text-text-primary hover:border-border-hover",
                  )}
                  aria-pressed={selected}
                  onClick={() => toggleSourceFilter(option.key)}
                >
                  <span>{option.label}</span>
                  <span className="font-mono text-[9px]">{option.count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-start gap-2">
          <span className="text-[10px] uppercase tracking-wide text-text-muted w-12 pt-1">
            Type
          </span>
          <div className="flex flex-wrap gap-1 flex-1">
            {visiblePropertyTypeOptions.map((option) => {
              const selected = selectedPropertyTypeFilters.has(option.key);
              return (
                <button
                  key={`type-${option.key}`}
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1 h-6 px-2 rounded-md border text-[10px] transition-colors",
                    selected
                      ? "border-accent/50 bg-accent/20 text-text-primary"
                      : "border-border-default bg-bg-input text-text-secondary hover:text-text-primary hover:border-border-hover",
                  )}
                  aria-pressed={selected}
                  onClick={() =>
                    toggleFacetFilter(
                      option.key,
                      setSelectedPropertyTypeFilters,
                    )
                  }
                >
                  <span>{option.label}</span>
                  <span className="font-mono text-[9px]">{option.count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-start gap-2">
          <span className="text-[10px] uppercase tracking-wide text-text-muted w-12 pt-1">
            Leaf
          </span>
          <div className="flex flex-wrap gap-1 flex-1">
            {visiblePropertyLeafOptions.map((option) => {
              const selected = selectedPropertyLeafFilters.has(option.key);
              return (
                <button
                  key={`leaf-${option.key}`}
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1 h-6 px-2 rounded-md border text-[10px] transition-colors",
                    selected
                      ? "border-emerald-500/50 bg-emerald-500/15 text-text-primary"
                      : "border-border-default bg-bg-input text-text-secondary hover:text-text-primary hover:border-border-hover",
                  )}
                  aria-pressed={selected}
                  onClick={() =>
                    toggleFacetFilter(
                      option.key,
                      setSelectedPropertyLeafFilters,
                    )
                  }
                >
                  <span>{option.label}</span>
                  <span className="font-mono text-[9px]">{option.count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border-default/60">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px]"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
          >
            Clear Filters
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px]"
            onClick={addFilteredToSelection}
            disabled={totalFilteredCount === 0}
          >
            Add Filtered To Selection ({totalFilteredCount})
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px]"
            onClick={clearSelection}
            disabled={totalSelectedCount === 0}
          >
            Clear Selection
          </Button>
          <Button
            size="sm"
            variant="primary"
            className="h-6 px-2 text-[10px]"
            onClick={handleAddSelected}
            disabled={totalSelectedCount === 0}
          >
            Add Selected ({totalSelectedCount})
          </Button>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="p-8 text-center text-xs text-text-muted italic flex flex-col gap-1">
          {search.trim() ? (
            <>
              <span>No drivers or properties match "{search.trim()}".</span>
              <span className="text-[11px] not-italic text-text-secondary">
                {hasActiveFilters
                  ? "Try broadening your filter chips or search terms."
                  : "Try a label, path segment, or ID fragment."}
              </span>
            </>
          ) : (
            <span>No drivers or properties available.</span>
          )}
        </div>
      ) : (
        groups.map((group) => {
          const isExpanded =
            expandedGroups.has(group.key) || queryTokens.length > 0;

          return (
            <TreeRow
              key={group.key}
              depth={0}
              label={group.label}
              hasChildren={true}
              isExpanded={isExpanded}
              onToggle={() => toggleGroup(group.key)}
              icon={
                <Box size={10} className="text-text-muted" strokeWidth={2.5} />
              }
              highlightQuery=""
              actions={
                <span className="text-[9px] text-text-muted font-mono">
                  {group.rows.length}
                </span>
              }
            >
              <div className="flex flex-col">
                {group.rows.map((row) => {
                  const isVariableSelected =
                    row.sourceFilter === "drivers" &&
                    selectedVariableInputIds.has(row.id);
                  const isPropertySelected =
                    row.sourceFilter === "properties" &&
                    !!row.targetId &&
                    selectedPropertyTargetIds.has(row.targetId);
                  const rowIsSelected =
                    isVariableSelected || isPropertySelected;

                  return (
                    <TreeRow
                      key={row.rowKey}
                      depth={1}
                      label={row.label}
                      hasChildren={false}
                      isSelected={rowIsSelected}
                      disabled={row.disabled}
                      disabledReason={row.disabledReason ?? undefined}
                      onToggle={() => undefined}
                      onSelect={() => {
                        if (row.disabled) {
                          return;
                        }
                        if (row.sourceFilter === "drivers") {
                          toggleVariableSelection(row.id);
                          return;
                        }
                        if (!row.targetId) {
                          return;
                        }
                        togglePropertySelection(row.targetId);
                      }}
                      icon={
                        <Zap
                          size={10}
                          className="text-yellow-400/70"
                          strokeWidth={2.5}
                        />
                      }
                      highlightQuery=""
                      actions={
                        <div className="flex items-center gap-1 max-w-[220px]">
                          {row.disabled ? (
                            <span
                              className="text-[9px] px-1.5 py-0.5 rounded border border-border-default/70 bg-bg-input/70 text-text-muted"
                              title={row.disabledReason ?? undefined}
                            >
                              Locked
                            </span>
                          ) : null}
                          <span className="text-[9px] px-1.5 py-0.5 rounded border border-border-default/60 bg-bg-input/60 text-text-muted">
                            {row.sourceLabel}
                          </span>
                          <Button
                            size="sm"
                            variant={rowIsSelected ? "secondary" : "ghost"}
                            className="h-5 px-1.5 text-[9px]"
                            disabled={row.disabled}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (row.disabled) {
                                return;
                              }
                              if (row.sourceFilter === "drivers") {
                                toggleVariableSelection(row.id);
                                return;
                              }
                              if (!row.targetId) {
                                return;
                              }
                              togglePropertySelection(row.targetId);
                            }}
                          >
                            {rowIsSelected ? "Selected" : "Select"}
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 px-1.5 text-[9px]"
                            disabled={row.disabled}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (row.disabled) {
                                return;
                              }
                              handleAddSingle(row);
                            }}
                          >
                            Add
                          </Button>
                        </div>
                      }
                    />
                  );
                })}
              </div>
            </TreeRow>
          );
        })
      )}
    </div>
  );
}
