// src/pages/Configuracoes.tsx

import React, { useEffect, useState } from "react";

type Plant = {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
};

export default function Configuracoes() {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const API = import.meta.env.VITE_API_BASE;

  async function loadPlants() {
    const r = await fetch(`${API}/api/plants`);
    const data = await r.json();
    setPlants(data);
  }

  async function createPlant() {
    await fetch(`${API}/api/plants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, code }),
    });

    setName("");
    setCode("");
    loadPlants();
  }

  useEffect(() => {
    loadPlants();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h2>⚙️ Configurações</h2>

      {/* CADASTRO */}
      <div style={{ marginTop: 20 }}>
        <h3>Cadastro de Plantas</h3>

        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <input
            placeholder="Nome da planta"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <input
            placeholder="Código (P01)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />

          <button onClick={createPlant}>Adicionar</button>
        </div>
      </div>

      {/* LISTA */}
      <div style={{ marginTop: 30 }}>
        <h3>Plantas cadastradas</h3>

        <table style={{ width: "100%", marginTop: 10 }}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Código</th>
              <th>Nome</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {plants.map((p) => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>{p.code}</td>
                <td>{p.name}</td>
                <td>{p.is_active ? "Ativa" : "Inativa"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
