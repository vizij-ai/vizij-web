import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button";
import { Switch } from "./Switch";
import { Checkbox } from "./Checkbox";
import { Badge } from "./Badge";
import { Chip } from "./Chip";
import { Tabs } from "./Tabs";
import { Input } from "./Input";
import { Select } from "./Select";
import { Combobox } from "./Combobox";
import { TextArea } from "./TextArea";
import { NumberField } from "./NumberField";
import { Slider } from "./Slider";
import { PanelSearch } from "./PanelSearch";
import { Card } from "./Card";
import { Panel } from "./Panel";
import { Tooltip } from "./Tooltip";
import { ListRow } from "./ListRow";
import { TreeRow } from "./TreeRow";
import { CollapsibleRow } from "./CollapsibleRow";
import { FieldRow } from "./FieldRow";
import { Logo } from "./Logo";

const meta: Meta = { title: "Audit/All Components", parameters: { layout: "fullscreen" } };
export default meta;

const noop = () => {};
const Cell = ({ label, w = 240, children }: { label: string; w?: number; children: React.ReactNode }) => (
  <div style={{ width: w, display: "flex", flexDirection: "column", gap: 6 }}>
    <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-sans)" }}>{label}</span>
    <div>{children}</div>
  </div>
);

export const All: StoryObj = {
  render: () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 28, padding: 28, alignItems: "flex-start" }}>
      <Cell label="Button" w={360}>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="primary">Button</Button>
          <Button variant="secondary">Button</Button>
          <Button variant="subtle">Button</Button>
          <Button variant="danger">Button</Button>
          <Button variant="ghost">Button</Button>
        </div>
      </Cell>
      <Cell label="Switch" w={120}><Switch checked onChange={noop} /></Cell>
      <Cell label="Checkbox" w={120}><Checkbox checked onChange={noop} label="Label" /></Cell>
      <Cell label="Badge" w={200}>
        <div style={{ display: "flex", gap: 6 }}><Badge tone="accent">accent</Badge><Badge tone="info">info</Badge><Badge tone="muted">muted</Badge></div>
      </Cell>
      <Cell label="Chip" w={420}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Chip tone="default">default</Chip><Chip tone="info">info</Chip><Chip tone="success">success</Chip>
          <Chip tone="warning">warning</Chip><Chip tone="danger">danger</Chip><Chip tone="muted">muted</Chip>
        </div>
      </Cell>
      <Cell label="Tabs" w={320}>
        <Tabs items={[{ id: "a", label: "Design" }, { id: "b", label: "Rig" }, { id: "c", label: "Animate" }]} value="a" onValueChange={noop} renderPanel={() => null} />
      </Cell>
      <Cell label="Input"><Input placeholder="Placeholder" /></Cell>
      <Cell label="Select"><Select value="a" onChange={noop} options={[{ value: "a", label: "Option A" }]} /></Cell>
      <Cell label="Combobox"><Combobox value={null} onChange={noop} options={[{ value: "a", label: "a" }]} placeholder="Search…" /></Cell>
      <Cell label="TextArea"><TextArea placeholder="Multi-line…" rows={3} /></Cell>
      <Cell label="NumberField" w={140}><NumberField value={0.6} onChange={noop} min={0} max={1} step={0.01} /></Cell>
      <Cell label="Slider"><Slider value={0.5} min={0} max={1} step={0.01} onChange={noop} fillMode="value" /></Cell>
      <Cell label="PanelSearch"><PanelSearch value="" onChange={noop} placeholder="Search…" /></Cell>
      <Cell label="Card"><Card>Card title<div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Body text inside the card.</div></Card></Cell>
      <Cell label="Panel"><Panel title="Panel" description="Description">Body</Panel></Cell>
      <Cell label="Tooltip" w={120}><Tooltip content="Tip">Hover</Tooltip></Cell>
      <Cell label="ListRow"><ListRow title="List row" meta="meta" /></Cell>
      <Cell label="TreeRow"><TreeRow depth={0} hasChildren label="Tree node" onToggle={noop} /></Cell>
      <Cell label="CollapsibleRow" w={360}><CollapsibleRow id="r" title="Section" value={0.6} onValueChange={noop} expandedContent={<div style={{ fontSize: 12 }}>Detail</div>} /></Cell>
      <Cell label="FieldRow"><FieldRow label="Label" control={<Input />} /></Cell>
      <Cell label="Logo" w={120}><Logo /></Cell>
    </div>
  ),
};
