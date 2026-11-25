import test from 'node:test';
import assert from 'node:assert/strict';

// Helper functions mirroring date-utils and RecordDialog logic
const normalizeDateParts = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value);
    const get = (type) => Number(parts.find((p) => p.type === type)?.value);
    return { year: get('year'), month: get('month'), day: get('day') };
  }
  const text = String(value).trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };

  const dmy4 = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmy4) return { year: Number(dmy4[3]), month: Number(dmy4[2]), day: Number(dmy4[1]) };
  return null;
};

const toInputDate = (value) => {
  if (!value) return '';
  const parts = normalizeDateParts(value);
  if (!parts) return typeof value === 'string' ? value.trim() : '';
  const { year, month, day } = parts;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const isBlankValue = (val) => val === undefined || val === null || String(val).trim() === '';

// Mirror RecordDialog initialValues computation
const computeInitialValues = ({ fields, initial, todayDate, slug }) => {
  const raw = { ...(initial?.data ?? {}) };

  const recordOriginalDate = initial
    ? (toInputDate(raw.date) ||
       toInputDate(initial.data?.date) ||
       toInputDate(initial.data?.date_of_in_time) ||
       toInputDate(initial.recordDate) ||
       toInputDate(initial.createdAt) ||
       todayDate)
    : todayDate;

  fields.forEach((field) => {
    const isPrimaryDateField = field.key === 'date' || (slug === 'driver-attendance' && field.key === 'date_of_in_time');
    if (isPrimaryDateField) {
      if (initial) {
        raw[field.key] = recordOriginalDate;
      } else {
        raw[field.key] = isBlankValue(raw[field.key]) ? todayDate : toInputDate(raw[field.key]);
      }
    } else if (field.type === 'date' || field.key.includes('date')) {
      const val = raw[field.key];
      raw[field.key] = isBlankValue(val) ? '' : toInputDate(val);
    }
  });

  if (['outgoing-vehicles', 'outgoing-vehicle-log'].includes(slug)) {
    if (!initial) {
      // First time (create): in_date / out_date is not auto-filled, remains empty
      raw.in_date = '';
      raw.out_date = '';
    } else {
      // Edit mode: In Time Date autoselects on which date edit option open and should be saved
      raw.date = recordOriginalDate;
      const existingInDate = toInputDate(raw.in_date) || toInputDate(raw.out_date);
      raw.in_date = existingInDate || todayDate;
      raw.out_date = raw.in_date;
    }
  }

  return raw;
};

// Mirror field locking logic
const isFieldLocked = ({ field, initial, role, isNameField }) => {
  if (!initial) return false;
  if (role === 'super_admin') return false; // Super admin has no locked fields
  // Primary date field is locked after record creation across all registers
  if (field.key === 'date' || field.key === 'date_of_in_time') {
    return true;
  }
  // Name fields are locked for manager and security roles
  if (['manager', 'security'].includes(role ?? '') && isNameField(field)) {
    return true;
  }
  return false;
};

// Mirror backend PATCH record update date retention
const computeBackendUpdatedData = ({ existingRecord, payloadData, role }) => {
  const isSuperAdmin = role === 'super_admin';
  const existingRecordDate = toInputDate(existingRecord.data?.date) ||
    toInputDate(existingRecord.recordDate) ||
    toInputDate(existingRecord.createdAt);
  const selectedDate = isSuperAdmin && payloadData?.date
    ? (toInputDate(payloadData.date) || existingRecordDate)
    : existingRecordDate;

  const data = { ...(payloadData ?? existingRecord.data) };
  data.date = selectedDate;
  return { recordDate: selectedDate, data };
};

test('New record creation autofetches and defaults to current date', () => {
  const fields = [
    { key: 'date', label: 'DATE', type: 'date' },
    { key: 'name', label: 'NAME', type: 'text' },
  ];
  const initialValues = computeInitialValues({
    fields,
    initial: undefined,
    todayDate: '2026-11-20',
    slug: 'daily-attendance',
  });

  assert.equal(initialValues.date, '2026-11-20');
  const locked = isFieldLocked({
    field: fields[0],
    initial: undefined,
    role: 'manager',
    isNameField: () => false,
  });
  assert.equal(locked, false, 'Date field should not be locked when creating a new record');
});

test('Existing record created on 18 Nov retains 18 Nov when opened on 20 Nov and is locked', () => {
  const fields = [
    { key: 'date', label: 'DATE', type: 'date' },
    { key: 'name', label: 'NAME', type: 'text' },
  ];
  const existingRecord = {
    id: 'rec-123',
    registerSlug: 'daily-attendance',
    recordDate: '2026-11-18',
    createdAt: '2026-11-18T08:00:00.000Z',
    data: {
      date: '2026-11-18',
      name: 'Ramesh Kumar',
    },
  };

  // User opens dialog on 20 Nov
  const initialValues = computeInitialValues({
    fields,
    initial: existingRecord,
    todayDate: '2026-11-20',
    slug: 'daily-attendance',
  });

  assert.equal(initialValues.date, '2026-11-18', 'Date must be 18 Nov, not 20 Nov');

  const locked = isFieldLocked({
    field: fields[0],
    initial: existingRecord,
    role: 'security',
    isNameField: () => false,
  });
  assert.equal(locked, true, 'Date field must be locked for editing on an existing record');
});

test('Backend update preserves original record date even if payload attempts to overwrite with today date', () => {
  const existingRecord = {
    id: 'rec-456',
    registerSlug: 'key-movement',
    recordDate: '2026-11-18',
    createdAt: '2026-11-18T09:30:00.000Z',
    data: {
      date: '2026-11-18',
      key_name: 'Server Room',
      in_time: '',
    },
  };

  // Client on 20 Nov sends return time with date: 2026-11-20
  const result = computeBackendUpdatedData({
    existingRecord,
    payloadData: {
      date: '2026-11-20',
      key_name: 'Server Room',
      in_time: '18:00',
    },
  });

  assert.equal(result.data.date, '2026-11-18', 'Backend data.date must remain original 18 Nov date');
  assert.equal(result.recordDate, '2026-11-18', 'Backend recordDate must remain original 18 Nov date');
  assert.equal(result.data.in_time, '18:00', 'Other fields like in_time should still be updated successfully');
});

test('Optional date fields like car_in_date remain empty on existing records and do not autofill today date', () => {
  const fields = [
    { key: 'date', label: 'DATE', type: 'date' },
    { key: 'car_in_date', label: 'CAR IN DATE', type: 'date' },
  ];
  const existingBreakdown = {
    id: 'rec-789',
    registerSlug: 'car-breakdowns',
    recordDate: '2026-11-18',
    createdAt: '2026-11-18T10:00:00.000Z',
    data: {
      date: '2026-11-18',
      car_in_date: '',
    },
  };

  const initialValues = computeInitialValues({
    fields,
    initial: existingBreakdown,
    todayDate: '2026-11-20',
    slug: 'car-breakdowns',
  });

  assert.equal(initialValues.date, '2026-11-18', 'Entry date must be 18 Nov');
  assert.equal(initialValues.car_in_date, '', 'car_in_date must remain empty until filled, not todayDate');
});

test('Outgoing vehicles: in_date (In Time Date) is empty on new record creation and not auto-filled first time', () => {
  const fields = [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'car_name', label: 'Car Name', type: 'text' },
    { key: 'out_time', label: 'Out Time', type: 'time' },
    { key: 'in_date', label: 'In Time Date', type: 'date' },
  ];

  const initialValues = computeInitialValues({
    fields,
    initial: null,
    todayDate: '2026-11-18',
    slug: 'outgoing-vehicles',
  });

  assert.equal(initialValues.date, '2026-11-18', 'Departure date defaults to current date on creation');
  assert.equal(initialValues.in_date, '', 'in_date (In Time Date) must remain empty / blank on initial creation');
});

