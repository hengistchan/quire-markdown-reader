# Architecture at a glance

Technical Markdown stays readable, from diagrams and formulas to highlighted code.

```mermaid
flowchart LR
  A[Markdown] --> B[Sanitize]
  B --> C[Render]
  C --> D[Read]
```

## Precise notation

Inline math remains crisp: $E = mc^2$ and $O(n \log n)$.

```ts
const workspace = { mode: "local", editable: false };
```
