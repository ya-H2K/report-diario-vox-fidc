-- =====================================================================
--  Apresentações de Resultados: os PDFs ficam só para o administrador
--  (enquanto a aba Relatórios estiver em teste).
--  Cole isto no "SQL Editor" do Supabase e clique em "Run" (uma vez só).
--  Para liberar a todos depois, rode de novo sem a linha das apresentações.
-- =====================================================================

drop policy if exists "vox caixa leitura" on storage.objects;
create policy "vox caixa leitura" on storage.objects for select to authenticated
  using (bucket_id = 'caixa' and public._acesso_ok()
         and ((name not like 'despesas/%' and name not like 'apresentacoes/%') or public._admin_ok()));

select 'Pronto! Apresentações de Resultados restritas ao administrador.' as resultado;
