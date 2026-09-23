---
name: Payment bill round-off
description: Business rule for optional bill rounding during payment recording.
---

Payment recording automatically rounds a selected payment up to the next whole rupee. The paise portion becomes a separate round-off amount in rupees; for example, ₹1,557.50 becomes ₹1,558.00 with a ₹0.50 round-off. Whole-rupee amounts have no round-off.

**Why:** The user wants paise handled automatically during payment, without a manual fixed-value checkbox, while keeping the underlying attendance and SPL calculations accurate.

**How to apply:** Keep round-off at the payment/bill layer, not in register-derived wages, overtime, attendance allocations, or person summaries. Persist it on both the bill and individual payment transaction so history, downloads, print views, and backups remain consistent.