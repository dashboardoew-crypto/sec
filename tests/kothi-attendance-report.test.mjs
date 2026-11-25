import test from 'node:test';
import assert from 'node:assert/strict';

// Helper logic mirroring the updated Kothi Attendance calculation
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

const formatDays = (days) => {
  if (Number.isInteger(days)) {
    return `${days} Days`;
  }
  return `${days.toFixed(1)} Days`;
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

    // Morning + Evening shift = 1 day (1.0)
    // Any single shift is there = 0.5 days
    let dayValue = 0;
    let dayLabel = '0 Days';
    let attendanceType = 'Incomplete';

    if (hasMorning && hasEvening) {
      dayValue = 1.0;
      dayLabel = '1.0 Day';
      attendanceType = 'Full Day (1.0)';
    } else if (hasMorning || hasEvening) {
      dayValue = 0.5;
      dayLabel = '0.5 Day';
      attendanceType = 'Half Day (0.5)';
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
      dayValue,
      dayLabel,
      attendanceType,
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

  // Person-wise aggregation: Total Days = 1.0 for (morning + evening), 0.5 for single shift
  const personMap = new Map();
  for (const rec of filtered) {
    const personName = rec.name || 'Unknown';
    let summary = personMap.get(personName);
    if (!summary) {
      summary = {
        name: personName,
        datesMap: new Map(),
        totalEntries: 0,
        firstDate: rec.date,
        lastDate: rec.date,
      };
      personMap.set(personName, summary);
    }

    summary.totalEntries += 1;
    if (rec.date) {
      if (!summary.firstDate || rec.date < summary.firstDate) summary.firstDate = rec.date;
      if (!summary.lastDate || rec.date > summary.lastDate) summary.lastDate = rec.date;

      let dateObj = summary.datesMap.get(rec.date);
      if (!dateObj) {
        dateObj = { hasMorning: false, hasEvening: false, minutes: 0 };
        summary.datesMap.set(rec.date, dateObj);
      }
      if (rec.hasMorning) dateObj.hasMorning = true;
      if (rec.hasEvening) dateObj.hasEvening = true;
      dateObj.minutes += rec.totalMinutes;
    }
  }

  const personSummaries = Array.from(personMap.values()).map((p) => {
    let fullDays = 0;
    let halfDays = 0;
    let totalMinutes = 0;

    for (const dObj of p.datesMap.values()) {
      totalMinutes += dObj.minutes;
      if (dObj.hasMorning && dObj.hasEvening) {
        fullDays += 1; // 1.0 day
      } else if (dObj.hasMorning || dObj.hasEvening) {
        halfDays += 1; // 0.5 day
      }
    }

    const totalDays = fullDays * 1.0 + halfDays * 0.5;

    return {
      name: p.name,
      totalDays, // Sum of 1.0 days + 0.5 days
      totalDaysFormatted: formatDays(totalDays),
      fullDays,
      halfDays,
      totalEntries: p.totalEntries,
      totalMinutes,
      totalHoursFormatted: formatDuration(totalMinutes),
      totalHours: Math.round((totalMinutes / 60) * 10) / 10,
      firstDate: p.firstDate,
      lastDate: p.lastDate,
    };
  });

  const totalDays = personSummaries.reduce((acc, p) => acc + p.totalDays, 0);
  const totalFullDays = personSummaries.reduce((acc, p) => acc + p.fullDays, 0);
  const totalHalfDays = personSummaries.reduce((acc, p) => acc + p.halfDays, 0);
  const totalMinutes = personSummaries.reduce((acc, p) => acc + p.totalMinutes, 0);

  return {
    records: filtered,
    personSummaries,
    overall: {
      totalRecords: filtered.length,
      uniquePersons: personSummaries.length,
      totalDays,
      totalDaysFormatted: formatDays(totalDays),
      totalFullDays,
      totalHalfDays,
      totalMinutes,
      totalHoursFormatted: formatDuration(totalMinutes),
    },
  };
};

test('Kothi Attendance: morning + evening shift = 1 day (1.0)', () => {
  const sample = [
    {
      date: '2026-11-20',
      name: 'Ramesh Mali',
      morning_in_time: '08:00',
      morning_out_time: '12:30',
      evening_in_time: '16:00',
      evening_out_time: '20:00',
    },
  ];

  const result = computeKothiAttendanceAnalytics(sample);
  assert.equal(result.records.length, 1);
  const rec = result.records[0];

  assert.equal(rec.dayValue, 1.0, 'Both shifts should equal 1.0 day');
  assert.equal(rec.dayLabel, '1.0 Day');
  assert.equal(rec.attendanceType, 'Full Day (1.0)');

  const ramesh = result.personSummaries[0];
  assert.equal(ramesh.totalDays, 1.0);
  assert.equal(ramesh.fullDays, 1);
  assert.equal(ramesh.halfDays, 0);
});

test('Kothi Attendance: single shift on any day = 0.5 days', () => {
  const sample = [
    // Morning only -> 0.5 days
    {
      date: '2026-11-20',
      name: 'Sunita Cook',
      morning_in_time: '08:00',
      morning_out_time: '12:00',
    },
    // Evening only -> 0.5 days
    {
      date: '2026-11-21',
      name: 'Sunita Cook',
      evening_in_time: '16:00',
      evening_out_time: '20:00',
    },
  ];

  const result = computeKothiAttendanceAnalytics(sample);
  assert.equal(result.records[0].dayValue, 0.5);
  assert.equal(result.records[0].dayLabel, '0.5 Day');
  assert.equal(result.records[1].dayValue, 0.5);
  assert.equal(result.records[1].dayLabel, '0.5 Day');

  const sunita = result.personSummaries[0];
  assert.equal(sunita.fullDays, 0);
  assert.equal(sunita.halfDays, 2);
  assert.equal(sunita.totalDays, 1.0, 'Two 0.5 days should total 1.0 day');
});

test('Kothi Attendance: combined calculation (morning + evening = 1 day, single shift = 0.5 days)', () => {
  const records = [
    // Ramesh:
    // Day 1 (Nov 18): Both shifts -> 1.0 day
    { date: '2026-11-18', name: 'Ramesh Mali', morning_in_time: '08:00', morning_out_time: '12:00', evening_in_time: '16:00', evening_out_time: '20:00' },
    // Day 2 (Nov 19): Both shifts -> 1.0 day
    { date: '2026-11-19', name: 'Ramesh Mali', morning_in_time: '08:00', morning_out_time: '12:00', evening_in_time: '16:00', evening_out_time: '20:00' },
    // Day 3 (Nov 20): Morning only -> 0.5 day
    { date: '2026-11-20', name: 'Ramesh Mali', morning_in_time: '08:00', morning_out_time: '12:00' },
    // Total for Ramesh = 1.0 + 1.0 + 0.5 = 2.5 days

    // Rajesh:
    // Day 1 (Nov 18): Evening only -> 0.5 day
    { date: '2026-11-18', name: 'Rajesh Helper', evening_in_time: '14:00', evening_out_time: '18:00' },
    // Day 2 (Nov 19): Morning only -> 0.5 day
    { date: '2026-11-19', name: 'Rajesh Helper', morning_in_time: '08:00', morning_out_time: '12:00' },
    // Total for Rajesh = 0.5 + 0.5 = 1.0 day
  ];

  const result = computeKothiAttendanceAnalytics(records);
  assert.equal(result.overall.uniquePersons, 2);
  assert.equal(result.overall.totalDays, 3.5); // 2.5 + 1.0 = 3.5
  assert.equal(result.overall.totalFullDays, 2);
  assert.equal(result.overall.totalHalfDays, 3);

  const ramesh = result.personSummaries.find((p) => p.name === 'Ramesh Mali');
  assert.equal(ramesh.fullDays, 2);
  assert.equal(ramesh.halfDays, 1);
  assert.equal(ramesh.totalDays, 2.5, 'Ramesh should have exactly 2.5 days');

  const rajesh = result.personSummaries.find((p) => p.name === 'Rajesh Helper');
  assert.equal(rajesh.fullDays, 0);
  assert.equal(rajesh.halfDays, 2);
  assert.equal(rajesh.totalDays, 1.0, 'Rajesh should have exactly 1.0 day');

  // Verify average time is not present in summary
  assert.equal(ramesh.avgMinutesPerDay, undefined);
  assert.equal(ramesh.avgHoursPerDay, undefined);
});

test('Kothi Attendance: filter by date range and person name', () => {
  const records = [
    { date: '2026-11-10', name: 'Ramesh Mali', morning_in_time: '08:00', morning_out_time: '12:00', evening_in_time: '16:00', evening_out_time: '20:00' },
    { date: '2026-11-15', name: 'Ramesh Mali', morning_in_time: '08:00', morning_out_time: '12:00' },
    { date: '2026-11-20', name: 'Ramesh Mali', evening_in_time: '16:00', evening_out_time: '20:00' },
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
  assert.equal(personResult.personSummaries[0].totalDays, 0.5, 'Single shift should equal 0.5 days');
});
