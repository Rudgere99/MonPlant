export default function Exportar() {
  return (
    <div className="mp-container">
      <div>
        <div className="mp-chip">Utilitários</div>
        <div className="mp-page-title">Exportar Excel</div>
        <div className="mp-page-sub">Exportar no padrão do seu BASE_PLANTA.xlsx.</div>
      </div>

      <div style={{ height: 16 }} />

      <div className="mp-card">
        <div className="mp-card-h">
          <b>Exportação</b>
          <span className="mp-help">Em desenvolvimento</span>
        </div>
        <div className="mp-card-b">
          <div className="mp-help">
            Aqui vai ter: seleção de data/intervalo + botão para gerar e baixar o arquivo.
          </div>

          <div style={{ height: 12 }} />

          <button className="mp-btn mp-btn-primary" disabled>
            Gerar Excel (em breve)
          </button>
        </div>
      </div>
    </div>
  );
}
