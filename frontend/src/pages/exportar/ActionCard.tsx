import ToneBadge from "./ToneBadge";

export default function ActionCard({
  title,
  description,
  buttonText,
  secondaryText,
  buttonTone,
  disabled,
  onPreview,
  onExport,
}: {
  title: string;
  description: string;
  buttonText: string;
  secondaryText: string;
  buttonTone: "primary" | "secondary";
  disabled: boolean;
  onPreview: () => void;
  onExport: () => void;
}) {
  return (
    <div
      style={{
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,.08)",
        background: "rgba(255,255,255,.03)",
        padding: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.56)", marginTop: 6 }}>{description}</div>
        </div>
        <ToneBadge tone={buttonTone === "primary" ? "info" : "warn"}>{buttonTone === "primary" ? "Relatório Base" : "Relatório Paradas"}</ToneBadge>
      </div>

      <div style={{ height: 14 }} />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="mp-btn" onClick={onPreview} disabled={disabled} style={{ minWidth: 170, height: 42, borderRadius: 12, fontWeight: 800 }}>
          {secondaryText}
        </button>
        <button
          className={buttonTone === "primary" ? "mp-btn mp-btn-primary" : "mp-btn"}
          onClick={onExport}
          disabled={disabled}
          style={{ minWidth: 190, height: 42, borderRadius: 12, fontWeight: 900 }}
        >
          {buttonText}
        </button>
      </div>
    </div>
  );
}
