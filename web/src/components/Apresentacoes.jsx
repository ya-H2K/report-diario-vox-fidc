import { useCallback, useEffect, useState } from "react";
import { apiApresentacoes, apiLaminas } from "../api.js";
import { BarraTopo } from "./Cabecalho.jsx";
import VisorPdf from "./VisorPdf.jsx";
import { useAutoAtualizacao } from "../hooks/useAutoAtualizacao.js";

// Relatórios com um PDF por mês: Apresentação de Resultados e Lâminas (mesma tela, textos diferentes).
//   #/relatorios/<rota>          lista (cards por ano)
//   #/relatorios/<rota>/AAAA-MM  o PDF do mês na tela, com "Baixar PDF"
// Os PDFs vêm das pastas de publicados (publicador/publicar.js → bucket "caixa", <rota>/AAAA-MM.pdf).

export const TIPOS = {
  apresentacoes: {
    rota: "apresentacoes", api: apiApresentacoes, titulo: "Apresentação de Resultados",
    sub: "Apresentações mensais do FIDC Vox", umaPublicada: "publicada", variasPublicadas: "publicadas",
    vazio: "Nenhuma apresentação publicada ainda.", semMes: "Não há apresentação publicada para",
    tituloVisor: "Apresentação de Resultados",
  },
  laminas: {
    rota: "laminas", api: apiLaminas, titulo: "Lâmina",
    sub: "Lâminas mensais do FIDC Vox", umaPublicada: "publicada", variasPublicadas: "publicadas",
    vazio: "Nenhuma lâmina publicada ainda.", semMes: "Não há lâmina publicada para",
    tituloVisor: "Lâmina mensal",
  },
};

const LONGOS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const longo = (id) => `${LONGOS[Number(id.slice(5, 7)) - 1]} ${id.slice(0, 4)}`;
const curto = (id) => `${CURTOS[Number(id.slice(5, 7)) - 1]}/${id.slice(0, 4)}`;
const dataBr = (iso) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));

