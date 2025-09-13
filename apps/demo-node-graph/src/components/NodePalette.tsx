import React, { useEffect, useState } from 'react';
import { loadRegistry } from '../schema/registry';

const onDragStart = (event: React.DragEvent, nodeType: string) => {
  event.dataTransfer.setData('application/reactflow', nodeType);
  event.dataTransfer.effectAllowed = 'move';
};

const NodeCategory = ({
  title,
  types,
  nameForType,
}: {
  title: string;
  types: string[];
  nameForType: (typeId: string) => string;
}) => {
  const [isOpen, setIsOpen] = React.useState(true);

  return (
    <div style={{ marginBottom: 20 }}>
      <h3 
        style={{ marginTop: 0, marginBottom: 10, borderBottom: '1px solid #444', paddingBottom: 5, cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setIsOpen(!isOpen)}
      >
        {title} {isOpen ? '▾' : '▸'}
      </h3>
      {isOpen &&
        types.map((type) => {
          const lower = type.toLowerCase();
          const label = nameForType(lower);
          return (
            <div
              key={type}
              onDragStart={(event) => onDragStart(event, type)}
              draggable
              style={{
                padding: '10px',
                border: '1px solid #555',
                borderRadius: '4px',
                marginBottom: '10px',
                cursor: 'grab',
                textAlign: 'center',
                background: '#2a2a2a'
              }}
            >
              {label}
            </div>
          );
        })}
    </div>
  );
};

const NodePalette = () => {
  // Schema-driven labels (optional enhancement)
  const [nameMap, setNameMap] = useState<Record<string, string>>({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const reg = await loadRegistry();
        if (!mounted) return;
        const map: Record<string, string> = {};
        for (const n of reg.nodes) {
          map[n.type_id] = n.name;
        }
        setNameMap(map);
      } catch (e) {
        console.warn('Node schema registry not available yet; falling back to type names.', e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const nameForType = (typeId: string) => nameMap[typeId] ?? typeId;
  const sourceNodes = ['Constant', 'Slider', 'MultiSlider', 'Time'];
  const mathNodes = ['Add', 'Subtract', 'Multiply', 'Divide', 'Power', 'Log', 'Sin', 'Cos', 'Tan', 'Oscillator'];
  const logicNodes = ['And', 'Or', 'Not', 'Xor'];
  const conditionalNodes = ['GreaterThan', 'LessThan', 'Equal', 'NotEqual', 'If'];
  const rangeNodes = ['Clamp', 'Remap'];
  const vectorNodes = [
    // Vector-first nodes
    'Join',
    'Split',
    'VectorConstant',
    'VectorAdd',
    'VectorSubtract',
    'VectorMultiply',
    'VectorScale',
    'VectorNormalize',
    'VectorDot',
    'VectorLength',
    'VectorIndex',
    // Reducers
    'VectorMin',
    'VectorMax',
    'VectorMean',
    'VectorMedian',
    'VectorMode',
    // 3D-specific kept
    'Vec3Cross',
    'InverseKinematics',
  ];
  const outputNodes = ['Output'];

  return (
    <aside style={{ borderRight: '1px solid #444', padding: 15, overflowY: 'auto' }}>
      <h2 style={{ marginTop: 0 }}>Nodes</h2>
      <NodeCategory title="Sources" types={sourceNodes} nameForType={nameForType} />
      <NodeCategory title="Math" types={mathNodes} nameForType={nameForType} />
      <NodeCategory title="Logic" types={logicNodes} nameForType={nameForType} />
      <NodeCategory title="Conditional" types={conditionalNodes} nameForType={nameForType} />
      <NodeCategory title="Ranges" types={rangeNodes} nameForType={nameForType} />
      <NodeCategory title="Vector" types={vectorNodes} nameForType={nameForType} />
      <NodeCategory title="Output" types={outputNodes} nameForType={nameForType} />
    </aside>
  );
};

export default NodePalette;
