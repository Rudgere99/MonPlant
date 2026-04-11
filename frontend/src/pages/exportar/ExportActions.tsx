export default function ExportActions({
  onExportFiltered,
  onTechPdf,
  disabled,
}: {
  onExportFiltered: () => void;
  onTechPdf: () => void;
  disabled: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <button className="mp-btn mp-btn-primary" onClick={onExportFiltered} disabled={disabled}>
        Exportar Excel (somente o filtrado)
      </button>
      <button className="mp-btn" onClick={onTechPdf} disabled={disabled}>
        Gerar análise técnica (PDF)
      </button>
    </div>
  );
}