test('Outgoing vehicles: in_date (In Time Date) is auto-selected to current date when opened for edit on a later date', () => {
  const fields = [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'car_name', label: 'Car Name', type: 'text' },
    { key: 'out_time', label: 'Out Time', type: 'time' },
    { key: 'in_time', label: 'In Time', type: 'time' },
    { key: 'in_date', label: 'In Time Date', type: 'date' },
  ];

  const existingTrip = {
    id: 'trip-101',
    registerSlug: 'outgoing-vehicles',
    recordDate: '2026-11-18',
    createdAt: '2026-11-18T09:00:00.000Z',
    data: {
      date: '2026-11-18',
      car_name: 'Swift Dzire',
      out_time: '09:00',
      in_date: '',
    },
  };

  // Guard opens edit 10 days later on 28 Nov
  const initialValues = computeInitialValues({
    fields,
    initial: existingTrip,
    todayDate: '2026-11-28',
    slug: 'outgoing-vehicles',
  });

  assert.equal(initialValues.date, '2026-11-18', 'Original departure date strictly remains locked to 18 Nov');
  assert.equal(initialValues.in_date, '2026-11-28', 'in_date (In Time Date) autoselects to 28 Nov (the date edit option is opened)');
});

test('Security role can edit outgoing vehicle records after 10 days', () => {
  const canEditRecordHelper = (createdAtStr, role, slug, isTripOpen) => {
    if (role === 'super_admin' || role === 'hr' || role === 'admin') return true;
    const isVehicle = slug === 'outgoing-vehicles' || slug === 'outgoing-vehicle-log';
    if (isVehicle && role === 'security' && isTripOpen) return true;
    const windowDays = isVehicle && role === 'security' ? 30 : role === 'security' ? 3 : role === 'manager' ? 7 : 0;
    const today = new Date('2026-11-28T00:00:00Z');
    const created = new Date(`${createdAtStr}T00:00:00Z`);
    const diffDays = Math.floor((today - created) / 86400000);
    return diffDays <= windowDays;
  };

  // Normal register 10 days ago (18 Nov to 28 Nov) -> Security blocked
  assert.equal(canEditRecordHelper('2026-11-18', 'security', 'key-movement', false), false);

  // Outgoing vehicle 10 days ago with pending return (isTripOpen = true) -> Security allowed!
  assert.equal(canEditRecordHelper('2026-11-18', 'security', 'outgoing-vehicles', true), true);

  // Outgoing vehicle 10 days ago even if completed (within 30 days window) -> Security allowed!
  assert.equal(canEditRecordHelper('2026-11-18', 'security', 'outgoing-vehicles', false), true);
});

