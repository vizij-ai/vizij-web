import { useEffect, useMemo, useState } from "react";

import type {
  GraphEditorState,
  GraphNodeState,
  GraphParamState,
  ValueKind,
} from "../types";
import type { NodeRegistryEntry } from "../hooks/useNodeRegistry";
import { ValueField } from "./ValueField";
import { defaultValueForKind } from "../utils/valueHelpers";

const VALUE_KIND_OPTIONS: ValueKind[] = [
  "float",
  "bool",
  "vec2",
  "vec3",
  "vec4",
  "quat",
  "color",
  "vector",
  "transform",
  "custom",
];

interface GraphEditorProps {
  value: GraphEditorState;
  onChange: (state: GraphEditorState) => void;
  registry: NodeRegistryEntry[];
  loading?: boolean;
  error?: string | null;
}

type ShapeErrorMap = Record<
  string,
  { input?: string | null; output?: string | null }
>;

type ParamBlueprint = {
  id: string;
  label: string;
  kind: ValueKind;
  defaultValue: any;
};

function cloneState(state: GraphEditorState): GraphEditorState {
  return structuredClone(state);
}

function toValueKind(
  typeName: string | undefined,
  fallback: ValueKind = "float",
): ValueKind {
  if (!typeName) return fallback;
  const value = typeName.toLowerCase();
  if (value.includes("vec2")) return "vec2";
  if (value.includes("vec3")) return "vec3";
  if (value.includes("vec4")) return "vec4";
  if (value.includes("quat")) return "quat";
  if (value.includes("color")) return "color";
  if (value.includes("bool")) return "bool";
  if (value.includes("transform")) return "transform";
  if (value.includes("vector")) return "vector";
  if (
    value.includes("int") ||
    value.includes("float") ||
    value.includes("number")
  )
    return "float";
  return fallback;
}

function paramBlueprintsFromSchema(
  schema?: NodeRegistryEntry | undefined,
): ParamBlueprint[] {
  if (!schema?.params || !Array.isArray(schema.params)) {
    return [];
  }
  return schema.params.map((param: any, index: number) => {
    const id = String(param?.id ?? param?.key ?? `param_${index}`);
    const label = String(param?.label ?? param?.name ?? id);
    const kind = toValueKind(
      typeof param?.type === "string" ? param.type : undefined,
      "custom",
    );
    const defaultValue = param?.default ?? defaultValueForKind(kind);
    return { id, label, kind, defaultValue };
  });
}

function inputsFromSchema(schema?: NodeRegistryEntry | undefined): string[] {
  if (!schema?.inputs || !Array.isArray(schema.inputs)) {
    return [];
  }
  return schema.inputs.map((input: any, index: number) =>
    String(input?.id ?? input?.key ?? input?.slot ?? `input_${index}`),
  );
}

function ensureParamsMatchBlueprints(
  params: GraphParamState[] | undefined,
  blueprints: ParamBlueprint[],
): GraphParamState[] {
  const existingMap = new Map((params ?? []).map((param) => [param.id, param]));
  const next: GraphParamState[] = blueprints.map((blueprint) => {
    const existing = existingMap.get(blueprint.id);
    if (existing) {
      return {
        ...existing,
        label: existing.label || blueprint.label,
        type: existing.type,
      };
    }
    return {
      id: blueprint.id,
      label: blueprint.label,
      type: blueprint.kind,
      value: structuredClone(blueprint.defaultValue),
    };
  });
  (params ?? []).forEach((param) => {
    if (!existingMap.has(param.id)) {
      next.push(param);
    }
  });
  return next;
}

function ensureInputsMatchSchema(
  inputs: Record<string, string> | undefined,
  schemaInputs: string[],
): Record<string, string> {
  const next: Record<string, string> = { ...(inputs ?? {}) };
  schemaInputs.forEach((slot) => {
    if (!(slot in next)) {
      next[slot] = "";
    }
  });
  return next;
}

