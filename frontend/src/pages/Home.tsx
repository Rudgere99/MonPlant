import { useNavigate } from "react-router-dom";

export default function Home() {
  const nav = useNavigate();

  return (
    <div className="mp-home">
      <div className="mp-home-bg" />

      {/* NAV */}
      <header className="mp-home-nav">
        <div className="mp-home-logo">MonPlant</div>
        <div className="mp-home-actions">
          <button className="mp-btn-outline" onClick={() => nav("/login")}>
            Entrar
          </button>
        </div>
      </header>

      {/* HERO */}
      <section className="mp-hero">
        <h1>
          Monitoramento Inteligente da
          <span> Produção Industrial</span>
        </h1>

        <p>
          Plataforma centralizada para controle de produção, paradas,
          horímetros e performance operacional em tempo real.
        </p>

        <div className="mp-hero-buttons">
          <button className="mp-btn-primary" onClick={() => nav("/login")}>
            Acessar Sistema
          </button>

          <button className="mp-btn-secondary">
            Ver Funcionalidades
          </button>
        </div>
      </section>

      {/* FEATURES */}
      <section className="mp-section">
        <h2>Recursos do Sistema</h2>

        <div className="mp-card-grid">
          <div className="mp-card">
            <h3>Produção em Tempo Real</h3>
            <p>
              Acompanhamento por período, metas diárias, ritmo necessário e
              comparativo de desempenho.
            </p>
          </div>

          <div className="mp-card">
            <h3>Gestão de Paradas</h3>
            <p>
              Registro detalhado por equipamento, hora e motivo,
              com indicadores consolidados.
            </p>
          </div>

          <div className="mp-card">
            <h3>Controle de Horímetros</h3>
            <p>
              Lançamento estruturado por equipamento com histórico
              rastreável.
            </p>
          </div>

          <div className="mp-card">
            <h3>Dashboard Executivo</h3>
            <p>
              Visão consolidada com KPI’s, metas, taxa operacional e insights
              estratégicos.
            </p>
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="mp-cta">
        <h2>Centralize sua operação em uma única plataforma</h2>
        <button className="mp-btn-primary" onClick={() => nav("/login")}>
          Entrar no MonPlant
        </button>
      </section>

      <style>{`
        .mp-home {
          min-height: 100vh;
          background: radial-gradient(circle at 30% 30%, #0f172a, #020617 70%);
          color: white;
          font-family: Inter, sans-serif;
          position: relative;
          overflow-x: hidden;
        }

        .mp-home-bg {
          position: absolute;
          width: 600px;
          height: 600px;
          background: #10b981;
          filter: blur(160px);
          opacity: 0.15;
          top: -200px;
          right: -200px;
          border-radius: 50%;
        }

        .mp-home-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 28px 60px;
        }

        .mp-home-logo {
          font-size: 22px;
          font-weight: 900;
          letter-spacing: 1px;
          color: #10b981;
        }

        .mp-btn-outline {
          border: 1px solid rgba(255,255,255,0.2);
          background: transparent;
          color: white;
          padding: 8px 18px;
          border-radius: 12px;
          cursor: pointer;
          font-weight: 600;
        }

        .mp-hero {
          text-align: center;
          padding: 120px 20px 80px;
          max-width: 900px;
          margin: auto;
        }

        .mp-hero h1 {
          font-size: 48px;
          font-weight: 900;
          line-height: 1.2;
        }

        .mp-hero h1 span {
          color: #10b981;
        }

        .mp-hero p {
          margin-top: 20px;
          font-size: 18px;
          opacity: 0.75;
        }

        .mp-hero-buttons {
          margin-top: 40px;
          display: flex;
          justify-content: center;
          gap: 20px;
        }

        .mp-btn-primary {
          background: #10b981;
          color: black;
          border: none;
          padding: 14px 28px;
          border-radius: 14px;
          font-weight: 800;
          cursor: pointer;
        }

        .mp-btn-secondary {
          background: rgba(255,255,255,0.08);
          color: white;
          border: none;
          padding: 14px 28px;
          border-radius: 14px;
          cursor: pointer;
        }

        .mp-section {
          padding: 80px 60px;
          text-align: center;
        }

        .mp-section h2 {
          font-size: 32px;
          margin-bottom: 50px;
        }

        .mp-card-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 30px;
        }

        .mp-card {
          background: rgba(255,255,255,0.04);
          padding: 30px;
          border-radius: 20px;
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.08);
        }

        .mp-card h3 {
          margin-bottom: 12px;
          color: #10b981;
        }

        .mp-card p {
          opacity: 0.7;
        }

        .mp-cta {
          text-align: center;
          padding: 100px 20px;
        }

        .mp-cta h2 {
          margin-bottom: 30px;
          font-size: 28px;
        }
      `}</style>
    </div>
  );
}