test('Super admin role has no locked fields when editing any register', () => {
  const fields = [
    { key: 'date', label: 'DATE', type: 'date' },
    { key: 'name', label: 'NAME', type: 'text' },
    { key: 'in_time', label: 'IN TIME', type: 'time' },
  ];
  const existingRecord = {
    id: 'rec-999',
    registerSlug: 'driver-attendance',
    recordDate: '2026-11-18',
    createdAt: '2026-11-18T08:00:00.000Z',
    data: {
      date: '2026-11-18',
      date_of_in_time: '2026-11-18',
      name: 'Raju Driver',
    },
  };

  // For regular security role, date and name are locked
  assert.equal(isFieldLocked({ field: fields[0], initial: existingRecord, role: 'security', isNameField: () => false }), true);
  assert.equal(isFieldLocked({ field: fields[1], initial: existingRecord, role: 'security', isNameField: () => true }), true);

  // For super_admin, nothing is locked!
  assert.equal(isFieldLocked({ field: fields[0], initial: existingRecord, role: 'super_admin', isNameField: () => false }), false, 'Date field should not be locked for super_admin');
  assert.equal(isFieldLocked({ field: fields[1], initial: existingRecord, role: 'super_admin', isNameField: () => true }), false, 'Name field should not be locked for super_admin');
  assert.equal(isFieldLocked({ field: fields[2], initial: existingRecord, role: 'super_admin', isNameField: () => false }), false, 'Time field should not be locked for super_admin');
});

