// Conexão com o Supabase usando a chave SECRETA (só no seu PC, nunca no GitHub).
import { createClient } from "@supabase/supabase-js";

export function conectar() {
  const url = (process.env.SUPABASE_URL || "").trim();
  const chave = (process.env.SUPABASE_SECRET_KEY || "").trim();
  if (!url || !chave) {
    throw new Error("Faltam SUPABASE_URL e SUPABASE_SECRET_KEY no arquivo .env. Rode o configurar-online.bat.");
  }
  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Grava várias chaves na tabela "painel" (em lotes, para não estourar o tamanho do pedido).
export async function gravarChaves(sb, mapa) {
  const linhas = Object.entries(mapa).map(([chave, conteudo]) => ({ chave, conteudo, atualizado_em: new Date().toISOString() }));
  for (let i = 0; i < linhas.length; i += 40) {
    const { error } = await sb.from("painel").upsert(linhas.slice(i, i + 40), { onConflict: "chave" });
    if (error) throw new Error(`Supabase (gravar dados): ${error.message}`);
  }
}

export async function apagarChaves(sb, chaves) {
  if (!chaves.length) return;
  const { error } = await sb.from("painel").delete().in("chave", chaves);
  if (error) throw new Error(`Supabase (apagar dados antigos): ${error.message}`);
}

export async function enviarArquivo(sb, caminhoNuvem, buffer) {
  const { error } = await sb.storage.from("caixa").upload(caminhoNuvem, buffer, {
    upsert: true,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  if (error) throw new Error(`Supabase (enviar planilha do caixa): ${error.message}`);
}
