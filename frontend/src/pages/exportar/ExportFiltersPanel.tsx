import type React from "react";
import type { ExportFilters, PlantInfo } from "./types";

export default function ExportFiltersPanel({
  filters,
  setFilters,
  selectedPlantId,
  setSelectedPlantId,
  plants,
}: {
  filters: ExportFilters;
  setFilters: React.Dispatch<React.SetStateAction<ExportFilters>>;
  selectedPlantId: string;
  setSelectedPlantId: (v: string) => void;
  plants: PlantInfo[];
}) {
  return (
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
          <div style={{ fontWeight: 900, fontSize: 16 }}>2. Filtros e pesquisa (padrão MonPlant)</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.52)", marginTop: 4 }}>
            Os filtros abaixo impactam a prévia, a exportação do Excel filtrado e a análise técnica.
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
        <input className="mp-input" placeholder="Pesquisa geral..." value={filters.pesquisa} onChange={(e) => setFilters((f) => ({ ...f, pesquisa: e.target.value }))} />
        <input className="mp-input" placeholder="Equipamento" value={filters.equipamento} onChange={(e) => setFilters((f) => ({ ...f, equipamento: e.target.value }))} />
        <input className="mp-input" placeholder="Planta / área" value={filters.planta} onChange={(e) => setFilters((f) => ({ ...f, planta: e.target.value }))} />
        <input className="mp-input" placeholder="Material" value={filters.material} onChange={(e) => setFilters((f) => ({ ...f, material: e.target.value }))} />
        <input className="mp-input" placeholder="Origem" value={filters.origem} onChange={(e) => setFilters((f) => ({ ...f, origem: e.target.value }))} />
        <input className="mp-input" placeholder="Destino" value={filters.destino} onChange={(e) => setFilters((f) => ({ ...f, destino: e.target.value }))} />
        <input className="mp-input" placeholder="Letra" value={filters.letra} onChange={(e) => setFilters((f) => ({ ...f, letra: e.target.value }))} />
        <select className="mp-select" value={filters.turno} onChange={(e) => setFilters((f) => ({ ...f, turno: e.target.value }))}>
          <option value="">Turno: todos</option>
          <option value="1">Turno 1</option>
          <option value="2">Turno 2</option>
        </select>
        <select className="mp-select" value={selectedPlantId} onChange={(e) => setSelectedPlantId(e.target.value)}>
          <option value="">Produção: todas as plantas</option>
          {plants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
