-- Nova Jornada: área da empresa (etapa 1: escala planejada dos colaboradores).
-- Cada conta Google é dona de uma empresa. A empresa só cadastra e edita colaboradores
-- enquanto o mês estiver pago (pago_ate >= hoje). Pagamentos entram só pelo webhook do Mercado Pago.

-- ---------- tabelas ----------
create table public.empresas (
  id          uuid primary key default gen_random_uuid(),
  dono        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome        text not null check (char_length(btrim(nome)) between 2 and 120),
  uf          char(2) check (uf ~ '^[A-Z]{2}$'),
  cidade      text check (char_length(cidade) <= 80),
  pago_ate    date,                       -- acesso liberado até este dia (inclusive)
  criada_em   timestamptz not null default now()
);
create unique index empresas_um_dono on public.empresas (dono);

create table public.colaboradores (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id) on delete cascade,
  nome           text not null check (char_length(btrim(nome)) between 2 and 120),
  cargo          text check (char_length(cargo) <= 80),
  escala         jsonb not null check (jsonb_typeof(escala) = 'object' and pg_column_size(escala) < 8000),
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index colaboradores_empresa on public.colaboradores (empresa_id);

create table public.pagamentos (
  id               bigint generated always as identity primary key,
  empresa_id       uuid not null references public.empresas (id) on delete cascade,
  mp_pagamento_id  text not null unique,
  status           text not null,
  valor            numeric(10, 2),
  pago_em          timestamptz,
  criado_em        timestamptz not null default now()
);
create index pagamentos_empresa on public.pagamentos (empresa_id);

-- ---------- regras auxiliares ----------
create or replace function public.hoje_brasilia() returns date
language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- A empresa é do usuário logado e está com o mês pago?
create or replace function public.empresa_ativa(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.empresas e
    where e.id = eid and e.dono = auth.uid() and e.pago_ate >= public.hoje_brasilia()
  )
$$;

create or replace function public.empresa_do_usuario(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.empresas e where e.id = eid and e.dono = auth.uid())
$$;

-- Limite de colaboradores por empresa (protege o plano gratuito do banco).
create or replace function public.limitar_colaboradores() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.colaboradores where empresa_id = new.empresa_id) >= 300 then
    raise exception 'Limite de 300 colaboradores por empresa atingido';
  end if;
  return new;
end $$;
create trigger colaboradores_limite before insert on public.colaboradores
  for each row execute function public.limitar_colaboradores();

create or replace function public.tocar_atualizado_em() returns trigger
language plpgsql as $$ begin new.atualizado_em := now(); return new; end $$;
create trigger colaboradores_atualizado before update on public.colaboradores
  for each row execute function public.tocar_atualizado_em();

-- Chamada só pelo webhook (service role): registra o pagamento aprovado uma única vez
-- e soma 1 mês a partir de hoje ou do fim do mês já pago, o que for mais tarde.
create or replace function public.registrar_pagamento(
  p_empresa uuid, p_mp_id text, p_status text, p_valor numeric, p_pago_em timestamptz
) returns date
language plpgsql security definer set search_path = public as $$
declare
  ja_aprovado boolean;
  novo_fim date;
begin
  select status = 'approved' into ja_aprovado from public.pagamentos where mp_pagamento_id = p_mp_id for update;

  insert into public.pagamentos (empresa_id, mp_pagamento_id, status, valor, pago_em)
  values (p_empresa, p_mp_id, p_status, p_valor, p_pago_em)
  on conflict (mp_pagamento_id) do update set status = excluded.status, valor = excluded.valor, pago_em = excluded.pago_em;

  if p_status = 'approved' and coalesce(ja_aprovado, false) = false then
    update public.empresas
       set pago_ate = (greatest(coalesce(pago_ate, public.hoje_brasilia() - 1), public.hoje_brasilia() - 1) + interval '1 month')::date
     where id = p_empresa
     returning pago_ate into novo_fim;
  end if;
  return novo_fim;
end $$;
revoke all on function public.registrar_pagamento(uuid, text, text, numeric, timestamptz) from public, anon, authenticated;

-- ---------- permissões e RLS ----------
alter table public.empresas enable row level security;
alter table public.colaboradores enable row level security;
alter table public.pagamentos enable row level security;

revoke all on public.empresas, public.colaboradores, public.pagamentos from anon, authenticated;

-- Empresas: o dono vê e edita só nome e local. pago_ate só muda pelo webhook.
grant select, delete on public.empresas to authenticated;
grant insert (nome, uf, cidade) on public.empresas to authenticated;
grant update (nome, uf, cidade) on public.empresas to authenticated;
create policy empresas_ver on public.empresas for select to authenticated using (dono = auth.uid());
create policy empresas_criar on public.empresas for insert to authenticated with check (dono = auth.uid());
create policy empresas_editar on public.empresas for update to authenticated using (dono = auth.uid()) with check (dono = auth.uid());
create policy empresas_apagar on public.empresas for delete to authenticated using (dono = auth.uid());

-- Colaboradores: o dono sempre vê; cadastrar, editar e remover só com o mês pago.
grant select, insert, update, delete on public.colaboradores to authenticated;
create policy colaboradores_ver on public.colaboradores for select to authenticated
  using (public.empresa_do_usuario(empresa_id));
create policy colaboradores_criar on public.colaboradores for insert to authenticated
  with check (public.empresa_ativa(empresa_id));
create policy colaboradores_editar on public.colaboradores for update to authenticated
  using (public.empresa_ativa(empresa_id)) with check (public.empresa_ativa(empresa_id));
create policy colaboradores_apagar on public.colaboradores for delete to authenticated
  using (public.empresa_ativa(empresa_id));

-- Pagamentos: o dono só consulta.
grant select on public.pagamentos to authenticated;
create policy pagamentos_ver on public.pagamentos for select to authenticated
  using (public.empresa_do_usuario(empresa_id));
