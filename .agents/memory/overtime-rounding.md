---
name: SPL overtime rounding
description: Business rule for overtime shown and paid in HR bills.
---

SPL overtime is paid in completed 30-minute blocks: always floor the computed overtime to the nearest 30 minutes, never round up.

**Why:** The user explicitly requires values such as 35 minutes → 00:30 and 1:55 → 01:30 so attendance displays and bill amounts match the half-hour schedule.

**How to apply:** Use the same floored minutes for register-derived overtime, HR report totals, bill line items, and any future exports or payment calculations.