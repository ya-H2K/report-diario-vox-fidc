// Publicador: lê a planilha e o fluxo de caixa no seu PC e envia para o Supabase
// só os status e valores que o site mostra (nada de nomes de arquivo, caminhos etc.).
//
//   node publicador/publicar.js            fica vigiando: publica sempre que a planilha
//                                          ou a pasta do caixa mudarem (confere a cada minuto)
//   node publicador/publicar.js --uma-vez  publica uma vez e sai
//   node publicador/publicar.js --tudo     reenvia tudo, mesmo o que não mudou
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { config, agora } from "../server/config.js";
import { obterBases } from "../server/planilha.js";
import { listarPublicados, obterCaixa, prepararPublicados } from "../server/caixa.js";
import { gerarOperacional, gerarCaixa, gerarRelatorios, gerarDespesas, gerarApresentacoes, gerarBalancetes, cortesDoDia, opcoesDe } from "./gerar.js";
import { listarBalancetes, caminhoNuvem, TIPO_CONTEUDO } from "../server/balancetes.js";
import { listarApresentacoes } from "../server/apresentacoes.js";
import { listarLaminas } from "../server/laminas.js";
import { arquivoPublicado, lerDespesas } from "../server/despesas.js";
import { conectar, gravarChaves, apagarChaves, enviarArquivo } from "./nuvem.js";
import { statusDoDia } from "./bauk.js";
import { faseBauk, isoLocal, prepararBases, montarDia } from "../server/status.js";

const PASTA = path.dirname(fileURLToPath(import.meta.url));
const ARQ_ESTADO = path.join(PASTA, ".estado.json");
const hora = () => new Date().toLocaleTimeString("pt-BR");
const log = (...a) => console.log(`[${hora()}]`, ...a);
const aviso = (...a) => console.warn(`[${hora()}] [aviso]`, ...a);

function lerEstado() {
  try { return JSON.parse(fs.readFileSync(ARQ_ESTADO, "utf-8")); } catch { return { hashes: {}, arquivos: {} }; }
}
function salvarEstado(e) { fs.writeFileSync(ARQ_ESTADO, JSON.stringify(e, null, 1), "utf-8"); }
const hash = (v) => crypto.createHash("sha1").update(JSON.stringify(v)).digest("hex");

// ---------- status das operações do dia na Bauk (tela Negociação) ----------
// Consultado a cada BAUK_INTERVALO_MIN (padrão 2) em dias úteis, das 8h às 20h.
// Desligar: BAUK_STATUS=false no .env.
const baukLigado = () => (process.env.BAUK_STATUS || "true").toLowerCase() !== "false";
const bauk = { iso: null, status: null, em: 0, falhas: 0, avisados: new Set(), exemploSalvo: false };
// Data de negociação de cada operação na Bauk, guardada no PC (publicador/.bauk-datas.json) para
// que uma operação repetida na planilha em outro dia conte só no dia em que foi negociada.
const ARQ_DATAS = path.join(PASTA, ".bauk-datas.json");
let dataBauk = {};
try { dataBauk = JSON.parse(fs.readFileSync(ARQ_DATAS, "utf-8")); } catch { /* ainda não existe */ }

