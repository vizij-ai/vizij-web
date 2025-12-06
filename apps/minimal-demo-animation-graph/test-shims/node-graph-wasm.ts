const createMockFn = () => {
  const fn: any = (...args: any[]) => {
    fn.mock.calls.push(args);
  };
  fn.mock = { calls: [] as any[] };
  return fn;
};

let lastGraph: any = null;

export const init = async () => {};

export const createGraph = async () => {
  const graph = {
    loadGraph: createMockFn(),
    evalAll: () => ({ toValueJSON: () => ({}) }),
    free: createMockFn(),
    stageInput: createMockFn(),
    setParam: createMockFn(),
    setTime: createMockFn(),
    step: createMockFn(),
  };
  lastGraph = graph;
  return graph;
};

export const Graph = createGraph;

export const __setMode = () => {};
export const __getLastGraph = () => lastGraph;

export const normalizeGraphSpec = async (spec: any) => spec;
export const normalize_graph_spec_json = (json: string) => json;
export const toValueJSON = <T>(value: T): T => value;