function generateUniqueId(base: string, existing: Set<string>): string {
  let suffix = 1;
  let candidate = base;
  while (existing.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function createNodeFromSchema(
  schema: NodeRegistryEntry | undefined,
  existingIds: Set<string>,
  fallbackType: string,
): GraphNodeState {
  const normalizedFallback = fallbackType?.trim()
    ? fallbackType.trim()
    : "custom";
  const baseId = schema?.type_id ?? normalizedFallback ?? "node";
  const id = generateUniqueId(baseId, existingIds);
  const blueprints = paramBlueprintsFromSchema(schema);
  const schemaInputs = inputsFromSchema(schema);
  return {
    id,
    type: schema?.type_id ?? normalizedFallback,
    name: schema?.name ?? id,
    category: schema?.category ?? "Custom",
    params: ensureParamsMatchBlueprints([], blueprints),
    inputs: ensureInputsMatchSchema({}, schemaInputs),
    inputShapeJson: undefined,
    outputShapeJson: undefined,
    outputValueKind:
      (schema?.type_id ?? normalizedFallback).toLowerCase() === "output"
        ? "float"
        : undefined,
  };
}

function summarizeNode(node: GraphNodeState): string {
  const inputCount = Object.values(node.inputs ?? {}).filter(
    (value) => value,
  ).length;
  const paramCount = node.params.length;
  const valueSummary =
    node.type.toLowerCase() === "output" && node.outputValueKind
      ? ` • ${node.outputValueKind}`
      : "";
  return `${node.type} • ${paramCount} param${paramCount === 1 ? "" : "s"} • ${inputCount} input${
    inputCount === 1 ? "" : "s"
  }${valueSummary}`;
}

function buildGroupedRegistry(
  registry: NodeRegistryEntry[],
): Array<[string, NodeRegistryEntry[]]> {
  const groups = new Map<string, NodeRegistryEntry[]>();
  registry.forEach((entry) => {
    const category = entry.category ?? "Uncategorised";
    const list = groups.get(category) ?? [];
    list.push(entry);
    groups.set(category, list);
  });
  return Array.from(groups.entries()).map(([category, entries]) => [
    category,
    entries.sort((a, b) => a.name.localeCompare(b.name)),
  ]);
}

function renameKey<T extends Record<string, unknown>>(
  source: T,
  from: string,
  to: string,
): T {
  if (from === to) return source;
  const next: Record<string, unknown> = {};
  Object.entries(source).forEach(([key, value]) => {
    if (key === from) {
      next[to] = value;
    } else {
      next[key] = value;
    }
  });
  return next as T;
}

export function GraphEditor({
  value,
  onChange,
  registry,
  loading,
  error,
}: GraphEditorProps) {
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>(
    {},
  );
  const [shapeErrors, setShapeErrors] = useState<ShapeErrorMap>({});
  const [newNodeType, setNewNodeType] = useState<string>(
    () => registry[0]?.type_id ?? "",
  );

  const registryByType = useMemo(
    () => new Map(registry.map((entry) => [entry.type_id, entry] as const)),
    [registry],
  );

  const groupedRegistry = useMemo(
    () => buildGroupedRegistry(registry),
    [registry],
  );
  const nodeIdOptions = useMemo(
    () => value.nodes.map((node) => node.id),
    [value.nodes],
  );

  useEffect(() => {
    if (!registry.length) {
      setNewNodeType("custom");
      return;
    }
    if (!registryByType.has(newNodeType)) {
      setNewNodeType(registry[0]?.type_id ?? "custom");
    }
  }, [registry, registryByType, newNodeType]);

  const commit = (mutator: (state: GraphEditorState) => void) => {
    const next = cloneState(value);
    mutator(next);
    onChange(next);
  };

  const handleNodeChange = (
    index: number,
    updater: (node: GraphNodeState) => void,
  ) => {
    commit((draft) => {
      const node = draft.nodes[index];
      if (!node) return;
      updater(node);
    });
  };

  const handleNodeIdChange = (index: number, nextId: string) => {
    const trimmed = nextId.trim();
    if (!trimmed) return;
    const previousId = value.nodes[index]?.id;
    if (!previousId || previousId === trimmed) {
      handleNodeChange(index, (node) => {
        node.id = trimmed;
      });
      return;
    }
    commit((draft) => {
      const node = draft.nodes[index];
      if (!node) return;
      node.id = trimmed;
      draft.nodes.forEach((candidate, candidateIndex) => {
        if (candidateIndex === index) return;
        candidate.inputs = Object.entries(candidate.inputs ?? {}).reduce<
          Record<string, string>
        >((acc, [slot, target]) => {
          acc[slot] = target === previousId ? trimmed : target;
          return acc;
        }, {});
      });
    });
    setCollapsedNodes((prev) => {
      const next = { ...prev };
      if (previousId in next) {
        const value = next[previousId];
        delete next[previousId];
        next[trimmed] = value;
      }
      return next;
    });
    setShapeErrors((prev) => {
      const next = { ...prev };
      if (previousId && previousId in next) {
        const value = next[previousId];
        delete next[previousId];
        next[trimmed] = value;
      }
      return next;
    });
  };

  const handleNodeTypeChange = (index: number, typeId: string) => {
    const schema = registryByType.get(typeId);
    handleNodeChange(index, (node) => {
      node.type = typeId;
      node.category = schema?.category ?? node.category;
      if (schema?.name) {
        node.name = schema.name;
      }
      const blueprints = paramBlueprintsFromSchema(schema);
      node.params = ensureParamsMatchBlueprints(node.params, blueprints);
      const schemaInputs = inputsFromSchema(schema);
      node.inputs = ensureInputsMatchSchema(node.inputs, schemaInputs);
      if (typeId.toLowerCase() === "output") {
        node.outputValueKind = node.outputValueKind ?? "float";
      } else {
        node.outputValueKind = undefined;
      }
    });
  };

  const handleNodeNameChange = (index: number, nextName: string) => {
    handleNodeChange(index, (node) => {
      node.name = nextName;
    });
  };

  const handleNodeCategoryChange = (index: number, nextCategory: string) => {
    handleNodeChange(index, (node) => {
      node.category = nextCategory;
    });
  };

  const handleRemoveNode = (index: number) => {
    const nodeId = value.nodes[index]?.id;
    commit((draft) => {
      draft.nodes.splice(index, 1);
      draft.nodes.forEach((node) => {
        node.inputs = Object.entries(node.inputs ?? {}).reduce<
          Record<string, string>
        >((acc, [slot, target]) => {
          acc[slot] = target === nodeId ? "" : target;
          return acc;
        }, {});
      });
    });
    if (nodeId) {
      setCollapsedNodes((prev) => {
        const next = { ...prev };
        delete next[nodeId];
        return next;
      });
      setShapeErrors((prev) => {
        const next = { ...prev };
        delete next[nodeId];
        return next;
      });
    }
  };

  const handleParamValueChange = (
    nodeIndex: number,
    paramIndex: number,
    updater: (param: GraphParamState) => void,
  ) => {
    handleNodeChange(nodeIndex, (node) => {
      const param = node.params[paramIndex];
      if (!param) return;
      updater(param);
    });
  };

  const handleParamKindChange = (
    nodeIndex: number,
    paramIndex: number,
    kind: ValueKind,
  ) => {
    handleParamValueChange(nodeIndex, paramIndex, (param) => {
      param.type = kind;
      param.value = defaultValueForKind(kind);
    });
  };

  const handleInputTargetChange = (
    nodeIndex: number,
    slot: string,
    target: string,
  ) => {
    handleNodeChange(nodeIndex, (node) => {
      node.inputs = {
        ...node.inputs,
        [slot]: target,
      };
    });
  };

  const handleAddInputSlot = (index: number) => {
    handleNodeChange(index, (node) => {
      const existing = new Set(Object.keys(node.inputs ?? {}));
      let counter = existing.size + 1;
      let key = `input_${counter}`;
      while (existing.has(key)) {
        counter += 1;
        key = `input_${counter}`;
      }
      node.inputs = {
        ...node.inputs,
        [key]: "",
      };
    });
  };

  const handleRemoveInputSlot = (
    nodeIndex: number,
    slot: string,
    lockedSlots: Set<string>,
  ) => {
    if (lockedSlots.has(slot)) return;
    handleNodeChange(nodeIndex, (node) => {
      const next = { ...node.inputs };
      delete next[slot];
      node.inputs = next;
    });
  };

  const handleRenameInputSlot = (
    nodeIndex: number,
    slot: string,
    nextSlot: string,
    lockedSlots: Set<string>,
  ) => {
    const trimmed = nextSlot.trim();
    if (!trimmed || slot === trimmed || lockedSlots.has(slot)) return;
    handleNodeChange(nodeIndex, (node) => {
      node.inputs = renameKey(node.inputs, slot, trimmed);
    });
  };

  const handleShapeJsonChange = (
    nodeIndex: number,
    key: "input" | "output",
    raw: string,
  ) => {
    const nodeId = value.nodes[nodeIndex]?.id;
    const parseResult = (() => {
      if (!raw.trim()) return null;
      try {
        JSON.parse(raw);
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : "Invalid JSON";
      }
    })();
    if (nodeId) {
      setShapeErrors((prev) => ({
        ...prev,
        [nodeId]: {
          ...(prev[nodeId] ?? {}),
          [key]: parseResult,
        },
      }));
    }
    handleNodeChange(nodeIndex, (node) => {
      if (key === "input") {
        node.inputShapeJson = raw;
      } else {
        node.outputShapeJson = raw;
      }
    });
  };

  const handleSubscriptionsChange = (
    key: "inputs" | "outputs",
    index: number,
    valueText: string,
  ) => {
    commit((draft) => {
      draft[key][index] = valueText;
    });
  };

  const handleAddSubscription = (key: "inputs" | "outputs") => {
    commit((draft) => {
      draft[key].push("");
    });
  };

  const handleRemoveSubscription = (
    key: "inputs" | "outputs",
    index: number,
  ) => {
    commit((draft) => {
      draft[key].splice(index, 1);
    });
  };

  const handleAddNode = () => {
    const schema = registryByType.get(newNodeType) ?? registry[0];
    const existingIds = new Set(value.nodes.map((node) => node.id));
    const newNode = createNodeFromSchema(schema, existingIds, newNodeType);
    commit((draft) => {
      draft.nodes.push(newNode);
    });
    setCollapsedNodes((prev) => ({ ...prev, [newNode.id]: false }));
  };

  const datalistId = "graph-node-targets";

  return (
    <div className="panel graph-editor">
      <div className="panel-header">
        <h2>Graph Editor</h2>
        <span className="tag">nodes {value.nodes.length}</span>
      </div>
      <div className="panel-body">
        {loading ? (
          <div className="panel-status">Loading node registry…</div>
        ) : null}
        {error ? <div className="panel-status error">{error}</div> : null}

        <fieldset>
          <legend>Subscriptions</legend>
          <div className="graph-subs">
            <div>
              <strong>Inputs</strong>
              {value.inputs.map((subscription, index) => (
                <div key={`input-${index}`} className="graph-subs-row">
                  <input
                    className="text-input"
                    type="text"
                    value={subscription}
                    onChange={(event) =>
                      handleSubscriptionsChange(
                        "inputs",
                        index,
                        event.target.value,
                      )
                    }
                    placeholder="demo/graph/gain"
                  />
                  <button
                    type="button"
                    className="btn btn-muted"
                    onClick={() => handleRemoveSubscription("inputs", index)}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-muted"
                onClick={() => handleAddSubscription("inputs")}
              >
                Add input subscription
              </button>
            </div>
            <div>
              <strong>Outputs</strong>
              {value.outputs.map((subscription, index) => (
                <div key={`output-${index}`} className="graph-subs-row">
                  <input
                    className="text-input"
                    type="text"
                    value={subscription}
                    onChange={(event) =>
                      handleSubscriptionsChange(
                        "outputs",
                        index,
                        event.target.value,
                      )
                    }
                    placeholder="demo/graph/value"
                  />
                  <button
                    type="button"
                    className="btn btn-muted"
                    onClick={() => handleRemoveSubscription("outputs", index)}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-muted"
                onClick={() => handleAddSubscription("outputs")}
              >
                Add output subscription
              </button>
            </div>
          </div>
        </fieldset>

        <fieldset className="graph-actions">
          <legend>Add node</legend>
          <select
            className="select-input"
            value={newNodeType}
            onChange={(event) => setNewNodeType(event.target.value)}
          >
            {!registry.length ? <option value="custom">Custom</option> : null}
            {groupedRegistry.map(([category, entries]) => (
              <optgroup key={category} label={category}>
                {entries.map((entry) => (
                  <option key={entry.type_id} value={entry.type_id}>
                    {entry.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleAddNode}
          >
            Add node
          </button>
        </fieldset>

        <datalist id={datalistId}>
          {nodeIdOptions.map((nodeId) => (
            <option key={nodeId} value={nodeId} />
          ))}
        </datalist>

        {value.nodes.map((node, index) => {
          const schema = registryByType.get(node.type);
          const schemaSlots = new Set(inputsFromSchema(schema));
          const nodeId = node.id;
          const shapeError = shapeErrors[nodeId] ?? {};
          const isOpen = !(nodeId && collapsedNodes[nodeId]);
          const connectionCount = Object.values(node.inputs ?? {}).filter(
            Boolean,
          ).length;
          return (
            <details
              key={node.id}
              className="graph-node"
              open={isOpen}
              onToggle={(event) => {
                const details = event.currentTarget;
                setCollapsedNodes((prev) => ({
                  ...prev,
                  [nodeId]: !details.open,
                }));
              }}
            >
              <summary>
                <div>
                  <strong>{node.name || node.id}</strong>
                  <span className="track-summary">
                    {summarizeNode(node)} • {connectionCount} connection
                    {connectionCount === 1 ? "" : "s"}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-muted"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleRemoveNode(index);
                  }}
                >
                  Remove node
                </button>
              </summary>
              <div className="graph-node-body">
                <label>
                  <span>Node name</span>
                  <input
                    className="text-input"
                    type="text"
                    value={node.name}
                    onChange={(event) =>
                      handleNodeNameChange(index, event.target.value)
                    }
                  />
                </label>
                <label>
                  <span>Node ID</span>
                  <input
                    className="text-input"
                    type="text"
                    value={node.id}
                    onChange={(event) =>
                      handleNodeIdChange(index, event.target.value)
                    }
                  />
                </label>
                <label>
                  <span>Category</span>
                  <input
                    className="text-input"
                    type="text"
                    value={node.category}
                    onChange={(event) =>
                      handleNodeCategoryChange(index, event.target.value)
                    }
                  />
                </label>
                <label>
                  <span>Type</span>
                  <select
                    className="select-input"
                    value={node.type}
                    onChange={(event) =>
                      handleNodeTypeChange(index, event.target.value)
                    }
                  >
                    {!registry.length ? (
                      <option value={node.type}>{node.type}</option>
                    ) : null}
                    {groupedRegistry.map(([category, entries]) => (
                      <optgroup key={category} label={category}>
                        {entries.map((entry) => (
                          <option key={entry.type_id} value={entry.type_id}>
                            {entry.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>

                {node.type.toLowerCase() === "output" ? (
                  <fieldset className="graph-output-config">
                    <legend>Output configuration</legend>
                    <label>
                      <span>Value kind</span>
                      <select
                        className="select-input"
                        value={node.outputValueKind ?? "float"}
                        onChange={(event) =>
                          handleNodeChange(index, (nextNode) => {
                            nextNode.outputValueKind = event.target
                              .value as ValueKind;
                          })
                        }
                      >
                        {VALUE_KIND_OPTIONS.map((kind) => (
                          <option key={kind} value={kind}>
                            {kind}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="graph-output-hint">
                      This hint is used by the orchestrator panel to validate
                      how the graph output maps to the target animatable (e.g.
                      vec3 → X/Y/Z).
                    </p>
                  </fieldset>
                ) : null}

                {node.params.length ? (
                  <div className="graph-node-params">
                    <strong>Params</strong>
                    {node.params.map((param, paramIndex) => (
                      <div key={param.id} className="graph-param-row">
                        <label>
                          <span>Label</span>
                          <input
                            className="text-input"
                            type="text"
                            value={param.label}
                            onChange={(event) =>
                              handleParamValueChange(
                                index,
                                paramIndex,
                                (nextParam) => {
                                  nextParam.label = event.target.value;
                                },
                              )
                            }
                          />
                        </label>
                        <label>
                          <span>Param ID</span>
                          <input
                            className="text-input"
                            type="text"
                            value={param.id}
                            onChange={(event) =>
                              handleParamValueChange(
                                index,
                                paramIndex,
                                (nextParam) => {
                                  nextParam.id = event.target.value;
                                },
                              )
                            }
                          />
                        </label>
                        <label>
                          <span>Kind</span>
                          <select
                            className="select-input"
                            value={param.type}
                            onChange={(event) =>
                              handleParamKindChange(
                                index,
                                paramIndex,
                                event.target.value as ValueKind,
                              )
                            }
                          >
                            {VALUE_KIND_OPTIONS.map((kind) => (
                              <option key={kind} value={kind}>
                                {kind}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="value-field">
                          <span>Value</span>
                          <ValueField
                            kind={param.type}
                            value={param.value}
                            onChange={(newValue) =>
                              handleParamValueChange(
                                index,
                                paramIndex,
                                (nextParam) => {
                                  nextParam.value = newValue;
                                },
                              )
                            }
                            allowDynamicLength={param.type === "vector"}
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="graph-node-shapes">
                  <label>
                    <span>Input shape JSON</span>
                    <textarea
                      className={shapeError.input ? "input-error" : ""}
                      rows={4}
                      value={node.inputShapeJson ?? ""}
                      onChange={(event) =>
                        handleShapeJsonChange(
                          index,
                          "input",
                          event.target.value,
                        )
                      }
                      placeholder='{ "size": 3 }'
                    />
                    {shapeError.input ? (
                      <p className="form-error">{shapeError.input}</p>
                    ) : null}
                  </label>
                  <label>
                    <span>Output shape JSON</span>
                    <textarea
                      className={shapeError.output ? "input-error" : ""}
                      rows={4}
                      value={node.outputShapeJson ?? ""}
                      onChange={(event) =>
                        handleShapeJsonChange(
                          index,
                          "output",
                          event.target.value,
                        )
                      }
                      placeholder='{ "size": 3 }'
                    />
                    {shapeError.output ? (
                      <p className="form-error">{shapeError.output}</p>
                    ) : null}
                  </label>
                </div>

                <div className="graph-node-inputs">
                  <div className="graph-node-inputs-header">
                    <strong>Inputs</strong>
                    <button
                      type="button"
                      className="btn btn-muted"
                      onClick={() => handleAddInputSlot(index)}
                    >
                      Add input slot
                    </button>
                  </div>
                  {Object.entries(node.inputs).map(([slot, target]) => (
                    <div key={slot} className="graph-node-input-row">
                      <div className="graph-node-input-meta">
                        <input
                          className="text-input"
                          type="text"
                          value={slot}
                          onChange={(event) =>
                            handleRenameInputSlot(
                              index,
                              slot,
                              event.target.value,
                              schemaSlots,
                            )
                          }
                          disabled={schemaSlots.has(slot)}
                        />
                        {!schemaSlots.has(slot) ? (
                          <button
                            type="button"
                            className="btn btn-muted"
                            onClick={() =>
                              handleRemoveInputSlot(index, slot, schemaSlots)
                            }
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                      <input
                        className="text-input"
                        type="text"
                        list={datalistId}
                        value={target}
                        onChange={(event) =>
                          handleInputTargetChange(
                            index,
                            slot,
                            event.target.value,
                          )
                        }
                        placeholder="node-id"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
