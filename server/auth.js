// Login do site.
//  - Admin: usuário e senha do .env (ADMIN_USUARIO / ADMIN_SENHA).
//  - Demais: a pessoa pede acesso (nome completo, e-mail de domínio permitido, CPF e
//    senha) e o pedido fica aguardando a aprovação do admin, na aba Usuários.
//  - Esqueci minha senha: a pessoa informa uma nova senha, que só passa a valer depois
//    que o admin aprovar.
// Os dados ficam em server/dados/usuarios.json (fora do GitHub). As senhas são
// guardadas com hash (scrypt): ninguém consegue lê-las, nem o admin.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { config } from "./config.js";

const PASTA = path.join(path.dirname(fileURLToPath(import.meta.url)), "dados");
const ARQUIVO = path.join(PASTA, "usuarios.json");
fs.mkdirSync(PASTA, { recursive: true });

// ---------------------------------------------------------------- armazenamento
function carregar() {
  try {
    const b = JSON.parse(fs.readFileSync(ARQUIVO, "utf-8"));
    return { usuarios: b.usuarios || [] };
  } catch {
    return { usuarios: [] };
  }
}
let banco = carregar();
function salvar() {
  const tmp = `${ARQUIVO}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(banco, null, 2), "utf-8");
  fs.renameSync(tmp, ARQUIVO);
}

// ---------------------------------------------------------------- utilidades
const agora = () => Date.now();
const normEmail = (e) => String(e || "").trim().toLowerCase();
const soDigitos = (s) => String(s || "").replace(/\D/g, "");
const iguais = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

function hashSenha(senha) {
  const sal = crypto.randomBytes(16);
  return `scrypt$${sal.toString("hex")}$${crypto.scryptSync(senha, sal, 64).toString("hex")}`;
}
function conferirSenha(senha, guardado) {
  const [, salHex, hHex] = String(guardado || "").split("$");
  if (!salHex || !hHex) return false;
  const h = crypto.scryptSync(String(senha), Buffer.from(salHex, "hex"), 64);
  return crypto.timingSafeEqual(h, Buffer.from(hHex, "hex"));
}

// ---------------------------------------------------------------- regras
export function regrasSenha(s = "") {
  return { tamanho: s.length >= 8, numero: /\d/.test(s), especial: /[^A-Za-z0-9\s]/.test(s) };
}
const senhaValida = (s) => Object.values(regrasSenha(s)).every(Boolean);

export function cpfValido(cpf) {
  const d = soDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const t of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(d[i]) * (t + 1 - i);
    if (((soma * 10) % 11) % 10 !== Number(d[t])) return false;
  }
  return true;
}
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
export const dominioPermitido = (e) => config.dominiosPermitidos.includes(normEmail(e).split("@")[1] || "");
const cpfMascarado = (cpf) => { const d = soDigitos(cpf); return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : ""; };

// ---------------------------------------------------------------- sessão (cookie assinado)
function segredoSessao() {
  if (config.sessaoSegredo) return config.sessaoSegredo;
  const arq = path.join(PASTA, "segredo_sessao.txt");
  try {
    return fs.readFileSync(arq, "utf-8").trim();
  } catch {
    const s = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(arq, s, "utf-8");
    return s;
  }
}
const SEGREDO = segredoSessao();
const COOKIE = "vox_sessao";

function assinar(dados) {
  const corpo = Buffer.from(JSON.stringify(dados)).toString("base64url");
  const sig = crypto.createHmac("sha256", SEGREDO).update(corpo).digest("base64url");
  return `${corpo}.${sig}`;
}
function lerAssinado(token) {
  const [corpo, sig] = String(token || "").split(".");
  if (!corpo || !sig) return null;
  if (!iguais(sig, crypto.createHmac("sha256", SEGREDO).update(corpo).digest("base64url"))) return null;
  try {
    const d = JSON.parse(Buffer.from(corpo, "base64url").toString("utf-8"));
    return d.exp > agora() ? d : null;
  } catch {
    return null;
  }
}
function lerCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(";").map((c) => c.trim().split("="))
    .filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join("="))]));
}
function gravarCookie(req, res, valor, maxAgeSeg) {
  const seguro = config.cookieSeguro || req.secure || req.headers["x-forwarded-proto"] === "https";
  res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(valor)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeg}${seguro ? "; Secure" : ""}`);
}
function abrirSessao(req, res, dados) {
  const seg = Math.round(config.sessaoHoras * 3600);
  gravarCookie(req, res, assinar({ ...dados, exp: agora() + seg * 1000 }), seg);
}

