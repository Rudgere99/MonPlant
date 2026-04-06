// Adjusted PlantProduction.tsx (multi-planta)
// Changes: plant selector + API endpoints by plant_id

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LabelList,
} from "recharts";

// ... (helpers unchanged)

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";

function authHeaders(): HeadersInit {
  const t = (localStorage.getItem("mp_token") || "").trim();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export default function PlantProduction() {
  const periods = useMemo(() => {
    const res: string[] = [];
    for (let h = 0; h < 24; h++) {
      const h2 = (h + 1) % 24;
      res.push(`${String(h).padStart(2,"0")}:00-${String(h2).padStart(2,"0")}:00`);
    }
    return res;
  }, []);

  const [plants, setPlants] = useState<any[]>([]);
  const [plantId, setPlantId] = useState<number | null>(null);

  const [day, setDay] = useState<string>(new Date().toISOString().slice(0,10));
  const [payload, setPayload] = useState<any>({ day, obs:"", rows: periods.map(p=>({period:p})) });

  async function loadPlants(){
    const r = await fetch(`${API_BASE}/api/plants`, { headers: authHeaders() });
    const data = await r.json();
    setPlants(data);
    if(data.length && plantId===null) setPlantId(data[0].id);
  }

  async function loadDay(d:string){
    if(!plantId) return;
    const r = await fetch(`${API_BASE}/api/plants/${plantId}/plant-production/${d}`, { headers: authHeaders() });
    if(!r.ok) return;
    const data = await r.json();
    setPayload(data);
  }

  async function saveDay(){
    if(!plantId) return;
    await fetch(`${API_BASE}/api/plants/${plantId}/plant-production/${day}`,{
      method:"PUT",
      headers:{...authHeaders(),"Content-Type":"application/json"},
      body: JSON.stringify(payload)
    });
    alert("Salvo");
  }

  useEffect(()=>{ loadPlants(); },[]);
  useEffect(()=>{ if(plantId) loadDay(day); },[day,plantId]);

  return (
    <div>
      <h2>Produção</h2>

      <select value={plantId ?? ""} onChange={e=>setPlantId(Number(e.target.value))}>
        {plants.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      <input type="date" value={day} onChange={e=>setDay(e.target.value)} />

      <button onClick={saveDay}>Salvar</button>

      <pre>{JSON.stringify(payload,null,2)}</pre>
    </div>
  );
}
