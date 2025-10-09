import { Fragment, useCallback, useMemo, useState } from "react";
import { useVizijStore, useVizijStoreSubscription } from "@vizij/render";
import type { VizijActions, VizijData } from "@vizij/render";
import { getNamespace, getId } from "@vizij/utils";
import type { RawValue } from "@vizij/utils";

function formatValue(value: RawValue | undefined) {
  if (value === undefined || value === null) {
    return "–";
  }
  if (typeof value === "number") {
    return value.toFixed(3);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

export function ActiveValuesPanel({ namespace }: { namespace: string }) {
  const [rawEntries, setRawEntries] = useState<
    Array<[string, RawValue | undefined]>
  >([]);

  const selector = useCallback(
    (state: VizijData & VizijActions) => Array.from(state.values.entries()),
    [],
  );

  useVizijStoreSubscription(selector, setRawEntries);

  const animatables = useVizijStore((state) => state.animatables);

  const entries = useMemo(() => {
    const list: Array<{
      animId: string;
      label: string;
      value: RawValue | undefined;
    }> = [];
    rawEntries.forEach(([key, value]) => {
      if (getNamespace(key) !== namespace) {
        return;
      }
      const animId = getId(key);
      const animInfo = animatables[animId];
      const label =
        (typeof animInfo?.name === "string" && animInfo.name.trim().length > 0
          ? animInfo.name
          : animId) ?? animId;
      list.push({ animId, label, value });
    });
    return list;
  }, [rawEntries, namespace, animatables]);

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Active Values</h2>
        <span className="tag">{entries.length}</span>
      </div>
      <div className="panel-body">
        {entries.length === 0 ? (
          <div className="panel-status">
            No values applied in this namespace.
          </div>
        ) : (
          <ul className="value-list">
            {entries.map(({ animId, label, value }) => (
              <Fragment key={animId}>
                <li>
                  <span className="value-id" title={animId}>
                    {label}
                  </span>
                  <span className="value-data">{formatValue(value)}</span>
                </li>
              </Fragment>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
