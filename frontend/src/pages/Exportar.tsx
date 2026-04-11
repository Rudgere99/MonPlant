import ActionCard from "./exportar/ActionCard";
import ExportActions from "./exportar/ExportActions";
import ExportFiltersPanel from "./exportar/ExportFiltersPanel";
import PreviewTable from "./exportar/PreviewTable";
import ToneBadge from "./exportar/ToneBadge";
import { useExportData } from "./exportar/useExportData";

export default function Exportar() {
  const {
    fromDay,
    toDay,
    setFromDay,
    setToDay,
    busy,
    previewBusy,
    msg,
    lastFile,
    lastMode,
    previewMode,
    previewData,
    plants,
    selectedPlantId,
    setSelectedPlantId,
    filters,
    setFilters,
    periodLabel,
    handlePreview,
    handleExport,
    handleExportModeloParadas,
    handleExportFilteredExcel,
    handleTechAnalysisPdf,
  } = useExportData();

  return (
    <div style={{ padding: 18 }}>
      <div
        className="mp-card"
        style={{
          borderRadius: 24,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,.08)",
          background:
            "radial-gradient(circle at top right, rgba(59,130,246,.10), transparent 24%), linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.015))",
          boxShadow: "0 20px 60px rgba(0,0,0,.22)",
        }}
      >
        <div
          className="mp-card-h"
          style={{
            padding: "18px 18px 8px 18px",
            borderBottom: "1px solid rgba(255,255,255,.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: 0.2 }}>Central de Exportação</div>
            <div style={{ marginTop: 4, color: "rgba(255,255,255,.58)", fontSize: 13 }}>
              Visualize o relatório no site antes de gerar o Excel e exporte somente quando estiver tudo conferido.
            </div>
          </div>

          <ToneBadge tone="info">MonPlant • Exportação Assistida</ToneBadge>
        </div>

        <div className="mp-card-b" style={{ padding: 18 }}>
          <div
            style={{
              borderRadius: 20,
              border: "1px solid rgba(255,255,255,.08)",
              background: "rgba(7,10,18,.42)",
              padding: 16,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,.02)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
                marginBottom: 14,
              }}
            >
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>1. Defina o período</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,.52)", marginTop: 4 }}>
                  O usuário primeiro escolhe o intervalo, depois pré-visualiza o relatório e por fim exporta.
                </div>
              </div>
              <ToneBadge tone="muted">{periodLabel}</ToneBadge>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              <div>
                <div className="mp-label" style={{ marginBottom: 6 }}>Data inicial</div>
                <input className="mp-input" type="date" value={fromDay} onChange={(e) => setFromDay(e.target.value)} disabled={busy || previewBusy} />
              </div>
              <div>
                <div className="mp-label" style={{ marginBottom: 6 }}>Data final</div>
                <input className="mp-input" type="date" value={toDay} onChange={(e) => setToDay(e.target.value)} disabled={busy || previewBusy} />
              </div>
            </div>
          </div>

          <div style={{ height: 14 }} />

          <ExportFiltersPanel
            filters={filters}
            setFilters={setFilters}
            selectedPlantId={selectedPlantId}
            setSelectedPlantId={setSelectedPlantId}
            plants={plants}
          />

          <div style={{ height: 14 }} />

          <div
            style={{
              borderRadius: 20,
              border: "1px solid rgba(255,255,255,.08)",
              background: "rgba(7,10,18,.42)",
              padding: 16,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,.02)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>3. Escolha o tipo de relatório</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,.52)", marginTop: 4 }}>
                  Cada modo tem sua própria prévia e sua própria exportação.
                </div>
              </div>
              <ToneBadge tone="muted">{lastFile ? `Último arquivo: ${lastFile}` : "Pré-visualize antes de exportar"}</ToneBadge>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: 12,
              }}
            >
              <ActionCard
                title="Relatório base da planta"
                description="Prévia com horímetros consolidados e produção do período. Exporta usando o template public/BASE_PLANTA.xlsx."
                buttonText={busy && lastMode === "base" ? "Gerando..." : "Exportar Excel Base"}
                secondaryText="Pré-visualizar Base"
                buttonTone="primary"
                disabled={busy || previewBusy}
                onPreview={() => handlePreview("base")}
                onExport={handleExport}
              />

              <ActionCard
                title="Relatório de paradas"
                description="Prévia dos lançamentos de parada/manutenção com tempo, tipo e descrição. Exporta usando public/MODELO_PARADAS.xlsx."
                buttonText={busy && lastMode === "paradas" ? "Gerando..." : "Exportar Excel Paradas"}
                secondaryText="Pré-visualizar Paradas"
                buttonTone="secondary"
                disabled={busy || previewBusy}
                onPreview={() => handlePreview("paradas")}
                onExport={handleExportModeloParadas}
              />

              <ActionCard
                title="Produção por planta"
                description="Consolida produção por turno/planta para análise gerencial e exportação por filtro."
                buttonText="Prévia Produção"
                secondaryText="Pré-visualizar Produção"
                buttonTone="primary"
                disabled={busy || previewBusy}
                onPreview={() => handlePreview("producao")}
                onExport={() => handlePreview("producao")}
              />
            </div>

            {msg ? (
              <div
                style={{
                  marginTop: 14,
                  borderRadius: 14,
                  border: msg.startsWith("✅") ? "1px solid rgba(34,197,94,.25)" : "1px solid rgba(239,68,68,.25)",
                  background: msg.startsWith("✅") ? "rgba(34,197,94,.10)" : "rgba(239,68,68,.10)",
                  padding: 12,
                  color: "rgba(255,255,255,.92)",
                }}
              >
                {msg}
              </div>
            ) : null}
          </div>

          <div style={{ height: 14 }} />

          <ExportActions onExportFiltered={handleExportFilteredExcel} onTechPdf={handleTechAnalysisPdf} disabled={busy || previewBusy} />

          <div style={{ height: 14 }} />

          <div
            className="mp-card"
            style={{
              borderRadius: 24,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,.08)",
              background: "linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.015))",
              boxShadow: "0 20px 60px rgba(0,0,0,.20)",
            }}
          >
            <div
              className="mp-card-h"
              style={{
                padding: 18,
                borderBottom: "1px solid rgba(255,255,255,.06)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>4. Pré-visualização do relatório</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,.52)", marginTop: 4 }}>
                  O usuário vê no site o que será exportado. A tabela abaixo mostra os primeiros registros reais do relatório.
                </div>
              </div>
              <ToneBadge tone={previewMode === "base" ? "info" : previewMode === "paradas" ? "warn" : "ok"}>
                {previewMode === "base" ? "Prévia Base" : previewMode === "paradas" ? "Prévia Paradas" : "Prévia Produção"}
              </ToneBadge>
            </div>

            <div className="mp-card-b" style={{ padding: 18 }}>
              <PreviewTable data={previewData} loading={previewBusy} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
