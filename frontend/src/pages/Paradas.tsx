import { useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

async function apiPost(path: string, body: any) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-owner-id": "default",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || "Erro ao salvar");
  }

  return res.json();
}

export default function Paradas() {
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    turno: "Turno 1",
    day: "2026-01-06",
    data_inicio: "2026-01-06",
    hora_inicio: "19:57",
    data_fim: "2026-01-06",
    hora_fim: "20:53",
    equipamento: "PN-01",
    tipo_parada: "Preventiva",
    atividade: "Limpeza",
    descricao: "",
  });

  async function salvar() {
    try {
      setErro(null);
      setLoading(true);

      await apiPost("/api/stops", {
        ...form,
      });

      alert("Parada salva com sucesso");
    } catch (e: any) {
      console.error(e);
      setErro(e.message || "Falha ao salvar parada");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Novo lançamento</h2>

      {erro && (
        <div style={{ color: "red", marginBottom: 12 }}>
          {erro}
        </div>
      )}

      <textarea
        placeholder="Descrição"
        value={form.descricao}
        onChange={(e) =>
          setForm({ ...form, descricao: e.target.value })
        }
        style={{ width: "100%", height: 80 }}
      />

      <button
        onClick={salvar}
        disabled={loading}
        style={{ marginTop: 16 }}
      >
        {loading ? "Salvando..." : "Adicionar parada"}
      </button>
    </div>
  );
}
