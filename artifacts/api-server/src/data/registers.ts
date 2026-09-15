export type RegisterModule = "security" | "main-gate" | "master";
export type FieldType = "text" | "number" | "date" | "time" | "select" | "textarea" | "checkbox";

export type FieldDefinition = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  derived?: boolean;
  options?: string[];
};

export type RegisterDefinition = {
  slug: string;
  title: string;
  module: RegisterModule;
  description: string;
  fields: FieldDefinition[];
};

const keyFor = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "") || "field";

const fieldType = (label: string): FieldType => {
  const value = label.toLowerCase();
  if (value.includes("date")) return "date";
  if (value.includes("time")) return "time";
  if (/(amount|quantity|count|reading|number|minutes|wages|km|water|code|mobile)/.test(value)) return "number";
  if (/(remark|particular|address|purpose|location|station)/.test(value)) return "textarea";
  return "text";
};

const makeFields = (labels: string[]): FieldDefinition[] =>
  labels
    .filter((label) => label.trim() && label.toLowerCase() !== "id")
    .map((label) => ({
      key: keyFor(label),
      label: label.trim(),
      type: fieldType(label),
      required: !/(sign|remark|status|final|in-time|out-time|time|date)/i.test(label),
      derived: /(total|minutes consumed|per minute|time duration|total hours|time taken|fetched phone)/i.test(label),
    }));

const register = (
  slug: string,
  title: string,
  module: RegisterModule,
  labels: string[],
  description: string,
): RegisterDefinition => ({
  slug,
  title,
  module,
  description,
  fields: makeFields(labels),
});

const meterFields: FieldDefinition[] = [
  { key: "on_time", label: "ON TIME", type: "time", required: true },
  { key: "off_time", label: "OFF TIME", type: "time", required: true, derived: true },
  { key: "office_initial", label: "OFFICE INITIAL", type: "number", required: true },
  { key: "office_final", label: "OFFICE FINAL", type: "number", required: true },
  { key: "kothi_initial", label: "KOTHI INITIAL", type: "number", required: true },
  { key: "kothi_final", label: "KOTHI FINAL", type: "number", required: true },
  { key: "minutes_consumed", label: "MINUTES CONSUMED", type: "number", derived: true },
  { key: "total_water_consumed", label: "TOTAL WATER CONSUMED", type: "number", derived: true },
  { key: "per_minute_water_consumed", label: "PER MINUTE WATER CONSUMED", type: "number", derived: true },
];

const keyMovementFields: FieldDefinition[] = [
  { key: "name", label: "NAME", type: "text", required: true },
  { key: "key_out_time", label: "KEY OUT TIME", type: "time", required: true },
  { key: "key_return", label: "KEY RETURN", type: "time" },
  { key: "location", label: "LOCATION", type: "text" },
];

const solarPanelCleaningFields: FieldDefinition[] = [
  { key: "date", label: "DATE", type: "date", required: true },
  { key: "name", label: "NAME", type: "text", required: true },
  { key: "in_time", label: "IN-TIME", type: "time", required: true },
  { key: "out_time", label: "OUT-TIME", type: "time" },
  { key: "yard", label: "YARD", type: "text" },
  { key: "canopy_zone_i", label: "CANOPY ZONE I", type: "text" },
  { key: "foundry_zone_ii", label: "FOUNDRY ZONE II", type: "text" },
  { key: "machine_shop_iii", label: "MACHINE SHOP III", type: "text" },
  { key: "remark", label: "REMARK", type: "textarea" },
];

const serviceBillFields: FieldDefinition[] = [
  { key: "date", label: "DATE", type: "date", required: true },
  { key: "party_name", label: "PARTY NAME", type: "text", required: true },
  { key: "invoice_number", label: "INVOICE NUMBER", type: "text", required: true },
  { key: "invoice_date", label: "INVOICE DATE", type: "date", required: true },
];

const jackRegisterFields: FieldDefinition[] = [
  { key: "date", label: "DATE", type: "date", required: true },
  { key: "name_of_party", label: "NAME OF PARTY", type: "text", required: true },
  { key: "challan_no", label: "CHALLAN NO.", type: "text", required: true },
  { key: "challan_date", label: "CHALLAN DATE", type: "date", required: true },
];

