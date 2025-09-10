export type ValueType = 'float' | 'bool' | 'vector' | 'any';

export interface PortType {
  name: string;
  type: ValueType;
}

export interface NodeTypeSpec {
  inputs: PortType[];
  outputs: PortType[];
}

export const nodeTypeRegistry: Record<string, NodeTypeSpec> = {
  constant: { inputs: [], outputs: [{ name: 'out', type: 'float' }] },
  slider: { inputs: [], outputs: [{ name: 'out', type: 'float' }] },
  multislider: { inputs: [], outputs: [{ name: 'o1', type: 'float' }, { name: 'o2', type: 'float' }, { name: 'o3', type: 'float' }] },
  time: { inputs: [], outputs: [{ name: 'out', type: 'float' }] },
  add: { inputs: [{ name: 'a', type: 'float' }, { name: 'b', type: 'float' }], outputs: [{ name: 'out', type: 'float' }] },
  subtract: { inputs: [{ name: 'a', type: 'float' }, { name: 'b', type: 'float' }], outputs: [{ name: 'out', type: 'float' }] },
  multiply: { inputs: [{ name: 'a', type: 'float' }, { name: 'b', type: 'float' }], outputs: [{ name: 'out', type: 'float' }] },
  divide: { inputs: [{ name: 'a', type: 'float' }, { name: 'b', type: 'float' }], outputs: [{ name: 'out', type: 'float' }] },
  power: { inputs: [{ name: 'a', type: 'float' }, { name: 'b', type: 'float' }], outputs: [{ name: 'out', type: 'float' }] },
  log: { inputs: [{ name: 'a', type: 'float' }, { name: 'b', type: 'float' }], outputs: [{ name: 'out', type: 'float' }] },
  sin: { inputs: [{ name: 'in', type: 'float' }], outputs: [{ name: 'out', type: 'float' }] },
  cos: { inputs: [{ name: 'in', type: 'float' }], outputs: [{ name: 'out', type: 'float' }] },
  tan: { inputs: [{ name: 'in', type: 'float' }], outputs: [{ name: 'out', type: 'float' }] },
  oscillator: { inputs: [{ name: 'frequency', type: 'float' }, { name: 'phase', type: 'float' }], outputs: [{ name: 'out', type: 'float' }] },
  and: { inputs: [{ name: 'a', type: 'bool' }, { name: 'b', type: 'bool' }], outputs: [{ name: 'out', type: 'bool' }] },
  or: { inputs: [{ name: 'a', type: 'bool' }, { name: 'b', type: 'bool' }], outputs: [{ name: 'out', type: 'bool' }] },
  not: { inputs: [{ name: 'in', type: 'bool' }], outputs: [{ name: 'out', type: 'bool' }] },
  xor: { inputs: [{ name: 'a', type: 'bool' }, { name: 'b', type: 'bool' }], outputs: [{ name: 'out', type: 'bool' }] },
  greaterthan: { inputs: [{ name: 'a', type: 'float' }, { name: 'b', type: 'float' }], outputs: [{ name: 'out', type: 'bool' }] },
  lessthan: { inputs: [{ name: 'a', type: 'float' }, { name: 'b', type: 'float' }], outputs: [{ name: 'out', type: 'bool' }] },
  equal: { inputs: [{ name: 'a', type: 'float' }, { name: 'b', type: 'float' }], outputs: [{ name: 'out', type: 'bool' }] },
  notequal: { inputs: [{ name: 'a', type: 'float' }, { name: 'b', type: 'float' }], outputs: [{ name: 'out', type: 'bool' }] },
  if: { inputs: [{ name: 'cond', type: 'bool' }, { name: 'then', type: 'any' }, { name: 'else', type: 'any' }], outputs: [{ name: 'out', type: 'any' }] },
  clamp: { inputs: [{ name: 'in', type: 'float' }], outputs: [{ name: 'out', type: 'float' }] },
  remap: { inputs: [{ name: 'in', type: 'float' }], outputs: [{ name: 'out', type: 'float' }] },
  vec3: { inputs: [{ name: 'x', type: 'float' }, { name: 'y', type: 'float' }, { name: 'z', type: 'float' }], outputs: [{ name: 'out', type: 'vector' }] },
  vec3split: { inputs: [{ name: 'in', type: 'vector' }], outputs: [{ name: 'out', type: 'float' }] },
  vec3add: { inputs: [{ name: 'a', type: 'vector' }, { name: 'b', type: 'vector' }], outputs: [{ name: 'out', type: 'vector' }] },
  vec3subtract: { inputs: [{ name: 'a', type: 'vector' }, { name: 'b', type: 'vector' }], outputs: [{ name: 'out', type: 'vector' }] },
  vec3multiply: { inputs: [{ name: 'a', type: 'vector' }, { name: 'b', type: 'vector' }], outputs: [{ name: 'out', type: 'vector' }] },
  vec3scale: { inputs: [{ name: 'in', type: 'vector' }, { name: 'scale', type: 'float' }], outputs: [{ name: 'out', type: 'vector' }] },
  vec3normalize: { inputs: [{ name: 'in', type: 'vector' }], outputs: [{ name: 'out', type: 'vector' }] },
  vec3dot: { inputs: [{ name: 'a', type: 'vector' }, { name: 'b', type: 'vector' }], outputs: [{ name: 'out', type: 'float' }] },
  vec3cross: { inputs: [{ name: 'a', type: 'vector' }, { name: 'b', type: 'vector' }], outputs: [{ name: 'out', type: 'vector' }] },
  vec3length: { inputs: [{ name: 'in', type: 'vector' }], outputs: [{ name: 'out', type: 'float' }] },
    inversekinematics: { inputs: [{ name: 'x', type: 'float' }, { name: 'y', type: 'float' }, { name: 'theta', type: 'float' }, { name: 'bone1', type: 'float' }, { name: 'bone2', type: 'float' }, { name: 'bone3', type: 'float' }], outputs: [{ name: 'out', type: 'vector' }] },
  output: { inputs: [], outputs: [] }, // Dynamic inputs
};
