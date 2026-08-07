# Architecture refactor baseline

Recorded on 2026-08-06 from `release/0.0.5` before the architecture migration.

## Verification baseline

| Check | Result |
| --- | --- |
| `npm run compile` | Passed |
| `npm test` | 18 files, 126 tests passed |
| `npm run build` | Chrome MV3 and Firefox MV2 passed |

## Source baseline

| File | Lines |
| --- | ---: |
| `src/entrypoints/viewer/App.tsx` | 1,093 |
| `src/entrypoints/viewer/components/index.tsx` | 223 |
| `src/entrypoints/viewer/style.css` | 365 |
| `src/entrypoints/viewer/App.test.tsx` | 465 |

## Chrome production bundle baseline

The gzip values use `gzip -c` and therefore include a small gzip header. They are intended for relative regression checks.

| Artifact | Raw bytes | Gzip bytes |
| --- | ---: | ---: |
| Viewer entry | 85,295 | 27,615 |
| React vendor | 192,500 | 60,299 |
| Markdown vendor | 176,744 | 63,964 |
| KaTeX vendor | 539,103 | 154,115 |
| Highlight vendor | 162,525 | 53,836 |
| Icons vendor | 4,835 | 2,001 |
| Viewer CSS | 30,911 | 7,077 |
| Chrome output directory | 5,640 KiB | n/a |
| Firefox output directory | 5,624 KiB | n/a |

## Initial performance guardrails

- A local refresh with unchanged `lastModified` and `size` must not call `File.text()`.
- Browser back/forward traversal must not add a new history entry.
- Switching away from a document source must dispose its object URLs and pending work.
- A primary bundle may not grow by more than 15% without an explanation.
- The packaged extension may not grow by more than 10% without an explanation.

Large-document and large-workspace timings will be added once deterministic fixtures are introduced. This baseline intentionally records only measurements that the current repository can reproduce in CI.

## Navigation v2 baseline

Recorded on 2026-08-08 after the Navigation v2 architecture closeout.

The viewer entry is 107,571 raw bytes and 33,747 gzip bytes. The intentional increase from the pre-migration baseline contains the unified Workspace, Local, Remote, and Imported history restoration paths, explicit permission-recovery states, and the feature-controller composition boundary. Vendor, stylesheet, and packaged-extension budgets remain anchored to the pre-migration measurements above.

The CI budget uses 33,747 bytes as the new viewer baseline and continues to reject growth above 15%.
