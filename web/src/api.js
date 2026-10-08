// Acesso aos dados do site online. As funções têm os MESMOS nomes e devolvem o MESMO
// formato da API antiga (servidor Node), então as telas continuam iguais.
// Os dados vêm do Supabase, enviados pelo publicador do PC (publicador/publicar.js).
import { supabase } from "./supabase.js";
import { SESSAO_HORAS } from "./config-publica.js";

const FUSO = "America/Sao_Paulo";

// ---------------------------------------------------------------- utilidades

function avisarSessaoExpirada() {
  window.dispatchEvent(new Event("vox:sessao-expirada"));
}

// Mensagens do banco vêm como "VOX_CODIGO: texto". Sem acesso: volta ao login.
function erroDe(e, padrao, { sessao = true } = {}) {
  const msg = String(e?.message || "");
  const semAcesso = /VOX_SEM_ACESSO/.test(msg) || e?.code === "42501" || /JWT|PGRST30/.test(`${msg} ${e?.code}`);
  if (semAcesso && sessao) {
    avisarSessaoExpirada();
    return Object.assign(new Error("Faça login para continuar."), { status: 401 });
  }
  const vox = msg.match(/VOX_[A-Z_]+:\s*(.+)$/);
  if (vox) return Object.assign(new Error(vox[1]), { status: 400 });
  return Object.assign(new Error(padrao), { status: e?.status || 503 });
}

async function rpc(nome, args, padrao = "Os dados estão indisponíveis no momento.", opcoes) {
  const { data, error } = await supabase.rpc(nome, args);
  if (error) throw erroDe(error, padrao, opcoes);
  return data;
}

const lerPainel = (chaves) => rpc("vox_painel", { p_chaves: chaves });

// Agora no horário de Brasília (a tela pode estar em qualquer computador).
function agoraBrasilia() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { iso: `${p.year}-${p.month}-${p.day}`, hhmm: `${p.hour}:${p.minute}` };
}
const diaUtil = (iso) => { const d = new Date(`${iso}T12:00:00Z`).getUTCDay(); return d !== 0 && d !== 6; };

// O publicador manda, para o dia de hoje, um cenário por horário de corte
// (ex.: antes das 14h, depois das 14h...). Aqui escolhemos o cenário do momento.
function escolherCenario(variantes, iso, agora) {
  if (!variantes?.length) return null;
  if (iso < agora.iso) return variantes.at(-1).dia;
  if (iso > agora.iso) return variantes[0].dia;
  let escolhido = variantes[0];
  for (const v of variantes) if (v.desde <= agora.hhmm) escolhido = v;
  return escolhido.dia;
}

function montarInicio(inicio) {
  if (!inicio) throw Object.assign(new Error("Ainda não há dados publicados. Ligue o publicador no PC."), { status: 503 });
  const agora = agoraBrasilia();
  const datas = [...inicio.datas];
  if (diaUtil(agora.iso) && !datas.includes(agora.iso)) datas.push(agora.iso);
  datas.sort();
  const meta = { hoje: agora.iso, intervaloAtualizacaoMin: inicio.intervaloAtualizacaoMin || 10,
    mostrarResponsavel: inicio.mostrarResponsavel };
  return { meta, datas, sugerida: datas.includes(agora.iso) ? agora.iso : datas.at(-1) };
}

// ---------------------------------------------------------------- fluxo operacional

export const api = {
  inicio: async () => montarInicio((await lerPainel(["inicio"])).inicio),

  // A "versão" muda quando o publicador envia dados novos E quando o relógio passa de um
  // horário de corte (14h, 15h...): nos dois casos a tela se atualiza sozinha em até 1 min.
  versao: async () => {
    const { versao } = await lerPainel(["versao"]);
    if (!versao) return { versao: null };
    const { hhmm } = agoraBrasilia();
    const etapa = (versao.cortes || []).filter((c) => c <= hhmm).length;
    return { versao: `${versao.versao}|${agoraBrasilia().iso}|${etapa}` };
  },

  dia: async (iso) => {
    const r = await lerPainel(["inicio", `dia:${iso}`, "dia:vazio"]);
    const { meta } = montarInicio(r.inicio);
    const agora = agoraBrasilia();
    let dia = escolherCenario(r[`dia:${iso}`]?.variantes, iso, agora);
    if (!dia) {
      // dia útil que a planilha ainda não tem: mostra "aguardando informações"
      const modelo = escolherCenario(r["dia:vazio"]?.variantes, iso, agora);
      if (!modelo) throw Object.assign(new Error("Não há dados para este dia."), { status: 404 });
      dia = { ...modelo, data: iso };
    }
    return { meta, dia };
  },
};

