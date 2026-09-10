# @vizij/node-graph-authoring Docs

Design documents for the authoring-time graph compiler. Cross-repo architecture lives in `vizij-docs`; authoring-app execution tracking lives in `apps/vizij-authoring/docs`. This folder owns the compile contract between authored bindings and `GraphSpec`.

## Design Documents

1. `multi-output-ports-authoring-plan-2026-07-30.md`
   - Lets authored expressions read more than one output port from a node. Confined to vizij-web. Independent and ready to schedule.
2. `subgraph-function-node-design-2026-07-30.md`
   - Lets authors define reusable many-in / many-out blocks via a `call` node and a graph-local function table. Lands mostly in `vizij-rs`.
   - Its section 4.8 specifies how the two plans compose — the end state is `polar_to_cart(radius, angle).x`, where doc 1 delivers the `.x` and doc 2 delivers the function. There is deliberately no third integration document; the joins live with the dependent plan.

## Background: the graph is already many-to-many

A recurring assumption is that a graph node computes one value from many inputs. It does not. `eval_node` produces a map of named output ports per node, edges are port-addressed via `output_key` (defaulting to `out`), and node signatures declare `outputs: Vec<PortSpec>` plus optional `variadic_outputs`. `MultiSlider` and `Split` already use this.

The single-output behavior everyone observes comes from the authoring layer in this package, which resolves every node to its default port and truncates function signatures at `outputs[0]`. Both documents above start from that distinction; see section 3 of each for the file-level evidence.
