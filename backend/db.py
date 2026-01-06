create index if not exists ix_bv_hori_owner_day
  on public.bv_horimetros(owner_id, day);

create index if not exists ix_bv_hori_owner_eq
  on public.bv_horimetros(owner_id, equipamento);

create index if not exists ix_bv_hori_owner_created
  on public.bv_horimetros(owner_id, created_at desc);