// Quem está logado (confere a cada pedido: bloqueio/exclusão valem na hora).
export function sessaoAtual(req) {
  const d = lerAssinado(lerCookies(req)[COOKIE]);
  if (!d) return null;
  if (d.tipo === "admin") return { admin: true, nome: "Administrador", login: config.adminUsuario };
  const u = banco.usuarios.find((x) => x.id === d.id);
  if (!u || u.status !== "ativo" || u.versao !== d.v) return null;
  return { admin: false, id: u.id, nome: u.nome, email: u.email };
}

export function exigirLogin(req, res, next) {
  const s = sessaoAtual(req);
  if (!s) return res.status(401).json({ erro: "Faça login para continuar." });
  req.usuario = s;
  next();
}
export function exigirAdmin(req, res, next) {
  const s = sessaoAtual(req);
  if (!s) return res.status(401).json({ erro: "Faça login para continuar." });
  if (!s.admin) return res.status(403).json({ erro: "Acesso restrito ao administrador." });
  req.usuario = s;
  next();
}

// ---------------------------------------------------------------- limite de tentativas
const tentativas = new Map();                // chave -> [instantes das falhas]
const JANELA = 15 * 60 * 1000;
function bloqueadoPorTentativas(chave, maximo = 5) {
  const lista = (tentativas.get(chave) || []).filter((t) => agora() - t < JANELA);
  tentativas.set(chave, lista);
  return lista.length >= maximo;
}
const registrarFalha = (chave) => tentativas.set(chave, [...(tentativas.get(chave) || []), agora()]);
const limparFalhas = (chave) => tentativas.delete(chave);

// ---------------------------------------------------------------- rotas de login
const erro = (status, mensagem) => Object.assign(new Error(mensagem), { status });
const rota = (fn) => async (req, res) => {
  try {
    res.json(await fn(req, res));
  } catch (e) {
    if (!e.status) console.error(`[erro login] ${e.message}`);
    res.status(e.status || 500).json({ erro: e.status ? e.message : "Não foi possível concluir agora. Tente de novo." });
  }
};

export const rotasAuth = express.Router();
rotasAuth.use(express.json({ limit: "20kb" }));

rotasAuth.get("/sessao", (req, res) => {
  const s = sessaoAtual(req);
  res.json({ logado: Boolean(s), usuario: s });
});

rotasAuth.post("/entrar", rota(async (req, res) => {
  const login = String(req.body?.login || "").trim();
  const senha = String(req.body?.senha || "");
  const chave = `login:${login.toLowerCase()}`;
  if (bloqueadoPorTentativas(chave)) throw erro(429, "Muitas tentativas. Aguarde 15 minutos e tente de novo.");

  if (login.toLowerCase() === config.adminUsuario.toLowerCase()) {
    if (!iguais(senha, config.adminSenha)) { registrarFalha(chave); throw erro(401, "Usuário ou senha incorretos."); }
    limparFalhas(chave);
    abrirSessao(req, res, { tipo: "admin" });
    return { ok: true, usuario: { admin: true, nome: "Administrador", login: config.adminUsuario } };
  }

  const u = banco.usuarios.find((x) => x.email === normEmail(login));
  if (!u || !u.senhaHash || !conferirSenha(senha, u.senhaHash)) {
    registrarFalha(chave);
    throw erro(401, "E-mail ou senha incorretos.");
  }
  if (u.status === "pendente") throw erro(403, "Seu cadastro está aguardando a aprovação do administrador.");
  if (u.status === "bloqueado") throw erro(403, "Seu acesso está bloqueado. Fale com o administrador.");
  limparFalhas(chave);
  u.ultimoAcesso = new Date().toISOString();
  salvar();
  abrirSessao(req, res, { tipo: "usuario", id: u.id, v: u.versao });
  return { ok: true, usuario: { admin: false, id: u.id, nome: u.nome, email: u.email } };
}));

