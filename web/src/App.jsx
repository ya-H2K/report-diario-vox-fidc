import { useCallback, useEffect, useMemo, useState } from "react";
import Operacional from "./components/Operacional.jsx";
import Caixa from "./components/Caixa.jsx";
import Usuarios from "./components/Usuarios.jsx";
import Relatorios from "./components/Relatorios.jsx";
import Acesso from "./components/Acesso.jsx";
import Home from "./components/Home.jsx";
import { apiAuth } from "./api.js";
import { SessaoContexto } from "./sessao.js";

// Início (#/), Fluxo operacional (#/report), Fluxo de caixa (#/caixa), Relatórios
// (#/relatorios, #/relatorios/desagio...) e, só para o admin, Usuários (#/usuarios).
const SO_ADMIN = ["usuarios"];
const HREF = { home: "#/", operacional: "#/report", caixa: "#/caixa", usuarios: "#/usuarios", relatorios: "#/relatorios" };
const abaDaUrl = () => {
  const h = window.location.hash;
  if (h.startsWith("#/caixa")) return "caixa";
  if (h.startsWith("#/usuarios")) return "usuarios";
  if (h.startsWith("#/relatorios")) return "relatorios";
  if (h.startsWith("#/report")) return "operacional";
  return "home";
};

export default function App() {
  const [aba, setAba] = useState(abaDaUrl());
  const [usuario, setUsuario] = useState(undefined);        // undefined = conferindo; null = não logado

  useEffect(() => {
    apiAuth.sessao()
      .then((r) => setUsuario(r.logado ? r.usuario : null))
      .catch(() => setUsuario(null));
    const expirou = () => setUsuario(null);
    window.addEventListener("vox:sessao-expirada", expirou);
    return () => window.removeEventListener("vox:sessao-expirada", expirou);
  }, []);

  useEffect(() => {
    const aoMudar = () => setAba(abaDaUrl());
    window.addEventListener("hashchange", aoMudar);
    return () => window.removeEventListener("hashchange", aoMudar);
  }, []);

  const onAba = useCallback((nova) => {
    window.location.hash = HREF[nova] || "#/";
    setAba(nova);
    window.scrollTo(0, 0);
  }, []);

  const sair = useCallback(async () => {
    try { await apiAuth.sair(); } finally { setUsuario(null); }
  }, []);

  const contexto = useMemo(() => ({ usuario, sair }), [usuario, sair]);

  if (usuario === undefined) return <div className="acesso"><p className="acesso__carregando">Carregando…</p></div>;
  // depois do login, sempre começa no início
  const entrar = (u) => { window.location.hash = "#/"; setAba("home"); setUsuario(u); };
  if (!usuario) return <Acesso onEntrar={entrar} />;

  const abaVisivel = SO_ADMIN.includes(aba) && !usuario.admin ? "home" : aba;
  return (
    <SessaoContexto.Provider value={contexto}>
      {abaVisivel === "home" ? <Home aba={abaVisivel} onAba={onAba} />
        : abaVisivel === "caixa" ? <Caixa aba={abaVisivel} onAba={onAba} />
        : abaVisivel === "usuarios" ? <Usuarios aba={abaVisivel} onAba={onAba} />
          : abaVisivel === "relatorios" ? <Relatorios aba={abaVisivel} onAba={onAba} />
            : <Operacional aba={abaVisivel} onAba={onAba} />}
    </SessaoContexto.Provider>
  );
}
