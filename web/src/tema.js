// Aparência: "escuro" (padrão), "claro" ou "sistema" (segue o computador).
// A escolha fica salva no navegador de cada pessoa.
const CHAVE = "vox-tema";
const midia = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;

export function temaEscolhido() {
  try {
    const t = localStorage.getItem(CHAVE);
    return t === "claro" || t === "sistema" ? t : "escuro";
  } catch {
    return "escuro";
  }
}

function aplicar(escolha) {
  const claro = escolha === "claro" || (escolha === "sistema" && midia?.matches);
  document.documentElement.dataset.tema = claro ? "claro" : "escuro";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", claro ? "#ffffff" : "#15130f");
}

export function escolherTema(escolha) {
  try { localStorage.setItem(CHAVE, escolha); } catch { /* navegador sem armazenamento: vale só nesta visita */ }
  aplicar(escolha);
}

// Aplica ao carregar e acompanha o computador quando a escolha é "sistema".
aplicar(temaEscolhido());
midia?.addEventListener?.("change", () => { if (temaEscolhido() === "sistema") aplicar("sistema"); });
