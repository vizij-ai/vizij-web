import type { BindingValueType } from "./state";

export type ExpressionVariableKind = "slot" | "reserved";

export interface SlotVariableMetadata {
  slotId: string;
  slotAlias: string;
  inputId: string | null;
  targetId: string;
  animatableId: string;
  component?: string;
  valueType: BindingValueType;
}

export interface ReservedVariableMetadata {
  targetId?: string;
  animatableId?: string;
  component?: string;
}

export interface ExpressionVariableEntry {
  name: string;
  kind: ExpressionVariableKind;
  nodeId: string | null;
  metadata?: SlotVariableMetadata | ReservedVariableMetadata;
  description?: string;
}

export interface RegisterSlotVariableOptions extends SlotVariableMetadata {
  name: string;
  nodeId: string;
}

export interface RegisterReservedVariableOptions
  extends ReservedVariableMetadata {
  name: string;
  nodeId: string | null;
  description?: string;
}

export interface ExpressionVariableMissing {
  name: string;
  reason: "unknown" | "unresolved";
  entry?: ExpressionVariableEntry;
}

export interface ExpressionVariableTable {
  registerSlotVariable(options: RegisterSlotVariableOptions): void;
  registerReservedVariable(options: RegisterReservedVariableOptions): void;
  resolve(name: string): ExpressionVariableEntry | null;
  resolveNodeId(name: string): string | null;
  entries(): ExpressionVariableEntry[];
  firstNodeId(): string | null;
  missing(names: Iterable<string>): ExpressionVariableMissing[];
}

class DefaultExpressionVariableTable implements ExpressionVariableTable {
  private readonly variables = new Map<string, ExpressionVariableEntry>();
  private readonly order: string[] = [];

  registerSlotVariable(options: RegisterSlotVariableOptions): void {
    this.upsert({
      name: options.name,
      kind: "slot",
      nodeId: options.nodeId,
      metadata: {
        slotId: options.slotId,
        slotAlias: options.slotAlias,
        inputId: options.inputId,
        targetId: options.targetId,
        animatableId: options.animatableId,
        component: options.component,
        valueType: options.valueType,
      },
    });
  }

  registerReservedVariable(options: RegisterReservedVariableOptions): void {
    this.upsert({
      name: options.name,
      kind: "reserved",
      nodeId: options.nodeId,
      description: options.description,
      metadata: {
        targetId: options.targetId,
        animatableId: options.animatableId,
        component: options.component,
      },
    });
  }

  resolve(name: string): ExpressionVariableEntry | null {
    return this.variables.get(name) ?? null;
  }

  resolveNodeId(name: string): string | null {
    return this.variables.get(name)?.nodeId ?? null;
  }

  entries(): ExpressionVariableEntry[] {
    return this.order
      .map((name) => this.variables.get(name))
      .filter((entry): entry is ExpressionVariableEntry => Boolean(entry));
  }

  firstNodeId(): string | null {
    for (const name of this.order) {
      const nodeId = this.variables.get(name)?.nodeId;
      if (nodeId) {
        return nodeId;
      }
    }
    return null;
  }

  missing(names: Iterable<string>): ExpressionVariableMissing[] {
    const missing: ExpressionVariableMissing[] = [];
    for (const name of names) {
      const entry = this.variables.get(name);
      if (!entry) {
        missing.push({ name, reason: "unknown" });
        continue;
      }
      if (!entry.nodeId) {
        missing.push({
          name,
          reason: "unresolved",
          entry,
        });
      }
    }
    return missing;
  }

  private upsert(entry: ExpressionVariableEntry): void {
    if (!this.variables.has(entry.name)) {
      this.order.push(entry.name);
    }
    this.variables.set(entry.name, entry);
  }
}

export function createExpressionVariableTable(): ExpressionVariableTable {
  return new DefaultExpressionVariableTable();
}