async function atualizarBauk({ forcar = false } = {}) {
  if (!baukLigado()) return;
  const agoraLocal = agora();
  const iso = isoLocal(agoraLocal);
  const hora = agoraLocal.getHours();
  const util = agoraLocal.getDay() !== 0 && agoraLocal.getDay() !== 6;
  if (!forcar && (!util || hora < 8 || hora >= 20)) return;
  const intervalo = Number(process.env.BAUK_INTERVALO_MIN || 2) * 60 * 1000;
  if (!forcar && bauk.iso === iso && Date.now() - bauk.em < intervalo) return;
  try {
    const { status, datas, exemplo } = await statusDoDia(iso);
    bauk.iso = iso; bauk.status = status; bauk.em = Date.now();
    // uma vez por dia: busca também os 7 dias anteriores, para saber a data das operações
    // que ficaram pendentes e podem ter sido repetidas na planilha
    if (bauk.datasCompletas !== iso) {
      for (let k = 1; k <= 7; k++) {
        const d = new Date(agoraLocal); d.setDate(d.getDate() - k);
        try { Object.assign(datas, (await statusDoDia(isoLocal(d))).datas); } catch { /* tenta amanhã */ }
      }
      bauk.datasCompletas = iso;
    }
    const novas = Object.entries(datas || {}).filter(([op, d]) => dataBauk[op] !== d);
    if (novas.length) {
      for (const [op, d] of novas) dataBauk[op] = d;
      try { fs.writeFileSync(ARQ_DATAS, JSON.stringify(dataBauk, null, 1), "utf-8"); } catch { /* fica só na memória */ }
    }
    if (bauk.falhas) log("Bauk: consulta de status voltou a funcionar.");
    bauk.falhas = 0;
    if (exemplo && !bauk.exemploSalvo) {      // cópia de um item, para conferência (fica só no PC)
      fs.writeFileSync(path.join(PASTA, ".bauk-exemplo.json"), JSON.stringify(exemplo, null, 2), "utf-8");
      bauk.exemploSalvo = true;
    }
    for (const [op, st] of Object.entries(status)) {
      if (st && !faseBauk(st) && !bauk.avisados.has(st)) {
        bauk.avisados.add(st);
        log(`Bauk: status "${st}" (operação ${op}) não muda o card (só CNAB Gerado, Aguardando Assinaturas, Aguardando Envio XML, XML Enviado e Negociado mudam).`);
      }
    }
  } catch (e) {
    bauk.em = Date.now();                     // espera o intervalo antes de tentar de novo
    if (bauk.falhas++ === 0) aviso(`Bauk: não consegui ler o status das operações (${e.message}). O site segue sem essa informação.`);
  }
}
// Confere as operações de hoje ainda não liquidadas (URFA/Endosso da planilha) contra a Bauk e
// avisa na janela (uma vez por operação/situação) por que o card não mudou de rótulo.
// Também grava publicador/.bauk-status.json com o que foi lido, para conferência.
const conferidos = new Set();
function conferirBauk(brutas) {
  if (!baukLigado()) return;
  const bases = prepararBases({ ...brutas, dataBauk });
  const iso = isoLocal(agora());
  const pendentes = [["URFA", bases.liquidacaoUrfa], ["Endosso", bases.liquidacaoEndosso]]
    .flatMap(([tipo, base]) => (base || []).filter((i) => i.data === iso && i.operacao !== "" && i.liquidado !== "Sim")
      .map((i) => ({ tipo, operacao: String(i.operacao) })));
  const lidos = bauk.iso === iso ? bauk.status : null;
  try {
    fs.writeFileSync(path.join(PASTA, ".bauk-status.json"), JSON.stringify({
      consultadoEm: bauk.em ? new Date(bauk.em).toLocaleString("pt-BR") : null, dia: iso,
      statusNaBauk: lidos, pendentesNaPlanilha: pendentes }, null, 2), "utf-8");
  } catch { /* só conferência */ }
  for (const p of pendentes) {
    let motivo = null;
    if (!lidos) motivo = "a consulta à Bauk ainda não trouxe dados de hoje";
    else if (!(p.operacao in lidos)) motivo = `a operação não aparece na tela Negociação da Bauk (operações lá: ${Object.keys(lidos).join(", ") || "nenhuma"})`;
    else if (!faseBauk(lidos[p.operacao])) motivo = `status na Bauk "${lidos[p.operacao]}" não é reconhecido`;
    const chave = `${iso}|${p.operacao}|${motivo}`;
    if (motivo && !conferidos.has(chave)) {
      conferidos.add(chave);
      log(`Bauk: ${p.tipo} operação ${p.operacao} segue "Aguardando informações": ${motivo}.`);
    }
  }
}

// ---------- horário de chegada dos arquivos RPE ----------
// A automação baixar_rpe_fiabilite.py (C:\\Automacao\\Vox) grava rpe_chegadas\\AAAA-MM-DD.json com a hora
// em que cada um dos 6 arquivos chegou ao SFTP. Vira { "AAAA-MM-DD": { "Extrato Diario": "08:47", ... } }.
function lerChegadasRpe() {
  const saida = {};
  let nomes = [];
  try { nomes = fs.readdirSync(config.rpeChegadas).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)); }
  catch { return saida; }                    // pasta ainda não existe: a automação nunca rodou
  for (const n of nomes) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(config.rpeChegadas, n), "utf-8"));
      const dia = {};
      for (const [tipo, a] of Object.entries(j.arquivos || {})) {
        const hhmm = String(a?.chegada || "").slice(11, 16);
        if (/^\d{2}:\d{2}$/.test(hhmm)) dia[tipo] = hhmm;
      }
      saida[n.slice(0, 10)] = dia;
    } catch { /* arquivo sendo gravado: pega na próxima volta */ }
  }
  return saida;
}

