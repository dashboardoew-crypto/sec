---
name: Payment summary allocation
description: Consistency rule for HR person-level payment totals and attendance rows.
---

Compute each person's paid amount by summing the payment amounts actually allocated to their included attendance rows. Cap each allocation at that row's due amount, and derive outstanding amount and payment status from that sum. When filtering to a register, use the transaction's attendance references to identify applicable payments; the transaction's saved scope may be "all" even when it pays a row in one register. Keep payment round-off separate from payable allocation.

**Why:** A transaction total can include round-off or amounts tied to attendance outside the current report scope. Comparing the gross transaction total to a person summary can disagree with row details, and filtering by saved transaction scope can hide payments that reference attendance in the selected register.

**How to apply:** Whenever HR overview, payment queue, statements, exports, or register filters calculate payment state, reuse attendance-level allocations as the canonical source instead of independently summing transaction totals or relying only on transaction scope.