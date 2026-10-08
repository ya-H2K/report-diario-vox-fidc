// Monta, a partir da planilha e do fluxo de caixa, os dados que vão para a nuvem.
// Usa exatamente as mesmas regras do servidor antigo (server/status.js), então o
// que aparece no site online é igual ao que aparecia no localhost.
//
// Os status dependem do horário (ex.: "Aguardando" até 14h, "Não realizado" depois).
// Como no site online ninguém recalcula na hora, para o dia de hoje (e depois) são
// gerados todos os cenários do dia, um para cada horário de corte. A tela escolhe
// o cenário pelo relógio dela.
import { montarDia, isoLocal } from "../server/status.js";

// Data sem nenhum registro, usada para gerar o modelo de "dia ainda sem informações"
// (quando a tela abre num dia útil que a planilha ainda não tem).
const DIA_VAZIO = "2099-01-05";

export function cortesDoDia(cfg) {
  return [...new Set([cfg.limiteRpe, cfg.limiteArquivosBauk, cfg.limiteFlash, cfg.limiteEndosso, cfg.limiteUrfa, cfg.horaEncerramento, cfg.horaFechamento]
    .map(normalizarHora))].sort();
}

function normalizarHora(h) {
  const [hh, mm] = String(h).split(":").map(Number);
  return `${String(hh || 0).padStart(2, "0")}:${String(mm || 0).padStart(2, "0")}`;
}

// Data AAAA-MM-DD às HH:MM, no fuso do computador (o mesmo que o servidor antigo usava).
function momento(iso, hhmm) {
  const [a, m, d] = iso.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  return new Date(a, m - 1, d, h, mi, 0, 0);
}

function opcoesDe(cfg, agora) {
  return { agora, horaFechamento: cfg.horaFechamento, horaEncerramento: cfg.horaEncerramento,
    limiteRpe: cfg.limiteRpe, limiteArquivosBauk: cfg.limiteArquivosBauk, limiteEndosso: cfg.limiteEndosso, limiteUrfa: cfg.limiteUrfa,
    limiteFlash: cfg.limiteFlash, mostrarResponsavel: cfg.mostrarResponsavel };
}

// Cenários de um dia: [{ desde: "HH:MM", dia }]. Dia já passado: um só (o definitivo).
export function variantesDoDia(bases, iso, cfg, agoraReal) {
  if (iso < isoLocal(agoraReal)) return [{ desde: "00:00", dia: montarDia(bases, iso, opcoesDe(cfg, agoraReal)) }];
  const lista = [];
  let anterior = null;
  for (const desde of ["00:00", ...cortesDoDia(cfg)]) {
    const dia = montarDia(bases, iso, opcoesDe(cfg, momento(iso, desde)));
    const json = JSON.stringify(dia);
    if (json !== anterior) lista.push({ desde, dia });       // só guarda quando muda algo
    anterior = json;
  }
  return lista;
}

// Mesma lista do servidor antigo, sem o "hoje" automático (a tela acrescenta o dia de hoje).
export function datasComRegistro(b) {
  const set = new Set();
  for (const base of [b.visaoGeral, b.extracaoRpe, b.observacoes, b.baixasBauk]) {
    for (const i of base) if (i.data) set.add(i.data);
  }
  return [...set].sort();
}

// Tudo do fluxo operacional: { chave: conteúdo }
export function gerarOperacional(bases, cfg, agoraReal = new Date()) {
  const saida = {};
  const datas = datasComRegistro(bases);
  // o dia de hoje sempre vai (pode ter dados só em abas que não entram na lista de datas)
  const hoje = isoLocal(agoraReal);
  for (const iso of new Set([...datas, hoje])) saida[`dia:${iso}`] = { variantes: variantesDoDia(bases, iso, cfg, agoraReal) };
  const vazio = variantesDoDia(bases, DIA_VAZIO, cfg, momento(DIA_VAZIO, "00:00"));
  saida["dia:vazio"] = { variantes: vazio.map((v) => ({ ...v, dia: { ...v.dia, data: null } })) };
  saida.inicio = {
    datas,
    cortes: cortesDoDia(cfg),
    intervaloAtualizacaoMin: cfg.intervaloAtualizacaoMin,
    mostrarResponsavel: cfg.mostrarResponsavel,
  };
  return saida;
}

// Relatórios (liberados para todos desde 08/10/2026: chaves "rel:..."; chaves "admin:..." continuam
// existindo para o que for só do admin). Chaves "admin:..." só são entregues pelo banco
// a quem é administrador (função vox_painel do supabase/configurar.sql).
export function gerarRelatorios(bases) {
  const linhas = [...(bases?.desagio || [])].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  return { "rel:desagio": { linhas } };
}

// Despesas do fundo (todos os usuários veem): a planilha publicada já traz todos os meses.
export function gerarDespesas(despesas, arquivo) {
  if (!despesas) return {};
  return { "rel:despesas": { ...despesas,
    arquivo: { nome: arquivo.nome, publicadoEm: new Date(arquivo.mtimeMs).toISOString() } } };
}

// Apresentações de Resultados (todos os usuários veem): a lista dos PDFs, do mais recente
// para o mais antigo. O PDF fica no bucket "caixa", em apresentacoes/AAAA-MM.pdf.
export function gerarApresentacoes(itens) {
  return { "rel:apresentacoes": { itens: itens.map(({ id, nome, mtimeMs, bytes }) =>
    ({ id, nome, bytes, publicadoEm: new Date(mtimeMs).toISOString() })) } };
}

// Balancete e Razão (todos os usuários veem): por mês, quais documentos e formatos existem.
// Os arquivos ficam no bucket "caixa", em balancetes/AAAA-MM/{balancete|razao}.{pdf|xlsx|xls|xlsm}.
export function gerarBalancetes(meses) {
  const limpar = (a) => a && { nome: a.nome, ext: a.ext, bytes: a.bytes, publicadoEm: new Date(a.mtimeMs).toISOString() };
  return { "rel:balancetes": { meses: meses.map(({ id, docs }) => ({ id, docs: Object.fromEntries(
    Object.entries(docs).map(([doc, f]) => [doc, { pdf: limpar(f.pdf), excel: limpar(f.excel) }])) })) } };
}

// Fluxo de caixa: meses publicados (sem caminho de pasta) e o conteúdo de cada mês.
export function gerarCaixa(meses) {
  const saida = {};
  const lista = meses.map(({ publicado }) => semCaminho(publicado));
  saida["caixa:meses"] = { meses: lista };
  for (const { publicado, dados } of meses) {
    saida[`caixa:${publicado.id}`] = { mes: publicado.id, arquivo: semCaminho(publicado), caixa: dados };
  }
  return saida;
}

const semCaminho = ({ caminho, mtimeMs, ...resto }) => ({ ...resto, publicadoEm: new Date(mtimeMs).toISOString() });
