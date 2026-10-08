-- =====================================================================
--  Dashboard Vox FIDC: configuração do banco no Supabase
--  Cole TUDO isto no "SQL Editor" do Supabase e clique em "Run".
--  Pode rodar de novo sem medo: não apaga nada que já exista.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- tabelas

-- Domínios de e-mail que podem pedir acesso (domínio exato, depois do @).
create table if not exists public.dominios_permitidos (dominio text primary key);
insert into public.dominios_permitidos (dominio) values
  ('h2kapital.com.br'), ('voxcred.com.br'), ('tendaatacado.com.br')
on conflict do nothing;

-- Quem tem acesso ao site (uma linha por login do Supabase).
create table if not exists public.perfis (
  id              uuid primary key references auth.users (id) on delete cascade,
  nome            text not null,
  email           text not null unique,
  cpf             text unique,
  status          text not null default 'pendente' check (status in ('pendente', 'ativo', 'bloqueado')),
  admin           boolean not null default false,
  criado_em       timestamptz not null default now(),
  solicitado_em   timestamptz not null default now(),
  aprovado_em     timestamptz,
  ultimo_acesso   timestamptz,
  nova_senha_hash text,            -- "Esqueci minha senha": hash da senha nova, até o admin aprovar
  nova_senha_em   timestamptz
);

-- Convite de uso único para criar o login do admin (gerado pelo configurar-online.bat).
create table if not exists public.convites (
  token     text primary key,
  criado_em timestamptz not null default now()
);

-- Dados do painel, enviados pelo publicador do seu PC (já filtrados).
create table if not exists public.painel (
  chave         text primary key,
  conteudo      jsonb not null,
  atualizado_em timestamptz not null default now()
);

-- Ninguém lê ou grava as tabelas direto pelo site: tudo passa pelas funções abaixo,
-- que conferem quem está pedindo. (O publicador usa a chave secreta e grava direto.)
alter table public.dominios_permitidos enable row level security;
alter table public.perfis enable row level security;
alter table public.painel enable row level security;
alter table public.convites enable row level security;
revoke all on public.dominios_permitidos, public.perfis, public.painel, public.convites from anon, authenticated;

-- ---------------------------------------------------------------- regras

create or replace function public._cpf_valido(c text) returns boolean
language plpgsql immutable as $$
declare
  d text := regexp_replace(coalesce(c, ''), '\D', '', 'g');
  s int; t int; i int;
begin
  if length(d) <> 11 or d ~ '^(\d)\1{10}$' then return false; end if;
  foreach t in array array[9, 10] loop
    s := 0;
    for i in 1..t loop s := s + substr(d, i, 1)::int * (t + 2 - i); end loop;
    if ((s * 10) % 11) % 10 <> substr(d, t + 1, 1)::int then return false; end if;
  end loop;
  return true;
end $$;

create or replace function public._senha_valida(s text) returns boolean
language sql immutable as $$
  select length(coalesce(s, '')) >= 8 and s ~ '\d' and s ~ '[^A-Za-z0-9[:space:]]'
$$;

-- Antes de criar um login: só domínios permitidos.
create or replace function public._antes_criar_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.dominios_permitidos
                 where dominio = lower(split_part(new.email, '@', 2))) then
    raise exception 'VOX_DOMINIO: este e-mail não tem permissão de acesso. Use o seu e-mail corporativo.';
  end if;
  return new;
end $$;

-- Depois de criar o login: cria o perfil "pendente" (o admin, criado pelo publicador, já entra ativo).
create or replace function public._apos_criar_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_nome  text := btrim(regexp_replace(coalesce(new.raw_user_meta_data ->> 'nome', ''), '\s+', ' ', 'g'));
  v_cpf   text := regexp_replace(coalesce(new.raw_user_meta_data ->> 'cpf', ''), '\D', '', 'g');
  v_admin boolean := coalesce((new.raw_app_meta_data ->> 'vox_admin')::boolean, false);
  v_convite text := new.raw_user_meta_data ->> 'vox_convite';
