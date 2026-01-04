import React from "react";

type Props = { children: React.ReactNode };
type State = { hasError: boolean; message?: string };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: any): State {
    return { hasError: true, message: error?.message || String(error) };
  }

  componentDidCatch(error: any, info: any) {
    // aparece no console também
    console.error("ErrorBoundary:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: "white", background: "#0B0F14", minHeight: "100vh" }}>
          <h2 style={{ marginBottom: 8 }}>Erro na tela</h2>
          <pre style={{ whiteSpace: "pre-wrap", opacity: 0.9 }}>
            {this.state.message}
          </pre>
          <p style={{ marginTop: 12, opacity: 0.8 }}>
            Abra o console (F12) para mais detalhes.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