rotasAuth.post("/sair", (req, res) => {
  gravarCookie(req, res, "", 0);
  res.json({ ok: true });
});

// Pedido de acesso: fica "pendente" até o admin aprovar.
rotasAuth.post("/cadastro", rota(async (req) => {
  const nome = String(req.body?.nome || "").trim().replace(/\s+/g, " ");
  const email = normEmail(req.body?.email);
  const cpf = soDigitos(req.body?.cpf);
  const senha = String(req.body?.senha || "");
  if (nome.split(" ").length < 2) throw erro(400, "Informe o nome completo.");
  if (!emailValido(email)) throw erro(400, "E-mail inválido.");
  if (!dominioPermitido(email)) throw erro(400, "Este e-mail não tem permissão de acesso. Use o seu e-mail corporativo.");
  if (!cpfValido(cpf)) throw erro(400, "CPF inválido.");
  if (!senhaValida(senha)) throw erro(400, "A senha precisa ter pelo menos 8 caracteres, 1 número e 1 caractere especial.");

  const existente = banco.usuarios.find((x) => x.email === email);
  if (existente && existente.status !== "pendente") throw erro(409, "Este e-mail já tem acesso. Se esqueceu a senha, use \"Esqueci minha senha\".");
  if (banco.usuarios.some((x) => x.cpf === cpf && x.email !== email)) throw erro(409, "Este CPF já está cadastrado com outro e-mail.");

  const agoraIso = new Date().toISOString();
  if (existente) Object.assign(existente, { nome, cpf, senhaHash: hashSenha(senha), solicitadoEm: agoraIso });
  else banco.usuarios.push({ id: crypto.randomUUID(), nome, email, cpf, status: "pendente", versao: 1,
    criadoEm: agoraIso, solicitadoEm: agoraIso, aprovadoEm: null, ultimoAcesso: null, senhaHash: hashSenha(senha) });
  salvar();
  return { ok: true };
}));

// Esqueci minha senha: a nova senha fica guardada e só passa a valer quando o admin aprovar.
// A resposta é sempre a mesma, para não revelar quais e-mails têm cadastro.
rotasAuth.post("/esqueci", rota(async (req) => {
  const email = normEmail(req.body?.email);
  const senha = String(req.body?.senha || "");
  if (!emailValido(email)) throw erro(400, "E-mail inválido.");
  if (!senhaValida(senha)) throw erro(400, "A senha precisa ter pelo menos 8 caracteres, 1 número e 1 caractere especial.");
  const u = banco.usuarios.find((x) => x.email === email);
  if (u && u.status === "ativo") {
    u.novaSenhaHash = hashSenha(senha);
    u.novaSenhaEm = new Date().toISOString();
    salvar();
  } else if (u && u.status === "pendente") {
    u.senhaHash = hashSenha(senha);            // ainda não aprovado: só troca a senha do pedido
    salvar();
  }
  return { ok: true };
}));

// ---------------------------------------------------------------- rotas do admin
export const rotasAdmin = express.Router();
rotasAdmin.use(express.json({ limit: "20kb" }));

const pendencias = () => banco.usuarios.filter((u) => u.status === "pendente" || u.novaSenhaHash).length;

