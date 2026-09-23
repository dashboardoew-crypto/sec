---
name: SPL overtime rounding
description: Business rule for overtime shown and paid in HR bills.
---

SPL overtime is calculated from the exact completed minutes: preserve values such as 06:10 and 00:01 in displays and pay them proportionally.

**Why:** The user clarified that a 6:10 overtime duration must remain 6:10 and a 1-minute duration must remain 00:01; the 1-minute row must also receive its proportional overtime amount.

**How to apply:** Use the same raw overtime minutes for register-derived overtime, HR report totals, bill line items, and payment calculations. Keep the existing baseline thresholds, but do not round the final minutes.