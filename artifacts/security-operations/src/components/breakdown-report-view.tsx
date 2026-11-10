import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { downloadCsv, indiaDateKey } from '@/lib/date-utils';

export type BreakdownRecord = {
  id: string;
  registerSlug: string;
  tubewellName: string;
  date: string;
  issue: string;
  reportedBy: string | null;
  status: 'open' | 'resolved';
  resolutionNotes: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  emailSent: boolean;
  emailRecipient: string | null;
  createdAt: string;
  updatedAt: string;
};

const TUBEWELL_OPTIONS = [
  { slug: 'mango-tree-meter', title: 'Mango Tree Meter Reading (Tubewell 1)' },
  { slug: 'clinic-gate-meter', title: 'Clinic Gate Meter Reading (Tube Well 2)' },
];

export function BreakdownReportView({
  onBreakdownCountChange,
}: {
  onBreakdownCountChange?: (openCount: number) => void;
}) {
  const { user } = useAuth();
  const todayDate = indiaDateKey(new Date());

  const [breakdowns, setBreakdowns] = useState<BreakdownRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Filters
  const [selectedTubewell, setSelectedTubewell] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Entry Modal
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [newTubewellSlug, setNewTubewellSlug] = useState('mango-tree-meter');
  const [newDate, setNewDate] = useState(todayDate);
  const [newIssue, setNewIssue] = useState('');
  const [newReportedBy, setNewReportedBy] = useState(user?.displayName || '');
  const [submittingEntry, setSubmittingEntry] = useState(false);
  const [entryError, setEntryError] = useState('');

  // Resolution Modal
  const [resolvingItem, setResolvingItem] = useState<BreakdownRecord | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [submittingResolution, setSubmittingResolution] = useState(false);

  // Resending Email State
  const [resendingId, setResendingId] = useState<string | null>(null);

  // Email Configuration State
  const [breakdownAlertEmail, setBreakdownAlertEmail] = useState('');
  const [fallbackEmail, setFallbackEmail] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [isGmailConfigured, setIsGmailConfigured] = useState(false);
  const [loadingEmailConfig, setLoadingEmailConfig] = useState(false);
  const [savingEmailConfig, setSavingEmailConfig] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [emailConfigNotice, setEmailConfigNotice] = useState('');
  const [emailConfigError, setEmailConfigError] = useState('');

  const safeParseJson = async (res: Response) => {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      throw new Error(
        res.status === 404
          ? 'API endpoint not found (404). Please ensure the backend server has been rebuilt and restarted.'
          : `Unexpected server response (HTTP ${res.status}): ${text.slice(0, 120)}`
      );
    }
  };

  const loadEmailConfig = async () => {
    try {
      setLoadingEmailConfig(true);
      const res = await fetch('/api/breakdowns/email-config', { credentials: 'include' });
      const data = await safeParseJson(res);
      if (res.ok) {
        setBreakdownAlertEmail(data.breakdownAlertEmail || '');
        setFallbackEmail(data.fallbackEmail || '');
        setSenderEmail(data.senderEmail || '');
        setIsGmailConfigured(Boolean(data.isGmailConfigured));
      }
    } catch {
      // ignore
    } finally {
      setLoadingEmailConfig(false);
    }
  };

  const handleSaveEmailConfig = async (e: FormEvent) => {
    e.preventDefault();
    setSavingEmailConfig(true);
    setEmailConfigNotice('');
    setEmailConfigError('');
    try {
      const res = await fetch('/api/breakdowns/email-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: breakdownAlertEmail.trim() }),
      });
      const data = await safeParseJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed to save email address.');
      setEmailConfigNotice(data.message || 'Breakdown alert email updated successfully.');
      await loadEmailConfig();
    } catch (err: any) {
      setEmailConfigError(err?.message || 'Failed to save email address.');
    } finally {
      setSavingEmailConfig(false);
    }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    setEmailConfigNotice('');
    setEmailConfigError('');
    try {
      const res = await fetch('/api/breakdowns/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: breakdownAlertEmail.trim() }),
      });
      const data = await safeParseJson(res);
      if (!res.ok || !data.sent) {
        throw new Error(data.error || 'Failed to send test alert email.');
      }
      setEmailConfigNotice(`Test alert email successfully sent to ${data.recipient}! Check inbox.`);
    } catch (err: any) {
      setEmailConfigError(err?.message || 'Failed to send test alert email.');
    } finally {
      setTestingEmail(false);
    }
  };

  const loadBreakdowns = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/breakdowns', { credentials: 'include' });
      const data = await safeParseJson(res);
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch breakdown records.');
      }
      const list: BreakdownRecord[] = data.breakdowns ?? [];
      setBreakdowns(list);
      const openCount = list.filter((b) => b.status === 'open').length;
      onBreakdownCountChange?.(openCount);
    } catch (err: any) {
      setError(err?.message || 'Error loading breakdowns.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBreakdowns();
    void loadEmailConfig();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  // Handle Create Breakdown Entry
  const handleCreateBreakdown = async (e: FormEvent) => {
    e.preventDefault();
    if (!newIssue.trim()) {
      setEntryError('Please enter the breakdown issue description.');
      return;
    }
    setSubmittingEntry(true);
    setEntryError('');

    const targetTubewell = TUBEWELL_OPTIONS.find((t) => t.slug === newTubewellSlug);
    const tubewellName = targetTubewell?.title || newTubewellSlug;

    try {
      const res = await fetch('/api/breakdowns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          registerSlug: newTubewellSlug,
          tubewellName,
          date: newDate,
          issue: newIssue.trim(),
          reportedBy: newReportedBy.trim() || user?.displayName || 'Admin',
        }),
      });

      const data = await safeParseJson(res);
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save breakdown record.');
      }

      const emailNote = data.emailSent
        ? `Alert email sent to ${data.emailRecipient}.`
        : data.emailError
          ? `(Email note: ${data.emailError})`
          : '';

      setNotice(`Breakdown logged successfully. ${emailNote}`);
      setIsEntryModalOpen(false);
      setNewIssue('');
      await loadBreakdowns();
    } catch (err: any) {
      setEntryError(err?.message || 'Failed to record breakdown.');
    } finally {
      setSubmittingEntry(false);
    }
  };

  // Handle Resolve Breakdown
  const handleResolveBreakdown = async (e: FormEvent) => {
    e.preventDefault();
    if (!resolvingItem) return;
    setSubmittingResolution(true);
    try {
      const res = await fetch(`/api/breakdowns/${resolvingItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          status: 'resolved',
          resolutionNotes: resolutionNotes.trim(),
        }),
      });

      const data = await safeParseJson(res);
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update breakdown.');
      }

      setNotice(`Breakdown #${resolvingItem.id} marked as Resolved.`);
      setResolvingItem(null);
      setResolutionNotes('');
      await loadBreakdowns();
    } catch (err: any) {
      setError(err?.message || 'Failed to resolve breakdown.');
    } finally {
      setSubmittingResolution(false);
    }
  };

  // Handle Resend Email
  const handleResendEmail = async (item: BreakdownRecord) => {
    setResendingId(item.id);
    try {
      const res = await fetch(`/api/breakdowns/${item.id}/resend-email`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await safeParseJson(res);
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to resend alert email.');
      }
      setNotice(`Alert email resent to ${data.recipient}.`);
      await loadBreakdowns();
    } catch (err: any) {
      setError(err?.message || 'Failed to resend email.');
    } finally {
      setResendingId(null);
    }
  };

  // Handle Delete Breakdown
  const handleDeleteBreakdown = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this breakdown record?')) return;
    try {
      const res = await fetch(`/api/breakdowns/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await safeParseJson(res);
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete record.');
      }
      setNotice('Breakdown record deleted.');
      await loadBreakdowns();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete record.');
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    const headers = [
      'ID',
      'Date',
      'Tubewell',
      'Register Slug',
      'Issue',
      'Reported By',
      'Status',
      'Resolution Notes',
      'Resolved At',
      'Resolved By',
      'Email Sent',
      'Email Recipient',
      'Created At',
    ];

    const rows = filteredBreakdowns.map((b) => [
      b.id,
      b.date,
      b.tubewellName,
      b.registerSlug,
      b.issue.replace(/"/g, '""'),
      b.reportedBy || '',
      b.status,
      (b.resolutionNotes || '').replace(/"/g, '""'),
      b.resolvedAt || '',
      b.resolvedBy || '',
      b.emailSent ? 'Yes' : 'No',
      b.emailRecipient || '',
      b.createdAt,
    ]);

    downloadCsv(`tubewell-breakdowns-${todayDate}.csv`, [headers, ...rows]);
    setNotice(`Exported ${filteredBreakdowns.length} breakdown records to CSV.`);
  };

  // Filtered Breakdowns
  const filteredBreakdowns = useMemo(() => {
    return breakdowns.filter((item) => {
      if (selectedTubewell !== 'all' && item.registerSlug !== selectedTubewell) return false;
      if (selectedStatus !== 'all' && item.status !== selectedStatus) return false;
      if (fromDate && item.date < fromDate) return false;
      if (toDate && item.date > toDate) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesIssue = item.issue.toLowerCase().includes(q);
        const matchesTubewell = item.tubewellName.toLowerCase().includes(q);
        const matchesReporter = (item.reportedBy || '').toLowerCase().includes(q);
        const matchesNotes = (item.resolutionNotes || '').toLowerCase().includes(q);
        if (!matchesIssue && !matchesTubewell && !matchesReporter && !matchesNotes) return false;
      }
      return true;
    });
  }, [breakdowns, selectedTubewell, selectedStatus, fromDate, toDate, searchQuery]);

  // Statistics
  const totalCount = breakdowns.length;
  const openCount = breakdowns.filter((b) => b.status === 'open').length;
  const resolvedCount = breakdowns.filter((b) => b.status === 'resolved').length;
  const mangoTreeCount = breakdowns.filter((b) => b.registerSlug === 'mango-tree-meter').length;
  const clinicGateCount = breakdowns.filter((b) => b.registerSlug === 'clinic-gate-meter').length;

  return (
    <div className="space-y-6" data-testid="breakdown-report-view">
      {/* Alert Notices */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-medium text-destructive">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto text-xs underline">Dismiss</button>
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-medium text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 size={16} className="shrink-0" />
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="ml-auto text-xs underline">Dismiss</button>
        </div>
      )}

      {/* Action Header Card */}
      <div className="flex flex-col gap-4 rounded-2xl border border-red-500/30 bg-gradient-to-r from-red-500/10 via-card to-card p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <div className="grid size-12 place-items-center rounded-2xl bg-red-600 text-white shadow-md shadow-red-600/25">
            <Wrench size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400">
                Operations Incident Desk
              </span>
              {openCount > 0 && (
                <span className="animate-pulse rounded-full bg-red-600 px-2.5 py-0.5 text-[10px] font-bold text-white">
                  {openCount} Open Action{openCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <h2 className="mt-1 font-serif text-2xl font-bold tracking-tight">
              Tubewell Breakdown Report
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Review, track, and record breakdown incidents for Mango Tree (Tubewell 1) and Clinic Gate (Tubewell 2). Every entry automatically triggers an urgent email dispatch.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadBreakdowns()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
            data-testid="button-refresh-breakdowns"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredBreakdowns.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
            data-testid="button-export-breakdowns"
          >
            <Download size={14} /> Export CSV
          </button>
          <button
            type="button"
            onClick={() => {
              setNewDate(todayDate);
              setNewIssue('');
              setEntryError('');
              setIsEntryModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-semibold text-white shadow hover:bg-red-700"
            data-testid="button-enter-breakdown"
          >
            <Plus size={16} /> Enter Breakdown Record
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Reports</span>
            <Wrench size={16} className="text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold font-serif">{totalCount}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">All logged breakdowns</div>
        </div>

        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 shadow-sm">
          <div className="flex items-center justify-between text-red-600 dark:text-red-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Open / Pending</span>
            <AlertTriangle size={16} />
          </div>
          <div className="mt-2 text-2xl font-bold font-serif text-red-600 dark:text-red-400">{openCount}</div>
          <div className="mt-1 text-[11px] text-red-600/75 dark:text-red-400/75">Require maintenance</div>
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 shadow-sm">
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Resolved</span>
            <CheckCircle2 size={16} />
          </div>
          <div className="mt-2 text-2xl font-bold font-serif text-emerald-600 dark:text-emerald-400">{resolvedCount}</div>
          <div className="mt-1 text-[11px] text-emerald-600/75 dark:text-emerald-400/75">Fixed & running</div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Tubewell 1</span>
            <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-primary">T1</span>
          </div>
          <div className="mt-2 text-2xl font-bold font-serif">{mangoTreeCount}</div>
          <div className="mt-1 truncate text-[11px] text-muted-foreground">Mango Tree meter</div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Tubewell 2</span>
            <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-primary">T2</span>
          </div>
          <div className="mt-2 text-2xl font-bold font-serif">{clinicGateCount}</div>
          <div className="mt-1 truncate text-[11px] text-muted-foreground">Clinic Gate meter</div>
        </div>
      </div>

      {/* Dedicated Breakdown Alert Email Configuration Card */}
      <div className="rounded-2xl border border-red-500/25 bg-card p-5 shadow-sm" data-testid="card-breakdown-email-config">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
              <Mail size={20} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-serif text-base font-bold">Breakdown Alert Recipient Email</h3>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    breakdownAlertEmail
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {breakdownAlertEmail ? 'Dedicated recipient set' : 'Using system fallback'}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Whenever a breakdown is reported in <strong>Mango Tree</strong> or <strong>Clinic Gate</strong>, an urgent email alert is immediately dispatched from <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">{senderEmail || 'dashboardoew@gmail.com'}</code> to this address.
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Current Destination:</span>
                <span className="font-mono font-semibold text-foreground">
                  {breakdownAlertEmail || fallbackEmail || 'No email configured'}
                </span>
                {!breakdownAlertEmail && fallbackEmail && (
                  <span className="text-[11px] text-muted-foreground">(Fallback from Admin Settings)</span>
                )}
              </div>
            </div>
          </div>

          <form onSubmit={handleSaveEmailConfig} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-[280px]">
              <input
                type="email"
                value={breakdownAlertEmail}
                onChange={(e) => setBreakdownAlertEmail(e.target.value)}
                placeholder={fallbackEmail || 'Enter recipient email (e.g. maintenance@company.com)'}
                className="w-full rounded-xl border border-input bg-background px-3.5 py-2 text-xs outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                disabled={user?.role !== 'admin' || savingEmailConfig}
                data-testid="input-breakdown-alert-email"
              />
            </div>
            {user?.role === 'admin' ? (
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={savingEmailConfig}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
                  data-testid="button-save-breakdown-email"
                >
                  <Send size={13} /> {savingEmailConfig ? 'Saving…' : 'Save Email'}
                </button>
                <button
                  type="button"
                  onClick={handleTestEmail}
                  disabled={testingEmail || (!breakdownAlertEmail && !fallbackEmail)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                  data-testid="button-test-breakdown-email"
                  title="Send a sample breakdown alert email to verify deliverability"
                >
                  <Mail size={13} /> {testingEmail ? 'Sending Test…' : 'Send Test Alert'}
                </button>
              </div>
            ) : (
              <span className="text-[11px] text-muted-foreground">(Admin only)</span>
            )}
          </form>
        </div>

        {emailConfigNotice && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 size={14} className="shrink-0" />
            <span>{emailConfigNotice}</span>
          </div>
        )}
        {emailConfigError && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
            <AlertCircle size={14} className="shrink-0" />
            <span>{emailConfigError}</span>
          </div>
        )}
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm md:flex-row md:items-center">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search issue, reported by, or resolution notes…"
            className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-xs outline-none focus:border-red-500"
            data-testid="input-search-breakdown"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedTubewell}
            onChange={(e) => setSelectedTubewell(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:border-red-500"
            data-testid="select-filter-tubewell"
          >
            <option value="all">All Tubewells</option>
            <option value="mango-tree-meter">Mango Tree (Tubewell 1)</option>
            <option value="clinic-gate-meter">Clinic Gate (Tubewell 2)</option>
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-xs outline-none focus:border-red-500"
            data-testid="select-filter-status"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open Only</option>
            <option value="resolved">Resolved Only</option>
          </select>

          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>From:</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus:border-red-500"
            />
          </div>

          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>To:</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus:border-red-500"
            />
          </div>

          {(selectedTubewell !== 'all' || selectedStatus !== 'all' || fromDate || toDate || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setSelectedTubewell('all');
                setSelectedStatus('all');
                setFromDate('');
                setToDate('');
                setSearchQuery('');
              }}
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Breakdowns Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <RefreshCw className="mx-auto mb-2 animate-spin text-red-500" size={24} />
            Loading breakdown incidents…
          </div>
        ) : filteredBreakdowns.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <CheckCircle2 size={24} />
            </div>
            <h3 className="font-serif text-base font-bold">No Breakdown Records Found</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {breakdowns.length === 0
                ? 'No breakdowns have been reported yet. When an incident is logged, it will appear here.'
                : 'No incidents match the active search or filters.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="border-b border-border bg-muted/40 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Tubewell / Equipment</th>
                  <th className="px-4 py-3">Issue Details</th>
                  <th className="px-4 py-3">Reported By</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Alert Email</th>
                  <th className="px-4 py-3">Resolution Notes</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-xs">
                {filteredBreakdowns.map((item) => {
                  const isOpen = item.status === 'open';

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors hover:bg-muted/40 ${
                        isOpen ? 'bg-red-500/[0.02]' : ''
                      }`}
                      data-testid={`row-breakdown-${item.id}`}
                    >
                      <td className="whitespace-nowrap px-4 py-3.5 font-mono font-semibold text-foreground">
                        {item.date}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="font-semibold text-foreground">{item.tubewellName}</span>
                        <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                          {item.registerSlug}
                        </div>
                      </td>
                      <td className="max-w-xs px-4 py-3.5">
                        <div className="font-medium text-foreground whitespace-pre-wrap">
                          {item.issue}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-muted-foreground">
                        {item.reportedBy || 'Staff'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5">
                        {isOpen ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-bold text-red-600 dark:text-red-400">
                            <AlertTriangle size={12} /> Open
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 size={12} /> Resolved
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5">
                        {item.emailSent ? (
                          <div
                            className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium"
                            title={`Dispatched to: ${item.emailRecipient || 'Admin'}`}
                          >
                            <CheckCircle2 size={13} />
                            <span>Sent to {item.emailRecipient || 'Incharge'}</span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Mail size={13} /> Not sent
                          </span>
                        )}
                      </td>
                      <td className="max-w-xs px-4 py-3.5">
                        {item.resolutionNotes ? (
                          <div>
                            <span className="font-medium text-foreground">{item.resolutionNotes}</span>
                            {item.resolvedBy && (
                              <div className="mt-0.5 text-[10px] text-muted-foreground">
                                By {item.resolvedBy}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isOpen ? (
                            <button
                              type="button"
                              onClick={() => {
                                setResolvingItem(item);
                                setResolutionNotes('');
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
                              data-testid={`button-resolve-${item.id}`}
                            >
                              <CheckCircle2 size={13} /> Resolve
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setResolvingItem(item);
                                setResolutionNotes(item.resolutionNotes || '');
                              }}
                              className="rounded-lg border border-border px-2 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted"
                            >
                              Edit Notes
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleResendEmail(item)}
                            disabled={resendingId === item.id}
                            title="Resend email alert"
                            className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                            data-testid={`button-resend-email-${item.id}`}
                          >
                            <Send size={13} className={resendingId === item.id ? 'animate-spin' : ''} />
                          </button>

                          {['admin', 'manager'].includes(user?.role || '') && (
                            <button
                              type="button"
                              onClick={() => handleDeleteBreakdown(item.id)}
                              title="Delete breakdown entry"
                              className="rounded-lg border border-destructive/20 p-1.5 text-destructive hover:bg-destructive/10"
                              data-testid={`button-delete-breakdown-${item.id}`}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Enter Breakdown Record (Directly from Admin Panel) */}
      {isEntryModalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-2xl border border-red-500/30 bg-card p-6 shadow-2xl">
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-red-600 text-white">
                  <Wrench size={20} />
                </span>
                <div>
                  <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                    Incident Logging Desk
                  </div>
                  <h3 className="font-serif text-xl font-bold">Enter Breakdown Record</h3>
                  <p className="text-xs text-muted-foreground">Admin Breakdown Report & Dispatch</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEntryModalOpen(false)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                data-testid="button-close-admin-breakdown-modal"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateBreakdown} className="mt-5 space-y-4">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-900 dark:text-amber-200">
                ⚠️ <strong>Email Alert:</strong> Saving this breakdown will immediately send an alert email with full issue details to the registered email address.
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold">
                  Select Tubewell <span className="text-destructive">*</span>
                </label>
                <select
                  required
                  value={newTubewellSlug}
                  onChange={(e) => setNewTubewellSlug(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-red-500"
                  data-testid="select-breakdown-tubewell"
                >
                  {TUBEWELL_OPTIONS.map((opt) => (
                    <option key={opt.slug} value={opt.slug}>
                      {opt.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold">
                  Current Date <span className="text-destructive">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-red-500"
                  data-testid="input-admin-breakdown-date"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold">
                  Breakdown Issue Description <span className="text-destructive">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={newIssue}
                  onChange={(e) => setNewIssue(e.target.value)}
                  placeholder="Detail the problem (e.g. Submersible motor failure, high vibration, water leakage, low discharge pressure, electrical short)..."
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-red-500"
                  data-testid="input-admin-breakdown-issue"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold">Reported By</label>
                <input
                  type="text"
                  value={newReportedBy}
                  onChange={(e) => setNewReportedBy(e.target.value)}
                  placeholder="Admin name / Reporting staff"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>

              {entryError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">
                  {entryError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEntryModalOpen(false)}
                  className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEntry}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-red-700 disabled:opacity-50"
                  data-testid="button-save-admin-breakdown"
                >
                  <Send size={15} /> {submittingEntry ? 'Saving & sending email…' : 'Save Breakdown & Send Email'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Resolve Breakdown */}
      {resolvingItem && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-emerald-500/30 bg-card p-6 shadow-2xl">
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 size={20} />
                </span>
                <div>
                  <h3 className="font-serif text-lg font-bold">Mark as Resolved</h3>
                  <p className="text-xs text-muted-foreground">{resolvingItem.tubewellName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResolvingItem(null)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleResolveBreakdown} className="mt-4 space-y-4">
              <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                <strong className="text-foreground">Incident on {resolvingItem.date}:</strong>
                <p className="mt-1 line-clamp-3 text-foreground/80">{resolvingItem.issue}</p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold">
                  Resolution Remarks / Maintenance Notes
                </label>
                <textarea
                  rows={3}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="e.g. Technician replaced starter fuse, tested water flow, normal operations resumed."
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  data-testid="input-resolution-notes"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setResolvingItem(null)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingResolution}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
                  data-testid="button-confirm-resolve"
                >
                  {submittingResolution ? 'Saving…' : 'Mark Resolved'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

