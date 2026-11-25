import test from 'node:test';
import assert from 'node:assert/strict';

// Helper logic mirroring the Kothi Attendance Report calculations
const parseTimeMinutes = (val) => {
  if (typeof val !== 'string' && typeof val !== 'number') return undefined;
  const str = String(val).trim();
  if (!str) return undefined;
  const match = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const ampm = match[3]?.toLowerCase();
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return hours * 60 + minutes;
    }
  }
  return undefined;
};

const formatDuration = (totalMinutes) => {
  if (!totalMinutes || totalMinutes <= 0) return '0m';
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

const normalizeToIsoDate = (dateVal) => {
  if (!dateVal) return '';
  const str = String(dateVal).trim();
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const dmyMatch = str.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
  return str.slice(0, 10);
};

const computeKothiAttendanceAnalytics = (records, filters = {}) => {
  const { filterMonth, filterPerson, filterFrom, filterTo, filterSearch } = filters;

  const processed = records.map((r, idx) => {
    const date = normalizeToIsoDate(r.date || '2026-11-01');
    const name = String(r.name || '').trim();
    const morningIn = String(r.morning_in_time || '').trim();
    const morningOut = String(r.morning_out_time || '').trim();
    const eveningIn = String(r.evening_in_time || '').trim();
    const eveningOut = String(r.evening_out_time || '').trim();
    const signOfSecurity = String(r.sign_of_security || '').trim();

    let morningMinutes = 0;
    const mIn = parseTimeMinutes(morningIn);
    const mOut = parseTimeMinutes(morningOut);
    const hasMorning = mIn !== undefined && mOut !== undefined;
    if (hasMorning) {
      morningMinutes = (mOut - mIn + 1440) % 1440;
    }

    let eveningMinutes = 0;
    const eIn = parseTimeMinutes(eveningIn);
    const eOut = parseTimeMinutes(eveningOut);
    const hasEvening = eIn !== undefined && eOut !== undefined;
    if (hasEvening) {
      eveningMinutes = (eOut - eIn + 1440) % 1440;
    }

    const totalMinutes = morningMinutes + eveningMinutes;

    let shiftStatus = 'Present';
    if (hasMorning && hasEvening) {
      shiftStatus = 'Both Shifts (Full Day)';
    } else if (hasMorning && !eIn && !eOut) {
      shiftStatus = 'Morning Only';
    } else if (hasEvening && !mIn && !mOut) {
      shiftStatus = 'Evening Only';
    } else if (mIn !== undefined && mOut === undefined) {
      shiftStatus = 'Morning Incomplete';
    } else if (eIn !== undefined && eOut === undefined) {
      shiftStatus = 'Evening Incomplete';
    } else if (totalMinutes === 0 && (morningIn || eveningIn)) {
      shiftStatus = 'Incomplete';
    }

    const monthKey = date.slice(0, 7);

    return {
      id: r.id || `rec-${idx}`,
      date,
      monthKey,
      name,
      morningInTime: morningIn,
      morningOutTime: morningOut,
      morningMinutes,
      morningDurationFormatted: formatDuration(morningMinutes),
      eveningInTime: eveningIn,
      eveningOutTime: eveningOut,
      eveningMinutes,
      eveningDurationFormatted: formatDuration(eveningMinutes),
      totalMinutes,
      totalHoursFormatted: formatDuration(totalMinutes),
      totalHours: Math.round((totalMinutes / 60) * 10) / 10,
      shiftStatus,
      signOfSecurity,
      hasMorning,
      hasEvening,
    };
  });

  const filtered = processed.filter((rec) => {
    if (filterMonth && filterMonth !== 'all' && rec.monthKey !== filterMonth) return false;
    if (filterPerson && filterPerson !== 'all' && rec.name.toLowerCase() !== filterPerson.toLowerCase()) return false;
    if (filterFrom && rec.date < filterFrom) return false;
    if (filterTo && rec.date > filterTo) return false;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      if (!rec.name.toLowerCase().includes(q) && !rec.date.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Person-wise aggregation (Day count of every person)
  const personMap = new Map();
  for (const rec of filtered) {
    const personName = rec.name || 'Unknown';
    let summary = personMap.get(personName);
    if (!summary) {
      summary = {
        name: personName,
        dates: new Set(),
        totalEntries: 0,
        morningShifts: 0,
        eveningShifts: 0,
        bothShiftsDates: new Set(),
        totalMinutes: 0,
        firstDate: rec.date,
        lastDate: rec.date,
      };
      personMap.set(personName, summary);
    }

    summary.totalEntries += 1;
    if (rec.date) {
      summary.dates.add(rec.date);
      if (!summary.firstDate || rec.date < summary.firstDate) summary.firstDate = rec.date;
      if (!summary.lastDate || rec.date > summary.lastDate) summary.lastDate = rec.date;
    }
    if (rec.hasMorning) summary.morningShifts += 1;
    if (rec.hasEvening) summary.eveningShifts += 1;
    if (rec.hasMorning && rec.hasEvening) summary.bothShiftsDates.add(rec.date);
    summary.totalMinutes += rec.totalMinutes;
  }

  const personSummaries = Array.from(personMap.values()).map((p) => {
    const totalDays = p.dates.size;
    const bothShifts = p.bothShiftsDates.size;
    const avgMinutes = totalDays > 0 ? Math.round(p.totalMinutes / totalDays) : 0;
    return {
      name: p.name,
      totalDays, // Day count of the person
      totalEntries: p.totalEntries,
      morningShifts: p.morningShifts,
      eveningShifts: p.eveningShifts,
      bothShifts,
      singleShiftDays: Math.max(0, totalDays - bothShifts),
      totalMinutes: p.totalMinutes,
      totalHoursFormatted: formatDuration(p.totalMinutes),
      totalHours: Math.round((p.totalMinutes / 60) * 10) / 10,
      avgHoursPerDayFormatted: formatDuration(avgMinutes),
      firstDate: p.firstDate,
      lastDate: p.lastDate,
    };
  });

  const totalPersonDays = personSummaries.reduce((acc, p) => acc + p.totalDays, 0);
  const totalMinutes = personSummaries.reduce((acc, p) => acc + p.totalMinutes, 0);

  return {
    records: filtered,
    personSummaries,
    overall: {
      totalRecords: filtered.length,
      uniquePersons: personSummaries.length,
      totalPersonDays,
      totalMinutes,
      totalHoursFormatted: formatDuration(totalMinutes),
    },
  };
};

test('Kothi Attendance: calculate shift durations accurately', () => {
  const sample = [
    {
      date: '2026-11-20',
      name: 'Ramesh Mali',
      morning_in_time: '08:00',
      morning_out_time: '12:30',
      evening_in_time: '16:00',
      evening_out_time: '20:00',
      sign_of_security: 'Guard Singh',
    },
  ];

  const result = computeKothiAttendanceAnalytics(sample);
  assert.equal(result.records.length, 1);
  const rec = result.records[0];

  assert.equal(rec.morningMinutes, 270); // 4h 30m
  assert.equal(rec.morningDurationFormatted, '4h 30m');
  assert.equal(rec.eveningMinutes, 240); // 4h
  assert.equal(rec.eveningDurationFormatted, '4h');
  assert.equal(rec.totalMinutes, 510); // 8h 30m
  assert.equal(rec.totalHoursFormatted, '8h 30m');
  assert.equal(rec.shiftStatus, 'Both Shifts (Full Day)');
});

test('Kothi Attendance: accurately compute distinct day count for every person', () => {
  const records = [
    // Ramesh: 3 distinct dates (Nov 18, 19, 20) with 4 entries
    { date: '2026-11-18', name: 'Ramesh Mali', morning_in_time: '08:00', morning_out_time: '12:00' },
    { date: '2026-11-19', name: 'Ramesh Mali', morning_in_time: '08:00', morning_out_time: '12:00' },
    { date: '2026-11-20', name: 'Ramesh Mali', morning_in_time: '08:00', morning_out_time: '12:00' },
    { date: '2026-11-20', name: 'Ramesh Mali', evening_in_time: '16:00', evening_out_time: '20:00' }, // same date entry

    // Sunita: 2 distinct dates (Nov 18, 20)
    { date: '2026-11-18', name: 'Sunita Cook', morning_in_time: '07:30', morning_out_time: '11:30' },
    { date: '2026-11-20', name: 'Sunita Cook', morning_in_time: '07:30', morning_out_time: '11:30' },

    // Rajesh: 1 date (Nov 19)
    { date: '2026-11-19', name: 'Rajesh Helper', evening_in_time: '14:00', evening_out_time: '18:00' },
  ];

  const result = computeKothiAttendanceAnalytics(records);
  assert.equal(result.overall.uniquePersons, 3);
  assert.equal(result.overall.totalPersonDays, 6); // 3 (Ramesh) + 2 (Sunita) + 1 (Rajesh) = 6

  const rameshSummary = result.personSummaries.find((p) => p.name === 'Ramesh Mali');
  assert.ok(rameshSummary);
  assert.equal(rameshSummary.totalDays, 3, 'Ramesh should have 3 distinct days attended');
  assert.equal(rameshSummary.totalEntries, 4);

  const sunitaSummary = result.personSummaries.find((p) => p.name === 'Sunita Cook');
  assert.ok(sunitaSummary);
  assert.equal(sunitaSummary.totalDays, 2, 'Sunita should have 2 distinct days attended');

  const rajeshSummary = result.personSummaries.find((p) => p.name === 'Rajesh Helper');
  assert.ok(rajeshSummary);
  assert.equal(rajeshSummary.totalDays, 1, 'Rajesh should have 1 distinct day attended');
});

test('Kothi Attendance: classify single shift vs full day shifts', () => {
  const records = [
    { date: '2026-11-21', name: 'Mohan Guard', morning_in_time: '08:00', morning_out_time: '14:00' },
    { date: '2026-11-21', name: 'Sohan Night', evening_in_time: '16:00', evening_out_time: '22:00' },
    { date: '2026-11-21', name: 'Geeta Cleaner', morning_in_time: '08:00', morning_out_time: '12:00', evening_in_time: '15:00', evening_out_time: '19:00' },
  ];

  const result = computeKothiAttendanceAnalytics(records);
  const mohan = result.records.find((r) => r.name === 'Mohan Guard');
  const sohan = result.records.find((r) => r.name === 'Sohan Night');
  const geeta = result.records.find((r) => r.name === 'Geeta Cleaner');

  assert.equal(mohan.shiftStatus, 'Morning Only');
  assert.equal(sohan.shiftStatus, 'Evening Only');
  assert.equal(geeta.shiftStatus, 'Both Shifts (Full Day)');
});

test('Kothi Attendance: filter by date range and person name', () => {
  const records = [
    { date: '2026-11-10', name: 'Ramesh Mali', morning_in_time: '08:00', morning_out_time: '12:00' },
    { date: '2026-11-15', name: 'Ramesh Mali', morning_in_time: '08:00', morning_out_time: '12:00' },
    { date: '2026-11-20', name: 'Ramesh Mali', morning_in_time: '08:00', morning_out_time: '12:00' },
    { date: '2026-11-15', name: 'Sunita Cook', morning_in_time: '08:00', morning_out_time: '12:00' },
  ];

  // Filter date range 2026-11-12 to 2026-11-18
  const rangeResult = computeKothiAttendanceAnalytics(records, {
    filterFrom: '2026-11-12',
    filterTo: '2026-11-18',
  });
  assert.equal(rangeResult.records.length, 2);

  // Filter person Sunita Cook
  const personResult = computeKothiAttendanceAnalytics(records, {
    filterPerson: 'Sunita Cook',
  });
  assert.equal(personResult.records.length, 1);
  assert.equal(personResult.personSummaries[0].name, 'Sunita Cook');
  assert.equal(personResult.personSummaries[0].totalDays, 1);
});
