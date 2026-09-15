import { Eye, LockKeyhole, Pencil, WalletCards } from 'lucide-react';
import { PageIntro } from '@/components/ops-ui';
import { canEditPayments, useAuth } from '@/lib/auth';

export default function PaymentsPage() {
  const { user } = useAuth();
  const editable = canEditPayments(user?.role);

  return (
    <div className="ops-grid min-h-[100dvh] px-5 py-8 md:px-8 lg:px-10">
      <PageIntro
        eyebrow="HR and finance workspace"
        title="Payment module"
        description="A dedicated workspace for payment records. The payment fields and workflows will be added once the payment register format is confirmed."
      />
      <section className="max-w-4xl rounded-xl border border-border bg-card p-6 shadow-sm md:p-8">
        <div className="flex items-start gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <WalletCards size={23} />
          </div>
          <div>
            <h2 className="font-serif text-xl font-bold">Payment register setup pending</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              This module is visible only to HR, Manager, and Admin. It is ready for the payment columns and rules you will provide.
            </p>
          </div>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-muted/45 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              {editable ? <Pencil size={16} className="text-primary" /> : <Eye size={16} className="text-muted-foreground" />}
              {editable ? 'Edit access enabled' : 'View-only access'}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {editable ? 'HR and Admin will be able to add and edit payment records once the register is configured.' : 'Managers can review all payment information but cannot edit it.'}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/45 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <LockKeyhole size={16} className="text-muted-foreground" />
              Fields not configured
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              No payment fields have been invented or added before you confirm the format.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}