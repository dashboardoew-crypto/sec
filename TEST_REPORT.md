# ERP System Test Execution & Verification Report

<!-- AUTO-GENERATED TEST RUN HEADER -->
> **Last Automated Run:** 19 Nov 2026, 5:11:44 pm (IST)  
> **Status:** ✅ PASSED (All tests passed)  
> **Total Tests:** 36 | **Passed:** 36 | **Failed:** 0  
> **Execution Duration:** 406ms  
<!-- /AUTO-GENERATED TEST RUN HEADER -->

---

## 1. Where Test Results Are Shown

When you run `pnpm test`, the results are displayed in **two places**:

1. **Directly in your Terminal / Command Prompt**:
   - The terminal prints each test with a green checkmark `✔` and the execution duration in milliseconds.
   - At the bottom, it prints the summary:
     ```text
     ℹ tests 32
     ℹ pass 32
     ℹ fail 0
     ℹ duration_ms 454ms
     ```

2. **In This File ([TEST_REPORT.md](file:///c:/Users/digital/Desktop/today%201311/sec/TEST_REPORT.md))**:
   - A permanent reference guide in your project root detailing all 32 test cases, their inputs, expected assertions, and diagnostics.

---

## 2. Complete 32-Point Test Matrix

### Suite 1: Authentication & Password Security
**File:** [tests/auth-security.test.mjs](file:///c:/Users/digital/Desktop/today%201311/sec/tests/auth-security.test.mjs)  
- `✔` **Scrypt Salted Password Hashing**: Verifies that passwords are encrypted using salted `scrypt` hashing with 16-byte random salts and 64-byte hashes.
- `✔` **Timing-Safe Password Verification**: Ensures matching passwords authenticate and incorrect, empty, or corrupted hashes fail cleanly using `crypto.timingSafeEqual` to prevent timing attacks.

### Suite 2: Car Breakdown Service Duration
**File:** [tests/car-breakdown-service.test.mjs](file:///c:/Users/digital/Desktop/today%201311/sec/tests/car-breakdown-service.test.mjs)  
- `✔` **Same-Day Breakdown Service Duration**: Verifies `10:00` to `14:30` returns `"4h 30m"`.
- `✔` **Multi-Day Breakdown Service Duration**: Verifies multi-day spans return days, hours, and minutes (e.g. `"2d 6h 15m"`).
- `✔` **Pending Return Handling**: Leaves service duration `undefined` when a vehicle is still at the workshop.
- `✔` **Invalid Chronology Detection**: Flags inverted timestamps as `"Invalid time range"`.

### Suite 3: Date & Time Normalization (IST / Asia/Kolkata)
**File:** [tests/date-utils.test.mjs](file:///c:/Users/digital/Desktop/today%201311/sec/tests/date-utils.test.mjs)  
- `✔` **Multi-Format Date Normalization**: Converts `YYYY-MM-DD`, `DD-MM-YYYY`, `DD/MM/YYYY`, and `DD/MM/YY` to uniform date objects.
- `✔` **Display Date Formatting**: Formats dates to standard `DD-MM-YYYY` for display.
- `✔` **Input Date Standardization**: Converts values to `YYYY-MM-DD` for HTML date pickers.
- `✔` **Time to Minutes Conversion**: Converts `HH:mm` to minutes from midnight.
- `✔` **Human Duration Formatter**: Converts raw minutes to human strings (`"2h 30m"`).
- `✔` **Overtime Minutes Calculation**: Derives overtime beyond standard 5-hour and 8-hour shift limits.

### Suite 4: Driver Attendance & Vehicle Dispatch Integration
**File:** [tests/driver-dispatch-logic.test.mjs](file:///c:/Users/digital/Desktop/today%201311/sec/tests/driver-dispatch-logic.test.mjs)  
- `✔` **Exclude Busy Drivers from Dispatch**: Excludes drivers who are already out on another active vehicle trip.
- `✔` **Exclude Shift Logged-Out Drivers**: Excludes drivers who have ended their shift for the day.
- `✔` **Retain Existing Driver on Edit**: Keeps the assigned driver selectable when modifying an existing trip record.

### Suite 5: HR Attendance & Wage Calculations
**File:** [tests/hr-wage-calculation.test.mjs](file:///c:/Users/digital/Desktop/today%201311/sec/tests/hr-wage-calculation.test.mjs)  
- `✔` **Full Day Attendance Multiplier**: 8+ hours (480 mins) = `1.0` day pay.
- `✔` **Half Day Attendance Multiplier**: 5 to 7.9 hours (300–479 mins) = `0.5` day pay.
- `✔` **Short Shift Multiplier**: Under 5 hours (< 300 mins) = `0.0` day pay.
- `✔` **Combined Wage with Overtime Hours**: Accurately computes regular wages plus overtime hourly compensation.

### Suite 6: Labour Master 3-Day Grace Period
**File:** [tests/labour-grace-period.test.mjs](file:///c:/Users/digital/Desktop/today%201311/sec/tests/labour-grace-period.test.mjs)  
- `✔` **Active Employee Status**: Active workers (`is_closed: false`) are visible and cannot be unclosed.
- `✔` **Closed Employee Within 3-Day Window**: Closed workers within 3 days appear in the closed section with an `Unclose Employee` button.
- `✔` **Expired Closed Employee (>3 Days)**: Closed workers after 3 days are completely hidden from dropdowns.

### Suite 7: Operational Calculations & Derived Fields
**File:** [tests/operational-calculations.test.mjs](file:///c:/Users/digital/Desktop/today%201311/sec/tests/operational-calculations.test.mjs)  
- `✔` **Vehicle Total KM Run Derivation**: Automatically subtracts `initial_reading` from `final_reading`.
- `✔` **Fork Lifter Daily Reading Derivation**: Automatically subtracts initial meter reading from final meter reading.
- `✔` **Inter-Unit Transit Duration**: Computes travel duration between Unit 1 and Unit 2.
- `✔` **Duration Interval & Midnight Rollover**: Accurately calculates durations across shifts that cross midnight.

### Suite 8: Role-Based Access Control (RBAC) & Entry Windows
**File:** [tests/rbac-permissions.test.mjs](file:///c:/Users/digital/Desktop/today%201311/sec/tests/rbac-permissions.test.mjs)  
- `✔` **Security Role Entry Date Boundaries**: Guards can add records up to 3 days prior; future dates are blocked.
- `✔` **Manager Role Entry Date Boundaries**: Managers can add records up to 7 days prior; future dates are blocked.
- `✔` **Admin & HR Historical Entry**: Admins/HR can enter past dates without limit; future dates are blocked.
- `✔` **Module Access Boundary Enforcement**: Security cannot access HR or Master data directly.

### Suite 9: Register Schema Specifications
**File:** [tests/register-specifications.test.mjs](file:///c:/Users/digital/Desktop/today%201311/sec/tests/register-specifications.test.mjs)  
- `✔` **Register Definitions Integrity**: Verifies that `camera-breakdown`, `key-movement`, `key-master`, `daily-attendance`, and `labour-master` exist with all required fields.
- `✔` **Backend Operations Routes Integrity**: Verifies that endpoints (`/api/labour/employees`, `/toggle-close`, `/api/keys/locations`) are registered.

### Suite 10: Record Date Retention & Edit Locking
**File:** [tests/record-date-retention.test.mjs](file:///c:/Users/digital/Desktop/today%201311/sec/tests/record-date-retention.test.mjs)  
- `✔` **New Record Date Autofetch**: When creating a new record, the date field automatically defaults to the current day.
- `✔` **Historical Date Retention on Edit**: When an entry created on 18 Nov is opened/edited on 20 Nov, it shows 18 Nov and does not autofetch current date.
- `✔` **Date Field Locking**: The primary date field is marked locked (`editable: false`, disabled, with "Locked" badge) when editing existing records.
- `✔` **Backend Preservation**: Backend `PATCH` endpoint strictly retains the original record date even if request payloads contain today's date.
- `✔` **Optional Date Fields Safeguard**: Optional secondary date fields (e.g. `car_in_date`) remain blank until filled and are not falsely overwritten with today's date.

---

## 3. How to Run & Verify

Run from your terminal:
```bash
pnpm test
```
