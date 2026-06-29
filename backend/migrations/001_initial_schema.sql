-- MonPlant - schema inicial mínimo para PostgreSQL
-- Execute uma vez em um banco novo antes de iniciar a API.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.bv_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  sector text NOT NULL DEFAULT '',
  user_type text NOT NULL,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  can_edit_retroactive boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bv_logs (
  id bigserial PRIMARY KEY,
  user_id uuid NULL,
  user_name text NULL,
  user_type text NULL,
  action text NOT NULL,
  entity text NULL,
  entity_id text NULL,
  ip text NULL,
  user_agent text NULL,
  payload jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bv_logs_created_at ON public.bv_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bv_logs_user_id ON public.bv_logs(user_id);

CREATE TABLE IF NOT EXISTS public.bv_plants (
  id integer PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.bv_plants(id, code, name, description, is_active)
VALUES
  (1, 'PLANTA-01', 'Planta 01', 'Planta 01', true),
  (2, 'PLANTA-02', 'Planta 02', 'Planta 02', true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.bv_equipments (
  id bigserial PRIMARY KEY,
  owner_id text NOT NULL DEFAULT 'default',
  equipment_type text NOT NULL DEFAULT 'escavadeira',
  tag text NOT NULL,
  bucket_ton numeric(18,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_bv_equipments_owner_tag ON public.bv_equipments(owner_id, upper(tag));

CREATE TABLE IF NOT EXISTS public.bv_plant_equipment_allocations (
  id bigserial PRIMARY KEY,
  owner_id text NOT NULL DEFAULT 'default',
  plant_id integer NOT NULL REFERENCES public.bv_plants(id),
  equipment_id bigint NULL REFERENCES public.bv_equipments(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_bv_plant_equipment_allocations_owner_plant ON public.bv_plant_equipment_allocations(owner_id, plant_id);

CREATE TABLE IF NOT EXISTS public.bv_plant_production_equipments (
  id bigserial PRIMARY KEY,
  owner_id text NOT NULL DEFAULT 'default',
  plant_id integer NOT NULL REFERENCES public.bv_plants(id),
  tag text NOT NULL,
  description text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_bv_ppe_owner_plant_tag ON public.bv_plant_production_equipments(owner_id, plant_id, upper(tag));
CREATE INDEX IF NOT EXISTS idx_bv_ppe_owner_plant_active ON public.bv_plant_production_equipments(owner_id, plant_id, is_active);

CREATE TABLE IF NOT EXISTS public.bv_plant_production_daily (
  owner_id text NOT NULL DEFAULT 'default',
  day date NOT NULL,
  plant_id integer NOT NULL DEFAULT 1 REFERENCES public.bv_plants(id),
  obs text NULL,
  original_rows jsonb NULL,
  over_moved_t numeric(18,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id, day, plant_id)
);

CREATE TABLE IF NOT EXISTS public.bv_plant_production_rows (
  id bigserial PRIMARY KEY,
  owner_id text NOT NULL DEFAULT 'default',
  day date NOT NULL,
  plant_id integer NOT NULL DEFAULT 1 REFERENCES public.bv_plants(id),
  period text NOT NULL,
  ton numeric(18,2) NULL,
  freq numeric(18,2) NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bv_ppr_owner_day_plant ON public.bv_plant_production_rows(owner_id, day, plant_id);
CREATE INDEX IF NOT EXISTS idx_bv_ppr_period ON public.bv_plant_production_rows(period);

CREATE TABLE IF NOT EXISTS public.bv_stops (
  id bigserial PRIMARY KEY,
  owner_id text NOT NULL DEFAULT 'default',
  plant_id integer NOT NULL DEFAULT 1 REFERENCES public.bv_plants(id),
  day date NOT NULL,
  turno integer NOT NULL,
  data_inicio text NOT NULL,
  hora_inicio text NOT NULL,
  data_fim text NOT NULL,
  hora_fim text NOT NULL,
  equipamento text NOT NULL,
  tipo_parada text NOT NULL,
  atividade text NOT NULL,
  descricao text NOT NULL,
  tempo_parada_h numeric(18,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bv_stops_owner_day_plant ON public.bv_stops(owner_id, day, plant_id);

CREATE TABLE IF NOT EXISTS public.bv_horimetros (
  id bigserial PRIMARY KEY,
  owner_id text NOT NULL DEFAULT 'default',
  plant_id integer NOT NULL DEFAULT 1 REFERENCES public.bv_plants(id),
  day date NOT NULL,
  turno integer NOT NULL,
  equipamento text NOT NULL,
  horimetro_ini numeric(18,2) NOT NULL,
  horimetro_fim numeric(18,2) NOT NULL,
  obs text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bv_horimetros_owner_plant_day ON public.bv_horimetros(owner_id, plant_id, day);
CREATE INDEX IF NOT EXISTS idx_bv_horimetros_owner_plant_eq ON public.bv_horimetros(owner_id, plant_id, equipamento);

CREATE TABLE IF NOT EXISTS public.bv_goals_daily (
  owner_id text NOT NULL DEFAULT 'default',
  plant_id integer NOT NULL DEFAULT 1 REFERENCES public.bv_plants(id),
  day date NOT NULL,
  meta_ton numeric(18,2) NOT NULL DEFAULT 0,
  discount_hours numeric(18,2) NOT NULL DEFAULT 2,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id, plant_id, day)
);

CREATE TABLE IF NOT EXISTS public.bv_supervisores_planta (
  id bigserial PRIMARY KEY,
  owner_id text NOT NULL DEFAULT 'default',
  nome_completo text NOT NULL,
  empresa text NOT NULL,
  plant_id integer NOT NULL REFERENCES public.bv_plants(id),
  planta_id integer NULL,
  letra_turno text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bv_supervisores_planta_owner_plant ON public.bv_supervisores_planta(owner_id, plant_id);

CREATE TABLE IF NOT EXISTS public.bv_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  created_by uuid NULL,
  created_by_name text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  closed_at timestamptz NULL,
  source_key text NULL,
  notice_type text NULL
);
CREATE INDEX IF NOT EXISTS idx_bv_notices_source_key ON public.bv_notices(source_key);

CREATE TABLE IF NOT EXISTS public.bv_notice_reads (
  id bigserial PRIMARY KEY,
  notice_id uuid NOT NULL REFERENCES public.bv_notices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(notice_id, user_id)
);

CREATE SCHEMA IF NOT EXISTS bv_launch;

CREATE TABLE IF NOT EXISTS bv_launch.stops_day (
  id bigserial PRIMARY KEY,
  owner_id text NOT NULL DEFAULT 'default',
  day date NOT NULL,
  plant_id integer NOT NULL DEFAULT 1 REFERENCES public.bv_plants(id),
  obs text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_stops_day_owner_day_plant ON bv_launch.stops_day(owner_id, day, plant_id);

CREATE TABLE IF NOT EXISTS bv_launch.stops_rows (
  id bigserial PRIMARY KEY,
  day_id bigint NOT NULL REFERENCES bv_launch.stops_day(id) ON DELETE CASCADE,
  period text NOT NULL,
  equipment text NULL,
  stop_type text NULL,
  description text NULL,
  minutes integer NOT NULL DEFAULT 0,
  hora_inicial time NULL,
  hora_final time NULL,
  justificativa_baixa_producao text NULL,
  ordem integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_stops_rows_horas_preenchidas_juntas CHECK (
    (hora_inicial IS NULL AND hora_final IS NULL)
    OR
    (hora_inicial IS NOT NULL AND hora_final IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_stops_rows_day_period_ordem ON bv_launch.stops_rows(day_id, period, ordem);
CREATE INDEX IF NOT EXISTS idx_stops_rows_day_period_horas ON bv_launch.stops_rows(day_id, period, hora_inicial, hora_final);
