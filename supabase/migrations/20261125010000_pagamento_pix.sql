-- Nova Jornada: pagamento da área da empresa por Pix direto na chave do dono do site.
-- A empresa gera o Pix copia e cola (R$ 10, com um identificador), paga e clica em "Já fiz o Pix":
-- o mês é liberado NA HORA. O administrador confere o extrato depois:
--   Confirmar  -> o mês continua valendo;
--   Recusar    -> o mês liberado é retirado.
-- Enquanto houver um aviso sem conferência, a empresa não consegue avisar outro
-- (no máximo 1 mês liberado sem conferência por empresa).

-- ---------- administradores ----------
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;

-- ---------- avisos de Pix ----------
create table public.pedidos_pix (
  id           bigint generated always as identity primary key,
  empresa_id   uuid not null references public.empresas (id) on delete cascade,
  txid         text not null check (txid ~ '^[A-Za-z0-9]{1,25}$'),
  valor        numeric(10, 2) not null default 10,
  status       text not null default 'aguardando' check (status in ('aguardando', 'confirmado', 'recusado')),
  liberado_ate date,                       -- até quando o aviso liberou o acesso
  criado_em    timestamptz not null default now(),
  decidido_em  timestamptz
);
create index pedidos_pix_empresa on public.pedidos_pix (empresa_id);
-- No máximo um aviso sem conferência por empresa.
create unique index pedidos_pix_um_aguardando on public.pedidos_pix (empresa_id) where status = 'aguardando';

alter table public.pedidos_pix enable row level security;
revoke all on public.pedidos_pix from anon, authenticated;
grant select on public.pedidos_pix to authenticated;
create policy pedidos_ver on public.pedidos_pix for select to authenticated
  using (public.empresa_do_usuario(empresa_id) or public.eh_admin());

-- O administrador vê todas as empresas (nome, cidade e até quando está pago).
create policy empresas_admin_ver on public.empresas for select to authenticated using (public.eh_admin());

-- ---------- a empresa avisa que pagou: libera 1 mês na hora ----------
create or replace function public.avisar_pix(p_empresa uuid, p_txid text) returns date
language plpgsql security definer set search_path = public as $$
declare
  novo_fim date;
begin
  if not public.empresa_do_usuario(p_empresa) then raise exception 'Empresa não encontrada'; end if;
  if exists (select 1 from public.pedidos_pix where empresa_id = p_empresa and status = 'aguardando') then
    raise exception 'Já existe um Pix aguardando conferência';
  end if;

  update public.empresas
     set pago_ate = (greatest(coalesce(pago_ate, public.hoje_brasilia() - 1), public.hoje_brasilia() - 1) + interval '1 month')::date
   where id = p_empresa
   returning pago_ate into novo_fim;

  insert into public.pedidos_pix (empresa_id, txid, liberado_ate) values (p_empresa, p_txid, novo_fim);
  return novo_fim;
end $$;

-- ---------- conferência do administrador ----------
create or replace function public.confirmar_pix(p_pedido bigint) returns date
language plpgsql security definer set search_path = public as $$
declare
  ped public.pedidos_pix;
begin
  if not public.eh_admin() then raise exception 'Apenas administradores'; end if;
  select * into ped from public.pedidos_pix where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if ped.status <> 'aguardando' then raise exception 'Pedido já conferido'; end if;

  update public.pedidos_pix set status = 'confirmado', decidido_em = now() where id = p_pedido;
  insert into public.pagamentos (empresa_id, mp_pagamento_id, status, valor, pago_em)
  values (ped.empresa_id, 'pix-' || ped.id, 'approved', ped.valor, ped.criado_em);
  return ped.liberado_ate;
end $$;

-- Recusar retira o mês que o aviso liberou.
create or replace function public.recusar_pix(p_pedido bigint) returns date
language plpgsql security definer set search_path = public as $$
declare
  ped public.pedidos_pix;
  novo_fim date;
begin
  if not public.eh_admin() then raise exception 'Apenas administradores'; end if;
  select * into ped from public.pedidos_pix where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if ped.status <> 'aguardando' then raise exception 'Pedido já conferido'; end if;

  update public.pedidos_pix set status = 'recusado', decidido_em = now() where id = p_pedido;
  update public.empresas
     set pago_ate = (pago_ate - interval '1 month')::date
   where id = ped.empresa_id and pago_ate is not null
   returning pago_ate into novo_fim;
  return novo_fim;
end $$;

revoke all on function public.avisar_pix(uuid, text), public.confirmar_pix(bigint), public.recusar_pix(bigint) from public, anon;
grant execute on function public.avisar_pix(uuid, text), public.confirmar_pix(bigint), public.recusar_pix(bigint) to authenticated;
revoke all on function public.eh_admin() from public, anon;
grant execute on function public.eh_admin() to authenticated;

-- ---------- quem é administrador ----------
-- Troque o e-mail se você entrar no site com outra conta Google.
insert into public.admins (user_id)
select id from auth.users where email = 'iltoneto444@gmail.com'
on conflict do nothing;
