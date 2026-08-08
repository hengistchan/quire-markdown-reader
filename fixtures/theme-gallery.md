# Quire Visual System v2

A warm, quiet, high-contrast reading surface for long-form Markdown. This gallery is the visual acceptance fixture for typography, components, diagrams, and responsive behavior.

## Typography scale

### Heading level three

#### Heading level four

##### Heading level five

###### Heading level six

Body copy should feel calm at reading distance. It includes **strong text**, *emphasis*, ~~strikethrough~~, an [external link](https://example.com), and `inline code` that remains distinct without overpowering the sentence.

Quire separates reading content from application chrome. Secondary information remains legible, while the document title and primary prose keep the strongest contrast.

## Lists and tasks

- Unordered list marker uses a quiet tertiary tone.
- Nested content stays aligned.
  - A nested item
  - Another nested item with **emphasis**
- The final list item closes the rhythm.

1. Open a Markdown document.
2. Read without visual noise.
3. Use the workspace only when it helps.

- [x] Semantic tokens
- [x] Theme-aware Mermaid
- [ ] Final release review

## Quotes and callouts

> A reader should feel like a well-made page: present enough to guide you, quiet enough to disappear.

::: note
**Note.** Quire keeps useful context close to the document without turning the reading surface into a dashboard.
:::

::: warning
**Warning.** Long tables, code blocks, and diagrams must remain usable at narrow viewport widths.
:::

## Table

| Token family | Purpose | Example |
| --- | --- | --- |
| Surface | Separates document, toolbar, sidebar, and elevation | `--surface-document` |
| Text | Establishes strong, primary, secondary, and tertiary hierarchy | `--text-secondary` |
| Interaction | Describes hover, active, selected, and focus states | `--focus-ring` |
| Semantic | Communicates success, warning, danger, and highlight | `--warning-soft` |

## Code

### JavaScript

```js
const reader = await Quire.open('guide.md');
reader.focus();
```

### TypeScript

```ts
type ReaderTheme = 'light' | 'dark';

interface ReadingSession {
  documentId: string;
  theme: ReaderTheme;
}
```

### Go

```go
package main

func main() {
	fmt.Println("quiet reading")
}
```

### JSON

```json
{
  "theme": "system",
  "contentWidth": 760,
  "enableMermaid": true
}
```

### Shell

```sh
pnpm compile
pnpm test
pnpm build
```

## Mathematics

Inline mathematics such as $E = mc^2$ should align naturally with prose.

$$
\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
$$

## Image

![Quire visual system sample](assets/quire-mark.svg)

## Mermaid flowchart

```mermaid
flowchart LR
  Source[Markdown source] --> Sanitize[Sanitize]
  Sanitize --> Render[Render document]
  Render --> Read[Quiet reading]
```

## Mermaid sequence

```mermaid
sequenceDiagram
  participant Reader
  participant Quire
  Reader->>Quire: Open document
  Quire-->>Reader: Render themed page
```

## Mermaid class

```mermaid
classDiagram
  class Document {
    +String title
    +render()
  }
  class Theme {
    +String mode
    +resolveTokens()
  }
  Document --> Theme
```

## Mermaid state

```mermaid
stateDiagram-v2
  [*] --> Loading
  Loading --> Reading
  Reading --> Focused
  Focused --> Reading
  Reading --> [*]
```

## Mermaid entity relationship

```mermaid
erDiagram
  WORKSPACE ||--o{ DOCUMENT : contains
  DOCUMENT ||--o{ HEADING : exposes
  DOCUMENT {
    string title
    string source
  }
```

## Mermaid journey

```mermaid
journey
  title A reading session
  section Open
    Choose document: 4: Reader
    Render Markdown: 5: Quire
  section Read
    Follow the argument: 5: Reader
    Inspect a diagram: 4: Reader
```

## Mermaid pie

```mermaid
pie showData
  title Document composition
  "Prose" : 68
  "Code" : 20
  "Diagrams" : 12
```

## Mermaid git graph

```mermaid
gitGraph
  commit id: "0.0.4"
  branch release-0.0.5
  checkout release-0.0.5
  commit id: "tokens"
  commit id: "mermaid"
  checkout main
  merge release-0.0.5
```

## Mermaid XY chart

```mermaid
xychart-beta
  title "Reading sessions"
  x-axis [Mon, Tue, Wed, Thu, Fri]
  y-axis "Minutes" 0 --> 40
  bar [12, 24, 19, 32, 28]
  line [10, 20, 22, 30, 31]
```

## Closing rhythm

The final section verifies the spacing that separates a long document from its footer. Every surface should remain warm, every text hierarchy should remain explicit, and every interaction should retain a visible focus state.
