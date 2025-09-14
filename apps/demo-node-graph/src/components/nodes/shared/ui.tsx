import React from "react";
import { Handle, Position } from "reactflow";
import { handleStyle } from "./constants";

export const NodeChrome = React.memo(function NodeChrome({
  title,
  width = 170,
  children,
}: {
  title: React.ReactNode;
  width?: number;
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: "15px 20px",
        background: "#2a2a2a",
        borderRadius: 8,
        border: "1px solid #555",
        width,
        position: "relative",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <strong>{title}</strong>
      </div>
      {children}
    </div>
  );
});

export const ValueDisplay = React.memo(function ValueDisplay({
  children,
}: {
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        fontSize: "1.5em",
        fontWeight: "bold",
        margin: "5px 0",
        textAlign: "center",
      }}
    >
      {children}
    </div>
  );
});

export const TargetPort = React.memo(function TargetPort({
  id,
  top,
  label,
  labelLeft = -40,
}: {
  id: string;
  top: number;
  label?: React.ReactNode;
  labelLeft?: number;
}) {
  return (
    <>
      <Handle
        type="target"
        id={id}
        position={Position.Left}
        style={{ ...handleStyle, top }}
      />
      {label !== undefined && (
        <div
          style={{
            position: "absolute",
            top: top - 5,
            left: labelLeft,
            fontSize: "0.8em",
            color: "#aaa",
          }}
        >
          {label}
        </div>
      )}
    </>
  );
});

export const SourcePort = React.memo(function SourcePort() {
  return (
    <Handle
      type="source"
      position={Position.Right}
      style={{ ...handleStyle }}
    />
  );
});