// ---------------------------------------------------------------- fluxo de caixa

export const apiCaixa = {
  meses: async () => {
    const r = await lerPainel(["caixa:meses", "inicio"]);
    const meses = r["caixa:meses"]?.meses || [];
    const { iso } = agoraBrasilia();
    const atual = iso.slice(0, 7);
    return {
      meta: { intervaloAtualizacaoMin: r.inicio?.intervaloAtualizacaoMin || 10 },
      meses,
      sugerido: meses.some((m) => m.id === atual) ? atual : meses.at(-1)?.id ?? null,
    };
  },
  mes: async (id) => {
    const r = await lerPainel([`caixa:${id}`, "inicio"]);
    const c = r[`caixa:${id}`];
    if (!c) throw Object.assign(new Error("Não há fluxo de caixa publicado para este mês."), { status: 404 });
    return { meta: { intervaloAtualizacaoMin: r.inicio?.intervaloAtualizacaoMin || 10 }, mes: c.mes, arquivo: c.arquivo, caixa: c.caixa };
  },
  // Link temporário (1 minuto) para baixar a planilha publicada do mês.
  baixar: async (arquivo) => {
    const { data, error } = await supabase.storage.from("caixa").createSignedUrl(`${arquivo.id}.xlsx`, 60, { download: arquivo.nome });
    if (error || !data?.signedUrl) throw erroDe(error, "Arquivo indisponível no momento.");
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  },
};

// ---------------------------------------------------------------- relatórios (só admin, por enquanto)

export const apiRelatorios = {
  // Todas as remessas da aba Deságio (o filtro de período é feito na tela).
  desagio: async () => {
    const r = await lerPainel(["admin:desagio", "inicio"]);
    if (!r["admin:desagio"]) throw Object.assign(new Error("O relatório de deságio ainda não foi publicado."), { status: 404 });
    return { linhas: r["admin:desagio"].linhas || [], hoje: agoraBrasilia().iso,
      meta: { intervaloAtualizacaoMin: r.inicio?.intervaloAtualizacaoMin || 10 } };
  },

  // Despesas do fundo: a planilha publicada (todos os meses) e o link para baixá-la.
  despesas: async () => {
    const r = await lerPainel(["admin:despesas", "inicio"]);
    if (!r["admin:despesas"]) throw Object.assign(new Error("O relatório de despesas ainda não foi publicado."), { status: 404 });
    return { despesas: r["admin:despesas"], meta: { intervaloAtualizacaoMin: r.inicio?.intervaloAtualizacaoMin || 10 } };
  },
  baixarDespesas: async (arquivo) => {
    const { data, error } = await supabase.storage.from("caixa").createSignedUrl("despesas/atual.xlsx", 60, { download: arquivo.nome });
    if (error || !data?.signedUrl) throw erroDe(error, "Arquivo indisponível no momento.");
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  },
};

// ---------------------------------------------------------------- apresentações de resultados (só admin, por enquanto)

export const apiApresentacoes = {
  // Lista dos PDFs publicados: [{ id: "AAAA-MM", nome, bytes, publicadoEm }], do mais recente ao mais antigo.
  lista: async () => {
    const r = await lerPainel(["admin:apresentacoes", "inicio"]);
    return { itens: r["admin:apresentacoes"]?.itens || [], meta: { intervaloAtualizacaoMin: r.inicio?.intervaloAtualizacaoMin || 10 } };
  },
  // O PDF do mês (bytes), baixado com o login da pessoa (sem link temporário).
  arquivo: async (item) => {
    const { data, error } = await supabase.storage.from("caixa").download(`apresentacoes/${item.id}.pdf`);
    if (error || !data) {
      const e = erroDe(error, "Arquivo indisponível no momento.");
      e.detalhe = error?.message || String(error?.statusCode || "");
      throw e;
    }
    return data;                                   // Blob
  },
  // Link temporário para o PDF do mês (para ver na tela ou baixar com o nome original).
  link: async (item, { baixar = false, segundos = 600 } = {}) => {
    const { data, error } = await supabase.storage.from("caixa")
      .createSignedUrl(`apresentacoes/${item.id}.pdf`, segundos, baixar ? { download: item.nome } : undefined);
    if (error || !data?.signedUrl) throw erroDe(error, "Arquivo indisponível no momento.");
    return data.signedUrl;
  },
};

