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
      params: { max_rate: 1.5 },
    },
    {
      id: "damp_node",
      type: "damp",
      params: { half_life: 0.22 },
    },
    {
      id: "raw_out",
      type: "output",
      params: { path: slewPaths.driver },
    },
    {
      id: "slew_out",
      type: "output",
      params: { path: slewPaths.slew },
    },
    {
      id: "damp_out",
      type: "output",
      params: { path: slewPaths.damp },
    },
  ],
  links: [
    {
      from: { node_id: "driver_in" },
      to: { node_id: "slew_node", input: "in" },
    },
    {
      from: { node_id: "slew_node" },
      to: { node_id: "damp_node", input: "in" },
    },
    { from: { node_id: "driver_in" }, to: { node_id: "raw_out", input: "in" } },
    {
      from: { node_id: "slew_node" },
      to: { node_id: "slew_out", input: "in" },
    },
    {
      from: { node_id: "damp_node" },
      to: { node_id: "damp_out", input: "in" },
    },
  ],
};
