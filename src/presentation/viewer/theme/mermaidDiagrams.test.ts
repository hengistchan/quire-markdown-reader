import { beforeAll, describe, expect, it } from 'vitest';
import mermaid from 'mermaid';

const diagrams = {
  flowchart: 'flowchart LR\n  Draft --> Review --> Publish',
  sequence: 'sequenceDiagram\n  Reader->>Quire: Open Markdown\n  Quire-->>Reader: Render document',
  state: 'stateDiagram-v2\n  [*] --> Reading\n  Reading --> Focused\n  Focused --> [*]',
  class: 'classDiagram\n  class Document\n  Document : +String title\n  Document : +render()',
  pie: 'pie showData\n  title Reading time\n  "Prose" : 72\n  "Code" : 18\n  "Diagrams" : 10',
  xychart: 'xychart-beta\n  title "Reading sessions"\n  x-axis [Mon, Tue, Wed, Thu]\n  y-axis "Minutes" 0 --> 40\n  bar [12, 24, 19, 32]',
} as const;

describe('supported Mermaid gallery diagrams', () => {
  beforeAll(() => {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base' });
  });

  for (const [name, source] of Object.entries(diagrams)) {
    it(`parses the ${name} diagram`, async () => {
      await expect(mermaid.parse(source)).resolves.toBeTruthy();
    });
  }
});
