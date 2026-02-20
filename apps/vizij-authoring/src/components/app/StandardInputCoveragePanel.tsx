import { useMemo } from "react";
import { SELF_BINDING_ID } from "@vizij/utils";
import {
  useBindingAuthoring,
  useRigUi,
} from "../../state/RigControllerProvider";
import { Panel, Chip, ListRow } from "../ui";

function isMapped(binding: any): boolean {
  if (!binding) return false;
  const hasParent =
    binding.inputId && binding.inputId !== SELF_BINDING_ID ? true : false;
  const hasSlots =
    Array.isArray(binding.slots) &&
    binding.slots.some(
      (slot: any) => slot?.inputId && slot.inputId !== SELF_BINDING_ID,
    );
  return Boolean(hasParent || hasSlots);
}

interface StandardInputCoveragePanelProps {
  showMissingList?: boolean;
}

export function StandardInputCoveragePanel({
  showMissingList = true,
}: StandardInputCoveragePanelProps) {
  const managed = useBindingAuthoring((state) => state.managedStandardInputs);
  const inputBindings = useBindingAuthoring((state) => state.inputBindings);
  const hiddenIds = useRigUi((state) => state.hiddenDriverIds);
  const standardInputSchema = useBindingAuthoring(
    (state) => state.standardInputSchema,
  );

  const summary = useMemo(() => {
    const hiddenSet = hiddenIds ?? new Set<string>();
    let mapped = 0;
    let disabled = 0;
    let hidden = 0;
    const missing: { id: string; label: string }[] = [];

    managed.forEach((entry) => {
      const id = entry.input.id;
      const binding = inputBindings[id];
      const mappedFlag = isMapped(binding);
      if (mappedFlag) mapped += 1;
      if (entry.disabled) disabled += 1;
      if (hiddenSet.has(id)) hidden += 1;
      if (!mappedFlag && !entry.disabled) {
        missing.push({ id, label: entry.input.label ?? id });
      }
    });

    return {
      total: managed.length,
      mapped,
      unmapped: managed.length - mapped,
      disabled,
      hidden,
      missing: missing.slice(0, 5),
    };
  }, [hiddenIds, inputBindings, managed]);

  if (summary.total === 0) {
    return (
      <Panel
        title="Standard Input Coverage"
        description="Track which standard inputs are currently mapped to scene properties."
        className="flex flex-col gap-3"
      >
        <p className="text-xs text-slate-500 italic bg-slate-900/20 p-4 rounded-lg border border-dashed border-white/5">
          Load a rig and generate standard inputs to see coverage.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Standard Input Coverage"
      description="Track which standard inputs are currently mapped to scene properties."
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <div /> {/* Spacer since title is in Panel header now */}
          {standardInputSchema ? (
            <span className="text-[10px] font-bold text-slate-500 px-1.5 py-0.5 bg-slate-950/40 rounded border border-white/5 opacity-80">
              {standardInputSchema.id} · {standardInputSchema.version}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip tone="info">Mapped {summary.mapped}</Chip>
          <Chip tone="muted">Unmapped {summary.unmapped}</Chip>
          {summary.disabled > 0 ? (
            <Chip tone="warning">Disabled {summary.disabled}</Chip>
          ) : null}
          {summary.hidden > 0 ? (
            <Chip tone="info">Hidden {summary.hidden}</Chip>
          ) : null}
        </div>
      </div>
      {showMissingList && summary.missing.length > 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">
            Inputs needing mappings (top {summary.missing.length}):
          </p>
          <ul className="space-y-2">
            {summary.missing.map((item) => (
              <ListRow key={item.id} title={item.label} description={item.id} />
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-center py-6 text-slate-500 text-xs italic bg-slate-900/20 rounded-lg border border-dashed border-white/5">
          All inputs are mapped or disabled.
        </p>
      )}
    </Panel>
  );
}
