import type { SlotDiagnosticsNode } from "./SlotDiagnosticsContext";

export type BindingChainSlot = {
  id: string;
  aliasLabel: string;
  sourceLabel: string;
  targetLabel: string;
  upstreamNodes: SlotDiagnosticsNode[];
  downstreamNodes: SlotDiagnosticsNode[];
  expressionNode?: SlotDiagnosticsNode;
};

interface BindingChainPanelProps {
  title?: string;
  slots: BindingChainSlot[];
  upstreamLabel?: string;
  downstreamLabel?: string;
  variant?: "default" | "dense";
}

export function BindingChainPanel({
  title = "Signal path",
  slots,
  upstreamLabel = "Input chain",
  downstreamLabel = "Output chain",
  variant = "default",
}: BindingChainPanelProps) {
  if (!slots.length) {
    return null;
  }
  return (
    <div
      className="feature-tree__property-pipeline feature-panel__chain-panel"
      data-variant={variant}
    >
      {title && <h4 className="feature-tree__section-title">{title}</h4>}
      <ul className="feature-tree__pipeline-list">
        {slots.map((slot) => (
          <li key={slot.id} className="feature-tree__pipeline-item">
            <div className="feature-tree__pipeline-row">
              <span className="feature-tree__pipeline-alias">
                {slot.aliasLabel}
              </span>
              <span className="feature-tree__pipeline-arrow">→</span>
              <span className="feature-tree__pipeline-input">
                {slot.sourceLabel}
              </span>
            </div>
            {slot.upstreamNodes.length > 0 && (
              <div className="feature-tree__pipeline-track">
                <span className="feature-tree__pipeline-track-label">
                  {upstreamLabel}
                </span>
                <div className="feature-tree__pipeline-track-chips">
                  <span className="feature-tree__pipeline-chip feature-tree__pipeline-chip--input">
                    {slot.sourceLabel}
                  </span>
                  {slot.upstreamNodes.map((node) => (
                    <span
                      key={`${slot.id}-up-${node.id}`}
                      className="feature-tree__pipeline-chip"
                      title={`${node.label} · ${node.type}`}
                    >
                      {node.label}
                    </span>
                  ))}
                  <span className="feature-tree__pipeline-chip feature-tree__pipeline-chip--alias">
                    {slot.aliasLabel}
                  </span>
                </div>
              </div>
            )}
            {(slot.expressionNode || slot.downstreamNodes.length > 0) && (
              <div className="feature-tree__pipeline-track">
                <span className="feature-tree__pipeline-track-label">
                  {downstreamLabel}
                </span>
                <div className="feature-tree__pipeline-track-chips">
                  {slot.expressionNode && (
                    <span
                      className="feature-tree__pipeline-chip feature-tree__pipeline-chip--expression"
                      title={`${slot.expressionNode.label} · ${slot.expressionNode.type}`}
                    >
                      {slot.expressionNode.label}
                    </span>
                  )}
                  {slot.downstreamNodes.map((node) => (
                    <span
                      key={`${slot.id}-down-${node.id}`}
                      className="feature-tree__pipeline-chip"
                      title={`${node.label} · ${node.type}`}
                    >
                      {node.label}
                    </span>
                  ))}
                  <span className="feature-tree__pipeline-chip feature-tree__pipeline-chip--output">
                    {slot.targetLabel}
                  </span>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