// ---------- horário em que cada etapa ficou OK ----------
// A cada minuto o publicador olha o status das etapas de hoje. Quando vê uma etapa passar de
// "não OK" para OK, guarda a hora (publicador/.horarios-etapas.json). Só vale se a observação
// anterior for recente (até 20 min): com o PC desligado ou o publicador fechado, a hora seria
// a de quando ele voltou, então fica sem hora em vez de mostrar uma hora errada.
const ARQ_HORARIOS = path.join(PASTA, ".horarios-etapas.json");
let horarios = {};
try { horarios = JSON.parse(fs.readFileSync(ARQ_HORARIOS, "utf-8")); } catch { /* ainda não existe */ }
const horasEtapas = () => Object.fromEntries(Object.entries(horarios).map(([iso, h]) => [iso, h.horas || {}]));

function observarEtapas(brutas) {
  if (!brutas) return;
  const agoraLocal = agora();
  const iso = isoLocal(agoraLocal);
  let dia;
  try {
    dia = montarDia({ ...brutas, statusBauk: statusBaukParaBases(), dataBauk }, iso, opcoesDe(config, agoraLocal));
  } catch { return; }
  const reg = horarios[iso] || (horarios[iso] = { visto: {}, vistoEm: 0, horas: {} });
  const recente = agoraLocal.getTime() - reg.vistoEm <= 20 * 60 * 1000;
  const hhmm = agoraLocal.toTimeString().slice(0, 5);
  let mudou = false;
  for (const p of dia.processos) {
    const antes = reg.visto[p.id];
    if (p.status === "ok" && antes && antes !== "ok" && recente && !reg.horas[p.id]) {
      reg.horas[p.id] = hhmm;
      mudou = true;
      log(`${p.nome}: OK às ${hhmm}.`);
    }
    reg.visto[p.id] = p.status;
  }
  reg.vistoEm = agoraLocal.getTime();
  // guarda só os últimos 120 dias
  for (const k of Object.keys(horarios).sort().slice(0, -120)) delete horarios[k];
  try { fs.writeFileSync(ARQ_HORARIOS, JSON.stringify(horarios, null, 1), "utf-8"); } catch { /* fica na memória */ }
  return mudou;
}

const avisadosApr = new Set();
const statusBaukParaBases = () => (bauk.iso && bauk.status ? { [bauk.iso]: bauk.status } : {});

