import { Router, type IRouter, type Request, type Response } from "express";
import { desc, eq, and, gte, lte, sql } from "drizzle-orm";
import nodemailer from "nodemailer";
import {
  db,
  breakdownsTable,
  backupSettingsTable,
  authUsersTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/authMiddleware";

const router: IRouter = Router();
router.use("/breakdowns", requireAuth);

let tableInitialized = false;
export const ensureBreakdownsTable = async () => {
  if (tableInitialized) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS breakdowns (
        id text PRIMARY KEY,
        register_slug text NOT NULL,
        tubewell_name text NOT NULL,
        date text NOT NULL,
        issue text NOT NULL,
        reported_by text,
        status text NOT NULL DEFAULT 'open',
        resolution_notes text,
        resolved_at timestamp with time zone,
        resolved_by text,
        email_sent boolean DEFAULT false,
        email_recipient text,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS breakdowns_slug_idx ON breakdowns (register_slug);
      CREATE INDEX IF NOT EXISTS breakdowns_date_idx ON breakdowns (date);
      ALTER TABLE backup_settings ADD COLUMN IF NOT EXISTS breakdown_alert_email text;
    `);
    tableInitialized = true;
  } catch (err) {
    console.error("Failed to ensure breakdowns table:", err);
  }
};

export const sendBreakdownAlertEmail = async (breakdown: {
  registerSlug: string;
  tubewellName: string;
  date: string;
  issue: string;
  reportedBy?: string | null;
}) => {
  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailAppPassword) {
    console.warn("Gmail is not configured in environment. Skipping email dispatch.");
    return { sent: false, recipient: null, error: "Gmail is not configured." };
  }

  // Find recipient email
  const settingsRows = await db
    .select()
    .from(backupSettingsTable)
    .limit(1);
  const settings = settingsRows[0] ?? null;

  let recipient = "";
  // 1. Dedicated breakdown alert recipient email
  if (settings?.breakdownAlertEmail && String(settings.breakdownAlertEmail).trim()) {
    recipient = String(settings.breakdownAlertEmail).trim();
  }
  // 2. Register-specific report & alert email
  if (!recipient) {
    const registerEmails = (settings?.registerEmails as Record<string, any>) ?? {};
    const regConfig = registerEmails[breakdown.registerSlug];
    if (regConfig && regConfig.email && regConfig.enabled !== false) {
      recipient = String(regConfig.email).trim();
    }
  }
  // 3. Fallback to system backup email
  if (!recipient && settings?.recipientEmail) {
    recipient = String(settings.recipientEmail).trim();
  }
  // 4. Fallback to first admin user email
  if (!recipient) {
    const adminUsers = await db
      .select({ email: authUsersTable.email })
      .from(authUsersTable)
      .where(eq(authUsersTable.role, "admin"))
      .limit(1);
    if (adminUsers[0]?.email) {
      recipient = adminUsers[0].email;
    }
  }

  if (!recipient) {
    return {
      sent: false,
      recipient: null,
      error: "No recipient email configured for breakdown alerts. Configure email in Admin Panel.",
    };
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailAppPassword },
  });

  const subject = `🚨 BREAKDOWN ALERT: ${breakdown.tubewellName} — ${breakdown.date}`;
  const nowIndiaStr = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
        .card { max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 14px; border: 1px solid #fee2e2; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(220, 38, 38, 0.12); }
        .banner { background: linear-gradient(135deg, #b91c1c 0%, #dc2626 100%); color: #ffffff; padding: 28px 24px; }
        .tag { display: inline-block; background: #ffffff; color: #b91c1c; font-weight: 800; font-size: 11px; padding: 4px 10px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; }
        .title { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
        .sub { margin: 6px 0 0; font-size: 13px; color: #fecaca; }
        .body { padding: 24px; }
        .grid-row { display: flex; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding: 12px 0; font-size: 14px; }
        .grid-label { color: #64748b; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
        .grid-val { color: #0f172a; font-weight: 600; }
        .alert-box { margin-top: 20px; background: #fef2f2; border: 1px solid #fecaca; border-left: 5px solid #dc2626; border-radius: 8px; padding: 18px; }
        .alert-heading { font-size: 12px; font-weight: 700; color: #991b1b; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; }
        .alert-desc { font-size: 15px; color: #7f1d1d; line-height: 1.6; white-space: pre-wrap; margin: 0; font-weight: 500; }
        .footer { padding: 16px 24px; background: #f8fafc; border-top: 1px solid #f1f5f9; font-size: 11px; color: #94a3b8; text-align: center; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="banner">
          <span class="tag">🚨 Incident Report</span>
          <h1 class="title">${breakdown.tubewellName}</h1>
          <p class="sub">A breakdown has been reported in the Watchroom ERP system.</p>
        </div>
        <div class="body">
          <div class="grid-row">
            <span class="grid-label">Tubewell / Meter Register</span>
            <span class="grid-val">${breakdown.tubewellName}</span>
          </div>
          <div class="grid-row">
            <span class="grid-label">Breakdown Date</span>
            <span class="grid-val">${breakdown.date}</span>
          </div>
          <div class="grid-row">
            <span class="grid-label">Reported By</span>
            <span class="grid-val">${breakdown.reportedBy || "Operations Security"}</span>
          </div>
          <div class="grid-row">
            <span class="grid-label">Dispatched At</span>
            <span class="grid-val">${nowIndiaStr} IST</span>
          </div>
          <div class="alert-box">
            <div class="alert-heading">Issue Description</div>
            <p class="alert-desc">${breakdown.issue}</p>
          </div>
        </div>
        <div class="footer">
          Watchroom ERP Security Operations • Automated Alert Notification
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: gmailUser,
      to: recipient,
      subject,
      html,
      text: `🚨 BREAKDOWN ALERT\n\nTubewell: ${breakdown.tubewellName}\nDate: ${breakdown.date}\nReported By: ${breakdown.reportedBy || "Security"}\nTime: ${nowIndiaStr} IST\n\nIssue Details:\n${breakdown.issue}\n\nImmediate maintenance review required.`,
    });
    return { sent: true, recipient };
  } catch (err: any) {
    console.error("Failed to send breakdown alert email:", err);
    return { sent: false, recipient, error: err?.message || "Email send failure" };
  }
};

// GET /breakdowns/email-config - get current breakdown alert email configuration
router.get("/breakdowns/email-config", async (_req: Request, res: Response) => {
  await ensureBreakdownsTable();
  const settingsRows = await db.select().from(backupSettingsTable).limit(1);
  const settings = settingsRows[0] ?? null;

  let fallbackEmail = "";
  if (settings?.recipientEmail) {
    fallbackEmail = settings.recipientEmail;
  } else {
    const adminUsers = await db
      .select({ email: authUsersTable.email })
      .from(authUsersTable)
      .where(eq(authUsersTable.role, "admin"))
      .limit(1);
    if (adminUsers[0]?.email) {
      fallbackEmail = adminUsers[0].email;
    }
  }

  const gmailUser = process.env.GMAIL_USER || "";
  const isGmailConfigured = Boolean(gmailUser && process.env.GMAIL_APP_PASSWORD);

  return res.json({
    breakdownAlertEmail: settings?.breakdownAlertEmail || "",
    fallbackEmail,
    effectiveEmail: settings?.breakdownAlertEmail || fallbackEmail || "",
    senderEmail: gmailUser,
    isGmailConfigured,
  });
});

// POST /breakdowns/email-config - save breakdown alert email
router.post("/breakdowns/email-config", async (req: Request, res: Response) => {
  await ensureBreakdownsTable();
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Only administrators can configure breakdown alert email destinations." });
  }

  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  const existing = await db.select().from(backupSettingsTable).limit(1);
  if (!existing[0]) {
    await db.insert(backupSettingsTable).values({
      id: "default",
      breakdownAlertEmail: email || null,
      updatedAt: new Date(),
    });
  } else {
    await db
      .update(backupSettingsTable)
      .set({
        breakdownAlertEmail: email || null,
        updatedAt: new Date(),
      })
      .where(eq(backupSettingsTable.id, existing[0].id));
  }

  return res.json({
    success: true,
    breakdownAlertEmail: email,
    message: email
      ? `Breakdown alerts will be sent to ${email}`
      : "Breakdown alert email cleared. System fallback email will be used.",
  });
});

// POST /breakdowns/test-email - send a test breakdown alert to verify setup
router.post("/breakdowns/test-email", async (req: Request, res: Response) => {
  await ensureBreakdownsTable();
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Only administrators can send test alerts." });
  }

  const result = await sendBreakdownAlertEmail({
    registerSlug: "mango-tree-meter",
    tubewellName: "Mango Tree Meter Reading (Tubewell 1) [TEST ALERT]",
    date: new Date().toISOString().slice(0, 10),
    issue: "This is a test breakdown alert dispatched from Watchroom ERP Admin Panel to verify email delivery.",
    reportedBy: req.user?.displayName || "System Administrator",
  });

  return res.json(result);
});

// GET /breakdowns - list all breakdowns with optional filtering
router.get("/breakdowns", async (req: Request, res: Response) => {
  await ensureBreakdownsTable();

  const registerSlug = typeof req.query.registerSlug === "string" ? req.query.registerSlug.trim() : "";
  const from = typeof req.query.from === "string" ? req.query.from.trim() : "";
  const to = typeof req.query.to === "string" ? req.query.to.trim() : "";
  const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
  const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";

  let query = db.select().from(breakdownsTable).$dynamic();
  const conditions = [];

  if (registerSlug && registerSlug !== "all") {
    conditions.push(eq(breakdownsTable.registerSlug, registerSlug));
  }
  if (from) {
    conditions.push(gte(breakdownsTable.date, from));
  }
  if (to) {
    conditions.push(lte(breakdownsTable.date, to));
  }
  if (status && status !== "all") {
    conditions.push(eq(breakdownsTable.status, status));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const rows = await query.orderBy(desc(breakdownsTable.date), desc(breakdownsTable.createdAt));

  const filtered = search
    ? rows.filter(
        (r) =>
          r.issue.toLowerCase().includes(search) ||
          r.tubewellName.toLowerCase().includes(search) ||
          (r.reportedBy && r.reportedBy.toLowerCase().includes(search)) ||
          (r.resolutionNotes && r.resolutionNotes.toLowerCase().includes(search)),
      )
    : rows;

  return res.json({ breakdowns: filtered, total: filtered.length });
});

// POST /breakdowns - create a new breakdown record and send alert email
router.post("/breakdowns", async (req: Request, res: Response) => {
  await ensureBreakdownsTable();

  const { registerSlug, tubewellName, date, issue } = req.body ?? {};
  if (!registerSlug || !tubewellName || !date || !issue) {
    return res.status(400).json({
      error: "Missing required fields: registerSlug, tubewellName, date, and issue are required.",
    });
  }

  const id = `brk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const reportedBy = (req.body.reportedBy ?? req.user?.displayName ?? req.user?.email ?? "Staff").trim();

  // 1. Send email alert
  const emailResult = await sendBreakdownAlertEmail({
    registerSlug: String(registerSlug).trim(),
    tubewellName: String(tubewellName).trim(),
    date: String(date).trim(),
    issue: String(issue).trim(),
    reportedBy,
  });

  // 2. Insert breakdown record
  const inserted = await db
    .insert(breakdownsTable)
    .values({
      id,
      registerSlug: String(registerSlug).trim(),
      tubewellName: String(tubewellName).trim(),
      date: String(date).trim(),
      issue: String(issue).trim(),
      reportedBy,
      status: "open",
      emailSent: emailResult.sent,
      emailRecipient: emailResult.recipient,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return res.status(201).json({
    breakdown: inserted[0],
    emailSent: emailResult.sent,
    emailRecipient: emailResult.recipient,
    emailError: emailResult.error,
  });
});

// PATCH /breakdowns/:id - update breakdown status, resolution notes, etc.
router.patch("/breakdowns/:id", async (req: Request, res: Response) => {
  await ensureBreakdownsTable();

  const id = String(req.params.id);
  const existing = await db
    .select()
    .from(breakdownsTable)
    .where(eq(breakdownsTable.id, id))
    .limit(1);

  if (!existing[0]) {
    return res.status(404).json({ error: "Breakdown record not found." });
  }

  const updateData: Partial<typeof breakdownsTable.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (typeof req.body.status === "string") {
    updateData.status = req.body.status;
    if (req.body.status === "resolved") {
      updateData.resolvedAt = new Date();
      updateData.resolvedBy = req.user?.displayName || "Admin";
    }
  }
  if (typeof req.body.resolutionNotes === "string") {
    updateData.resolutionNotes = req.body.resolutionNotes.trim();
  }
  if (typeof req.body.issue === "string") {
    updateData.issue = req.body.issue.trim();
  }
  if (typeof req.body.date === "string") {
    updateData.date = req.body.date.trim();
  }

  const updated = await db
    .update(breakdownsTable)
    .set(updateData)
    .where(eq(breakdownsTable.id, id))
    .returning();

  return res.json({ breakdown: updated[0] });
});

// DELETE /breakdowns/:id - delete breakdown record (admin / manager only)
router.delete("/breakdowns/:id", async (req: Request, res: Response) => {
  await ensureBreakdownsTable();

  if (!["admin", "manager"].includes(req.user?.role ?? "")) {
    return res.status(403).json({ error: "Only admins and managers can delete breakdown records." });
  }

  const id = String(req.params.id);
  await db.delete(breakdownsTable).where(eq(breakdownsTable.id, id));
  return res.json({ success: true, message: "Breakdown record deleted." });
});

// POST /breakdowns/:id/resend-email - resend alert email for a breakdown
router.post("/breakdowns/:id/resend-email", async (req: Request, res: Response) => {
  await ensureBreakdownsTable();

  const id = String(req.params.id);
  const existing = await db
    .select()
    .from(breakdownsTable)
    .where(eq(breakdownsTable.id, id))
    .limit(1);

  if (!existing[0]) {
    return res.status(404).json({ error: "Breakdown record not found." });
  }

  const record = existing[0];
  const emailResult = await sendBreakdownAlertEmail({
    registerSlug: record.registerSlug,
    tubewellName: record.tubewellName,
    date: record.date,
    issue: record.issue,
    reportedBy: record.reportedBy,
  });

  if (emailResult.sent) {
    await db
      .update(breakdownsTable)
      .set({
        emailSent: true,
        emailRecipient: emailResult.recipient,
        updatedAt: new Date(),
      })
      .where(eq(breakdownsTable.id, id));
  }

  return res.json({
    success: emailResult.sent,
    recipient: emailResult.recipient,
    error: emailResult.error,
  });
});

export default router;
