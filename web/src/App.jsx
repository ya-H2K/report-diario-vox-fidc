import { useCallback, useEffect, useMemo, useState } from "react";
import Operacional from "./components/Operacional.jsx";
import Caixa from "./components/Caixa.jsx";
import Usuarios from "./components/Usuarios.jsx";
import Acesso from "./components/Acesso.jsx";
import { apiAuth } from "./api.js";
import { SessaoContexto } from "./sessao.js";

// Abas: Fluxo operacional (#/), Fluxo de caixa (#/caixa) e, só para o admin, Usuários (#/usuarios).
const abaDaUrl = () => {
  const h = window.location.hash;
  if (h.startsWith("#/caixa")) return "caixa";
  if (h.startsWith("#/usuarios")) return "usuarios";
  return "operacional";
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
    window.location.hash = nova === "caixa" ? "#/caixa" : nova === "usuarios" ? "#/usuarios" : "#/";
    setAba(nova);
    window.scrollTo(0, 0);
  }, []);

  const sair = useCallback(async () => {
    try { await apiAuth.sair(); } finally { setUsuario(null); }
  }, []);

  const contexto = useMemo(() => ({ usuario, sair }), [usuario, sair]);

  if (usuario === undefined) return <div className="acesso"><p className="acesso__carregando">Carregando…</p></div>;
  if (!usuario) return <Acesso onEntrar={setUsuario} />;

  const abaVisivel = aba === "usuarios" && !usuario.admin ? "operacional" : aba;
  return (
    <SessaoContexto.Provider value={contexto}>
      {abaVisivel === "caixa" ? <Caixa aba={abaVisivel} onAba={onAba} />
        : abaVisivel === "usuarios" ? <Usuarios aba={abaVisivel} onAba={onAba} />
          : <Operacional aba={abaVisivel} onAba={onAba} />}
    </SessaoContexto.Provider>
  );
}