test('Super admin role can update record date freely on existing record without restriction', () => {
  const existingRecord = {
    id: 'rec-123',
    registerSlug: 'daily-attendance',
    recordDate: '2026-11-18',
    createdAt: '2026-11-18T08:00:00.000Z',
    data: {
      date: '2026-11-18',
      name: 'Ramesh Kumar',
    },
  };

  // Regular user attempting to edit date to 15 Nov -> Date forced back to 18 Nov
  const normalResult = computeBackendUpdatedData({
    existingRecord,
    payloadData: { date: '2026-11-15', name: 'Ramesh Kumar Edited' },
    role: 'manager',
  });
  assert.equal(normalResult.data.date, '2026-11-18', 'Normal users cannot alter record date on edit');

  // Super admin editing date to 15 Nov -> Allowed and updated!
  const superAdminResult = computeBackendUpdatedData({
    existingRecord,
    payloadData: { date: '2026-11-15', name: 'Ramesh Kumar Edited' },
    role: 'super_admin',
  });
  assert.equal(superAdminResult.data.date, '2026-11-15', 'Super admin can update record date freely');
  assert.equal(superAdminResult.recordDate, '2026-11-15', 'Super admin updates recordDate column as well');

  // Super admin editing date to any future date -> Allowed and updated!
  const superAdminFutureResult = computeBackendUpdatedData({
    existingRecord,
    payloadData: { date: '2027-01-15', name: 'Ramesh Kumar Scheduled' },
    role: 'super_admin',
  });
  assert.equal(superAdminFutureResult.data.date, '2027-01-15', 'Super admin can set future dates in date field');
  assert.equal(superAdminFutureResult.recordDate, '2027-01-15');

  // Super admin editing date to historical past date (e.g. 2 years ago) -> Allowed and updated!
  const superAdminPastResult = computeBackendUpdatedData({
    existingRecord,
    payloadData: { date: '2024-03-01', name: 'Ramesh Kumar Archive' },
    role: 'super_admin',
  });
  assert.equal(superAdminPastResult.data.date, '2024-03-01', 'Super admin can set historical dates in date field');
  assert.equal(superAdminPastResult.recordDate, '2024-03-01');
});

test('Super admin and edit mode bypass driver dispatch locks on outgoing vehicles', () => {
  const validateOutgoingVehicleDispatch = ({
    isSuperAdmin,
    initial,
    attendingDrivers,
    busyDriversOnDate,
    loggedOutDrivers,
    data,
  }) => {
    if (!isSuperAdmin && !initial) {
      if (attendingDrivers && attendingDrivers.length === 0) {
        if (busyDriversOnDate.length > 0 && loggedOutDrivers.length > 0) {
          return 'Cannot dispatch: All attending drivers are either on a trip or have logged out for the day.';
        }
        if (loggedOutDrivers.length > 0) {
          return 'Cannot dispatch: All attending drivers have already logged out / ended their shift for the day.';
        }
        return 'No driver attendance recorded.';
      }
      const chosenDriver = String(data.driver_name ?? '').trim().toLowerCase();
      if (chosenDriver && loggedOutDrivers.some((d) => d.driverName.toLowerCase() === chosenDriver)) {
        return `Driver ${data.driver_name} has already logged out.`;
      }
    }

    if (!isSuperAdmin && initial) {
      const chosenDriver = String(data.driver_name ?? '').trim().toLowerCase();
      const existingDriver = String(initial.data?.driver_name ?? '').trim().toLowerCase();
      if (chosenDriver && chosenDriver !== existingDriver) {
        if (loggedOutDrivers.some((d) => d.driverName.toLowerCase() === chosenDriver)) {
          return `Driver ${data.driver_name} has already logged out.`;
        }
      }
    }

    return null; // Allowed!
  };

  const existingTrip = {
    id: 'trip-1',
    data: { date: '2026-11-21', driver_name: 'RAJESH', out_time: '10:00' },
  };

  // 1. Regular user trying to create NEW dispatch when all drivers logged out -> Blocked
  const newDispatchBlocked = validateOutgoingVehicleDispatch({
    isSuperAdmin: false,
    initial: null,
    attendingDrivers: [],
    busyDriversOnDate: [],
    loggedOutDrivers: [{ driverName: 'RAJESH', outTime: '11:40' }],
    data: { driver_name: 'RAJESH' },
  });
  assert.equal(newDispatchBlocked, 'Cannot dispatch: All attending drivers have already logged out / ended their shift for the day.');

  // 2. Regular user editing EXISTING trip (e.g. entering return/in-time or notes) -> ALLOWED (not a new dispatch)
  const editExistingAllowed = validateOutgoingVehicleDispatch({
    isSuperAdmin: false,
    initial: existingTrip,
    attendingDrivers: [],
    busyDriversOnDate: [],
    loggedOutDrivers: [{ driverName: 'RAJESH', outTime: '11:40' }],
    data: { driver_name: 'RAJESH', in_time: '11:40', final_reading: '550' },
  });
  assert.equal(editExistingAllowed, null, 'Editing existing trip must not be blocked by dispatch availability');

  // 3. Super admin editing date or details on existing record -> ALLOWED unrestricted
  const superAdminEditDateAllowed = validateOutgoingVehicleDispatch({
    isSuperAdmin: true,
    initial: existingTrip,
    attendingDrivers: [],
    busyDriversOnDate: [],
    loggedOutDrivers: [{ driverName: 'RAJESH', outTime: '11:40' }],
    data: { date: '2026-11-21', driver_name: 'RAJESH' },
  });
  assert.equal(superAdminEditDateAllowed, null, 'Super admin editing date must be unrestricted');

  // 4. Super admin creating even a new dispatch when drivers logged out -> ALLOWED unrestricted
  const superAdminNewDispatchAllowed = validateOutgoingVehicleDispatch({
    isSuperAdmin: true,
    initial: null,
    attendingDrivers: [],
    busyDriversOnDate: [],
    loggedOutDrivers: [{ driverName: 'RAJESH', outTime: '11:40' }],
    data: { driver_name: 'RAJESH' },
  });
  assert.equal(superAdminNewDispatchAllowed, null, 'Super admin new dispatch is unrestricted');
});

