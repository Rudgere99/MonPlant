alter table public.bv_users
add column if not exists retro_token_enabled boolean not null default false;
