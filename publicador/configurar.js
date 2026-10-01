// Configuração guiada (roda pelo configurar-online.bat):
//  1. pergunta as chaves do Supabase e o login do admin e grava no .env
//  2. confere se o SQL já foi rodado no Supabase
//  3. cria (ou atualiza) o login do administrador
//  4. grava web/src/config-publica.js (endereço do Supabase + chave PÚBLICA, que podem ir pro GitHub)
//  5. faz o primeiro envio dos dados
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARQ_ENV = path.join(RAIZ, ".env");
const ARQ_WEB = path.join(RAIZ, "web", "src", "config-publica.js");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const titulo = (t) => console.log(`\n=== ${t} ${"=".repeat(Math.max(3, 60 - t.length))}`);
const ok = (t) => console.log(`  [OK] ${t}`);
const falhar = (t) => { console.log(`\n  [ERRO] ${t}\n`); rl.close(); process.exit(1); };

// ---------------------------------------------------------------- .env
if (!fs.existsSync(ARQ_ENV)) fs.copyFileSync(path.join(RAIZ, ".env.example"), ARQ_ENV);
let textoEnv = fs.readFileSync(ARQ_ENV, "utf-8");
const env = dotenv.parse(textoEnv);

function gravarEnv(chave, valor) {
  env[chave] = valor;
  process.env[chave] = valor;
  const linha = `${chave}=${valor}`;
  const re = new RegExp(`^${chave}=.*$`, "m");
  if (re.test(textoEnv)) textoEnv = textoEnv.replace(re, () => linha);
  else {
    if (!/\n# =+ SITE ONLINE/.test(textoEnv)) textoEnv += `\n# ============================ SITE ONLINE (Supabase) ============================\n`;
    textoEnv += `${linha}\n`;
  }
  fs.writeFileSync(ARQ_ENV, textoEnv, "utf-8");
}

async function perguntar(chave, pergunta, validar, { mostrarAtual = true } = {}) {
  const atual = (env[chave] || "").trim();
  if (atual && !validar(atual)) {          // já tem um valor válido: pergunta se mantém
    const r = (await rl.question(`  ${pergunta}\n  (já preenchido${mostrarAtual ? `: ${atual.slice(0, 40)}${atual.length > 40 ? "..." : ""}` : ""}). Aperte ENTER para manter ou cole outro: `)).trim();
    if (!r) return atual;
    const erro = validar(r);
    if (!erro) { gravarEnv(chave, r); return r; }
    console.log(`  -> ${erro}`);
  }
  for (;;) {
    const r = (await rl.question(`  ${pergunta}\n  > `)).trim();
    const erro = validar(r);
    if (!erro) { gravarEnv(chave, r); return r; }
    console.log(`  -> ${erro} Tente de novo.\n`);
  }
}

const senhaValida = (s) => s.length >= 8 && /\d/.test(s) && /[^A-Za-z0-9\s]/.test(s);

titulo("1. Chaves do Supabase");
const url = await perguntar("SUPABASE_URL", "Cole a Project URL (algo como https://abcdefgh.supabase.co):", (v) => {
  const limpo = v.replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(limpo)) return "Isso não parece a Project URL. Ela começa com https:// e termina com .supabase.co.";
  return null;
});
if (url.endsWith("/")) gravarEnv("SUPABASE_URL", url.replace(/\/+$/, ""));
await perguntar("SUPABASE_PUBLISHABLE_KEY", "Cole a chave PUBLISHABLE (começa com sb_publishable_):", (v) =>
  /^sb_publishable_/.test(v) || /^eyJ/.test(v) ? null : "A chave publishable começa com sb_publishable_ .");
await perguntar("SUPABASE_SECRET_KEY", "Cole a chave SECRET (começa com sb_secret_). Ela fica só no seu PC:", (v) =>
  /^sb_secret_/.test(v) || /^eyJ/.test(v) ? null : "A chave secret começa com sb_secret_ .", { mostrarAtual: false });
if (env.SUPABASE_SECRET_KEY === env.SUPABASE_PUBLISHABLE_KEY) falhar("Você colou a mesma chave duas vezes. A publishable e a secret são diferentes.");

titulo("2. Login do administrador");
const dominios = (env.DOMINIOS_PERMITIDOS || "h2kapital.com.br,voxcred.com.br,tendaatacado.com.br").split(",").map((d) => d.trim().toLowerCase());
const adminEmail = (await perguntar("ADMIN_EMAIL", "Qual e-mail o ADMIN vai usar para entrar no site?", (v) => {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "E-mail inválido.";
  if (!dominios.includes(v.toLowerCase().split("@")[1])) return `Use um e-mail de: ${dominios.join(", ")}.`;
  return null;
})).toLowerCase();
const adminSenha = await perguntar("ADMIN_SENHA", "Crie a senha do admin (mín. 8 caracteres, 1 número e 1 caractere especial, ex.: !@#$):", (v) => {
  if (v === "admin2027") return "Essa é a senha padrão antiga, escolha outra.";
  return senhaValida(v) ? null : "A senha precisa ter 8+ caracteres, 1 número e 1 caractere especial.";
}, { mostrarAtual: false });