export default function Apresentacoes({ aba, onAba, onVoltar, tipo = "apresentacoes" }) {
  const t = TIPOS[tipo];
  const mesDaUrl = () => window.location.hash.match(new RegExp(`^#/relatorios/${t.rota}/(\\d{4}-\\d{2})`))?.[1] ?? null;
  const [itens, setItens] = useState(null);
  const [erro, setErro] = useState(null);
  const [meta, setMeta] = useState(null);
  const [mes, setMes] = useState(mesDaUrl());
  const [ordem, setOrdem] = useState(() => {               // "recentes" | "antigas" (lembrado neste navegador)
    try { return localStorage.getItem(`vox:${t.rota}-ordem`) === "antigas" ? "antigas" : "recentes"; } catch { return "recentes"; }
  });
  const trocarOrdem = (o) => { setOrdem(o); try { localStorage.setItem(`vox:${t.rota}-ordem`, o); } catch { /* sem problema */ } };

  useEffect(() => {
    const aoMudar = () => setMes(mesDaUrl());
    window.addEventListener("hashchange", aoMudar);
    return () => window.removeEventListener("hashchange", aoMudar);
  }, []);

  const buscar = useCallback(async () => {
    try {
      const r = await t.api.lista();
      setItens(r.itens);
      setMeta(r.meta);
      setErro(null);
    } catch (e) {
      setErro(e.message);
      throw e;
    }
  }, [t]);
  const intervaloMs = (meta?.intervaloAtualizacaoMin || 10) * 60 * 1000;
  useAutoAtualizacao(buscar, { chave: t.rota, intervaloMs, temDados: Boolean(itens) });

  const abrir = (id) => {
    window.location.hash = id ? `#/relatorios/${t.rota}/${id}` : `#/relatorios/${t.rota}`;
    setMes(id);
    window.scrollTo(0, 0);
  };

  const item = mes && itens ? itens.find((i) => i.id === mes) : null;
  if (mes) return <Visor t={t} aba={aba} onAba={onAba} itens={itens} item={item} mes={mes} erro={erro} onTrocar={abrir} onVoltar={() => abrir(null)} />;

  // agrupado por ano, na ordem escolhida (a lista chega do mais recente para o mais antigo)
  const ordenados = ordem === "antigas" ? [...(itens || [])].reverse() : itens || [];
  const anos = [];
  for (const i of ordenados) {
    const a = i.id.slice(0, 4);
    if (!anos.length || anos.at(-1)[0] !== a) anos.push([a, []]);
    anos.at(-1)[1].push(i);
  }

  return (
    <>
      <BarraTopo aba={aba} onAba={onAba} />
      <div className="pagina">
        <div className="cabeca-pagina">
          <div>
            <button type="button" className="botao-texto relatorio__voltar" onClick={onVoltar}>← Relatórios</button>
            <h1 className="page-title">{t.titulo}</h1>
            <p className="page-sub">
              {t.sub}
              {itens?.length ? ` — ${itens.length} ${itens.length === 1 ? t.umaPublicada : t.variasPublicadas}` : ""}
            </p>
          </div>
          {itens?.length > 0 && (
            <div className="apr__lado">
              <p className="apr__ultima">Última edição: {curto(itens[0].id)}</p>
              <span className="contexto__seg apr__ordem" role="group" aria-label="Ordem dos meses">
                <button type="button" className={ordem === "recentes" ? "on" : undefined} aria-pressed={ordem === "recentes"}
                  onClick={() => trocarOrdem("recentes")}>Mais recentes</button>
                <button type="button" className={ordem === "antigas" ? "on" : undefined} aria-pressed={ordem === "antigas"}
                  onClick={() => trocarOrdem("antigas")}>Ordem de data</button>
              </span>
            </div>
          )}
        </div>

        {erro && !itens ? (
          <p className="vazio" role="status">{erro}</p>
        ) : !itens ? (
          <p className="vazio" role="status">Carregando…</p>
        ) : !itens.length ? (
          <p className="vazio">{t.vazio}</p>
        ) : anos.map(([ano, lista]) => (
          <section key={ano} className="apr__grupo" aria-label={`${t.titulo}: ${ano}`}>
            <h2 className="apr__ano">{ano} <span>{lista.length}</span></h2>
            <div className="apr__grade">
              {lista.map((i) => (
                <a key={i.id} href={`#/relatorios/${t.rota}/${i.id}`} className="apr__card"
                  onClick={(e) => { e.preventDefault(); abrir(i.id); }}>
                  <span className="apr__corpo">
                    <span className="apr__doc" aria-hidden="true"><i /><i /><i /></span>
                    <span className="apr__nome">{longo(i.id)}</span>
                    <span className="apr__mes">{curto(i.id).toUpperCase()}</span>
                    <span className="apr__data">Publicada em {dataBr(i.publicadoEm)}</span>
                  </span>
                  <span className="apr__rodape">
                    <span className="apr__abrir">Abrir →</span>
                    <span>PDF</span>
                  </span>
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ visualizador

function Visor({ t, aba, onAba, itens, item, mes, erro, onTrocar, onVoltar }) {
  const [falha, setFalha] = useState(null);

  const baixar = async () => {
    if (!item) return;
    try {
      const url = await t.api.link(item, { baixar: true, segundos: 60 });
      const a = document.createElement("a");
      a.href = url;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) { setFalha(e.message); }
  };

  return (
    <>
      <BarraTopo aba={aba} onAba={onAba} />
      <div className="pagina">
        <div className="cabeca-pagina apr__cabeca">
          <div>
            <button type="button" className="botao-texto relatorio__voltar" onClick={onVoltar}>← {t.titulo}</button>
            <h1 className="page-title">{t.tituloVisor}</h1>
            <p className="page-sub">FIDC Vox — {LONGOS[Number(mes.slice(5, 7)) - 1]} de {mes.slice(0, 4)}</p>
          </div>
          <div className="apr__acoes">
            <label className="apr__campo">
              <span>Edição</span>
              <select value={item ? mes : ""} onChange={(e) => onTrocar(e.target.value)} disabled={!itens?.length}>
                {!item && <option value="">{curto(mes)}</option>}
                {(itens || []).map((i) => <option key={i.id} value={i.id}>{curto(i.id)}</option>)}
              </select>
            </label>
            <button type="button" className="button button--pequeno" onClick={baixar} disabled={!item}>
              <span aria-hidden="true">↓</span> Baixar PDF
            </button>
          </div>
        </div>

        {falha && <p className="aviso" role="alert">{falha}</p>}
        {erro && !itens ? (
          <p className="vazio" role="status">{erro}</p>
        ) : !itens ? (
          <p className="vazio" role="status">Carregando…</p>
        ) : !item ? (
          <p className="vazio">{t.semMes} {longo(mes)}.</p>
        ) : (
          <VisorPdf key={`${t.rota}-${item.id}-${item.publicadoEm}`} titulo={t.tituloVisor}
            carregar={() => t.api.arquivo(item)} />
        )}
      </div>
    </>
  );
}