// Monta tudo e envia só o que mudou desde o último envio.
export async function publicar({ tudo = false } = {}) {
  const sb = conectar();
  const leitura = await obterBases(config.planilha, { forcar: true });
  if (leitura.erro) aviso(leitura.erro);
  conferirBauk(leitura.bases);
  observarEtapas(leitura.bases);
  const mapa = gerarOperacional({ ...leitura.bases, statusBauk: statusBaukParaBases(), dataBauk,
    chegadasRpe: lerChegadasRpe(), horariosEtapas: horasEtapas() }, config, agora());

  let publicados = [];
  try { publicados = await listarPublicados(config.caixaPublicado, config.caixaDesde); }
  catch (e) { aviso(`Fluxo de caixa: ${e.message}`); }
  const meses = [];
  for (const publicado of publicados) {
    try { meses.push({ publicado, dados: await obterCaixa(publicado.caminho) }); }
    catch (e) { aviso(`Fluxo de caixa ${publicado.nome}: ${e.message}`); }
  }
  Object.assign(mapa, gerarCaixa(meses));
  if (leitura.bases) Object.assign(mapa, gerarRelatorios(leitura.bases));

  // Despesas: o arquivo mais recente da pasta de publicados
  let despesasArq = null;
  try {
    despesasArq = await arquivoPublicado(config.despesasPublicado);
    if (despesasArq) Object.assign(mapa, gerarDespesas(await lerDespesas(despesasArq.caminho), despesasArq));
  } catch (e) { aviso(`Despesas: ${e.message}`); despesasArq = null; }

  // Apresentações de Resultados: os PDFs da pasta de publicados (um por mês)
  let apresentacoes = null;
  try {
    const r = await listarApresentacoes(config.apresentacoesPublicado);
    apresentacoes = r.itens;
    Object.assign(mapa, gerarApresentacoes(r.itens));
    for (const n of r.ignorados) {
      if (!avisadosApr.has(n)) { avisadosApr.add(n); aviso(`Apresentações: "${n}" ignorado (o nome precisa terminar com o mês, ex.: "... 09.26.pdf").`); }
    }
  } catch (e) { aviso(`Apresentações: ${e.message}`); }

  // Lâminas: pastas ano\mês, um PDF por mês (mesmo formato das apresentações)
  let laminas = null;
  try {
    const r = await listarLaminas(config.laminasPublicado, String(agora().getFullYear()));
    laminas = r.itens;
    Object.assign(mapa, gerarApresentacoes(r.itens, "rel:laminas"));
    for (const n of r.ignorados) {
      if (!avisadosApr.has(`l:${n}`)) { avisadosApr.add(`l:${n}`); aviso(`Lâminas: ${n} ignorado (use pastas "AAAA\\MM" com o PDF dentro).`); }
    }
  } catch (e) { aviso(`Lâminas: ${e.message}`); }

  // Balancete e Razão: subpastas por mês na pasta de publicados
  let balancetes = null;
  try {
    const r = await listarBalancetes(config.balancetesPublicado);
    balancetes = r.meses;
    Object.assign(mapa, gerarBalancetes(r.meses));
    for (const n of r.ignorados) {
      if (!avisadosApr.has(`b:${n}`)) { avisadosApr.add(`b:${n}`); aviso(`Balancete e Razão: ${n} ignorado (pasta "AAAA.MM"; arquivo com "balancete" ou "razão" no nome, em PDF ou Excel).`); }
    }
  } catch (e) { aviso(`Balancete e Razão: ${e.message}`); }

  const estado = lerEstado();
  const novos = Object.fromEntries(Object.entries(mapa).map(([k, v]) => [k, hash(v)]));
  const mudadas = Object.keys(mapa).filter((k) => tudo || estado.hashes[k] !== novos[k]);
  const apagadas = Object.keys(estado.hashes).filter((k) => !(k in mapa));

  // Planilhas do caixa (para o botão "Baixar planilha"): só as que mudaram.
  const arquivos = { ...estado.arquivos };
  let enviados = 0;
  for (const { publicado } of meses) {
    if (!tudo && arquivos[publicado.id] === publicado.mtimeMs) continue;
    await enviarArquivo(sb, `${publicado.id}.xlsx`, fs.readFileSync(publicado.caminho));
    arquivos[publicado.id] = publicado.mtimeMs;
    enviados++;
  }

  if (despesasArq && (tudo || arquivos.despesas !== despesasArq.mtimeMs)) {
    await enviarArquivo(sb, "despesas/atual.xlsx", fs.readFileSync(despesasArq.caminho));
    arquivos.despesas = despesasArq.mtimeMs;
    enviados++;
  }

  for (const a of apresentacoes || []) {
    const chave = `apr:${a.id}`;
    if (!tudo && arquivos[chave] === a.mtimeMs) continue;
    await enviarArquivo(sb, `apresentacoes/${a.id}.pdf`, fs.readFileSync(a.caminho), "application/pdf");
    arquivos[chave] = a.mtimeMs;
    enviados++;
  }

  for (const l of laminas || []) {
    const chave = `lam:${l.id}`;
    if (!tudo && arquivos[chave] === l.mtimeMs) continue;
    await enviarArquivo(sb, `laminas/${l.id}.pdf`, fs.readFileSync(l.caminho), "application/pdf");
    arquivos[chave] = l.mtimeMs;
    enviados++;
  }

  for (const { id, docs } of balancetes || []) {
    for (const [doc, formatos] of Object.entries(docs)) {
      for (const arq of Object.values(formatos)) {
        const destino = caminhoNuvem(id, doc, arq);
        if (!tudo && arquivos[`bal:${destino}`] === arq.mtimeMs) continue;
        await enviarArquivo(sb, destino, fs.readFileSync(arq.caminho), TIPO_CONTEUDO[arq.ext]);
        arquivos[`bal:${destino}`] = arq.mtimeMs;
        enviados++;
      }
    }
  }

  if (!mudadas.length && !apagadas.length && !enviados) return { mudadas: 0, apagadas: 0, enviados: 0 };

  await gravarChaves(sb, Object.fromEntries(mudadas.map((k) => [k, mapa[k]])));
  await apagarChaves(sb, apagadas);
  // "versao" muda a cada envio: as telas abertas percebem em até 1 minuto e se atualizam.
  await gravarChaves(sb, { versao: { versao: Date.now(), publicadoEm: new Date().toISOString(), cortes: cortesDoDia(config) } });
  salvarEstado({ hashes: novos, arquivos });
  return { mudadas: mudadas.length, apagadas: apagadas.length, enviados };
}

