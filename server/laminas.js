// Lâminas: pasta de publicados organizada por ano e mês: "<pasta>\2026\09\<qualquer nome>.pdf".
// O mês vem das pastas (o nome do arquivo pode variar). Se houver mais de um PDF no mês, vale o
// mais recente. O publicador cria sozinho a pasta do ano atual.
import fs from "node:fs/promises";
import path from "node:path";

// Devolve { itens: [{ id: "AAAA-MM", nome, caminho, mtimeMs, bytes }], ignorados: [] },
// do mês mais recente para o mais antigo (mesmo formato das apresentações).
export async function listarLaminas(pasta, anoAtual = String(new Date().getFullYear())) {
  await fs.mkdir(path.join(pasta, anoAtual), { recursive: true });
  const itens = [];
  const ignorados = [];
  for (const a of await fs.readdir(pasta, { withFileTypes: true })) {
    if (!a.isDirectory()) { if (!a.name.startsWith("~$")) ignorados.push(a.name); continue; }
    if (!/^\d{4}$/.test(a.name.trim())) { ignorados.push(`pasta "${a.name}"`); continue; }
    const ano = a.name.trim();
    for (const m of await fs.readdir(path.join(pasta, a.name), { withFileTypes: true })) {
      const num = Number(m.name.trim());
      if (!m.isDirectory() || !/^\d{1,2}$/.test(m.name.trim()) || num < 1 || num > 12) {
        if (!m.name.startsWith("~$")) ignorados.push(`${a.name}\\${m.name}`);
        continue;
      }
      const dir = path.join(pasta, a.name, m.name);
      let melhor = null;
      for (const nome of await fs.readdir(dir)) {
        if (nome.startsWith("~$")) continue;
        if (!/\.pdf$/i.test(nome)) { ignorados.push(`${a.name}\\${m.name}\\${nome}`); continue; }
        const caminho = path.join(dir, nome);
        const st = await fs.stat(caminho);
        if (st.isFile() && (!melhor || st.mtimeMs > melhor.mtimeMs)) melhor = { nome, caminho, mtimeMs: st.mtimeMs, bytes: st.size };
      }
      if (melhor) itens.push({ id: `${ano}-${String(num).padStart(2, "0")}`, ...melhor });
    }
  }
  itens.sort((x, y) => (x.id < y.id ? 1 : -1));
  return { itens, ignorados };
}
