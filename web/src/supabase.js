import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config-publica.js";

// Cliente do Supabase no navegador. Usa só a chave PÚBLICA: o que cada pessoa pode
// ver é decidido pelo banco (funções vox_* do supabase/configurar.sql).
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "vox-sessao" },
});

// Sessão caiu (bloqueado, excluído, senha trocada pelo admin ou expirou): a tela volta ao login.
supabase.auth.onAuthStateChange((evento) => {
  if (evento === "SIGNED_OUT") window.dispatchEvent(new Event("vox:sessao-expirada"));
});
