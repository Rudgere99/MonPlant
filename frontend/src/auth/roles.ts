// src/auth/roles.ts
// Centraliza tipos e labels de papéis do MonPlant

export type UserRole =
  | "apontador"
  | "controlador"
  | "gerencia"
  | "supervisor"
  | "gestao_vista"
  | "dev";

export const ROLE_LABEL: Record<UserRole, string> = {
  apontador: "Apontador",
  controlador: "Controlador",
  gerencia: "Gerência",
  supervisor: "Supervisor",
  gestao_vista: "Gestão à Vista",
  dev: "DEV",
};
