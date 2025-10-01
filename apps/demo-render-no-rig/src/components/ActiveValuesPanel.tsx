import { Fragment, useCallback, useMemo, useState } from "react";
import { useVizijStoreSubscription } from "@vizij/render";
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

  const entries = useMemo(() => {
    const list: Array<{ animId: string; value: RawValue | undefined }> = [];
    rawEntries.forEach(([key, value]) => {
      if (getNamespace(key) !== namespace) {
        return;
      }
      list.push({ animId: getId(key), value });
    });
    return list;
  }, [rawEntries, namespace]);

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
            {entries.map(({ animId, value }) => (
              <Fragment key={animId}>
                <li>
                  <span className="value-id">{animId}</span>
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
