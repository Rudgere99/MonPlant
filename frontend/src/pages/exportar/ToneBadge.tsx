import type React from "react";
export default function ToneBadge({ children, tone = "muted" }: { children: any; tone?: "muted" | "info" | "ok" | "warn" }) {
  const styles: Record<string, React.CSSProperties> = {
    muted: {
      background: "rgba(148,163,184,.12)",
      border: "1px solid rgba(148,163,184,.20)",
      color: "#cbd5e1",
    },
    info: {
      background: "rgba(59,130,246,.14)",
      border: "1px solid rgba(59,130,246,.28)",
      color: "#93c5fd",
    },
    ok: {
      background: "rgba(34,197,94,.14)",
      border: "1px solid rgba(34,197,94,.28)",
      color: "#86efac",
    },
    warn: {
      background: "rgba(245,158,11,.14)",
      border: "1px solid rgba(245,158,11,.28)",
      color: "#fcd34d",
    },
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: 0.2,
        ...styles[tone],
      }}
    >
      {children}
    </span>
  );
}
