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

const standardDateField: FieldDefinition = {
  key: "date",
  label: "DATE",
  type: "date",
  required: true,
};

const withStandardDateField = (fields: FieldDefinition[]) =>
  fields.some((field) => field.key === standardDateField.key)
    ? fields
    : [standardDateField, ...fields];

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

type RegisterFieldOptions = {
  required?: string[];
  optional?: string[];
};

const labelMatches = (label: string, configuredLabels: string[] | undefined) =>
  configuredLabels?.some((configuredLabel) => configuredLabel.toLowerCase() === label.toLowerCase()) ?? false;

const makeFields = (labels: string[], options: RegisterFieldOptions = {}): FieldDefinition[] =>
  labels
    .filter((label) => label.trim() && label.toLowerCase() !== "id")
    .map((label) => {
      const explicitlyRequired = labelMatches(label, options.required);
      const explicitlyOptional = labelMatches(label, options.optional);
      return {
        key: keyFor(label),
        label: label.trim(),
        type: fieldType(label),
        required: explicitlyRequired || (!explicitlyOptional && !/(sign|remark|status|final|in-time|out-time|time|date)/i.test(label)),
        derived: /(total|minutes consumed|per minute|time duration|total hours|time taken|fetched phone)/i.test(label),
      };
    });

const register = (
  slug: string,
  title: string,
  module: RegisterModule,
  labels: string[],
  description: string,
  options: RegisterFieldOptions = {},
): RegisterDefinition => ({
  slug,
  title,
  module,
  description,
  fields: makeFields(labels, options),
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
  { key: "location", label: "LOCATION", type: "select", required: true },
  { key: "key_out_time", label: "KEY OUT TIME", type: "time", required: true },
  { key: "key_return", label: "KEY RETURN", type: "time" },
];

const kothiAttendanceFields: FieldDefinition[] = [
  { key: "date", label: "DATE", type: "date", required: true },
  { key: "name", label: "NAME", type: "select", required: true },
  { key: "morning_in_time", label: "MORNING IN-TIME", type: "time" },
  { key: "morning_out_time", label: "MORNING OUT-TIME", type: "time" },
  { key: "evening_in_time", label: "EVENING IN-TIME", type: "time" },
  { key: "evening_out_time", label: "EVENING OUT-TIME", type: "time" },
  { key: "sign_of_security", label: "SIGN OF SECURITY", type: "text" },
];

const attendanceTimeFields: FieldDefinition[] = [
  { key: "shift", label: "SHIFT", type: "select", required: true, options: ["Morning", "Evening"] },
  { key: "morning_in", label: "MORNING IN", type: "time" },
  { key: "morning_out", label: "MORNING OUT", type: "time" },
  { key: "evening_in", label: "EVENING IN", type: "time" },
  { key: "evening_out", label: "EVENING OUT", type: "time" },
  { key: "total_hours", label: "TOTAL HOURS", type: "text", derived: true },
  { key: "total_days", label: "TOTAL DAYS", type: "text", derived: true },
  { key: "overtime", label: "OVERTIME", type: "text", derived: true },
];

const trainingFields: FieldDefinition[] = [
  { key: "labour_name", label: "LABOUR NAME", type: "text", required: true },
  ...attendanceTimeFields,
];

const chowkLabourFields: FieldDefinition[] = [
  { key: "name", label: "NAME", type: "text", required: true },
  ...attendanceTimeFields,
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
  { key: "type_of_payment", label: "TYPE OF PAYMENT", type: "text", required: true },
  { key: "quantity", label: "QUANTITY", type: "number", required: true },
  { key: "particulars", label: "PARTICULARS", type: "textarea", required: true },
  { key: "amount", label: "AMOUNT", type: "number", required: true },
];

const jackRegisterFields: FieldDefinition[] = [
  { key: "date", label: "DATE", type: "date", required: true },
  { key: "name_of_party", label: "NAME OF PARTY", type: "text", required: true },
  { key: "challan_no", label: "CHALLAN NO.", type: "text", required: true },
  { key: "challan_date", label: "CHALLAN DATE", type: "date", required: true },
];

const driverMasterFields: FieldDefinition[] = [
  { key: "name", label: "NAME", type: "text", required: true },
  { key: "mobile_no", label: "MOBILE NO", type: "number", required: true },
  { key: "wages_per_day", label: "WAGES PER DAY", type: "number", required: true },
  { key: "day_allowance", label: "DAY ALLOWANCE", type: "number", required: true },
  { key: "night_allowance", label: "NIGHT ALLOWANCE", type: "number", required: true },
];

const securityMasterFields: FieldDefinition[] = [
  { key: "name", label: "NAME", type: "text", required: true },
  { key: "mobile_no", label: "MOBILE NO", type: "number", required: true },
];

const driverAttendanceFields: FieldDefinition[] = [
  { key: "name", label: "NAME", type: "select", required: true },
  { key: "in_time", label: "IN-TIME", type: "time", required: true },
  { key: "out_time", label: "OUT-TIME", type: "time" },
  { key: "station", label: "STATION", type: "select", options: ["Yes", "No"] },
  { key: "station_name", label: "STATION NAME", type: "text" },
  { key: "station_out_time", label: "STATION OUT-TIME", type: "time" },
  { key: "station_in_time", label: "STATION IN-TIME", type: "time" },
  { key: "station_in_date", label: "STATION IN DATE", type: "date" },
  { key: "total_days", label: "TOTAL DAYS", type: "number", derived: true },
  { key: "sign", label: "SIGN", type: "text" },
  { key: "day_allowance_applicable", label: "DAY ALLOWANCE", type: "select", options: ["Yes", "No"] },
  { key: "day_allowance", label: "DA", type: "number" },
  { key: "night_allowance_applicable", label: "NIGHT ALLOWANCE", type: "select", options: ["Yes", "No"] },
  { key: "night_allowance", label: "NA", type: "number" },
];

const nameMasterFields: FieldDefinition[] = [
  { key: "name", label: "NAME", type: "text", required: true },
];

const keyMasterFields: FieldDefinition[] = [
  { key: "location", label: "LOCATION", type: "text", required: true },
];

const labourMasterFields: FieldDefinition[] = [
  { key: "name", label: "NAME", type: "text", required: true },
  { key: "father_name", label: "FATHER NAME", type: "text", required: true },
  { key: "work_location", label: "WORK LOCATION", type: "text", required: true },
  { key: "wages_per_day", label: "WAGES PER DAY", type: "number", required: true },
  { key: "overtime_wages_per_hours", label: "OVERTIME WAGES PER HOURS", type: "text" },
];

const chowkLabourMasterFields: FieldDefinition[] = [
  { key: "wages_per_day", label: "CHOWK LABOUR WAGES PER DAY", type: "number", required: true },
  { key: "overtime_wages_per_hours", label: "CHOWK LABOUR OVERTIME WAGES PER HOURS", type: "text", required: true },
];

const driverBackedFieldKeys = new Set(["name", "driver_name", "choosen_driver"]);
const securitySignField = (field: FieldDefinition) => /sign/i.test(`${field.key} ${field.label}`);

export const REGISTER_DEFINITIONS: RegisterDefinition[] = [
  { ...register("mango-tree-meter", "Mango Tree Meter Reading", "security", [], "Track irrigation meter readings and water usage."), fields: meterFields },
  { ...register("clinic-gate-meter", "Clinic Gate Meter Reading", "security", [], "Track clinic gate irrigation and meter usage."), fields: meterFields },
  { ...register("key-movement", "Key Movement Register", "security", [], "Record who takes keys, where they go, and when the keys return."), fields: keyMovementFields },
  { ...register("chowk-labour", "Chowk Labour", "security", [], "Track daily chowk labour attendance. Names are entered per record and are not stored in Labour Master."), fields: chowkLabourFields },
   { ...register("daily-attendance", "Training Register", "security", [], "Track labour training attendance, hours, and overtime."), fields: trainingFields },
  { ...register("solar-panel-cleaning", "Solar Panel Cleaning Record", "security", [], "Record cleaning work across solar panel zones."), fields: solarPanelCleaningFields },
  register("driver-schedule", "Driver Daily Schedule", "security", ["CHOOSEN DRIVER", "DATE", "SCHEDULE TIME", "CAR NAME", "FETCHED PHONE", "LOCATION", "Print Batch"], "Schedule drivers and vehicles for daily assignments.", { optional: ["FETCHED PHONE", "Print Batch"] }),
  { ...register("service-bill", "Service Bill Entry", "security", [], "Record service bills and invoice details."), fields: serviceBillFields },
  { ...register("jack-register", "Jack Register OEW", "security", [], "Track jack issue and challan records."), fields: jackRegisterFields },
  { ...register("labour-master", "Labour Master", "master", [], "Maintain the labour directory, daily wage rates, and each person’s overtime rate. Enter the overtime rate as text, for example 150 or ₹150/hour."), fields: labourMasterFields },
  { ...register("chowk-labour-master", "Chowk Labour Master", "master", [], "Set the single daily wage and overtime rate shared by every Chowk Labour attendance record. Enter overtime as text, for example 150 or ₹150/hour."), fields: chowkLabourMasterFields },
  { ...register("driver-master", "Driver Master", "master", [], "Maintain the driver directory for HR and management."), fields: driverMasterFields },
  { ...register("security-master", "Security Master", "master", [], "Maintain the security staff directory for HR and management."), fields: securityMasterFields },
  { ...register("key-master", "Key Master", "master", [], "Maintain the locations available in Key Movement Register."), fields: keyMasterFields },
  { ...register("kothi-master", "Kothi Master", "master", [], "Maintain the names available in Kothi Attendance Register."), fields: nameMasterFields },
  register("personal-gate-pass", "Personal Gate Pass Register", "main-gate", ["Date", "Name", "Code", "Dept Name", "Out-Time", "In-Time", "Sign of Security"], "Manage personal movement through the main gate."),
  register("official-gate-pass", "Official Gate Pass Register", "main-gate", ["Date", "Name", "Department", "Out Time", "In Time", "Station", "Signature"], "Record official staff and work-related gate movements."),
  register("outgoing-vehicles", "Outgoing Vehicles Register", "main-gate", ["Date", "Driver Name", "Car Name", "Out Time", "Location", "Initial Reading", "Final Reading", "Total KM Car Run", "In Time", "Name of the Person in Car", "Signature"], "Track outgoing vehicles, trips, and odometer readings.", { optional: ["Total KM Car Run"] }),
  register("visitor-record", "Visitor Record Register", "main-gate", ["Date", "Name of Visitor", "Location of Visitor", "Mobile no", "Purpose", "Whom to Meet", "In-Time", "Out-Time", "Sign of Security"], "Maintain the visitor log and visit purpose."),
  { ...register("kothi-attendance", "Kothi Attendance Register", "main-gate", [], "Track household attendance across morning and evening shifts."), fields: kothiAttendanceFields },
  register("outgoing-vehicle-log", "Outgoing Vehicle Log", "main-gate", ["Date", "Driver Name", "Car Name", "Out Time", "Station", "Initial reading", "Final reading", "Total km car run", "In Time", "Name of the Person in Car", "Sign"], "Track secondary outgoing vehicle records.", { optional: ["Total km car run"] }),
   register("contractor-gate-pass", "Contractor Personal Gate Pass", "main-gate", ["Date", "Name", "Department", "Code", "Out Time", "In Time", "Security sign"], "Manage contractor and personal gate pass movements.", { required: ["Out Time"] }),
   register("guest-food", "Guest Food Register", "main-gate", ["Date", "Name", "Count Guest", "Add", "Breakfast", "Lunch", "Dinner", "Sign"], "Record guest meal requirements for the kitchen.", { optional: ["Add", "Breakfast", "Lunch", "Dinner", "Sign"] }),
   register("jain-food-service", "Jain Food Service Register", "main-gate", ["Date", "Name", "Count Guest", "Add", "Breakfast", "Lunch", "Dinner", "Sign"], "Record Jain food service requirements.", { optional: ["Add", "Breakfast", "Lunch", "Dinner", "Sign"] }),
  register("unit-2-gate-pass", "Unit 2 Gate Pass Register", "main-gate", ["Date", "Name", "Department", "Out Time from unit 1", "IN Time in unit 2", "Out Time from unit 2", "In Time in unit 1", "security sign", "time taken to travel from unit1 to 2", "time taken to travel from unit 2 to 1"], "Track Unit 1 to Unit 2 movements and travel times."),
    { ...register("driver-attendance", "Driver Attendance Record", "main-gate", [], "Track driver attendance, station movements, and allowances."), fields: driverAttendanceFields },
 ].map((definition) => ({
   ...definition,
   fields: withStandardDateField(definition.fields).map((field) => {
     const driverField = (
       (definition.slug === "driver-attendance" && field.key === "name") ||
       (["outgoing-vehicles", "outgoing-vehicle-log", "driver-schedule"].includes(definition.slug) && driverBackedFieldKeys.has(field.key))
     );
     const securityField = definition.module === "main-gate" && securitySignField(field);
     return driverField || securityField ? { ...field, type: "select" } : field;
   }),
 }));

export const getRegister = (slug: string) => REGISTER_DEFINITIONS.find((item) => item.slug === slug);

export const sampleRecords: Array<{ registerSlug: string; recordDate: string; data: Record<string, unknown> }> = [
  { registerSlug: "mango-tree-meter", recordDate: "2026-08-21", data: { date: "2026-08-21", on_time: "08:42", off_time: "12:37", office_initial: 570739, office_final: 571115, kothi_initial: 21290086, kothi_final: 21317326 } },
  { registerSlug: "clinic-gate-meter", recordDate: "2026-08-14", data: { date: "2026-08-14", on_time: "08:48", off_time: "11:15", office_initial: 439119, office_final: 439355, kothi_initial: 23924354, kothi_final: 23964678 } },
  { registerSlug: "key-movement", recordDate: "2026-07-31", data: { location: "Workshop", key_out_time: "06:18", key_return: "08:05" } },
  { registerSlug: "daily-attendance", recordDate: "2026-08-01", data: { labour_name: "ASHWANI KUMAR", date: "2026-08-01", morning_in: "08:00", morning_out: "13:00", evening_in: "14:00", evening_out: "19:05" } },
  { registerSlug: "driver-schedule", recordDate: "2026-07-27", data: { choosen_driver: "JASPAL", date: "2026-07-27", schedule_time: "09:00", car_name: "Hyrdere, Cng", location: "Company" } },
  { registerSlug: "official-gate-pass", recordDate: "2026-09-11", data: { date: "2026-09-11", name: "Subhash Rai", department: "Office", out_time: "11:37", in_time: "12:20", station: "Kumar Mall", signature: "Security" } },
  { registerSlug: "visitor-record", recordDate: "2026-09-10", data: { date: "2026-09-10", name_of_visitor: "Hari Shankar", location_of_visitor: "cont. YNR", mobile_no: "9896360744", purpose: "official", whom_to_meet: "Sanjeev sir", in_time: "09:30", out_time: "10:15", sign_of_security: "security" } },
  { registerSlug: "unit-2-gate-pass", recordDate: "2026-09-14", data: { date: "2026-09-14", name: "Yash", department: "IT", out_time_from_unit_1: "03:45", in_time_in_unit_2: "04:00", out_time_from_unit_2: "04:30", in_time_in_unit_1: "05:00", security_sign: "Y" } },
];