// Balancete e Razão: pasta de publicados com uma subpasta por mês ("2026.09" = setembro de 2026).
// Dentro de cada mês: o arquivo com "balancete" no nome é o balancete; com "razão"/"razao", o razão.
// A extensão diz o formato: .pdf = PDF; .xlsx/.xls/.xlsm = Excel. O resto do nome pode variar.
// Se houver dois do mesmo documento e formato no mês, vale o mais recente.
import fs from "node:fs/promises";
import path from "node:path";

const sem = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function mesDaPasta(nome) {
  const m = String(nome).trim().match(/^(\d{4})\s*[.\-_ ]\s*(\d{1,2})$/);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}`;
}

export function tipoDoArquivo(nome) {
  const n = sem(nome);
  const ext = path.extname(n).slice(1);
  const formato = ext === "pdf" ? "pdf" : ["xlsx", "xls", "xlsm"].includes(ext) ? "excel" : null;
  const doc = /balancete/.test(n) ? "balancete" : /razao/.test(n) ? "razao" : null;
  return formato && doc ? { doc, formato, ext } : null;
}

// Devolve { meses: [{ id, docs: { balancete: { pdf, excel }, razao: { pdf, excel } } }], ignorados: [] }
// (cada arquivo: { nome, caminho, ext, mtimeMs, bytes }), do mês mais recente para o mais antigo.
export async function listarBalancetes(pasta) {
  await fs.mkdir(pasta, { recursive: true });
  const meses = [];
  const ignorados = [];
  for (const ent of await fs.readdir(pasta, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const id = mesDaPasta(ent.name);
    if (!id) { ignorados.push(`pasta "${ent.name}"`); continue; }
    const dir = path.join(pasta, ent.name);
    const docs = {};
    for (const nome of await fs.readdir(dir)) {
      if (nome.startsWith("~$")) continue;
      const caminho = path.join(dir, nome);
      const st = await fs.stat(caminho);
      if (!st.isFile()) continue;
      const t = tipoDoArquivo(nome);
      if (!t) { ignorados.push(`${ent.name}\\${nome}`); continue; }
      docs[t.doc] ??= {};
      const atual = docs[t.doc][t.formato];
      if (!atual || st.mtimeMs > atual.mtimeMs) docs[t.doc][t.formato] = { nome, caminho, ext: t.ext, mtimeMs: st.mtimeMs, bytes: st.size };
    }
    if (Object.keys(docs).length) meses.push({ id, docs });
  }
  meses.sort((a, b) => (a.id < b.id ? 1 : -1));
  return { meses, ignorados };
}

// Caminho no bucket: balancetes/AAAA-MM/balancete.pdf, balancetes/AAAA-MM/razao.xlsx...
export const caminhoNuvem = (id, doc, arq) => `balancetes/${id}/${doc}.${arq.ext}`;

export const TIPO_CONTEUDO = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
  xls: "application/vnd.ms-excel",
};
