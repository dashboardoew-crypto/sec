---
name: Conditional allowance compatibility
description: Compatibility rule for numeric DA/NA fields that were saved before their Yes/No applicability controls existed.
---

For Driver Attendance, Station is the primary DA/NA gate: Station=Yes exposes and preserves both allowance values and marks them applicable; Station=No removes both allowances. Legacy numeric DA/NA values without flags remain compatible when Station=Yes.

**Why:** The attendance workflow defines station duty as the condition for entering DA and NA. Older records may also contain allowance quantities without the newer applicability flags.

**How to apply:** Apply the Station rule in Driver Attendance form normalization, submission cleanup, and API normalization. Keep the legacy flags populated as Yes when Station=Yes so existing HR calculations continue to work.