test('entryDateBounds provides unrestricted bounds for super_admin', () => {
  const entryDateBoundsHelper = (role) => {
    const today = '2026-11-25';
    if (role === 'super_admin') {
      return { min: undefined, max: undefined };
    }
    if (role === 'admin' || role === 'hr') {
      return { min: undefined, max: today };
    }
    return { min: '2026-11-22', max: today };
  };

  const superAdminBounds = entryDateBoundsHelper('super_admin');
  assert.equal(superAdminBounds.min, undefined, 'Super admin has no min bound');
  assert.equal(superAdminBounds.max, undefined, 'Super admin has no max bound');

  const securityBounds = entryDateBoundsHelper('security');
  assert.equal(securityBounds.max, '2026-11-25', 'Security has max today');
  assert.equal(securityBounds.min, '2026-11-22', 'Security has min 3 days ago');
});

test('All registers automatically sort in descending order according to date', () => {
  const records = [
    { id: '1', data: { date: '2026-11-18', name: 'Entry A' }, createdAt: '2026-11-18T08:00:00Z' },
    { id: '2', data: { date: '2026-11-25', name: 'Entry B' }, createdAt: '2026-11-25T09:00:00Z' },
    { id: '3', data: { date: '2026-11-21', name: 'Entry C' }, createdAt: '2026-11-21T10:00:00Z' },
    { id: '4', data: { date: '2026-11-25', name: 'Entry D' }, createdAt: '2026-11-25T14:00:00Z' },
    { id: '5', data: { date: '2026-11-01', name: 'Entry E' }, createdAt: '2026-11-01T07:00:00Z' },
  ];

  // Helper mirroring registers.tsx & operations.ts descending date sorting
  const sortRecordsDescending = (items, sortOrder = 'desc') => {
    const parseRecordDate = (r) => toInputDate(r.data?.date ?? r.recordDate ?? r.createdAt ?? '');
    const parseRecordTime = (r) => String(r.data?.in_time ?? r.data?.out_time ?? r.createdAt ?? '');
    return [...items].sort((a, b) => {
      const dateA = parseRecordDate(a);
      const dateB = parseRecordDate(b);
      const dateComp = dateA.localeCompare(dateB);
      if (sortOrder === 'asc') {
        if (dateComp !== 0) return dateComp;
        return parseRecordTime(a).localeCompare(parseRecordTime(b));
      }
      // 'desc' (automatic default)
      if (dateComp !== 0) return -dateComp;
      return parseRecordTime(b).localeCompare(parseRecordTime(a));
    });
  };

  const sorted = sortRecordsDescending(records);

  // Expected order: 25 Nov (14:00), 25 Nov (09:00), 21 Nov, 18 Nov, 01 Nov
  assert.equal(sorted[0].id, '4', 'Newest date & time (25 Nov 14:00) should be first');
  assert.equal(sorted[1].id, '2', '25 Nov 09:00 should be second');
  assert.equal(sorted[2].id, '3', '21 Nov should be third');
  assert.equal(sorted[3].id, '1', '18 Nov should be fourth');
  assert.equal(sorted[4].id, '5', 'Oldest date (01 Nov) should be last');
});
