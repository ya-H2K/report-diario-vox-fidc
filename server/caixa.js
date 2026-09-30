// Fluxo de caixa: o site lê só a pasta "Publicado", onde fica a versão final de cada
// mês (o mesmo arquivo completo que vai para os clientes). Da planilha, só a sheet
// "Dashboard" é lida, com os valores que o Excel deixou calculados.
import fs from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { isoDeValor } from "./planilha.js";

export const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho",
  "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const normalizar = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const MESES_NORM = MESES.map(normalizar);

// "CashFlow Vox - Setembro 2026.xlsx", "CashFlow Vox - Julho - 2026.xlsx",
// "CashFlow Vox - Marco 2026.xlsx"... → { ano, mes }
export function mesDoNome(nome) {
  const n = normalizar(nome);
  const ano = n.match(/(20\d{2})/)?.[1];
  const mes = MESES_NORM.findIndex((m) => new RegExp(`(^|[^a-z])${m}([^a-z]|$)`).test(n));
  return ano && mes >= 0 ? { ano: Number(ano), mes: mes + 1 } : null;
}

const idMes = (ano, mes) => `${ano}-${String(mes).padStart(2, "0")}`;
const jaAvisados = new Set();   // avisa uma vez só sobre cada arquivo com nome não reconhecido

// Arquivos publicados, um por mês (se houver dois do mesmo mês, vale o mais recente).
// desde = "AAAA-MM": meses anteriores a ele não aparecem no site.
export async function listarPublicados(pasta, desde = null) {
  let nomes;
  try {
    nomes = await fs.readdir(pasta);
  } catch {
    throw new Error(`Pasta de publicação do fluxo de caixa não encontrada: ${pasta}`);
  }
  const porMes = new Map();
  for (const nome of nomes) {
    if (nome.startsWith("~$") || !/\.xlsx$/i.test(nome)) continue;
    const m = mesDoNome(nome);
    if (!m) {
      if (!jaAvisados.has(nome)) console.warn(`[aviso] Fluxo de caixa: não reconheci o mês no nome "${nome}" (ignorado).`);
      jaAvisados.add(nome);
      continue;
    }
    const caminho = path.join(pasta, nome);
    const stat = await fs.stat(caminho);
    const id = idMes(m.ano, m.mes);
    const atual = porMes.get(id);
    if (!atual || stat.mtimeMs > atual.mtimeMs) {
      porMes.set(id, { id, ...m, rotulo: `${MESES[m.mes - 1]} de ${m.ano}`, nome, caminho, mtimeMs: stat.mtimeMs });
    }
  }
  return [...porMes.values()]
    .filter((m) => !desde || m.id >= desde)
    .sort((a, b) => a.id.localeCompare(b.id));
}

// ---------- preparação da pasta de publicados ----------
// Arquivo de trabalho de um mês: {ANO}, {MES} e {MES_NOME} no modelo do caminho.
// Se o nome exato não existir (ex.: "Julho - 2026"), procura na pasta do mês.
async function arquivoDeTrabalho(modelo, ano, mes) {
  const exato = modelo
    .replaceAll("{ANO}", String(ano))
    .replaceAll("{MES}", String(mes).padStart(2, "0"))
    .replaceAll("{MES_NOME}", MESES[mes - 1]);
  try { await fs.access(exato); return exato; } catch { /* procura na pasta */ }
  const pasta = path.dirname(exato);
  let nomes = [];
  try { nomes = await fs.readdir(pasta); } catch { return null; }
  const achado = nomes.find((n) => !n.startsWith("~$") && /\.xlsx$/i.test(n) &&
    (mesDoNome(n)?.mes === mes && mesDoNome(n)?.ano === ano));
  return achado ? path.join(pasta, achado) : null;
}

function mesesEntre(inicio, fim) {
  const [a1, m1] = inicio.split("-").map(Number);
  const [a2, m2] = fim.split("-").map(Number);
  const lista = [];
  for (let a = a1, m = m1; a < a2 || (a === a2 && m <= m2); m === 12 ? (a++, m = 1) : m++) lista.push({ ano: a, mes: m });
  return lista;
}

// Cria a pasta de publicados (se não existir) e copia para ela os meses do período
// inicial que ainda não estão lá. Nunca substitui um arquivo já publicado.
export async function prepararPublicados({ pasta, modeloTrabalho, importar }) {
  await fs.mkdir(pasta, { recursive: true });
  if (!importar) return [];
  const [inicio, fim] = importar.split(":").map((s) => s.trim());
  const jaPublicados = new Set((await listarPublicados(pasta)).map((m) => m.id));
  const copiados = [];
  for (const { ano, mes } of mesesEntre(inicio, fim || inicio)) {
    const id = idMes(ano, mes);
    if (jaPublicados.has(id)) continue;
    const origem = await arquivoDeTrabalho(modeloTrabalho, ano, mes);
    if (!origem) { console.warn(`[aviso] Fluxo de caixa: não achei o arquivo de trabalho de ${MESES[mes - 1]}/${ano}.`); continue; }
    const destino = path.join(pasta, path.basename(origem));
    await fs.copyFile(origem, destino);
    copiados.push(path.basename(origem));
  }
  return copiados;
}

