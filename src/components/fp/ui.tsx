import { useState, type ReactNode } from "react";
import { ArrowLeft, ChevronRight, X, type LucideIcon } from "lucide-react";
import { useBackClose } from "@/components/fp/PrivacyShield";

/** Shared building blocks for the "Me" pages (full pages, cards, rows, switches, small windows). */

export function Page({ title, onBack, close, right, children }: { title: string; onBack: () => void; close?: boolean; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-md flex-col bg-muted animate-in slide-in-from-right duration-200">
      <header className="flex h-14 shrink-0 items-center gap-1 bg-background px-2">
        <button aria-label="Back" onClick={onBack} className="rounded-full p-2">
          {close ? <X className="h-[22px] w-[22px]" /> : <ArrowLeft className="h-[22px] w-[22px]" />}
        </button>
        <p className="flex-1 text-ui font-bold">{title}</p>
        {right}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto pb-8">{children}</div>
    </div>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="mx-3 mt-3 overflow-hidden rounded-2xl bg-background">{children}</div>;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="px-5 pb-0 pt-5 text-ui font-bold uppercase tracking-wide text-muted-foreground">{children}</p>;
}

export function Row({ icon: I, color = "text-primary", label, value, onClick, danger }: { icon: LucideIcon; color?: string; label: string; value?: ReactNode; onClick?: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 border-b border-border px-4 py-3.5 text-left last:border-0 active:bg-muted">
      <I className={`h-[21px] w-[21px] shrink-0 ${danger ? "text-destructive" : color}`} />
      <span className={`flex-1 text-ui ${danger ? "font-semibold text-destructive" : ""}`}>{label}</span>
      {value && <span className="flex items-center text-ui text-muted-foreground">{value}</span>}
      {!danger && onClick && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
    </button>
  );
}

export function Toggle({ on }: { on: boolean }) {
  return (
    <span className={`relative inline-block h-6 w-10 shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-border"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </span>
  );
}

/** Switch row with a title and a one-line explanation. */
export function SwitchRow({ icon: I, label, hint, on, onChange, disabled }: { icon: LucideIcon; label: string; hint?: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="flex w-full items-center gap-3 border-b border-border px-4 py-3.5 text-left last:border-0 active:bg-muted disabled:opacity-50"
    >
      <I className="h-[21px] w-[21px] shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block text-ui">{label}</span>
        {hint && <span className="mt-0.5 block text-ui text-muted-foreground">{hint}</span>}
      </span>
      <Toggle on={on} />
    </button>
  );
}

/** A row of choice chips (single choice). */
export function Chips<T extends string | number>({ label, hint, value, options, onChange }: { label: string; hint?: string; value: T; options: { v: T; text: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="border-b border-border px-4 py-3.5 last:border-0">
      <p className="text-ui">{label}</p>
      {hint && <p className="mt-0.5 text-ui text-muted-foreground">{hint}</p>}
      <div className="mt-2.5 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={String(o.v)}
            onClick={() => onChange(o.v)}
            className={`rounded-full px-3.5 py-1.5 text-ui font-semibold ${value === o.v ? "bg-primary text-primary-foreground" : "bg-muted"}`}
          >
            {o.text}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SubBack({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  useBackClose(true, onBack);
  return <>{children}</>;
}

/** Small centred window (for short forms and confirmations). */
export function Modal({ title, onClose, children }: { title?: string; onClose: () => void; children: ReactNode }) {
  useBackClose(true, onClose);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/60 p-6" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-background p-5 animate-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
        {title && <p className="mb-3 text-ui font-bold">{title}</p>}
        {children}
      </div>
    </div>
  );
}

export function ConfirmButtons({ cancel, ok, onCancel, onOk, danger, busy }: { cancel: string; ok: string; onCancel: () => void; onOk: () => void; danger?: boolean; busy?: boolean }) {
  return (
    <div className="mt-5 flex justify-end gap-5 text-ui font-bold">
      <button onClick={onCancel} className="text-muted-foreground">{cancel}</button>
      <button disabled={busy} onClick={onOk} className={`${danger ? "text-destructive" : "text-primary"} disabled:opacity-50`}>{busy ? "…" : ok}</button>
    </div>
  );
}

export function useBusy() {
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  }
  return { busy, run };
}
