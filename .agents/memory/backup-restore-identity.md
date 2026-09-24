---
name: Backup restore identity
description: The non-obvious identity and consistency rule for restoring register and payment workbook data.
---

Payment transaction attendance references are derived from register record IDs, dates, and register slugs. A backup restore that generates new register IDs silently breaks payment history links even when every row imports successfully.

**Why:** A truncate followed by an import previously recreated register rows with new IDs while restoring old payment references, producing payment history entries with no matching attendance date or row.

**How to apply:** Include register IDs, payment bill keys, and attendance exclusions in workbook exports and preserve them on import. Validate every imported payment bill key, attendance reference, and exclusion link before the transaction commits; for legacy backups without IDs, only reconcile references when the match is unambiguous.