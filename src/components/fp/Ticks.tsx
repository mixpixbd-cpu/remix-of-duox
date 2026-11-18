/** imo-style message status: Sent = one tick, Delivered = two ticks, Seen = small hollow ring. */
export type MsgStatus = "sent" | "delivered" | "seen";

export function msgStatus(m: { delivered_at?: string | null; read_at?: string | null }, hideRead = false): MsgStatus {
  if (m.read_at && !hideRead) return "seen";
  if (m.delivered_at || m.read_at) return "delivered";
  return "sent";
}

export function StatusTick({ status, size = 16, className = "" }: { status: MsgStatus; size?: number; className?: string }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className: `shrink-0 ${className}` };
  if (status === "seen") return <svg {...common} aria-label="Seen"><circle cx="12" cy="12" r="7" /></svg>;
  if (status === "delivered") return <svg {...common} aria-label="Delivered"><path d="M2 12.5l4.5 4.5L15 8.5" /><path d="M10.5 16l1 1L22 8.5" /></svg>;
  return <svg {...common} aria-label="Sent"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
}
