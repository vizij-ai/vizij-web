import React from 'react';

const onDragStart = (event: React.DragEvent, nodeType: string) => {
  event.dataTransfer.setData('application/reactflow', nodeType);
  event.dataTransfer.effectAllowed = 'move';
};

const NodeCategory = ({ title, types }: { title: string, types: string[] }) => {
  const [isOpen, setIsOpen] = React.useState(true);

  return (
    <div style={{ marginBottom: 20 }}>
      <h3 
        style={{ marginTop: 0, marginBottom: 10, borderBottom: '1px solid #444', paddingBottom: 5, cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setIsOpen(!isOpen)}
      >
        {title} {isOpen ? '▾' : '▸'}
      </h3>
      {isOpen && types.map((type) => (
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
          {type}
        </div>
      ))}
    </div>
  );
};

const NodePalette = () => {
  const sourceNodes = ['Constant', 'Slider', 'MultiSlider', 'Time'];
  const mathNodes = ['Add', 'Subtract', 'Multiply', 'Divide', 'Power', 'Log', 'Sin', 'Cos', 'Tan', 'Oscillator'];
  const logicNodes = ['And', 'Or', 'Not', 'Xor'];
  const conditionalNodes = ['GreaterThan', 'LessThan', 'Equal', 'NotEqual', 'If'];
  const rangeNodes = ['Clamp', 'Remap'];
  const vectorNodes = ['Vec3', 'Vec3Split', 'Vec3Add', 'Vec3Subtract', 'Vec3Multiply', 'Vec3Scale', 'Vec3Normalize', 'Vec3Dot', 'Vec3Cross', 'Vec3Length', 'InverseKinematics'];
  const outputNodes = ['Output'];

  return (
    <aside style={{ borderRight: '1px solid #444', padding: 15, overflowY: 'auto' }}>
      <h2 style={{ marginTop: 0 }}>Nodes</h2>
      <NodeCategory title="Sources" types={sourceNodes} />
      <NodeCategory title="Math" types={mathNodes} />
      <NodeCategory title="Logic" types={logicNodes} />
      <NodeCategory title="Conditional" types={conditionalNodes} />
      <NodeCategory title="Ranges" types={rangeNodes} />
      <NodeCategory title="Vector" types={vectorNodes} />
      <NodeCategory title="Output" types={outputNodes} />
    </aside>
  );
};

export default NodePalette;
