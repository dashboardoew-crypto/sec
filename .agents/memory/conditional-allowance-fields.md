---
name: Conditional allowance compatibility
description: Compatibility rule for numeric DA/NA fields that were saved before their Yes/No applicability controls existed.
---

If a legacy Driver Attendance record contains a numeric DA or NA value but no applicability flag, treat a positive value as applicable before removing hidden conditional fields. Explicit No still suppresses the value.

**Why:** Older records can have the entered allowance quantity without the newer applicability flag. Deleting that number during normalization silently makes the HR calculation zero.

**How to apply:** Use this rule anywhere Driver Attendance data is normalized for reads, HR calculations, exports, or edits.