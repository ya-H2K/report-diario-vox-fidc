// Lê a planilha "Acompanhamento de Fluxo Operacional - Vox" e devolve as
// bases já normalizadas. Usa os valores que o Excel deixou calculados no
// arquivo (não recalcula fórmulas). Mantém cache enquanto o arquivo não muda.
import fs from "node:fs/promises";
import ExcelJS from "exceljs";

const EPOCH_EXCEL = Date.UTC(1899, 11, 30);

// ---------- conversão de células ----------
function bruto(cell) {
  let v = cell?.value;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    if ("result" in v) v = v.result;                 // fórmula: usa o valor calculado
    else if ("richText" in v) v = v.richText.map((t) => t.text).join("");
    else if ("text" in v) v = v.text;                 // hyperlink
    else if ("error" in v) v = null;
  }
  if (v && typeof v === "object" && "error" in v) v = null;
  return v ?? null;
}

export function isoDeValor(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) {
    return new Date(EPOCH_EXCEL + Math.round(v) * 86400000).toISOString().slice(0, 10);
  }
  if (typeof v === "string") {
    const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
    const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[0];
  }
  return null;
}

const texto = (v) => (v === null || v === undefined ? "" : String(v).trim());
const numero = (v) => {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/[R$\s.]/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};
const inteiroOuTexto = (v) => (typeof v === "number" ? Math.round(v) : texto(v));