// ---------- leitura da sheet Dashboard (colunas achadas pelo cabeçalho) ----------
function valor(cell) {
  let v = cell?.value;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    if ("result" in v) v = v.result;
    else if ("richText" in v) v = v.richText.map((t) => t.text).join("");
    else if ("error" in v) v = null;
  }
  if (v && typeof v === "object" && "error" in v) v = null;
  return v ?? null;
}
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// nome do cabeçalho (normalizado) → campo
const CABECALHOS = {
  "data": "data",
  "saldo inicial caixa": "saldoInicial",
  "entradas (baixas)": "entradas",
  "saidas": "saidas",
  "aplicacoes": "aplicacoes",
  "resgates": "resgates",
  "rendimento aplicacoes": "rendimento",
  "saldo final c/c": "saldoFinalCC",
  "saldo total aplicacoes": "saldoAplicacoes",
  "saldo caixa total": "saldoCaixaTotal",
  "% var. caixa": "variacaoCaixa",
  "% enquadramento": "enquadramento",
};
const INDICADORES = {
  "caixa inicial": "caixaInicial",
  "entradas acumuladas": "entradasAcumuladas",
  "saidas acumuladas": "saidasAcumuladas",
  "caixa total fechamento": "caixaTotalFechamento",
};

function lerDashboard(wb) {
  const ws = wb.getWorksheet("Dashboard");
  if (!ws) throw new Error('A planilha do fluxo de caixa não tem a sheet "Dashboard".');

  // 1) linha de cabeçalho da tabela: a que tem "Data" e "Saldo Caixa Total"
  let linhaCab = null;
  const colunas = {};
  for (let r = 1; r <= 20 && !linhaCab; r++) {
    const achados = {};
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
      const campo = CABECALHOS[normalizar(valor(cell))];
      if (campo) achados[campo] = col;
    });
    if (achados.data && achados.saldoCaixaTotal) { linhaCab = r; Object.assign(colunas, achados); }
  }
  if (!linhaCab) throw new Error("Não encontrei a tabela diária no Dashboard (cabeçalho com Data e Saldo Caixa Total).");

  // 2) linhas: a primeira é o fechamento do mês anterior (saldo de abertura)
  const linhas = [];
  for (let r = linhaCab + 1; r <= linhaCab + 80; r++) {
    const row = ws.getRow(r);
    const data = isoDeValor(valor(row.getCell(colunas.data)));
    if (!data) break;
    const abertura = linhas.length === 0;
    const linha = { data, abertura };
    for (const [campo, col] of Object.entries(colunas)) {
      if (campo === "data") continue;
      const v = num(valor(row.getCell(col)));
      // nas linhas do mês, fórmula sem valor salvo é zero (o Excel exibe R$ 0,00)
      linha[campo] = v === null && !abertura && campo !== "enquadramento" && campo !== "variacaoCaixa" ? 0 : v;
    }
    linhas.push(linha);
  }

  // 3) indicadores: rótulo numa linha, valor na linha de baixo (A3 → A4 etc.)
  const indicadores = {};
  for (let r = 1; r < linhaCab; r++) {
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
      const campo = INDICADORES[normalizar(valor(cell))];
      if (campo && !(campo in indicadores)) indicadores[campo] = num(valor(ws.getCell(r + 1, col)));
    });
  }
  // O fechamento é o saldo da última linha. Não usamos a célula direto porque, em
  // alguns meses, ela procura a linha de HOJE (XLOOKUP(TODAY())), que vira erro
  // quando o arquivo é salvo depois que o mês acabou.
  const ultima = linhas.at(-1);
  if (ultima) indicadores.caixaTotalFechamento = ultima.saldoCaixaTotal;
  if (indicadores.caixaInicial == null && linhas[0]) indicadores.caixaInicial = linhas[0].saldoCaixaTotal;

  return { titulo: String(valor(ws.getCell("A1")) ?? "").trim(), indicadores, linhas };
}

// ---------- cache por arquivo (mês fechado é lido uma vez só) ----------
const cache = new Map();          // caminho -> { mtimeMs, dados }
const emAndamento = new Map();    // caminho -> Promise

export function obterCaixa(caminho, { forcar = false } = {}) {
  if (!emAndamento.has(caminho)) {
    emAndamento.set(caminho, lerComCache(caminho, forcar).finally(() => emAndamento.delete(caminho)));
  }
  return emAndamento.get(caminho);
}

async function lerComCache(caminho, forcar) {
  const stat = await fs.stat(caminho);
  const atual = cache.get(caminho);
  if (!forcar && atual && atual.mtimeMs === stat.mtimeMs) return atual.dados;
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await fs.readFile(caminho));
    const dados = lerDashboard(wb);
    cache.set(caminho, { mtimeMs: stat.mtimeMs, dados });
    return dados;
  } catch (e) {
    if (atual) return atual.dados;   // arquivo no meio de uma cópia: usa a última leitura boa
    throw e;
  }
}