// "Impressão digital" do que pode mudar: data da planilha e dos arquivos do caixa.
async function assinatura() {
  const partes = [];
  try { partes.push(fs.statSync(config.planilha).mtimeMs); } catch { partes.push("sem-planilha"); }
  try {
    for (const n of fs.readdirSync(config.caixaPublicado).sort()) {
      if (n.startsWith("~$") || !/\.xlsx$/i.test(n)) continue;
      partes.push(`${n}:${fs.statSync(path.join(config.caixaPublicado, n)).mtimeMs}`);
    }
  } catch { partes.push("sem-caixa"); }
  try {
    for (const n of fs.readdirSync(config.despesasPublicado).sort()) {
      if (n.startsWith("~$") || !/\.xlsx$/i.test(n)) continue;
      partes.push(`d:${n}:${fs.statSync(path.join(config.despesasPublicado, n)).mtimeMs}`);
    }
  } catch { partes.push("sem-despesas"); }
  try {
    for (const n of fs.readdirSync(config.apresentacoesPublicado).sort()) {
      if (n.startsWith("~$") || !/\.pdf$/i.test(n)) continue;
      partes.push(`a:${n}:${fs.statSync(path.join(config.apresentacoesPublicado, n)).mtimeMs}`);
    }
  } catch { partes.push("sem-apresentacoes"); }
  try {
    for (const a of fs.readdirSync(config.laminasPublicado).sort()) {
      const da = path.join(config.laminasPublicado, a);
      if (!fs.statSync(da).isDirectory()) continue;
      for (const m of fs.readdirSync(da).sort()) {
        const dm = path.join(da, m);
        if (!fs.statSync(dm).isDirectory()) continue;
        for (const n of fs.readdirSync(dm).sort()) partes.push(`l:${a}/${m}/${n}:${fs.statSync(path.join(dm, n)).mtimeMs}`);
      }
    }
  } catch { partes.push("sem-laminas"); }
  try {
    for (const d of fs.readdirSync(config.balancetesPublicado).sort()) {
      const dir = path.join(config.balancetesPublicado, d);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const n of fs.readdirSync(dir).sort()) partes.push(`b:${d}/${n}:${fs.statSync(path.join(dir, n)).mtimeMs}`);
    }
  } catch { partes.push("sem-balancetes"); }
  try {
    for (const n of fs.readdirSync(config.rpeChegadas).sort()) partes.push(`r:${n}:${fs.statSync(path.join(config.rpeChegadas, n)).mtimeMs}`);
  } catch { partes.push("sem-rpe-chegadas"); }
  partes.push(hash(statusBaukParaBases()), hash(dataBauk), hash(horasEtapas()));
  return partes.join("|");
}

function resumo(r) {
  if (!r.mudadas && !r.apagadas && !r.enviados) return "nada mudou, nada a enviar.";
  return `enviado! (${r.mudadas} bloco(s) de dados${r.enviados ? `, ${r.enviados} arquivo(s) para download` : ""})`;
}

async function vigiar() {
  log("Publicador ligado. Deixe esta janela aberta (pode minimizar).");
  log(`Planilha: ${config.planilha}`);
  log(`Caixa:    ${config.caixaPublicado}`);
  log(`Despesas: ${config.despesasPublicado}`);
  log(`Apresentações: ${config.apresentacoesPublicado}`);
  log(`Balancete e Razão: ${config.balancetesPublicado}`);
  log(`Lâminas: ${config.laminasPublicado}`);
  log(`Chegada dos arquivos RPE: ${config.rpeChegadas}`);
  try {
    const copiados = await prepararPublicados({ pasta: config.caixaPublicado, modeloTrabalho: config.caixaTrabalho, importar: config.caixaImportar });
    if (copiados.length) log(`Fluxo de caixa, cópia inicial: ${copiados.join(", ")}`);
  } catch (e) { aviso(`Pasta de publicados do fluxo de caixa: ${e.message}`); }

  let ultima = null;
  let falhas = 0;
  for (;;) {
    await atualizarBauk();
    try { observarEtapas((await obterBases(config.planilha)).bases); } catch { /* planilha indisponível agora */ }
    const atual = await assinatura();
    if (atual !== ultima) {
      try {
        log(ultima === null ? "Conferindo os dados..." : "Mudança detectada, publicando...");
        log(resumo(await publicar()));
        ultima = atual;
        falhas = 0;
      } catch (e) {
        falhas++;
        aviso(`Não consegui publicar (${e.message}). Tento de novo em 1 minuto.`);
        if (falhas === 3) aviso("Se continuar, confira a internet e as chaves do Supabase no .env.");
      }
    }
    await new Promise((r) => setTimeout(r, 60 * 1000));
  }
}

const direto = process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (direto) {
  const args = process.argv.slice(2);
  if (args.includes("--uma-vez") || args.includes("--tudo")) {
    atualizarBauk({ forcar: true }).then(() => publicar({ tudo: args.includes("--tudo") }))
      .then((r) => { log(resumo(r)); process.exit(0); })
      .catch((e) => { console.error(`[erro] ${e.message}`); process.exit(1); });
  } else {
    vigiar();
  }
}
