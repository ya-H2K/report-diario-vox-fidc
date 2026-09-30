// Se o servidor responder 401 (sessão expirou, usuário bloqueado/excluído), a tela volta ao login.
function avisarSessaoExpirada() {
  window.dispatchEvent(new Event("vox:sessao-expirada"));
}

async function tratar(r, padrao) {
  const corpo = await r.json().catch(() => ({}));
  if (r.status === 401) avisarSessaoExpirada();
  if (!r.ok) throw Object.assign(new Error(corpo.erro || padrao), { status: r.status });
  return corpo;
}

async function pedir(url) {
  const r = await fetch(url, { cache: "no-store", credentials: "same-origin" });
  return tratar(r, "Os dados estão indisponíveis no momento.");
}

async function enviar(url, corpo, metodo = "POST") {
  const r = await fetch(url, {
    method: metodo, credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return tratar(r, "Não foi possível concluir agora. Tente de novo.");
}

export const api = {
  inicio: () => pedir("/api/inicio"),
  versao: () => pedir("/api/versao"),
  // forcar = true pede ao servidor para reler a planilha na hora (botão "Atualizar agora")
  dia: (iso, forcar = false) => pedir(`/api/dia/${iso}${forcar ? "?atualizar=1" : ""}`),
};

export const apiCaixa = {
  meses: () => pedir("/api/caixa/meses"),
  mes: (id, forcar = false) => pedir(`/api/caixa/${id}${forcar ? "?atualizar=1" : ""}`),
};

// Login: essas rotas não disparam o "sessão expirada" (401 aqui é senha errada).
async function auth(url, corpo) {
  const r = await fetch(url, {
    method: corpo === undefined ? "GET" : "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const c = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(c.erro || "Não foi possível concluir agora. Tente de novo."), { status: r.status });
  return c;
}

export const apiAuth = {
  sessao: () => auth("/api/auth/sessao"),
  entrar: (login, senha) => auth("/api/auth/entrar", { login, senha }),
  sair: () => auth("/api/auth/sair", {}),
  cadastro: (dados) => auth("/api/auth/cadastro", dados),              // { nome, email, cpf, senha }
  esqueci: (email, senha) => auth("/api/auth/esqueci", { email, senha }),
};

export const apiAdmin = {
  usuarios: () => pedir("/api/admin/usuarios"),
  pendentes: () => pedir("/api/admin/pendentes"),
  aprovar: (id) => enviar(`/api/admin/usuarios/${id}/aprovar`, {}),
  recusar: (id) => enviar(`/api/admin/usuarios/${id}/recusar`, {}),
  aprovarSenha: (id) => enviar(`/api/admin/usuarios/${id}/aprovar-senha`, {}),
  recusarSenha: (id) => enviar(`/api/admin/usuarios/${id}/recusar-senha`, {}),
  bloquear: (id) => enviar(`/api/admin/usuarios/${id}/bloquear`, {}),
  desbloquear: (id) => enviar(`/api/admin/usuarios/${id}/desbloquear`, {}),
  excluir: (id) => enviar(`/api/admin/usuarios/${id}`, undefined, "DELETE"),
};
