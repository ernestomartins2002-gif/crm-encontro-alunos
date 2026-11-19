-- CRM · Encontro de Alunos (23/01/2027)
-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em "Run".
--
-- Regras de acesso:
--   • Gestor (papel = 'admin'): vê todos os leads, importa e divide leads entre os vendedores.
--   • Vendedor: vê e mexe SOMENTE nos leads atribuídos a ele (garantido pelo banco, não só pela tela).

create extension if not exists pgcrypto;

-- Perfis da equipe (criado automaticamente quando você cadastra um usuário) ----
create table if not exists public.perfis (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  nome       text not null default '',
  papel      text not null default 'vendedor' check (papel in ('admin','vendedor')),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

create or replace function public.criar_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, email, nome)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nome', ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.criar_perfil();

-- usuários que já existiam antes deste script
insert into public.perfis (id, email) select id, email from auth.users on conflict (id) do nothing;

create or replace function public.sou_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and papel = 'admin');
$$;

-- Leads ---------------------------------------------------------------
create table if not exists public.leads (
  id                   uuid primary key default gen_random_uuid(),
  chave                text unique not null,          -- DDD + 8 últimos dígitos (evita duplicar na importação)
  nome                 text not null,
  telefone             text,
  email                text,
  origens              text not null,                 -- ex.: "enquete,formacao,gps"
  origem_principal     text not null check (origem_principal in ('enquete','caixinha','formacao','gps')),
  etapa                text not null default 'origem'
                       check (etapa in ('origem','ligou1','ligou2','ligou3','ligou4','ligou5','atendeu','interesse','comprou')),
  responsavel_id       uuid references public.perfis(id) on delete set null,
  sem_interesse        boolean not null default false,
  observacao_importada text,
  data_captacao        text,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  atualizado_por       text
);

create table if not exists public.observacoes (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads(id) on delete cascade,
  texto      text not null,
  autor      text,
  autor_id   uuid default auth.uid(),
  criado_em  timestamptz not null default now()
);

create table if not exists public.tarefas (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads(id) on delete cascade,
  descricao  text not null,
  data       date not null,
  feita      boolean not null default false,
  feita_em   timestamptz,
  autor      text,
  autor_id   uuid default auth.uid(),
  criado_em  timestamptz not null default now()
);

create table if not exists public.historico (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads(id) on delete cascade,
  descricao  text not null,
  autor      text,
  criado_em  timestamptz not null default now()
);

create index if not exists leads_resp_idx       on public.leads(responsavel_id);
create index if not exists observacoes_lead_idx on public.observacoes(lead_id);
create index if not exists tarefas_lead_idx     on public.tarefas(lead_id);
create index if not exists tarefas_pend_idx     on public.tarefas(feita, data);
create index if not exists historico_lead_idx   on public.historico(lead_id);

create or replace function public.lead_e_meu(lead uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.sou_admin() or exists (select 1 from public.leads where id = lead and responsavel_id = auth.uid());
$$;

-- Segurança ------------------------------------------------------------
alter table public.perfis      enable row level security;
alter table public.leads       enable row level security;
alter table public.observacoes enable row level security;
alter table public.tarefas     enable row level security;
alter table public.historico   enable row level security;

drop policy if exists ver_equipe       on public.perfis;
drop policy if exists editar_meu_nome  on public.perfis;
drop policy if exists ver_leads        on public.leads;
drop policy if exists editar_leads     on public.leads;
drop policy if exists criar_leads      on public.leads;
drop policy if exists apagar_leads     on public.leads;
drop policy if exists acesso           on public.observacoes;
drop policy if exists acesso           on public.tarefas;
drop policy if exists acesso           on public.historico;

-- Permissões da API: só usuários logados (nada para visitantes anônimos).
-- Explícitas para funcionar mesmo com "Grant API access to new tables automatically" desligado.
revoke all on public.perfis, public.leads, public.observacoes, public.tarefas, public.historico from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.leads, public.observacoes, public.tarefas, public.historico to authenticated;
grant select on public.perfis to authenticated;
revoke execute on function public.sou_admin(), public.lead_e_meu(uuid) from public, anon;
grant execute on function public.sou_admin(), public.lead_e_meu(uuid) to authenticated;

-- todo mundo da equipe vê os nomes dos colegas; cada um só altera o próprio nome
create policy ver_equipe      on public.perfis for select to authenticated using (true);
create policy editar_meu_nome on public.perfis for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.perfis from authenticated;
grant  update (nome) on public.perfis to authenticated;

-- vendedor: só os leads dele, e não consegue passar o lead para outra pessoa
create policy ver_leads    on public.leads for select to authenticated using (public.sou_admin() or responsavel_id = auth.uid());
create policy editar_leads on public.leads for update to authenticated
  using (public.sou_admin() or responsavel_id = auth.uid())
  with check (public.sou_admin() or responsavel_id = auth.uid());
create policy criar_leads  on public.leads for insert to authenticated with check (public.sou_admin());
create policy apagar_leads on public.leads for delete to authenticated using (public.sou_admin());

create policy acesso on public.observacoes for all to authenticated using (public.lead_e_meu(lead_id)) with check (public.lead_e_meu(lead_id));
create policy acesso on public.tarefas     for all to authenticated using (public.lead_e_meu(lead_id)) with check (public.lead_e_meu(lead_id));
create policy acesso on public.historico   for all to authenticated using (public.lead_e_meu(lead_id)) with check (public.lead_e_meu(lead_id));

-- Atualização em tempo real -------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.leads, public.tarefas;
exception when duplicate_object then null; end $$;

-- =====================================================================
-- DEPOIS de cadastrar o seu usuário em Authentication → Users, rode a
-- linha abaixo (com o SEU e-mail) para virar gestor:
--
--   update public.perfis set papel = 'admin' where email = 'seu-email@exemplo.com';
-- =====================================================================
