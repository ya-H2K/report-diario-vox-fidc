-- =====================================================================
--  Relatório de Despesas: a planilha para download fica só para o administrador.
--  Cole isto no "SQL Editor" do Supabase e clique em "Run" (uma vez só).
--  (Os dados da tela já são só do admin pela regra do relatorios-admin.sql.)
-- =====================================================================

drop policy if exists "vox caixa leitura" on storage.objects;
create policy "vox caixa leitura" on storage.objects for select to authenticated
  using (bucket_id = 'caixa' and public._acesso_ok()
         and (name not like 'despesas/%' or public._admin_ok()));

select 'Pronto! Planilha de despesas restrita ao administrador.' as resultado;
