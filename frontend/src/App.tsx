import { AppRoutes } from "./routes";

export default function App() {
  try {
    return <AppRoutes />;
  } catch (e: any) {
    return (
      <div style={{ background: "#0B0F14", color: "white", minHeight: "100vh", padding: 20 }}>
        <h2>Erro ao carregar rotas</h2>
        <pre style={{ whiteSpace: "pre-wrap", opacity: 0.9 }}>
          {e?.message || String(e)}
        </pre>
      </div>
    );
  }
}
