import { useMemo } from "react";
import { SELF_BINDING_ID } from "@vizij/utils";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import { Panel, Chip, ListRow } from "../ui";
import "./standard-input-coverage.css";

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
  const hiddenIds = useBindingAuthoring((state) => state.hiddenDriverIds);
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
      <Panel className="coverage-panel">
        <h2 className="coverage-panel__title">Standard Input Coverage</h2>
        <p className="coverage-panel__empty">
          Load a rig and generate standard inputs to see coverage.
        </p>
      </Panel>
    );
  }

  return (
    <Panel className="coverage-panel">
      <div className="coverage-panel__header">
        <h2 className="coverage-panel__title">Standard Input Coverage</h2>
        {standardInputSchema ? (
          <span className="coverage-panel__schema">
            {standardInputSchema.id} · {standardInputSchema.version}
          </span>
        ) : null}
        <div className="coverage-panel__chips">
          <Chip tone="success">Mapped {summary.mapped}</Chip>
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
        <div className="coverage-panel__list">
          <p className="coverage-panel__subtitle">
            Inputs needing mappings (top {summary.missing.length}):
          </p>
          <ul>
            {summary.missing.map((item) => (
              <ListRow key={item.id} title={item.label} description={item.id} />
            ))}
          </ul>
        </div>
      ) : (
        <p className="coverage-panel__empty">
          All inputs are mapped or disabled.
        </p>
      )}
    </Panel>
  );
}
