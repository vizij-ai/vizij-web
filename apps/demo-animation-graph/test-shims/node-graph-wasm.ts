export const init = async () => {};

export const createGraph = async () => ({
  loadGraph: () => {},
  evalAll: () => ({ toValueJSON: () => ({}) }),
  free: () => {},
  stageInput: () => {},
  setParam: () => {},
  setTime: () => {},
  step: () => {},
});

export const Graph = createGraph;

export const __setMode = () => {};
export const __getLastGraph = () => null;
