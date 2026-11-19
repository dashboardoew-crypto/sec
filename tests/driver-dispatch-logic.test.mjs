import test from 'node:test';
import assert from 'node:assert/strict';

// Evaluates driver availability for Outgoing Vehicle dispatch
const filterAvailableDrivers = ({
  presentDrivers = [],
  activeTrips = new Map(),
  loggedOutDrivers = [],
  editingDriverName = null,
}) => {
  const loggedOutSet = new Set(loggedOutDrivers.map((d) => d.toLowerCase()));

  // Active drivers who are not already logged out
  const activeAttending = presentDrivers.filter((d) => !loggedOutSet.has(d.toLowerCase()));

  // Drivers currently out of office on an open trip
  const busyDrivers = activeAttending
    .filter((d) => {
      const key = d.toLowerCase();
      if (editingDriverName && editingDriverName.toLowerCase() === key) {
        return false; // allow keeping current driver on edit
      }
      return activeTrips.has(key);
    })
    .map((d) => ({
      driverName: d,
      ...activeTrips.get(d.toLowerCase()),
    }));

  // Available drivers: attending, not logged out, and not on an open trip
  const availableDrivers = activeAttending.filter((d) => {
    const key = d.toLowerCase();
    if (editingDriverName && editingDriverName.toLowerCase() === key) {
      return true;
    }
    return !activeTrips.has(key);
  });

  return {
    availableDrivers,
    busyDrivers,
  };
};

test('Filters out drivers currently on an active trip from vehicle dispatch', () => {
  const present = ['AJAY KUMAR', 'MANOJ KUMAR', 'RAMESH'];
  const activeTrips = new Map([
    ['manoj kumar', { station: 'Unit 2', carName: 'Innova', outTime: '10:00' }],
  ]);

  const { availableDrivers, busyDrivers } = filterAvailableDrivers({
    presentDrivers: present,
    activeTrips,
    loggedOutDrivers: [],
  });

  assert.deepStrictEqual(availableDrivers, ['AJAY KUMAR', 'RAMESH']);
  assert.strictEqual(busyDrivers.length, 1);
  assert.strictEqual(busyDrivers[0].driverName, 'MANOJ KUMAR');
  assert.strictEqual(busyDrivers[0].station, 'Unit 2');
});

test('Filters out drivers who have clocked out for the day', () => {
  const present = ['AJAY KUMAR', 'RAMESH'];
  const loggedOut = ['RAMESH'];

  const { availableDrivers } = filterAvailableDrivers({
    presentDrivers: present,
    activeTrips: new Map(),
    loggedOutDrivers: loggedOut,
  });

  assert.deepStrictEqual(availableDrivers, ['AJAY KUMAR']);
});

test('Allows retaining the existing driver when editing a record', () => {
  const present = ['AJAY KUMAR', 'MANOJ KUMAR'];
  const activeTrips = new Map([
    ['manoj kumar', { station: 'Local', carName: 'Bolero', outTime: '11:00' }],
  ]);

  const { availableDrivers } = filterAvailableDrivers({
    presentDrivers: present,
    activeTrips,
    loggedOutDrivers: [],
    editingDriverName: 'MANOJ KUMAR',
  });

  assert.ok(availableDrivers.includes('MANOJ KUMAR'), 'Editing driver should remain selectable');
});
