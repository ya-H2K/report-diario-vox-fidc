// Apresentações de Resultados: PDFs publicados numa pasta (um por mês).
// O mês vem do final do nome: "Apresentação de Resultados - FIDC VOX 09.26.pdf" = setembro de 2026.
// Se houver mais de um arquivo do mesmo mês, vale o mais recente.
import fs from "node:fs/promises";
import path from "node:path";

export function mesDoNome(nome) {
  const base = nome.replace(/\.pdf$/i, "").trim();
  const m = base.match(/(\d{1,2})\s*[.\-_/]\s*(\d{4}|\d{2})$/);
  if (!m) return null;
  const mes = Number(m[1]);
  if (mes < 1 || mes > 12) return null;
  const ano = m[2].length === 2 ? `20${m[2]}` : m[2];
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

// Lista as apresentações da pasta (cria a pasta se ainda não existir).
// Devolve { itens: [{ id: "AAAA-MM", nome, caminho, mtimeMs, bytes }], ignorados: [nomes] }.
export async function listarApresentacoes(pasta) {
  await fs.mkdir(pasta, { recursive: true });
  const porMes = new Map();
  const ignorados = [];
  for (const nome of await fs.readdir(pasta)) {
    if (nome.startsWith("~$") || !/\.pdf$/i.test(nome)) continue;
    const id = mesDoNome(nome);
    if (!id) { ignorados.push(nome); continue; }
    const caminho = path.join(pasta, nome);
    const { mtimeMs, size } = await fs.stat(caminho);
    const atual = porMes.get(id);
    if (!atual || mtimeMs > atual.mtimeMs) porMes.set(id, { id, nome, caminho, mtimeMs, bytes: size });
  }
  const itens = [...porMes.values()].sort((a, b) => (a.id < b.id ? 1 : -1));   // mais recente primeiro
  return { itens, ignorados };
}