rotasAdmin.get("/usuarios", (req, res) => {
  res.json({
    dominios: config.dominiosPermitidos,
    pendentes: pendencias(),
    usuarios: banco.usuarios
      .map(({ senhaHash, novaSenhaHash, cpf, versao, ...u }) => ({ ...u, cpf: cpfMascarado(cpf), pediuNovaSenha: Boolean(novaSenhaHash) }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  });
});
rotasAdmin.get("/pendentes", (req, res) => res.json({ pendentes: pendencias() }));

const acharUsuario = (req, res) => {
  const u = banco.usuarios.find((x) => x.id === req.params.id);
  if (!u) res.status(404).json({ erro: "Usuário não encontrado." });
  return u;
};
rotasAdmin.post("/usuarios/:id/aprovar", (req, res) => {
  const u = acharUsuario(req, res); if (!u) return;
  if (u.status !== "pendente") return res.status(400).json({ erro: "Este usuário não está aguardando aprovação." });
  if (!u.senhaHash) return res.status(400).json({ erro: "Pedido sem senha: peça para a pessoa solicitar o acesso de novo." });
  u.status = "ativo";
  u.aprovadoEm = new Date().toISOString();
  u.versao = (u.versao || 1) + 1;
  salvar();
  res.json({ ok: true });
});
rotasAdmin.post("/usuarios/:id/recusar", (req, res) => {
  const u = acharUsuario(req, res); if (!u) return;
  if (u.status !== "pendente") return res.status(400).json({ erro: "Este usuário não está aguardando aprovação." });
  banco.usuarios = banco.usuarios.filter((x) => x !== u);   // pode pedir de novo depois
  salvar();
  res.json({ ok: true });
});
rotasAdmin.post("/usuarios/:id/aprovar-senha", (req, res) => {
  const u = acharUsuario(req, res); if (!u) return;
  if (!u.novaSenhaHash) return res.status(400).json({ erro: "Não há pedido de nova senha." });
  u.senhaHash = u.novaSenhaHash;
  delete u.novaSenhaHash; delete u.novaSenhaEm;
  u.versao = (u.versao || 1) + 1;            // derruba sessões com a senha antiga
  salvar();
  res.json({ ok: true });
});
rotasAdmin.post("/usuarios/:id/recusar-senha", (req, res) => {
  const u = acharUsuario(req, res); if (!u) return;
  delete u.novaSenhaHash; delete u.novaSenhaEm;
  salvar();
  res.json({ ok: true });
});

function alterarStatus(req, res, status) {
  const u = banco.usuarios.find((x) => x.id === req.params.id);
  if (!u) return res.status(404).json({ erro: "Usuário não encontrado." });
  if (status === "bloqueado" && u.status === "pendente") return res.status(400).json({ erro: "Cadastro ainda não confirmado: use Excluir." });
  u.status = status;
  u.versao = (u.versao || 1) + 1;            // bloqueio derruba a sessão na hora
  salvar();
  res.json({ ok: true });
}
rotasAdmin.post("/usuarios/:id/bloquear", (req, res) => alterarStatus(req, res, "bloqueado"));
rotasAdmin.post("/usuarios/:id/desbloquear", (req, res) => alterarStatus(req, res, "ativo"));
rotasAdmin.delete("/usuarios/:id", (req, res) => {
  const antes = banco.usuarios.length;
  const u = banco.usuarios.find((x) => x.id === req.params.id);
  banco.usuarios = banco.usuarios.filter((x) => x.id !== req.params.id);
  if (banco.usuarios.length === antes) return res.status(404).json({ erro: "Usuário não encontrado." });
  salvar();
  res.json({ ok: true });
});

export function avisosDeSeguranca() {
  if (config.adminSenha === "admin2027") console.warn("[aviso] Senha do admin ainda é a padrão (admin2027). Troque ADMIN_SENHA no .env antes de colocar o site no ar.");
}