const driverMasterFields: FieldDefinition[] = [
  { key: "name", label: "NAME", type: "text", required: true },
  { key: "code", label: "CODE", type: "number", required: true },
  { key: "mobile_no", label: "MOBILE NO", type: "number", required: true },
  { key: "license_no", label: "LICENSE NO", type: "text", required: true },
  { key: "address", label: "ADDRESS", type: "textarea" },
];

const securityMasterFields: FieldDefinition[] = [
  { key: "name", label: "NAME", type: "text", required: true },
  { key: "code", label: "CODE", type: "number", required: true },
  { key: "mobile_no", label: "MOBILE NO", type: "number", required: true },
  { key: "department", label: "DEPARTMENT", type: "text", required: true },
  { key: "shift", label: "SHIFT", type: "text" },
  { key: "address", label: "ADDRESS", type: "textarea" },
];

export const REGISTER_DEFINITIONS: RegisterDefinition[] = [
  { ...register("mango-tree-meter", "Mango Tree Meter Reading", "security", [], "Track irrigation meter readings and water usage."), fields: meterFields },
  { ...register("clinic-gate-meter", "Clinic Gate Meter Reading", "security", [], "Track clinic gate irrigation and meter usage."), fields: meterFields },
  { ...register("key-movement", "Key Movement Register", "security", [], "Record who takes keys, where they go, and when the keys return."), fields: keyMovementFields },
  register("chowk-labour", "Chowk Labour", "security", ["NAME", "DATE", "MORNING IN", "MORNING OUT", "EVENING IN", "EVENING OUT", "TIME DURATION", "WORK LOCATION", "payment status"], "Track chowk labour attendance and payment status."),
  register("daily-attendance", "Daily Attendance Log", "security", ["LABOUR NAME", "DATE", "MORNING IN", "MORNING OUT", "EVENING IN", "EVENING OUT", "TOTAL HOURS", "payment status", "Overtime payment status"], "Track daily labour attendance, hours, and payments."),
  { ...register("solar-panel-cleaning", "Solar Panel Cleaning Record", "security", [], "Record cleaning work across solar panel zones."), fields: solarPanelCleaningFields },
  register("driver-schedule", "Driver Daily Schedule", "security", ["CHOOSEN DRIVER", "DATE", "SCHEDULE TIME", "CAR NAME", "FETCHED PHONE", "LOCATION", "Print Batch"], "Schedule drivers and vehicles for daily assignments."),
  { ...register("service-bill", "Service Bill Entry", "security", [], "Record service bills and invoice details."), fields: serviceBillFields },
  { ...register("jack-register", "Jack Register OEW", "security", [], "Track jack issue and challan records."), fields: jackRegisterFields },
  register("labour-master", "Labour Master", "master", ["NAME", "FATHER NAME", "ADDRESS", "WORK LOCATION", "WAGES PER DAY"], "Maintain the labour directory and daily wage rates."),
  { ...register("driver-master", "Driver Master", "master", [], "Maintain the driver directory for HR and management."), fields: driverMasterFields },
  { ...register("security-master", "Security Master", "master", [], "Maintain the security staff directory for HR and management."), fields: securityMasterFields },
  register("personal-gate-pass", "Personal Gate Pass Register", "main-gate", ["Date", "Name", "Code", "Dept Name", "Out-Time", "In-Time", "Sign of Security"], "Manage personal movement through the main gate."),
  register("official-gate-pass", "Official Gate Pass Register", "main-gate", ["Date", "Name", "Department", "Out Time", "In Time", "Station", "Signature"], "Record official staff and work-related gate movements."),
  register("outgoing-vehicles", "Outgoing Vehicles Register", "main-gate", ["Date", "Driver Name", "Car Name", "Out Time", "Location", "Initial Reading", "Final Reading", "Total KM Car Run", "In Time", "Name of the Person in Car", "Signature"], "Track outgoing vehicles, trips, and odometer readings."),
  register("visitor-record", "Visitor Record Register", "main-gate", ["Date", "Name of Visitor", "Location of Visitor", "Mobile no", "Purpose", "Whom to Meet", "In-Time", "Out-Time", "Sign of Security"], "Maintain the visitor log and visit purpose."),
  register("kothi-attendance", "Kothi Attendance Register", "main-gate", ["Date", "Name", "Morning In-Time", "Morning out-Time", "Evening In-Time", "Evening Out-Time", "Sign of Security"], "Track household attendance across morning and evening shifts."),
  register("outgoing-vehicle-log", "Outgoing Vehicle Log", "main-gate", ["Date", "Driver Name", "Car Name", "Out Time", "Station", "Initial reading", "Final reading", "Total km car run", "In Time", "Name of the Person in Car", "Sign"], "Track secondary outgoing vehicle records."),
  register("contractor-gate-pass", "Contractor Personal Gate Pass", "main-gate", ["Date", "Name", "Department", "Code", "Out Time", "In Time", "Security sign"], "Manage contractor and personal gate pass movements."),
  register("guest-food", "Guest Food Register", "main-gate", ["Date", "Name", "Count Guest", "Add", "Breakfast", "Lunch", "Dinner", "Sign"], "Record guest meal requirements for the kitchen."),
  register("jain-food-service", "Jain Food Service Register", "main-gate", ["Date", "Name", "Count Guest", "Add", "Breakfast", "Lunch", "Dinner", "Sign"], "Record Jain food service requirements."),
  register("unit-2-gate-pass", "Unit 2 Gate Pass Register", "main-gate", ["Date", "Name", "Department", "Out Time from unit 1", "IN Time in unit 2", "Out Time from unit 2", "In Time in unit 1", "security sign", "time taken to travel from unit1 to 2", "time taken to travel from unit 2 to 1"], "Track Unit 1 to Unit 2 movements and travel times."),
  register("driver-attendance", "Driver Attendance Record", "main-gate", ["Date", "Name", "In-Time", "Out-Time", "Station", "Station Out Time", "Station In Date", "Station In Time", "Sign", "Payment Status", "Day Allowance", "Night Allowance"], "Track driver attendance, station movements, and allowances."),
];

