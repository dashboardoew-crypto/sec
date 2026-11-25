import test from 'node:test';
import assert from 'node:assert/strict';

const isBlankValue = (val) => val === undefined || val === null || String(val).trim() === '';

/**
 * Validation function mirroring the driver attendance active session logic
 * enforced in RecordDialog and backend POST / PATCH endpoints.
 */
const validateDriverAttendanceCreation = ({ driverName, existingRecords }) => {
  const cleanName = String(driverName ?? '').trim().toLowerCase();
  if (!cleanName) return { allowed: false, error: 'Driver name is required' };

  const activeRecord = existingRecords.find((rec) => {
    const recDriver = String(rec.data?.name ?? rec.data?.driver_name ?? '').trim().toLowerCase();
    return recDriver === cleanName && isBlankValue(rec.data?.out_time);
  });

  if (activeRecord) {
    const inDate = activeRecord.data?.date_of_in_time || activeRecord.data?.date || activeRecord.recordDate || 'previous shift';
    const inTime = activeRecord.data?.in_time ? ` at ${activeRecord.data.in_time}` : '';
    return {
      allowed: false,
      error: `Driver "${driverName}" already has an active attendance session without punch-out (punched in${inTime} on ${inDate}). They must punch out before a new attendance can be recorded.`,
      activeRecord,
    };
  }

  return { allowed: true };
};

const validateDriverAttendanceUpdate = ({ recordId, driverName, outTime, existingRecords }) => {
  const cleanName = String(driverName ?? '').trim().toLowerCase();
  const isOutTimeBlank = isBlankValue(outTime);

  // If keeping or updating an attendance with blank out-time, check for any OTHER active attendance
  if (cleanName && isOutTimeBlank) {
    const activeOther = existingRecords.find((rec) => {
      if (rec.id === recordId) return false;
      const recDriver = String(rec.data?.name ?? rec.data?.driver_name ?? '').trim().toLowerCase();
      return recDriver === cleanName && isBlankValue(rec.data?.out_time);
    });

    if (activeOther) {
      return {
        allowed: false,
        error: `Driver "${driverName}" already has another active attendance session without punch-out.`,
      };
    }
  }

  return { allowed: true };
};

test('Blocks new attendance on same date if driver has not punched out', () => {
  const existingRecords = [
    {
      id: 'att-1',
      recordDate: '2026-11-20',
      data: {
        name: 'Ramesh Kumar',
        date: '2026-11-20',
        in_time: '08:30',
        out_time: '',
      },
    },
  ];

  const result = validateDriverAttendanceCreation({
    driverName: 'Ramesh Kumar',
    existingRecords,
  });

  assert.equal(result.allowed, false);
  assert.match(result.error, /already has an active attendance session without punch-out/);
});

test('Blocks new attendance on different date (e.g. 20 Nov) if driver is still punched in from 18 Nov', () => {
  const existingRecords = [
    {
      id: 'att-1',
      recordDate: '2026-11-18',
      data: {
        name: 'Ramesh Kumar',
        date: '2026-11-18',
        in_time: '09:00',
        out_time: '',
      },
    },
  ];

  const result = validateDriverAttendanceCreation({
    driverName: 'Ramesh Kumar',
    existingRecords,
  });

  assert.equal(result.allowed, false);
  assert.match(result.error, /2026-11-18/);
  assert.match(result.error, /09:00/);
});

test('Allows new attendance once the driver has clocked out (out_time recorded)', () => {
  const existingRecords = [
    {
      id: 'att-1',
      recordDate: '2026-11-18',
      data: {
        name: 'Ramesh Kumar',
        date: '2026-11-18',
        in_time: '09:00',
        out_time: '18:00', // Clocked out
      },
    },
  ];

  const result = validateDriverAttendanceCreation({
    driverName: 'Ramesh Kumar',
    existingRecords,
  });

  assert.equal(result.allowed, true);
});

test('Allows attendance creation for a different driver when another driver is active', () => {
  const existingRecords = [
    {
      id: 'att-1',
      recordDate: '2026-11-20',
      data: {
        name: 'Ramesh Kumar',
        date: '2026-11-20',
        in_time: '08:30',
        out_time: '',
      },
    },
  ];

  const result = validateDriverAttendanceCreation({
    driverName: 'Suresh Singh',
    existingRecords,
  });

  assert.equal(result.allowed, true);
});

test('Allows editing an existing active attendance to record punch-out time', () => {
  const existingRecords = [
    {
      id: 'att-1',
      recordDate: '2026-11-18',
      data: {
        name: 'Ramesh Kumar',
        date: '2026-11-18',
        in_time: '09:00',
        out_time: '',
      },
    },
  ];

  // User edits att-1 to enter out_time
  const result = validateDriverAttendanceUpdate({
    recordId: 'att-1',
    driverName: 'Ramesh Kumar',
    outTime: '17:45',
    existingRecords,
  });

  assert.equal(result.allowed, true);
});
