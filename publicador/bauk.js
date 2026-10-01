// Status das operações do dia na Bauk (tela Negociação), para os cards de Liquidação
// URFA e Endosso mostrarem "Aguardando Aprovações" / "Aguardando Liquidação".
// Usa o mesmo login e a mesma consulta (Negotiation/FilterNegotiation) da automação em Python.
//
// Login: BAUK_EMAIL e BAUK_SENHA do .env. Se não estiverem lá, lê do próprio script da
// automação (AUTOMACAO_PY), assim a senha fica num lugar só.
import fs from "node:fs";

const API_V1 = "https://api.vuon.bcard.bauk.com.br/api/v1";
const API_V2 = "https://api.vuon.bcard.bauk.com.br/api/v2";
const PROJECTUID = "voxcred/bcard-prd";
const SCRIPT_PADRAO = "C:\\Automacao\\Vox\\preencher_fluxo_operacional_vox.py";

function credenciais() {
  let email = (process.env.BAUK_EMAIL || "").trim();
  let senha = process.env.BAUK_SENHA || "";
  if (!email || !senha) {
    const caminho = process.env.AUTOMACAO_PY || SCRIPT_PADRAO;
    try {
      const py = fs.readFileSync(caminho, "utf-8");
      const ler = (nome) => py.match(new RegExp(`^${nome}\\s*=\\s*os\\.getenv\\(\\s*"${nome}"\\s*,\\s*"([^"]*)"`, "m"))?.[1] || "";
      email ||= ler("BAUK_EMAIL");
      senha ||= ler("BAUK_SENHA");
    } catch { /* sem o script: fica sem credencial */ }
  }
  if (!email || !senha) throw new Error("Sem login da Bauk (BAUK_EMAIL/BAUK_SENHA no .env ou AUTOMACAO_PY).");
  return { email, senha };
}

const cabecalhos = (token) => ({
  Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json",
  origin: "https://portal.bauk.com.br", referer: "https://portal.bauk.com.br/", projectuid: PROJECTUID,
});

let tokenCache = { token: null, ate: 0 };
async function token() {
  if (tokenCache.token && Date.now() < tokenCache.ate) return tokenCache.token;
  const { email, senha } = credenciais();
  const r = await fetch(`${API_V2}/Authenticate`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: senha }), signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`login na Bauk recusado (${r.status})`);
  const t = (await r.json())?.data?.token;
  if (!t) throw new Error("a Bauk não devolveu o token do login");
  tokenCache = { token: t, ate: Date.now() + 30 * 60 * 1000 };       // reusa por 30 min
  return t;
}

function listaDoCorpo(corpo) {
  const d = corpo?.data;
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object") {
    for (const k of ["negotiation", "items", "records", "content"]) if (Array.isArray(d[k])) return d[k];
  }
  return [];
}

// Acha o texto do status no item (o nome do campo pode variar): prefere campos de texto com
// "status" no nome; se só houver número, devolve o número (fica registrado para mapear depois).
const normalizar = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function statusDoItem(item) {
  const candidatos = [];
  const visitar = (obj, prof) => {
    for (const [k, v] of Object.entries(obj || {})) {
      if (v && typeof v === "object" && !Array.isArray(v) && prof < 2) {
        if (/status/i.test(k) && typeof (v.name ?? v.description ?? v.label) === "string") {
          candidatos.push({ k, v: v.name ?? v.description ?? v.label, texto: true });
        }
        visitar(v, prof + 1);
      } else if (/status/i.test(k) && (typeof v === "string" || typeof v === "number")) {
        candidatos.push({ k, v, texto: typeof v === "string" && /[a-z]/i.test(v) });
      }
    }
  };
  visitar(item, 0);
  const texto = candidatos.find((c) => c.texto && /negoci|cnab|assinat|xml|rejeit|erro|liquid/.test(normalizar(c.v)))
    ?? candidatos.find((c) => c.texto);
  return texto ? String(texto.v).trim() : candidatos[0] ? String(candidatos[0].v) : null;
}

// { "10988": "Negociado", ... } das negociações de um dia (AAAA-MM-DD).
export async function statusDoDia(iso) {
  const t = await token();
  const saida = {};
  let exemplo = null;
  for (let pagina = 1; pagina <= 30; pagina++) {
    const r = await fetch(`${API_V1}/Negotiation/FilterNegotiation`, {
      method: "POST", headers: cabecalhos(t), signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        operation: null, issuer: null, participant: null, type: 0, status: 100,
        dateStart: `${iso}T00:00:00-03:00`, dateEnd: `${iso}T00:00:00-03:00`,
        isExport: false, pagination: { page: pagina, size: 50 },
      }),
    });
    if (r.status === 401) { tokenCache = { token: null, ate: 0 }; throw new Error("token da Bauk expirou (tenta de novo no próximo ciclo)"); }
    if (!r.ok) throw new Error(`consulta de negociações na Bauk falhou (${r.status})`);
    const lote = listaDoCorpo(await r.json());
    for (const item of lote) {
      exemplo ??= item;
      const op = item.operation ?? item.Operation;
      if (op != null) saida[String(op)] = statusDoItem(item);
    }
    if (lote.length < 50) break;
  }
  return { status: saida, exemplo };
}
