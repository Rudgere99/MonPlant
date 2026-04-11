export type PlantRow = { period: string; ton: number | null; freq: number | null };
export type PlantDay = { day: string; obs?: string | null; rows: PlantRow[] };
export type StopItem = any;
export type HoriItem = any;
export type PlantInfo = { id: number; code: string; name: string };

export type ExportMode = "base" | "paradas";
export type PreviewMode = "base" | "paradas" | "producao";

export type PreviewColumn = {
  key: string;
  label: string;
  width?: number;
};

export type PreviewData = {
  title: string;
  subtitle: string;
  columns: PreviewColumn[];
  rows: Record<string, any>[];
  total: number;
};

export type ExportFilters = {
  turno: string;
  letra: string;
  planta: string;
  equipamento: string;
  material: string;
  origem: string;
  destino: string;
  pesquisa: string;
};
