-- =====================================================================
--  Relatórios só para o administrador (Deságio e os próximos que entrarem).
--  Cole isto no "SQL Editor" do Supabase e clique em "Run" (uma vez só).
--  Faz a leitura dos dados do painel esconder as chaves "admin:..." de quem
--  não é administrador. O resto continua igual.
-- =====================================================================

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

select 'Pronto! Relatórios restritos ao administrador.' as resultado;
