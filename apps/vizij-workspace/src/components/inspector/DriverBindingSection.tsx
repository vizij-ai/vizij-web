import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import type { StandardRigInput } from "@vizij/utils";
import {
  type AnimatableBinding,
  type BindingValueType,
} from "@vizij/node-graph-authoring";
import type { SceneObjectNode } from "../../scene/sceneGraph";
import {
  useBindingAuthoring,
  useGraphRuntime,
} from "../../state/RigControllerProvider";
import { BindingEditor } from "../binding";
import { promptDialog, alertDialog } from "../../utils/dialogs";
import { Button, Card, CardHeader, CardBody, Input, Select } from "../ui";
import { collectDriversForNode } from "./DriverPanel";
import { cn } from "../../utils/cn";

interface DriverBindingSectionProps {
  node: SceneObjectNode;
}

export function DriverBindingSection({ node }: DriverBindingSectionProps) {
  const standardInputs = useBindingAuthoring((state) => state.standardInputs);
  const bindings = useBindingAuthoring((state) => state.bindings);
  const inputBindings = useBindingAuthoring((state) => state.inputBindings);
  const bindingIssues = useBindingAuthoring((state) => state.bindingIssues);
  const featureFlags = useBindingAuthoring((state) => state.featureFlags);
  const inputValues = useBindingAuthoring((state) => state.inputValues);
  const handleInputValueChange = useBindingAuthoring(
    (state) => state.handleInputValueChange,
  );
  const handleCreateParentDriverBinding = useBindingAuthoring(
    (state) => state.handleCreateParentDriverBinding,
  );
  const handleParentBindingInputChange = useBindingAuthoring(
    (state) => state.handleParentBindingInputChange,
  );
  const handleParentAddBindingSlot = useBindingAuthoring(
    (state) => state.handleParentAddBindingSlot,
  );
  const handleParentRemoveBindingSlot = useBindingAuthoring(
    (state) => state.handleParentRemoveBindingSlot,
  );
  const handleParentBindingExpressionChange = useBindingAuthoring(
    (state) => state.handleParentBindingExpressionChange,
  );
  const handleParentBindingSlotAliasChange = useBindingAuthoring(
    (state) => state.handleParentBindingSlotAliasChange,
  );
  const handleParentBindingSlotValueTypeChange = useBindingAuthoring(
    (state) => state.handleParentBindingSlotValueTypeChange,
  );
  const handleParentResetBinding = useBindingAuthoring(
    (state) => state.handleParentResetBinding,
  );
  const handleCreateCustomStandardInput = useBindingAuthoring(
    (state) => state.handleCreateCustomStandardInput,
  );

  const faceId = useGraphRuntime((state) => state.faceId);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const standardInputLookup = useMemo(
    () => new Map(standardInputs.map((input) => [input.id, input])),
    [standardInputs],
  );

  const activeDrivers = useMemo<StandardRigInput[]>(
    () => collectDriversForNode(node, bindings, standardInputs),
    [node, bindings, standardInputs],
  );
  const existingBindingDrivers = useMemo<StandardRigInput[]>(
    () =>
      activeDrivers.filter((driver: StandardRigInput) =>
        Boolean(inputBindings[driver.id]),
      ),
    [activeDrivers, inputBindings],
  );
  const unboundDrivers = useMemo<StandardRigInput[]>(
    () =>
      activeDrivers.filter(
        (driver: StandardRigInput) => !inputBindings[driver.id],
      ),
    [activeDrivers, inputBindings],
  );

  const [boundDriverId, setBoundDriverId] = useState<string>(
    () => unboundDrivers[0]?.id ?? activeDrivers[0]?.id ?? "",
  );
  const [upstreamDriverId, setUpstreamDriverId] = useState<string>(
    () => standardInputs[0]?.id ?? "",
  );

  useEffect(() => {
    if (
      !activeDrivers.some(
        (driver: StandardRigInput) => driver.id === boundDriverId,
      )
    ) {
      const fallback = (unboundDrivers[0] ?? activeDrivers[0])?.id ?? "";
      setBoundDriverId(fallback);
    }
  }, [activeDrivers, boundDriverId, unboundDrivers]);

  useEffect(() => {
    if (!standardInputs.some((input) => input.id === upstreamDriverId)) {
      setUpstreamDriverId(standardInputs[0]?.id ?? "");
    }
  }, [standardInputs, upstreamDriverId]);

  useEffect(() => {
    setExpandedIds((previous) => {
      if (previous.size === 0) {
        return previous;
      }
      const allowed = new Set(
        existingBindingDrivers.map((driver) => driver.id),
      );
      let changed = false;
      const next = new Set<string>();
      previous.forEach((id) => {
        if (allowed.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, [existingBindingDrivers]);

  const handleRequestCreateStandardInput = useCallback(
    (suggestedPath?: string): StandardRigInput | null => {
      const response = promptDialog(
        "Enter the rig path for the new driver (e.g., /eyes/blink)",
        suggestedPath ?? "/",
      );
      if (response === null) {
        return null;
      }
      const trimmed = response.trim();
      if (!trimmed) {
        alertDialog("Path cannot be empty.");
        return null;
      }
      return handleCreateCustomStandardInput(trimmed);
    },
    [handleCreateCustomStandardInput],
  );

  const handleCreateBinding = useCallback(() => {
    if (!boundDriverId || !upstreamDriverId) {
      return;
    }
    handleCreateParentDriverBinding(boundDriverId, upstreamDriverId);
    setExpandedIds((previous) => {
      const next = new Set(previous);
      next.add(boundDriverId);
      return next;
    });
  }, [boundDriverId, handleCreateParentDriverBinding, upstreamDriverId]);

  const handleBoundDriverChange = useCallback(
    (value: string) => {
      setBoundDriverId(value);
    },
    [],
  );

  const handleUpstreamDriverChange = useCallback(
    (value: string) => {
      setUpstreamDriverId(value);
    },
    [],
  );

  if (activeDrivers.length === 0) {
    return (
      <section className="flex flex-col gap-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 px-1">
          Driver bindings
        </h3>
        <p className="text-[11px] text-slate-500 italic px-1">
          Select an object with animatable properties driven by standard inputs
          to author upstream driver bindings.
        </p>
      </section>
    );
  }

  const canCreateBinding = Boolean(boundDriverId && upstreamDriverId);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 px-1">
          Driver bindings
        </h3>
        <p className="text-[11px] text-slate-500 px-1 leading-relaxed">
          Bind any upstream driver to the drivers controlling this object and
          author the expression using the familiar editor.
        </p>
      </div>

      <div className="flex flex-col gap-3 p-4 rounded-xl bg-slate-800/20 border border-slate-800/40 shadow-inner">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-0.5">
              Bound driver
            </label>
            <Select
              value={boundDriverId}
              onChange={handleBoundDriverChange}
              disabled={activeDrivers.length === 0}
              options={activeDrivers.map((driver) => ({
                value: driver.id,
                label: driver.path,
              }))}
              size="sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-0.5">
              Upstream driver
            </label>
            <Select
              value={upstreamDriverId}
              onChange={handleUpstreamDriverChange}
              disabled={standardInputs.length === 0}
              options={standardInputs.map((input) => ({
                value: input.id,
                label: input.path,
              }))}
              size="sm"
            />
          </div>
        </div>
        <Button
          variant="primary"
          className="w-full mt-1"
          onClick={handleCreateBinding}
          disabled={!canCreateBinding}
        >
          Create Binding
        </Button>
      </div>

      {existingBindingDrivers.length === 0 ? (
        <p className="text-[11px] text-slate-500 italic text-center py-6 bg-slate-800/10 rounded-lg border border-dashed border-slate-800/40 mx-1">
          No driver bindings yet. Create one to start editing expressions.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {existingBindingDrivers.map((driver) => (
            <DriverBindingCard
              key={driver.id}
              driver={driver}
              binding={inputBindings[driver.id]!}
              standardInputs={standardInputs}
              standardInputLookup={standardInputLookup}
              featureFlags={featureFlags}
              faceId={faceId}
              issues={bindingIssues.get(driver.id)}
              inputValues={inputValues}
              onInputValueChange={handleInputValueChange}
              onBindingInputChange={handleParentBindingInputChange}
              onAddBindingSlot={handleParentAddBindingSlot}
              onRemoveBindingSlot={handleParentRemoveBindingSlot}
              onBindingExpressionChange={handleParentBindingExpressionChange}
              onBindingSlotAliasChange={handleParentBindingSlotAliasChange}
              onBindingSlotValueTypeChange={
                handleParentBindingSlotValueTypeChange
              }
              onResetBinding={handleParentResetBinding}
              onRequestCreateStandardInput={handleRequestCreateStandardInput}
              expanded={expandedIds.has(driver.id)}
              onToggleExpanded={(expanded) => {
                setExpandedIds((previous) => {
                  const next = new Set(previous);
                  if (expanded) {
                    next.add(driver.id);
                  } else {
                    next.delete(driver.id);
                  }
                  return next;
                });
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface DriverBindingCardProps {
  driver: StandardRigInput;
  binding: AnimatableBinding;
  standardInputs: StandardRigInput[];
  standardInputLookup: Map<string, StandardRigInput>;
  featureFlags: {
    vectorAuthoringBeta?: boolean;
    conditionalAuthoringBeta?: boolean;
  };
  faceId: string;
  issues?: readonly string[];
  inputValues: Record<string, number>;
  onInputValueChange: (id: string, value: number) => void;
  onBindingInputChange: (
    targetId: string,
    inputId: string | null,
    slotId?: string,
  ) => void;
  onAddBindingSlot: (targetId: string) => void;
  onRemoveBindingSlot: (targetId: string, slotId: string) => void;
  onBindingExpressionChange: (targetId: string, expression: string) => void;
  onBindingSlotAliasChange: (
    targetId: string,
    slotId: string,
    alias: string,
  ) => void;
  onBindingSlotValueTypeChange: (
    targetId: string,
    slotId: string,
    valueType: BindingValueType,
  ) => void;
  onResetBinding: (targetId: string) => void;
  onRequestCreateStandardInput: (
    suggestedPath?: string,
  ) => StandardRigInput | null;
  expanded: boolean;
  onToggleExpanded: (expanded: boolean) => void;
}

function DriverBindingCard({
  driver,
  binding,
  standardInputs,
  standardInputLookup,
  featureFlags,
  faceId,
  issues,
  inputValues,
  onInputValueChange,
  onBindingInputChange,
  onAddBindingSlot,
  onRemoveBindingSlot,
  onBindingExpressionChange,
  onBindingSlotAliasChange,
  onBindingSlotValueTypeChange,
  onResetBinding,
  onRequestCreateStandardInput,
  expanded,
  onToggleExpanded,
}: DriverBindingCardProps) {
  const displayName =
    driver.label && driver.label.trim().length > 0
      ? driver.label.trim()
      : driver.path;

  return (
    <Card className="border-slate-800/60 bg-slate-950/20 shadow-sm overflow-hidden border-l-2 border-l-blue-500/30">
      <CardHeader className="flex flex-row items-center justify-between px-4 py-3 bg-slate-800/20 border-b border-slate-800/40">
        <div className="flex flex-col gap-0.5">
          <strong className="text-[11px] font-bold text-slate-200 tracking-tight">
            {displayName}
          </strong>
          <code className="text-[9px] text-blue-400 bg-blue-900/10 px-1 py-0.5 rounded w-fit">
            {driver.path}
          </code>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-[10px] text-slate-400 hover:text-slate-100"
          onClick={() => onToggleExpanded(!expanded)}
        >
          {expanded ? "Hide Binding" : "Edit Binding"}
        </Button>
      </CardHeader>

      {expanded ? (
        <CardBody>
          <BindingEditor
            binding={binding}
            targetId={driver.id}
            label={`${displayName} upstream binding`}
            standardInputs={standardInputs}
            standardInputLookup={standardInputLookup}
            faceId={faceId}
            issues={issues}
            onBindingInputChange={onBindingInputChange}
            onAddBindingSlot={onAddBindingSlot}
            onRemoveBindingSlot={onRemoveBindingSlot}
            onBindingExpressionChange={onBindingExpressionChange}
            onBindingSlotAliasChange={onBindingSlotAliasChange}
            onBindingSlotValueTypeChange={onBindingSlotValueTypeChange}
            onResetBinding={onResetBinding}
            onRequestCreateStandardInput={onRequestCreateStandardInput}
            expandable={false}
            featureFlags={{
              vectorAuthoringBeta: featureFlags.vectorAuthoringBeta,
              conditionalAuthoringBeta: featureFlags.conditionalAuthoringBeta,
            }}
            currentValues={inputValues}
            onInputValueChange={onInputValueChange}
          />
        </CardBody>
      ) : null}
    </Card>
  );
}