// ---------------------------------------------------------------- Supabase
const { conectar } = await import("./nuvem.js");
const sb = conectar();

titulo("3. Conferindo o banco no Supabase");
{
  const { error } = await sb.from("painel").select("chave", { head: true, count: "exact" });
  if (error) {
    if (/Invalid API key|JWT|apikey|401/i.test(error.message)) falhar("O Supabase recusou a chave SECRET. Confira se copiou a chave certa (sb_secret_...) do mesmo projeto da URL.");
    if (/does not exist|schema cache|not find/i.test(error.message)) falhar("Não achei as tabelas. Faltou rodar o arquivo supabase\\configurar.sql no SQL Editor do Supabase (passo 3 do guia).");
    falhar(`Não consegui falar com o Supabase: ${error.message}`);
  }
  ok("Banco configurado e chave secreta funcionando.");
}

titulo("4. Criando o login do administrador");
{
  const token = crypto.randomBytes(24).toString("hex");
  const { error: errConvite } = await sb.from("convites").insert({ token });
  if (errConvite) falhar(`Não consegui preparar o convite do admin: ${errConvite.message}`);
  const { data, error } = await sb.auth.admin.createUser({
    email: adminEmail, password: adminSenha, email_confirm: true,
    user_metadata: { nome: "Administrador", vox_convite: token },
  });
  let id = data?.user?.id;
  if (error) {
    if (!/already|exists|registered/i.test(error.message) && error.code !== "email_exists") {
      falhar(`Não consegui criar o admin: ${error.message}`);
    }
    // já existe: atualiza a senha e garante que é admin
    for (let page = 1; !id && page < 50; page++) {
      const { data: lista, error: e2 } = await sb.auth.admin.listUsers({ page, perPage: 200 });
      if (e2) falhar(`Não consegui procurar o admin: ${e2.message}`);
      id = lista.users.find((u) => u.email?.toLowerCase() === adminEmail)?.id;
      if (lista.users.length < 200) break;
    }
    if (!id) falhar("O Supabase diz que o e-mail já existe, mas não encontrei o usuário.");
    const { error: e3 } = await sb.auth.admin.updateUserById(id, { password: adminSenha, email_confirm: true });
    if (e3) falhar(`Não consegui atualizar a senha do admin: ${e3.message}`);
  }
  await sb.from("convites").delete().eq("token", token);
  const { error: e4 } = await sb.from("perfis").upsert({ id, nome: "Administrador", email: adminEmail, status: "ativo",
    admin: true, aprovado_em: new Date().toISOString() }, { onConflict: "id" });
  if (e4) falhar(`Não consegui marcar o admin: ${e4.message}`);
  ok(`Admin pronto: ${adminEmail}`);
}

titulo("5. Configuração pública do site");
{
  const conteudo = `// Gerado pelo configurar-online.bat. Pode ir para o GitHub: são dados PÚBLICOS
// (o endereço do Supabase e a chave "publishable", feita para ficar no navegador).
// A chave secreta NUNCA vai aqui: ela fica só no .env do seu PC.
export const SUPABASE_URL = ${JSON.stringify(env.SUPABASE_URL)};
export const SUPABASE_PUBLISHABLE_KEY = ${JSON.stringify(env.SUPABASE_PUBLISHABLE_KEY)};
export const SESSAO_HORAS = ${Number(env.SESSAO_HORAS || 12)};
`;
  fs.writeFileSync(ARQ_WEB, conteudo, "utf-8");
  ok("web/src/config-publica.js gravado.");
}

titulo("6. Primeiro envio dos dados");
{
  // recarrega a config do servidor já com o .env atualizado
  dotenv.config({ path: ARQ_ENV, override: true });
  const { publicar } = await import("./publicar.js");
  try {
    const r = await publicar({ tudo: true });
    ok(`Dados enviados (${r.mudadas} blocos, ${r.enviados} planilha(s) do caixa).`);
  } catch (e) {
    console.log(`  [aviso] Não consegui enviar os dados agora: ${e.message}`);
    console.log("          Confira o caminho da planilha (PLANILHA_PATH) no .env. O resto já está configurado.");
  }
}

rl.close();
console.log("\n  Tudo certo! Pode voltar para o guia.\n");
process.exit(0);