// Percorre as linhas de dados (a partir da 2) enquanto houver algo na coluna-chave.
function linhas(ws, colunas, colunaChave, mapear) {
  const out = [];
  if (!ws) return out;
  const ultima = ws.actualRowCount + 50;
  for (let r = 2; r <= Math.max(ultima, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const valores = {};
    for (const [nome, col] of Object.entries(colunas)) valores[nome] = bruto(row.getCell(col));
    if (valores[colunaChave] === null || valores[colunaChave] === "") continue;
    const item = mapear(valores, r);
    if (item) out.push(item);
  }
  return out;
}

// ---------- leitura de cada base ----------
function lerBases(wb) {
  const ws = (nome) => wb.getWorksheet(nome);

  const visaoGeral = linhas(ws("Visão Geral Bauk"),
    { data: "A", codigo: "B", nome: "C", tipo: "D", valor: "E", qtd: "F", status: "G", demais: "H", endosso: "I" }, "codigo",
    (v) => ({ data: isoDeValor(v.data), codigo: inteiroOuTexto(v.codigo), nome: texto(v.nome),
      tipo: texto(v.tipo), valor: numero(v.valor), qtd: v.qtd === null ? null : numero(v.qtd),
      status: texto(v.status),
      // marcações das colunas H e I (null = célula vazia, usa a regra pelo nome)
      marcaDemais: typeof v.demais === "number" ? v.demais : null,
      marcaEndosso: typeof v.endosso === "number" ? v.endosso : null }));

  const liquidacao = (nome) => linhas(ws(nome),
    { data: "A", operacao: "B", cedente: "C", valor: "F", tipo: "G", liquidado: "H", status: "I" }, "data",
    (v) => !isoDeValor(v.data) ? null : ({ data: isoDeValor(v.data), operacao: inteiroOuTexto(v.operacao), cedente: texto(v.cedente),
      valor: numero(v.valor), tipo: texto(v.tipo), liquidado: texto(v.liquidado), status: texto(v.status) }));

  const baixasBauk = linhas(ws("Baixas Bauk"),
    { data: "A", codigo: "B", nome: "C", tipo: "D", valor: "E", principal: "F" }, "codigo",
    (v) => ({ data: isoDeValor(v.data), codigo: inteiroOuTexto(v.codigo), nome: texto(v.nome),
      tipo: texto(v.tipo), valor: numero(v.valor),
      // coluna F: 1 = baixa principal. Respeita ajustes manuais (ex.: 04/09 zerado).
      marcaPrincipal: typeof v.principal === "number" ? v.principal : null }));

  const qiTech = linhas(ws("Processamento Qi Tech"), { data: "A", arquivo: "B", valor: "C" }, "arquivo",
    (v) => ({ data: isoDeValor(v.data), arquivo: texto(v.arquivo), valor: numero(v.valor) }));

  const aceitas = linhas(ws("Aceitas-Rejeitadas"),
    { data: "A", importadas: "B", aceitas: "C", rejeitadas: "D" }, "data",
    (v) => ({ data: isoDeValor(v.data), importadas: numero(v.importadas),
      aceitas: v.aceitas === null || v.aceitas === "" ? null : numero(v.aceitas),
      rejeitadas: v.aceitas === null || v.aceitas === "" ? null : numero(v.rejeitadas) }));

  const represadas = linhas(ws("Baixas Represadas"),
    { data: "A", operacao: "B", nome: "C", valor: "D", represada: "E", motivo: "F", responsavel: "G" }, "data",
    (v) => ({ data: isoDeValor(v.data), operacao: inteiroOuTexto(v.operacao), nome: texto(v.nome),
      valor: numero(v.valor), represada: texto(v.represada), motivo: texto(v.motivo),
      responsavel: texto(v.responsavel) }));
  const represadasAcumulado = numero(bruto(ws("Baixas Represadas")?.getCell("J2")));
  // Igual ao Dashboard!F17 do Excel: soma das células P2 (preenchidas à mão).
  const liquidacaoPendenteAcumulado =
    numero(bruto(ws("Liquidação URFA")?.getCell("P2"))) + numero(bruto(ws("Liquidação Endosso")?.getCell("P2")));

  const extracaoRpe = linhas(ws("Extração RPE"),
    { data: "A", tipo: "B", arquivo: "C", recebido: "D" }, "arquivo",
    (v) => ({ data: isoDeValor(v.data), tipo: texto(v.tipo), arquivo: texto(v.arquivo),
      recebido: texto(v.recebido) }));

  const arquivosRpe = linhas(ws("Arquivos RPE"),
    { data: "A", tipo: "B", arquivo: "C", corretos: "D", incorretos: "E" }, "arquivo",
    (v) => ({ data: isoDeValor(v.data), tipo: texto(v.tipo), arquivo: texto(v.arquivo),
      corretos: numero(v.corretos), incorretos: numero(v.incorretos) }));

  const flash = linhas(ws("Flash Reports"), { data: "A", arquivo: "B" }, "arquivo",
    (v) => ({ data: isoDeValor(v.data), arquivo: texto(v.arquivo) }));

  const observacoes = linhas(ws("Quadro de Observações"),
    { data: "A", processo: "B", status: "C", observacao: "D", responsavel: "E" }, "data",
    (v) => ({ data: isoDeValor(v.data), processo: texto(v.processo), status: texto(v.status),
      observacao: texto(v.observacao), responsavel: texto(v.responsavel) }));

  return {
    visaoGeral, liquidacaoUrfa: liquidacao("Liquidação URFA"), liquidacaoEndosso: liquidacao("Liquidação Endosso"),
    baixasBauk, qiTech, aceitas, represadas, represadasAcumulado, liquidacaoPendenteAcumulado, extracaoRpe, arquivosRpe, flash, observacoes,
  };
}

// ---------- cache ----------
let cache = { mtimeMs: null, bases: null, lidaEm: null, erro: null, caminho: null };
let emAndamento = null;

// Vários pedidos chegando juntos compartilham a mesma leitura do arquivo.
// forcar = true relê o arquivo mesmo que a data de modificação não tenha mudado
// (botão "Atualizar agora"; drives de rede às vezes demoram a refletir a data).
export function obterBases(caminho, { forcar = false } = {}) {
  if (!emAndamento) emAndamento = lerComCache(caminho, forcar).finally(() => { emAndamento = null; });
  return emAndamento;
}

async function lerComCache(caminho, forcar) {
  let stat;
  try {
    stat = await fs.stat(caminho);
  } catch {
    const erro = `Planilha não encontrada em ${caminho}. Confira PLANILHA_PATH no arquivo .env.`;
    if (cache.bases && cache.caminho === caminho) return { ...cache, erro };
    throw new Error(erro);
  }
  if (!forcar && cache.bases && cache.mtimeMs === stat.mtimeMs && cache.caminho === caminho) return cache;

  try {
    // Lê a partir de um buffer: não trava o arquivo para o Excel/automação.
    const buffer = await fs.readFile(caminho);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    cache = { mtimeMs: stat.mtimeMs, bases: lerBases(wb), lidaEm: new Date().toISOString(), erro: null, caminho };
  } catch (e) {
    // Arquivo pode estar no meio de um salvamento: mantém a última leitura boa.
    if (cache.bases) return { ...cache, erro: `Última leitura falhou (${e.message}); exibindo a anterior.` };
    throw e;
  }
  return cache;
}
