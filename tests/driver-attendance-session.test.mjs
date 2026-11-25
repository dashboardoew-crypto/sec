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

const validateDriverAttendanceUpdate = ({ recordId, driverName, outTime, existingRecords, activeVehicleTrips }) => {
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

  // If entering out_time, check if driver is currently outside on an incomplete outgoing vehicle trip
  if (cleanName && !isOutTimeBlank && activeVehicleTrips) {
    const blockingTrip = activeVehicleTrips.find((rec) => {
      const tripDriver = String(rec.data?.driver_name ?? rec.data?.driver ?? '').trim().toLowerCase();
      if (tripDriver !== cleanName) return false;
      const hasOutTime = !isBlankValue(rec.data?.out_time);
      const hasInTime = !isBlankValue(rec.data?.in_time);
      const hasFinal = !isBlankValue(rec.data?.final_reading);
      return hasOutTime && (!hasInTime || !hasFinal);
    });

    if (blockingTrip) {
      const carName = blockingTrip.data?.car_name || blockingTrip.data?.vehicle_name || 'vehicle';
      return {
        allowed: false,
        error: `Cannot enter out-time: Driver "${driverName}" is currently outside the company with ${carName}. The outgoing vehicle entry is not fully filled (In-Time and Final Reading missing). Please complete that entry first.`,
        incompleteRecordId: blockingTrip.id,
        renderUrl: `/registers/outgoing-vehicles?highlightRecord=${blockingTrip.id}`,
        rowColor: 'purple',
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

test('Blocks out-time in driver attendance if driver is currently outside on an incomplete outgoing vehicle trip', () => {
  const existingRecords = [
    {
      id: 'att-1',
      recordDate: '2026-11-25',
      data: {
        name: 'Mohan Sharma',
        date: '2026-11-25',
        in_time: '08:00',
        out_time: '',
      },
    },
  ];

  const activeVehicleTrips = [
    {
      id: 'trip-99',
      registerSlug: 'outgoing-vehicles',
      recordDate: '2026-11-25',
      data: {
        driver_name: 'Mohan Sharma',
        car_name: 'Innova DL-10-AB-1234',
        out_time: '10:30',
        in_time: '', // Trip return not entered yet!
        initial_reading: '45000',
        final_reading: '', // Trip return reading not entered!
      },
    },
  ];

  const result = validateDriverAttendanceUpdate({
    recordId: 'att-1',
    driverName: 'Mohan Sharma',
    outTime: '18:00',
    existingRecords,
    activeVehicleTrips,
  });

  assert.equal(result.allowed, false);
  assert.match(result.error, /currently outside the company with Innova DL-10-AB-1234/);
  assert.match(result.error, /outgoing vehicle entry is not fully filled/);
  assert.equal(result.incompleteRecordId, 'trip-99');
  assert.equal(result.renderUrl, '/registers/outgoing-vehicles?highlightRecord=trip-99');
  assert.equal(result.rowColor, 'purple');
});

test('Allows out-time once outgoing vehicle in_time and final_reading are completed', () => {
  const existingRecords = [
    {
      id: 'att-1',
      recordDate: '2026-11-25',
      data: {
        name: 'Mohan Sharma',
        date: '2026-11-25',
        in_time: '08:00',
        out_time: '',
      },
    },
  ];

  // Return has been fully entered now
  const activeVehicleTrips = [
    {
      id: 'trip-99',
      registerSlug: 'outgoing-vehicles',
      recordDate: '2026-11-25',
      data: {
        driver_name: 'Mohan Sharma',
        car_name: 'Innova DL-10-AB-1234',
        out_time: '10:30',
        in_time: '17:15', // In-time recorded!
        initial_reading: '45000',
        final_reading: '45120', // Final reading recorded!
      },
    },
  ];

  const result = validateDriverAttendanceUpdate({
    recordId: 'att-1',
    driverName: 'Mohan Sharma',
    outTime: '18:00',
    existingRecords,
    activeVehicleTrips,
  });

  assert.equal(result.allowed, true);
});