begin
  if v_convite is not null and exists (select 1 from public.convites where token = v_convite
                                       and criado_em > now() - interval '1 hour') then
    v_admin := true;
  end if;
  delete from public.convites where token = v_convite;
  if v_admin then
    insert into public.perfis (id, nome, email, cpf, status, admin, aprovado_em)
    values (new.id, coalesce(nullif(v_nome, ''), 'Administrador'), lower(new.email), nullif(v_cpf, ''), 'ativo', true, now())
    on conflict (id) do update set status = 'ativo', admin = true;
    return new;
  end if;
  if position(' ' in v_nome) = 0 then raise exception 'VOX_NOME: informe o nome completo.'; end if;
  if not public._cpf_valido(v_cpf) then raise exception 'VOX_CPF: CPF inválido.'; end if;
  if exists (select 1 from public.perfis where cpf = v_cpf) then
    raise exception 'VOX_CPF_DUPLICADO: este CPF já está cadastrado com outro e-mail.';
  end if;
  insert into public.perfis (id, nome, email, cpf) values (new.id, v_nome, lower(new.email), v_cpf);
  return new;
end $$;

drop trigger if exists vox_antes_criar_usuario on auth.users;
create trigger vox_antes_criar_usuario before insert on auth.users
  for each row execute function public._antes_criar_usuario();
drop trigger if exists vox_apos_criar_usuario on auth.users;
create trigger vox_apos_criar_usuario after insert on auth.users
  for each row execute function public._apos_criar_usuario();

-- Quem está pedindo tem acesso? (perfil ativo E sessão ainda válida: bloquear,
-- excluir ou trocar a senha derruba quem está com o site aberto na hora)
create or replace function public._acesso_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and exists (select 1 from public.perfis p where p.id = auth.uid() and p.status = 'ativo')
     and exists (select 1 from auth.sessions s
                 where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid and s.user_id = auth.uid())
$$;

create or replace function public._admin_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select public._acesso_ok() and exists (select 1 from public.perfis p where p.id = auth.uid() and p.admin)
$$;

create or replace function public._derrubar_sessoes(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from auth.sessions where user_id = p_id;
  delete from auth.refresh_tokens where user_id = p_id::text;
end $$;

-- ---------------------------------------------------------------- funções usadas pelo site

-- Domínios aceitos no cadastro (a tela avisa antes de enviar).
create or replace function public.vox_dominios() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(dominio order by dominio), '{}') from public.dominios_permitidos
$$;

-- Quem sou eu (a tela usa para saber se o cadastro está pendente/bloqueado e se é admin).
create or replace function public.vox_eu() returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.perfis;
begin
  select * into p from public.perfis where id = auth.uid();
  if not found then return null; end if;
  if p.status = 'ativo' then update public.perfis set ultimo_acesso = now() where id = p.id; end if;
  return jsonb_build_object('id', p.id, 'nome', p.nome, 'email', p.email, 'status', p.status,
    'admin', p.admin, 'sessaoOk', public._acesso_ok());
end $$;

-- Lê os dados do painel. Sem acesso: erro (a tela volta para o login).
create or replace function public.vox_painel(p_chaves text[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._acesso_ok() then
    raise exception 'VOX_SEM_ACESSO' using errcode = '42501';
  end if;
  -- chaves "admin:..." (relatórios em teste) só vão para o administrador
  return coalesce((select jsonb_object_agg(chave, conteudo) from public.painel
                   where chave = any (p_chaves) and (chave not like 'admin:%' or public._admin_ok())), '{}'::jsonb);
end $$;

-- Esqueci minha senha: a senha nova fica guardada (só o hash) até o admin aprovar.
-- A resposta é sempre a mesma, para não revelar quais e-mails têm cadastro.
create or replace function public.vox_pedir_nova_senha(p_email text, p_senha text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare p public.perfis;
begin
  if not public._senha_valida(p_senha) then
    raise exception 'VOX_SENHA: a senha precisa ter pelo menos 8 caracteres, 1 número e 1 caractere especial.';
  end if;
  select * into p from public.perfis where email = lower(btrim(p_email));
  if not found then return; end if;
  if p.status = 'ativo' then
    update public.perfis set nova_senha_hash = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
      nova_senha_em = now() where id = p.id;
  elsif p.status = 'pendente' then
    -- ainda não aprovado: só troca a senha do pedido
    update auth.users set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
      updated_at = now() where id = p.id;
  end if;
end $$;

-- ---------------------------------------------------------------- funções do admin

create or replace function public.vox_admin_pendentes() returns int
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._admin_ok() then raise exception 'VOX_SEM_ACESSO' using errcode = '42501'; end if;
  return (select count(*) from public.perfis where not admin and (status = 'pendente' or nova_senha_hash is not null));
end $$;

create or replace function public.vox_admin_usuarios() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._admin_ok() then raise exception 'VOX_SEM_ACESSO' using errcode = '42501'; end if;
  return jsonb_build_object(
    'dominios', to_jsonb(public.vox_dominios()),
    'pendentes', public.vox_admin_pendentes(),
    'usuarios', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'nome', nome, 'email', email,
        'cpf', case when length(cpf) = 11 then '***.' || substr(cpf, 4, 3) || '.' || substr(cpf, 7, 3) || '-**' else '' end,
        'status', status, 'criadoEm', criado_em, 'solicitadoEm', solicitado_em, 'aprovadoEm', aprovado_em,
        'ultimoAcesso', ultimo_acesso, 'pediuNovaSenha', nova_senha_hash is not null, 'novaSenhaEm', nova_senha_em)
        order by nome)
      from public.perfis where not admin), '[]'::jsonb));
