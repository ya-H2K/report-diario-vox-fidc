import { useEffect, useState } from "react";
import { api, apiAdmin, apiCaixa } from "../api.js";
import { BarraTopo } from "./Cabecalho.jsx";
import { RELATORIOS } from "./Relatorios.jsx";
import { useSessao } from "../sessao.js";

// Início (#/): aparece logo depois do login e ao clicar na marca no topo.
// As telas do site ficam em destaque no meio; cada card mostra uma informação real
// (situação do dia, último mês do caixa, quantos relatórios). A barra de Usuários só aparece para o admin.

const FUSO = "America/Sao_Paulo";
const CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const mesCurto = (id) => `${CURTOS[Number(id.slice(5, 7)) - 1]}/${id.slice(0, 4)}`;

function saudacao() {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}
const dataExtenso = () => new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());

const ICONES = {
  operacional: <path d="M3 3h14v14H3z M6 13l3-3 2 2 3-4" />,
  caixa: <path d="M10 2.5v15M13.6 6.3c-.6-1.2-1.9-1.9-3.6-1.9-2 0-3.4 1-3.4 2.6 0 3.6 7 1.9 7 5.5 0 1.6-1.5 2.7-3.6 2.7-1.8 0-3.2-.8-3.8-2.1" />,
  relatorios: <><path d="M5 2h7l4 4v12H5z" /><path d="M12 2v4h4M8 10h5M8 13h5" /></>,
};

export default function Home({ aba, onAba }) {
  const { usuario } = useSessao();
  const admin = Boolean(usuario?.admin);
  const [situacao, setSituacao] = useState(null);       // { estado, rotulo } do dia
  const [ultimoMes, setUltimoMes] = useState(null);
  const [pendentes, setPendentes] = useState(null);

  useEffect(() => {
    let vivo = true;
    api.inicio()
      .then((ini) => api.dia(ini.sugerida).then((r) => vivo && setSituacao({ ...r.dia?.situacao, hoje: ini.sugerida === ini.meta.hoje })))
      .catch(() => {});
    apiCaixa.meses().then((r) => vivo && setUltimoMes(r.meses.at(-1)?.id ?? null)).catch(() => {});
    if (admin) apiAdmin.pendentes().then((r) => vivo && setPendentes(r.pendentes)).catch(() => {});
    return () => { vivo = false; };
  }, [admin]);

  const nome = String(usuario?.nome || "").split(" ")[0] || "";

  const cards = [
    {
      id: "operacional", titulo: "Report Operacional",
      texto: "Fluxo operacional do dia: processamento, liquidações, baixas e observações.",
      rodape: situacao?.rotulo
        ? <span className={`home__estado estado--${situacao.estado}`}><span className="ponto" aria-hidden="true" />{situacao.hoje ? `Hoje: ${situacao.rotulo.toLowerCase()}` : situacao.rotulo}</span>
        : <span className="home__info">Situação do dia</span>,
    },
    {
      id: "caixa", titulo: "Fluxo de Caixa",
      texto: "Saldo, entradas e saídas, enquadramento e movimentação diária do mês.",
      rodape: <span className="home__info">{ultimoMes ? `Último mês: ${mesCurto(ultimoMes)}` : "Mês a mês"}</span>,
    },
    {
      id: "relatorios", titulo: "Relatórios",
      texto: "Apresentação de resultados, balancete, deságio, despesas e lâmina.",
      rodape: <span className="home__info">{RELATORIOS.length} relatórios</span>,
    },
  ];

  return (
    <>
      <BarraTopo aba={aba} onAba={onAba} semAbas />
      <div className="home">
        <p className="home__data">{dataExtenso()}</p>
        <h1 className="home__titulo">{saudacao()}{nome && <>, <b>{nome}</b></>}</h1>
        <p className="home__sub">Escolha por onde começar.</p>

        <nav className={`home__grade home__grade--${cards.length}`} aria-label="Telas do site">
          {cards.map((c) => (
            <a key={c.id} href={c.id === "operacional" ? "#/report" : `#/${c.id}`} className="home__card"
              onClick={(e) => { e.preventDefault(); onAba(c.id); }}>
              {c.admin && <span className="home__admin">Admin</span>}
              <span className="home__icone" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4">{ICONES[c.id]}</svg>
              </span>
              <span className="home__nome">{c.titulo}</span>
              <span className="home__texto">{c.texto}</span>
              <span className="home__rodape">{c.rodape}<span className="home__abrir">Abrir →</span></span>
            </a>
          ))}
        </nav>

        {admin && (
          <a href="#/usuarios" className="home__usuarios" onClick={(e) => { e.preventDefault(); onAba("usuarios"); }}>
            <span>Usuários{pendentes ? <> · <b>{pendentes} {pendentes === 1 ? "solicitação aguardando" : "solicitações aguardando"} aprovação</b></> : ""}</span>
            <span className="home__usuarios-link">Gerenciar usuários →</span>
          </a>
        )}
      </div>
    </>
  );
}
