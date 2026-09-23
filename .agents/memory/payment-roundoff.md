---
name: Payment bill round-off
description: Business rule for optional bill rounding during payment recording.
---

Payment recording supports one optional round-off choice of +₹0.50. The attendance amount remains unchanged; the payment transaction and bill total include the adjustment, and the bill shows it as a separate line.

**Why:** The user wants an amount such as ₹1,557.50 to be payable as ₹1,558.00 while keeping the underlying attendance and SPL calculations accurate.

**How to apply:** Keep round-off at the payment/bill layer, not in register-derived wages, overtime, attendance allocations, or person summaries. Persist it on both the bill and individual payment transaction so history, downloads, print views, and backups remain consistent.