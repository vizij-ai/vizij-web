import React, { useMemo } from "react";
import { useRegistry } from "../state/RegistryContext";

const onDragStart = (event: React.DragEvent, nodeType: string) => {
  event.dataTransfer.setData("application/reactflow", nodeType);
  event.dataTransfer.effectAllowed = "move";
};

const NodeCategory = ({
  title,
  types,
}: {
  title: string;
  types: Array<{ id: string; label: string }>;
}) => {
  const [isOpen, setIsOpen] = React.useState(true);

  return (
    <div style={{ marginBottom: 20 }}>
      <h3
        style={{
          marginTop: 0,
          marginBottom: 10,
          borderBottom: "1px solid #444",
          paddingBottom: 5,
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        {title} {isOpen ? "▾" : "▸"}
      </h3>
      {isOpen &&
        types.map((type) => (
          <div
            key={type.id}
            onDragStart={(event) => onDragStart(event, type.id)}
            draggable
            style={{
              padding: "10px",
              border: "1px solid #555",
              borderRadius: "4px",
              marginBottom: "10px",
              cursor: "grab",
              textAlign: "center",
              background: "#2a2a2a",
            }}
          >
            {type.label}
          </div>
        ))}
    </div>
  );
};

const NodePalette = () => {
  const { registry, loading, error } = useRegistry();

  const categories = useMemo(() => {
    if (registry) {
      const grouped = new Map<string, Array<{ id: string; label: string }>>();
      for (const node of registry.nodes) {
        const key = node.category || "Uncategorized";
        const bucket = grouped.get(key) ?? [];
        bucket.push({ id: node.type_id.toLowerCase(), label: node.name });
        grouped.set(key, bucket);
      }
      return Array.from(grouped.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([title, entries]) => ({
          title,
          types: entries.sort((a, b) => a.label.localeCompare(b.label)),
        }));
    }

    return [
      {
        title: "Sources",
        types: [
          { id: "constant", label: "Constant" },
          { id: "slider", label: "Slider" },
          { id: "multislider", label: "MultiSlider" },
          { id: "time", label: "Time" },
        ],
      },
      {
        title: "Math",
        types: [
          { id: "add", label: "Add" },
          { id: "subtract", label: "Subtract" },
          { id: "multiply", label: "Multiply" },
          { id: "divide", label: "Divide" },
          { id: "power", label: "Power" },
          { id: "log", label: "Log" },
          { id: "sin", label: "Sin" },
          { id: "cos", label: "Cos" },
          { id: "tan", label: "Tan" },
          { id: "oscillator", label: "Oscillator" },
        ],
      },
      {
        title: "Transitions",
        types: [
          { id: "spring", label: "Spring" },
          { id: "damp", label: "Damp" },
          { id: "slew", label: "Slew" },
        ],
      },
      {
        title: "Logic",
        types: [
          { id: "and", label: "And" },
          { id: "or", label: "Or" },
          { id: "not", label: "Not" },
          { id: "xor", label: "Xor" },
        ],
      },
      {
        title: "Conditional",
        types: [
          { id: "greaterthan", label: "Greater Than" },
          { id: "lessthan", label: "Less Than" },
          { id: "equal", label: "Equal" },
          { id: "notequal", label: "Not Equal" },
          { id: "if", label: "If" },
        ],
      },
      {
        title: "Vector",
        types: [
          { id: "join", label: "Join" },
          { id: "split", label: "Split" },
          { id: "vectorconstant", label: "Vector Constant" },
          { id: "vectoradd", label: "Vector Add" },
          { id: "vectorsubtract", label: "Vector Subtract" },
          { id: "vectormultiply", label: "Vector Multiply" },
          { id: "vectorscale", label: "Vector Scale" },
          { id: "vectornormalize", label: "Vector Normalize" },
          { id: "vectordot", label: "Vector Dot" },
          { id: "vectorlength", label: "Vector Length" },
          { id: "vectorindex", label: "Vector Index" },
          { id: "vectormin", label: "Vector Min" },
          { id: "vectormax", label: "Vector Max" },
          { id: "vectormean", label: "Vector Mean" },
          { id: "vectormedian", label: "Vector Median" },
          { id: "vectormode", label: "Vector Mode" },
          { id: "vec3cross", label: "Vec3 Cross" },
          { id: "inversekinematics", label: "Inverse Kinematics" },
        ],
      },
      {
        title: "Output",
        types: [{ id: "output", label: "Output" }],
      },
    ];
  }, [registry]);

  return (
    <aside
      style={{ borderRight: "1px solid #444", padding: 15, overflowY: "auto" }}
    >
      <h2 style={{ marginTop: 0 }}>Nodes</h2>
      {loading ? (
        <div style={{ fontSize: 12, color: "#9aa0a6" }}>Loading schema…</div>
      ) : null}
      {error ? (
        <div style={{ fontSize: 12, color: "#ff6b6b" }}>
          Failed to load schema: {error}
        </div>
      ) : null}
      {categories.map((cat) => (
        <NodeCategory key={cat.title} title={cat.title} types={cat.types} />
      ))}
    </aside>
  );
};

export default NodePalette;