end $$;

-- p_acao: aprovar | recusar | aprovar-senha | recusar-senha | bloquear | desbloquear | excluir
create or replace function public.vox_admin_acao(p_id uuid, p_acao text) returns void
language plpgsql security definer set search_path = public as $$
declare p public.perfis;
begin
  if not public._admin_ok() then raise exception 'VOX_SEM_ACESSO' using errcode = '42501'; end if;
  select * into p from public.perfis where id = p_id and not admin;
  if not found then raise exception 'VOX_ERRO: usuário não encontrado.'; end if;

  if p_acao = 'aprovar' then
    if p.status <> 'pendente' then raise exception 'VOX_ERRO: este usuário não está aguardando aprovação.'; end if;
    update public.perfis set status = 'ativo', aprovado_em = now() where id = p_id;
  elsif p_acao = 'recusar' then
    if p.status <> 'pendente' then raise exception 'VOX_ERRO: este usuário não está aguardando aprovação.'; end if;
    delete from auth.users where id = p_id;              -- pode pedir de novo depois
  elsif p_acao = 'aprovar-senha' then
    if p.nova_senha_hash is null then raise exception 'VOX_ERRO: não há pedido de nova senha.'; end if;
    update auth.users set encrypted_password = p.nova_senha_hash, updated_at = now() where id = p_id;
    update public.perfis set nova_senha_hash = null, nova_senha_em = null where id = p_id;
    perform public._derrubar_sessoes(p_id);              -- quem estava logado com a senha antiga sai
  elsif p_acao = 'recusar-senha' then
    update public.perfis set nova_senha_hash = null, nova_senha_em = null where id = p_id;
  elsif p_acao = 'bloquear' then
    if p.status = 'pendente' then raise exception 'VOX_ERRO: cadastro ainda não aprovado: use Excluir.'; end if;
    update public.perfis set status = 'bloqueado' where id = p_id;
    perform public._derrubar_sessoes(p_id);
  elsif p_acao = 'desbloquear' then
    update public.perfis set status = 'ativo' where id = p_id and status = 'bloqueado';
  elsif p_acao = 'excluir' then
    delete from auth.users where id = p_id;              -- apaga o perfil junto
  else
    raise exception 'VOX_ERRO: ação desconhecida.';
  end if;
end $$;

-- ---------------------------------------------------------------- permissões das funções

revoke all on function public._cpf_valido(text), public._senha_valida(text), public._antes_criar_usuario(),
  public._apos_criar_usuario(), public._acesso_ok(), public._admin_ok(), public._derrubar_sessoes(uuid),
  public.vox_dominios(), public.vox_eu(), public.vox_painel(text[]), public.vox_pedir_nova_senha(text, text),
  public.vox_admin_pendentes(), public.vox_admin_usuarios(), public.vox_admin_acao(uuid, text)
  from public, anon, authenticated;

grant execute on function public.vox_dominios(), public.vox_pedir_nova_senha(text, text) to anon, authenticated;
grant execute on function public.vox_eu(), public.vox_painel(text[]), public.vox_admin_pendentes(),
  public.vox_admin_usuarios(), public.vox_admin_acao(uuid, text), public._acesso_ok(), public._admin_ok() to authenticated;

-- ---------------------------------------------------------------- arquivos do fluxo de caixa

insert into storage.buckets (id, name, public) values ('caixa', 'caixa', false)
on conflict (id) do nothing;

drop policy if exists "vox caixa leitura" on storage.objects;
create policy "vox caixa leitura" on storage.objects for select to authenticated
  using (bucket_id = 'caixa' and public._acesso_ok()
         and (name not like 'despesas/%' or public._admin_ok()));   -- despesas: só o admin, por enquanto

select 'Pronto! Banco do dashboard Vox configurado.' as resultado;