export const getRegister = (slug: string) => REGISTER_DEFINITIONS.find((item) => item.slug === slug);

export const sampleRecords: Array<{ registerSlug: string; recordDate: string; data: Record<string, unknown> }> = [
  { registerSlug: "mango-tree-meter", recordDate: "2026-08-21", data: { date: "2026-08-21", on_time: "08:42", off_time: "12:37", office_initial: 570739, office_final: 571115, kothi_initial: 21290086, kothi_final: 21317326 } },
  { registerSlug: "clinic-gate-meter", recordDate: "2026-08-14", data: { date: "2026-08-14", on_time: "08:48", off_time: "11:15", office_initial: 439119, office_final: 439355, kothi_initial: 23924354, kothi_final: 23964678 } },
  { registerSlug: "key-movement", recordDate: "2026-07-31", data: { date: "2026-07-31", name: "Sanjay", key_out_time: "06:18", key_return: "08:05", location: "Workshop" } },
  { registerSlug: "daily-attendance", recordDate: "2026-08-01", data: { labour_name: "ASHWANI KUMAR", date: "2026-08-01", morning_in: "08:00", morning_out: "13:00", evening_in: "14:00", evening_out: "19:05", payment_status: "Paid" } },
  { registerSlug: "driver-schedule", recordDate: "2026-07-27", data: { choosen_driver: "JASPAL", date: "2026-07-27", schedule_time: "09:00", car_name: "Hyrdere, Cng", location: "Company" } },
  { registerSlug: "official-gate-pass", recordDate: "2026-09-11", data: { date: "2026-09-11", name: "Subhash Rai", department: "Office", out_time: "11:37", in_time: "12:20", station: "Kumar Mall", signature: "Security" } },
  { registerSlug: "visitor-record", recordDate: "2026-09-10", data: { date: "2026-09-10", name_of_visitor: "Hari Shankar", location_of_visitor: "cont. YNR", mobile_no: "9896360744", purpose: "official", whom_to_meet: "Sanjeev sir", in_time: "09:30", out_time: "10:15", sign_of_security: "security" } },
  { registerSlug: "unit-2-gate-pass", recordDate: "2026-09-14", data: { date: "2026-09-14", name: "Yash", department: "IT", out_time_from_unit_1: "03:45", in_time_in_unit_2: "04:00", out_time_from_unit_2: "04:30", in_time_in_unit_1: "05:00", security_sign: "Y" } },
];