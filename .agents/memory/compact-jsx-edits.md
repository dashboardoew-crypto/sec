---
name: Compact JSX edits
description: Safe editing guidance for large single-line JSX render blocks.
---

Large compact JSX lines are fragile to line-based patches. Inspect the exact current block before editing, confirm the resulting fragment boundaries with a typecheck, and avoid assuming an earlier patch context still matches.

**Why:** A stale or partially matching patch can leave duplicate `return` statements or duplicated render branches that break Vite parsing.

**How to apply:** When a JSX block has been compacted onto single lines, make the smallest verified change possible and run the frontend typecheck immediately afterward.