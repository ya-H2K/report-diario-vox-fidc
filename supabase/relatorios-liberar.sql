-- =====================================================================
--  Relatórios liberados para todos os usuários (08/10/2026).
--  Os arquivos dos relatórios (despesas, apresentações, balancetes) passam a ser
--  lidos por qualquer pessoa logada e ativa. Os dados dos relatórios já vão para
--  todos porque as chaves mudaram de "admin:..." para "rel:..." (publicador).
--  Cole isto no "SQL Editor" do Supabase e clique em "Run" (uma vez só).
-- =====================================================================

drop policy if exists "vox caixa leitura" on storage.objects;
create policy "vox caixa leitura" on storage.objects for select to authenticated
  using (bucket_id = 'caixa' and public._acesso_ok());

select 'Pronto! Relatórios liberados para todos os usuários.' as resultado;
