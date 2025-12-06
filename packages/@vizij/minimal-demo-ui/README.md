# @vizij/minimal-demo-ui

Internal chrome and layout helpers shared across Vizij minimal demo apps.

## Usage

```tsx
import { MinimalDemoChrome, MinimalDemoSection } from "@vizij/minimal-demo-ui";

export function App() {
  return (
    <MinimalDemoChrome title="Demo" subtitle="Minimal Vizij sample">
      <MinimalDemoSection title="Section title">
        {/** content */}
      </MinimalDemoSection>
    </MinimalDemoChrome>
  );
}
```