// ---------------------------------------------------------------- balancete e razão (só admin, por enquanto)

const caminhoBalancete = (mes, doc, arq) => `balancetes/${mes}/${doc}.${arq.ext}`;
export const apiBalancetes = {
  // [{ id: "AAAA-MM", docs: { balancete: { pdf?, excel? }, razao: { pdf?, excel? } } }], do mais recente ao mais antigo.
  lista: async () => {
    const r = await lerPainel(["admin:balancetes", "inicio"]);
    return { meses: r["admin:balancetes"]?.meses || [], meta: { intervaloAtualizacaoMin: r.inicio?.intervaloAtualizacaoMin || 10 } };
  },
  // O arquivo (Blob), baixado com o login da pessoa.
  arquivo: async (mes, doc, arq) => {
    const { data, error } = await supabase.storage.from("caixa").download(caminhoBalancete(mes, doc, arq));
    if (error || !data) {
      const e = erroDe(error, "Arquivo indisponível no momento.");
      e.detalhe = error?.message || String(error?.statusCode || "");
      throw e;
    }
    return data;
  },
  // Baixa com o nome original do arquivo.
  baixar: async (mes, doc, arq) => {
    const { data, error } = await supabase.storage.from("caixa").createSignedUrl(caminhoBalancete(mes, doc, arq), 60, { download: arq.nome });
    if (error || !data?.signedUrl) throw erroDe(error, "Arquivo indisponível no momento.");
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  },
};

// ---------------------------------------------------------------- login

const regrasOk = (s) => s.length >= 8 && /\d/.test(s) && /[^A-Za-z0-9\s]/.test(s);
const MSG_SENHA = "A senha precisa ter pelo menos 8 caracteres, 1 número e 1 caractere especial.";

function cpfValido(cpf) {
  const d = String(cpf || "").replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const t of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(d[i]) * (t + 1 - i);
    if (((soma * 10) % 11) % 10 !== Number(d[t])) return false;
  }
  return true;
}

// Sessão vale SESSAO_HORAS a partir do login (padrão 12h).
function sessaoVencida(session) {
  const desde = Date.parse(session?.user?.last_sign_in_at || "");
  return Number.isFinite(desde) && Date.now() - desde > SESSAO_HORAS * 3600 * 1000;
}

// A cada minuto confere se o acesso continua valendo (bloqueio/exclusão tiram a pessoa na hora).
let vigia = null;
function vigiarSessao() {
  if (vigia) return;
  vigia = setInterval(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { pararVigia(); return; }
    if (sessaoVencida(session)) { pararVigia(); await supabase.auth.signOut(); return; }
    const { data: eu, error } = await supabase.rpc("vox_eu");
    if (error && !(/VOX_|42501|JWT/.test(`${error.message} ${error.code}`))) return;   // rede instável: tenta depois
    if (error || !eu || eu.status !== "ativo" || !eu.sessaoOk) {
      pararVigia();
      await supabase.auth.signOut({ scope: "local" });
    }
  }, 60 * 1000);
}
function pararVigia() { clearInterval(vigia); vigia = null; }

const usuarioDe = (eu) => ({ admin: Boolean(eu.admin), id: eu.id, nome: eu.nome, email: eu.email });

