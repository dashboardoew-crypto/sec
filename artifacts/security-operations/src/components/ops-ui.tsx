import { type ReactNode } from 'react';
import { ClipboardList } from 'lucide-react';

export function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.18em] text-primary"><span className="size-1.5 rounded-full bg-accent" />{eyebrow}</div><h1 className="font-serif text-3xl font-bold tracking-[-.03em] text-foreground sm:text-4xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p></div>{action}</div>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="grid min-h-[220px] place-items-center rounded-xl border border-dashed border-border bg-card/60 p-8 text-center"><div><div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-muted text-muted-foreground"><ClipboardList size={18} /></div><h3 className="font-serif text-lg font-bold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{description}</p></div></div>;
}