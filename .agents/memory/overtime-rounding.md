---
name: SPL overtime rounding
description: Business rule for overtime shown and paid in HR bills.
---

SPL overtime in the training and Chowk labour registers is calculated in completed 30-minute blocks: floor values such as 00:35 to 00:30 and 01:55 to 01:30, then pay from the floored duration.

**Why:** The user requires SPL choices of 00:30, 01:00, 01:30, 02:00, and so on, with no rounding up. Other registers must not change.

**How to apply:** Keep the existing 5-hour and 8-hour baseline thresholds, floor only the resulting SPL minutes for `daily-attendance` and `chowk-labour`, and use those same rounded minutes for displays, HR totals, bills, and payment calculations.