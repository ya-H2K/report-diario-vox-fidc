// Despesas do fundo: o site lê só a pasta "Publicado" das despesas (publicada uma vez por mês).
// Vale o arquivo .xlsx mais recente da pasta. Layout esperado (o da planilha "Despesas Vox"):
//   linha 1: "Fornecedor", "Serviço", [opcional "Categoria"], e um mês por coluna (data ou "mm/aaaa");
//   linhas seguintes: uma despesa por linha. Linhas sem fornecedor (ex.: a de total) são ignoradas.
// A coluna "Categoria" é opcional; sem ela, a tela deduz a categoria pelo nome do serviço.
import fs from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";

const normalizar = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function valor(cell) {
  let v = cell?.value;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    if ("result" in v) v = v.result;
    else if ("richText" in v) v = v.richText.map((t) => t.text).join("");
    else if ("text" in v) v = v.text;
    else if ("error" in v) v = null;
  }
  if (v && typeof v === "object" && "error" in v) v = null;
  return v ?? null;
}

// Cabeçalho de mês → "AAAA-MM" (data do Excel, "09/2026", "set/26", "Setembro 2026"...)
const ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function mesDoCabecalho(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 7);
  if (typeof v === "number" && v > 20000 && v < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 7);
  }
  const s = normalizar(v);
  let m = s.match(/^(\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  m = s.match(/^([a-z]{3})[a-z]*[\s/.-]*(\d{2}|\d{4})$/);
  if (m && ABREV.includes(m[1])) {
    const ano = m[2].length === 2 ? `20${m[2]}` : m[2];
    return `${ano}-${String(ABREV.indexOf(m[1]) + 1).padStart(2, "0")}`;
  }
  return null;
}

const numero = (v) => (typeof v === "number" ? v : typeof v === "string" && v.trim()
  ? Number(v.replace(/[R$\s.]/g, "").replace(",", ".")) || 0 : 0);

// O arquivo publicado mais recente da pasta (cria a pasta se ainda não existir).
export async function arquivoPublicado(pasta) {
  await fs.mkdir(pasta, { recursive: true });
  let maisRecente = null;
  for (const nome of await fs.readdir(pasta)) {
    if (nome.startsWith("~$") || !/\.xlsx$/i.test(nome)) continue;
    const caminho = path.join(pasta, nome);
    const { mtimeMs } = await fs.stat(caminho);
    if (!maisRecente || mtimeMs > maisRecente.mtimeMs) maisRecente = { nome, caminho, mtimeMs };
  }
  return maisRecente;
}

export async function lerDespesas(caminho) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(caminho);
  const ws = wb.worksheets.find((w) => /despesa/i.test(w.name)) || wb.worksheets[0];
  if (!ws) throw new Error("planilha sem abas");

  // linha do cabeçalho: a primeira (até a 10ª) que tem "Fornecedor"
  let linhaCab = null;
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= row.cellCount; c++) if (normalizar(valor(row.getCell(c))) === "fornecedor") { linhaCab = r; break; }
    if (linhaCab) break;
  }
  if (!linhaCab) throw new Error('não achei a coluna "Fornecedor" no cabeçalho');

  const cab = ws.getRow(linhaCab);
  const col = { fornecedor: null, servico: null, categoria: null };
  const colMeses = [];
  for (let c = 1; c <= cab.cellCount; c++) {
    const v = valor(cab.getCell(c));
    const n = normalizar(v);
    if (n === "fornecedor") col.fornecedor = c;
    else if (n === "servico") col.servico = c;
    else if (n === "categoria") col.categoria = c;
    else {
      const mes = mesDoCabecalho(v);
      if (mes) colMeses.push({ c, mes });
    }
  }
  if (!colMeses.length) throw new Error("não achei as colunas de mês no cabeçalho");

  const linhas = [];
  for (let r = linhaCab + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const fornecedor = String(valor(row.getCell(col.fornecedor)) ?? "").trim();
    if (!fornecedor || /^total/i.test(fornecedor)) continue;
    const valores = {};
    for (const { c, mes } of colMeses) {
      const v = numero(valor(row.getCell(c)));
      if (v) valores[mes] = Math.round(v * 100) / 100;
    }
    linhas.push({
      fornecedor,
      servico: col.servico ? String(valor(row.getCell(col.servico)) ?? "").trim() : "",
      categoria: col.categoria ? String(valor(row.getCell(col.categoria)) ?? "").trim() : "",
      valores,
    });
  }
  // meses com algum valor, em ordem
  const meses = [...new Set(colMeses.map((m) => m.mes))].sort()
    .filter((m) => linhas.some((l) => l.valores[m]));
  return { meses, linhas };
}
