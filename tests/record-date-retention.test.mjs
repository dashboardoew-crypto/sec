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

  return raw;
};

// Mirror field locking logic
const isFieldLocked = ({ field, initial, role, isNameField }) => {
  if (!initial) return false;
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
const computeBackendUpdatedData = ({ existingRecord, payloadData }) => {
  const existingRecordDate = toInputDate(existingRecord.data?.date) ||
    toInputDate(existingRecord.recordDate) ||
    toInputDate(existingRecord.createdAt);
  const selectedDate = existingRecordDate;

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