export const apiAuth = {
  sessao: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { logado: false, usuario: null };
    if (sessaoVencida(session)) { await supabase.auth.signOut({ scope: "local" }); return { logado: false, usuario: null }; }
    const { data: eu, error } = await supabase.rpc("vox_eu");
    if (error) throw erroDe(error, "Não foi possível conferir o login agora.", { sessao: false });
    if (!eu || eu.status !== "ativo" || !eu.sessaoOk) {
      await supabase.auth.signOut({ scope: "local" });
      return { logado: false, usuario: null };
    }
    vigiarSessao();
    return { logado: true, usuario: usuarioDe(eu) };
  },

  entrar: async (login, senha) => {
    const email = String(login || "").trim().toLowerCase();
    if (!email.includes("@")) throw new Error("Entre com o seu e-mail.");
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) {
      if (error.status === 429) throw new Error("Muitas tentativas. Aguarde alguns minutos e tente de novo.");
      if (error.status === 400 || /invalid/i.test(error.message)) throw new Error("E-mail ou senha incorretos.");
      throw new Error("Não foi possível entrar agora. Tente de novo.");
    }
    const { data: eu, error: e2 } = await supabase.rpc("vox_eu");
    const sair = () => supabase.auth.signOut({ scope: "local" });
    if (e2 || !eu) { await sair(); throw new Error("E-mail ou senha incorretos."); }
    if (eu.status === "pendente") { await sair(); throw new Error("Seu cadastro está aguardando a aprovação do administrador."); }
    if (eu.status === "bloqueado") { await sair(); throw new Error("Seu acesso está bloqueado. Fale com o administrador."); }
    vigiarSessao();
    return { ok: true, usuario: usuarioDe(eu) };
  },

  sair: async () => {
    pararVigia();
    await supabase.auth.signOut({ scope: "local" });
    return { ok: true };
  },

  // Pedido de acesso: fica "pendente" até o admin aprovar.
  cadastro: async ({ nome, email, cpf, senha }) => {
    const n = String(nome || "").trim().replace(/\s+/g, " ");
    const e = String(email || "").trim().toLowerCase();
    if (n.split(" ").length < 2) throw new Error("Informe o nome completo.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error("E-mail inválido.");
    const dominios = await rpc("vox_dominios", {}, "Não foi possível concluir agora. Tente de novo.", { sessao: false });
    if (!dominios.includes(e.split("@")[1])) throw new Error("Este e-mail não tem permissão de acesso. Use o seu e-mail corporativo.");
    if (!cpfValido(cpf)) throw new Error("CPF inválido.");
    if (!regrasOk(senha)) throw new Error(MSG_SENHA);

    const { data, error } = await supabase.auth.signUp({
      email: e, password: senha, options: { data: { nome: n, cpf: String(cpf).replace(/\D/g, "") } },
    });
    if (error) {
      if (error.code === "user_already_exists" || /already registered|already exists/i.test(error.message)) {
        throw new Error("Este e-mail já tem cadastro. Se esqueceu a senha, use \"Esqueci minha senha\".");
      }
      if (/sending.*email|confirmation/i.test(error.message)) {
        throw new Error("Configuração pendente no Supabase: desligue a opção \"Confirm email\" (veja o guia).");
      }
      if (error.code === "weak_password") throw new Error(MSG_SENHA);
      if (error.status === 429) throw new Error("Muitas tentativas. Aguarde alguns minutos e tente de novo.");
      if (/database error/i.test(error.message)) {
        throw new Error("Não foi possível concluir o cadastro. Confira os dados: o CPF pode já estar cadastrado com outro e-mail.");
      }
      throw new Error("Não foi possível concluir agora. Tente de novo.");
    }
    // O Supabase já deixa logado ao cadastrar; como falta a aprovação, sai na hora.
    if (data?.session) await supabase.auth.signOut({ scope: "local" });
    return { ok: true };
  },

  // Esqueci minha senha: a nova senha só vale depois que o admin aprovar.
  esqueci: async (email, senha) => {
    if (!regrasOk(senha)) throw new Error(MSG_SENHA);
    await rpc("vox_pedir_nova_senha", { p_email: String(email || "").trim().toLowerCase(), p_senha: senha },
      "Não foi possível concluir agora. Tente de novo.", { sessao: false });
    return { ok: true };
  },
};

// ---------------------------------------------------------------- admin

const acao = (nome) => (id) => rpc("vox_admin_acao", { p_id: id, p_acao: nome }, "Não foi possível concluir agora. Tente de novo.");

export const apiAdmin = {
  usuarios: () => rpc("vox_admin_usuarios", {}),
  pendentes: async () => ({ pendentes: await rpc("vox_admin_pendentes", {}) }),
  aprovar: acao("aprovar"),
  recusar: acao("recusar"),
  aprovarSenha: acao("aprovar-senha"),
  recusarSenha: acao("recusar-senha"),
  bloquear: acao("bloquear"),
  desbloquear: acao("desbloquear"),
  excluir: acao("excluir"),
};
