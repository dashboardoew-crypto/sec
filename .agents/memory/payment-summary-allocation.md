---
name: Payment summary allocation
description: Consistency rule for HR person-level payment totals and attendance rows.
---

Compute each person's paid amount by summing the payment amounts actually allocated to their included attendance rows. Cap each allocation at that row's due amount, and derive outstanding amount and payment status from that sum. Keep payment round-off separate from payable allocation.

**Why:** A transaction total can include round-off or amounts tied to attendance outside the current report scope. Comparing the gross transaction total to a person summary can therefore disagree with the row-level payment details.

**How to apply:** Whenever HR overview, payment queue, statements, or exports calculate paid status, reuse attendance-level allocations as the canonical source instead of independently summing transaction totals.