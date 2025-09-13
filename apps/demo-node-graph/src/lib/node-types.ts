export type ValueType = 'float' | 'bool' | 'vector' | 'any';

export interface PortType {
  name: string;
  type: ValueType;
}

export interface NodeTypeSpec {
  inputs: PortType[];
  outputs: PortType[];
}

/**
 * UI-side registry used to help the canvas with some defaults for handles.
 * This is not authoritative; the wasm schema is the source of truth.
 * We keep this lightweight and aligned with the new vector-first model.
 */
export const nodeTypeRegistry: Record<string, NodeTypeSpec> = {
  // Sources & math (scalar)
  constant: { inputs: [], outputs: [{ name: 'out', type: 'float' }] },
  slider: { inputs: [], outputs: [{ name: 'out', type: 'float' }] },
  multislider: {
    inputs: [],
    outputs: [
      { name: 'o1', type: 'float' },
      { name: 'o2', type: 'float' },
      { name: 'o3', type: 'float' },
    ],
  },
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

  // Logic (bool semantics)
  and: { inputs: [{ name: 'a', type: 'bool' }, { name: 'b', type: 'bool' }], outputs: [{ name: 'out', type: 'bool' }] },
  or: { inputs: [{ name: 'a', type: 'bool' }, { name: 'b', type: 'bool' }], outputs: [{ name: 'out', type: 'bool' }] },
  not: { inputs: [{ name: 'in', type: 'bool' }], outputs: [{ name: 'out', type: 'bool' }] },
  xor: { inputs: [{ name: 'a', type: 'bool' }, { name: 'b', type: 'bool' }], outputs: [{ name: 'out', type: 'bool' }] },
  greaterthan: { inputs: [{ name: 'a', type: 'float' }, { name: 'b', type: 'float' }], outputs: [{ name: 'out', type: 'bool' }] },
  lessthan: { inputs: [{ name: 'a', type: 'float' }, { name: 'b', type: 'float' }], outputs: [{ name: 'out', type: 'bool' }] },
  equal: { inputs: [{ name: 'a', type: 'float' }, { name: 'b', type: 'float' }], outputs: [{ name: 'out', type: 'bool' }] },
  notequal: { inputs: [{ name: 'a', type: 'float' }, { name: 'b', type: 'float' }], outputs: [{ name: 'out', type: 'bool' }] },
  if: { inputs: [{ name: 'cond', type: 'bool' }, { name: 'then', type: 'any' }, { name: 'else', type: 'any' }], outputs: [{ name: 'out', type: 'any' }] },

  // Ranges
  clamp: { inputs: [{ name: 'in', type: 'float' }], outputs: [{ name: 'out', type: 'float' }] },
  remap: { inputs: [{ name: 'in', type: 'float' }], outputs: [{ name: 'out', type: 'float' }] },

  // 3D-specific kept
  vec3cross: { inputs: [{ name: 'a', type: 'vector' }, { name: 'b', type: 'vector' }], outputs: [{ name: 'out', type: 'vector' }] },

  // Vector-first nodes
  vectorconstant: { inputs: [], outputs: [{ name: 'out', type: 'vector' }] },
  vectoradd: { inputs: [{ name: 'a', type: 'vector' }, { name: 'b', type: 'vector' }], outputs: [{ name: 'out', type: 'vector' }] },
  vectorsubtract: { inputs: [{ name: 'a', type: 'vector' }, { name: 'b', type: 'vector' }], outputs: [{ name: 'out', type: 'vector' }] },
  vectormultiply: { inputs: [{ name: 'a', type: 'vector' }, { name: 'b', type: 'vector' }], outputs: [{ name: 'out', type: 'vector' }] },
  vectorscale: { inputs: [{ name: 'v', type: 'vector' }, { name: 'scalar', type: 'float' }], outputs: [{ name: 'out', type: 'vector' }] },
  vectornormalize: { inputs: [{ name: 'in', type: 'vector' }], outputs: [{ name: 'out', type: 'vector' }] },
  vectordot: { inputs: [{ name: 'a', type: 'vector' }, { name: 'b', type: 'vector' }], outputs: [{ name: 'out', type: 'float' }] },
  vectorlength: { inputs: [{ name: 'in', type: 'vector' }], outputs: [{ name: 'out', type: 'float' }] },
  vectorindex: { inputs: [{ name: 'v', type: 'vector' }, { name: 'index', type: 'float' }], outputs: [{ name: 'out', type: 'float' }] },

  // Join (variadic inputs conceptually; here we show two primary ports for UX)
  join: { inputs: [{ name: 'a', type: 'vector' }, { name: 'b', type: 'vector' }], outputs: [{ name: 'out', type: 'vector' }] },

  // Split (variadic outputs; UI renders parts dynamically; placeholder has no fixed outputs here)
  split: { inputs: [{ name: 'in', type: 'vector' }], outputs: [] },

  // Reducers
  vectormin: { inputs: [{ name: 'in', type: 'vector' }], outputs: [{ name: 'out', type: 'float' }] },
  vectormax: { inputs: [{ name: 'in', type: 'vector' }], outputs: [{ name: 'out', type: 'float' }] },
  vectormean: { inputs: [{ name: 'in', type: 'vector' }], outputs: [{ name: 'out', type: 'float' }] },
  vectormedian: { inputs: [{ name: 'in', type: 'vector' }], outputs: [{ name: 'out', type: 'float' }] },
  vectormode: { inputs: [{ name: 'in', type: 'vector' }], outputs: [{ name: 'out', type: 'float' }] },

  // Robotics
  inversekinematics: {
    inputs: [
      { name: 'x', type: 'float' },
      { name: 'y', type: 'float' },
      { name: 'theta', type: 'float' },
      { name: 'bone1', type: 'float' },
      { name: 'bone2', type: 'float' },
      { name: 'bone3', type: 'float' },
    ],
    outputs: [{ name: 'out', type: 'vector' }],
  },

  // Output sink
  output: { inputs: [], outputs: [] }, // dynamic input routing; no outputs
};
