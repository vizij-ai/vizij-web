import type { GraphSpec } from "@vizij/node-graph-wasm";
import { slewPaths } from "./slewAnimation";

export const slewGraphSpec: GraphSpec = {
  nodes: [
    {
      id: "driver_in",
      type: "input",
      params: {
        path: slewPaths.driver,
        value: { float: 0 },
      },
    },
    {
      id: "slew_node",
      type: "slew",
      inputs: { in: { node_id: "driver_in" } },
      params: { max_rate: 1.5 },
    },
    {
      id: "damp_node",
      type: "damp",
      inputs: { in: { node_id: "slew_node" } },
      params: { half_life: 0.22 },
    },
    {
      id: "raw_out",
      type: "output",
      params: { path: slewPaths.driver },
      inputs: { in: { node_id: "driver_in" } },
    },
    {
      id: "slew_out",
      type: "output",
      params: { path: slewPaths.slew },
      inputs: { in: { node_id: "slew_node" } },
    },
    {
      id: "damp_out",
      type: "output",
      params: { path: slewPaths.damp },
      inputs: { in: { node_id: "damp_node" } },
    },
  ],
};
