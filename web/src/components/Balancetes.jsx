import { useCallback, useEffect, useState } from "react";
import { apiBalancetes } from "../api.js";
import { BarraTopo } from "./Cabecalho.jsx";
import VisorPdf from "./VisorPdf.jsx";
import { useAutoAtualizacao } from "../hooks/useAutoAtualizacao.js";

// Relatórios > Balancete e Razão.
//   #/relatorios/balancetes                      lista (cards por ano)
//   #/relatorios/balancetes/AAAA-MM[/razao]      o mês: abas Balancete | Razão, PDF na tela,
//                                                 "Baixar PDF" e "Baixar Excel" do documento aberto
// Os arquivos vêm da pasta de publicados, uma subpasta por mês (publicador/publicar.js).

const LONGOS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const longo = (id) => `${LONGOS[Number(id.slice(5, 7)) - 1]} ${id.slice(0, 4)}`;
const curto = (id) => `${CURTOS[Number(id.slice(5, 7)) - 1]}/${id.slice(0, 4)}`;
const DOCS = [{ id: "balancete", nome: "Balancete" }, { id: "razao", nome: "Razão" }];
const qtdArquivos = (m) => DOCS.reduce((t, d) => t + (m.docs[d.id]?.pdf ? 1 : 0) + (m.docs[d.id]?.excel ? 1 : 0), 0);

const daUrl = () => {
  const m = window.location.hash.match(/^#\/relatorios\/balancetes\/(\d{4}-\d{2})(?:\/(razao|balancete))?/);
  return { mes: m?.[1] ?? null, doc: m?.[2] ?? "balancete" };
};

export default function Balancetes({ aba, onAba, onVoltar }) {
  const [meses, setMeses] = useState(null);
  const [erro, setErro] = useState(null);
  const [meta, setMeta] = useState(null);
  const [url, setUrl] = useState(daUrl());
  const [ordem, setOrdem] = useState(() => {               // "recentes" | "antigas" (lembrado neste navegador)
    try { return localStorage.getItem("vox:bal-ordem") === "antigas" ? "antigas" : "recentes"; } catch { return "recentes"; }
  });
  const trocarOrdem = (o) => { setOrdem(o); try { localStorage.setItem("vox:bal-ordem", o); } catch { /* sem problema */ } };

  useEffect(() => {
    const aoMudar = () => setUrl(daUrl());
    window.addEventListener("hashchange", aoMudar);
    return () => window.removeEventListener("hashchange", aoMudar);
  }, []);

  const buscar = useCallback(async () => {
    try {
      const r = await apiBalancetes.lista();
      setMeses(r.meses);
      setMeta(r.meta);
      setErro(null);
    } catch (e) {
      setErro(e.message);
      throw e;
    }
  }, []);
  const intervaloMs = (meta?.intervaloAtualizacaoMin || 10) * 60 * 1000;
  useAutoAtualizacao(buscar, { chave: "balancetes", intervaloMs, temDados: Boolean(meses) });

  const ir = (mes, doc = "balancete", { rolar = true } = {}) => {
    window.location.hash = mes ? `#/relatorios/balancetes/${mes}${doc === "razao" ? "/razao" : ""}` : "#/relatorios/balancetes";
    setUrl({ mes, doc });
    if (rolar) window.scrollTo(0, 0);
  };

  if (url.mes) {
    return <Mes aba={aba} onAba={onAba} meses={meses} erro={erro} mes={url.mes} doc={url.doc}
      onIr={ir} onVoltar={() => ir(null)} />;
  }

  const ordenados = ordem === "antigas" ? [...(meses || [])].reverse() : meses || [];
  const anos = [];
  for (const m of ordenados) {
    const a = m.id.slice(0, 4);
    if (!anos.length || anos.at(-1)[0] !== a) anos.push([a, []]);
    anos.at(-1)[1].push(m);
  }

  return (
    <>
      <BarraTopo aba={aba} onAba={onAba} />
      <div className="pagina">
        <div className="cabeca-pagina">
          <div>
            <button type="button" className="botao-texto relatorio__voltar" onClick={onVoltar}>← Relatórios</button>
            <h1 className="page-title">Balancete e Razão</h1>
            <p className="page-sub">
              Balancetes e razões mensais do FIDC Vox
              {meses?.length ? ` — ${meses.length} ${meses.length === 1 ? "mês publicado" : "meses publicados"}` : ""}
            </p>
          </div>
          {meses?.length > 0 && (
            <div className="apr__lado">
              <p className="apr__ultima">Último mês: {curto(meses[0].id)}</p>
              <span className="contexto__seg apr__ordem" role="group" aria-label="Ordem dos meses">
                <button type="button" className={ordem === "recentes" ? "on" : undefined} aria-pressed={ordem === "recentes"}
                  onClick={() => trocarOrdem("recentes")}>Mais recentes</button>
                <button type="button" className={ordem === "antigas" ? "on" : undefined} aria-pressed={ordem === "antigas"}
                  onClick={() => trocarOrdem("antigas")}>Ordem de data</button>
              </span>
            </div>
          )}
        </div>

        {erro && !meses ? (
          <p className="vazio" role="status">{erro}</p>
        ) : !meses ? (
          <p className="vazio" role="status">Carregando…</p>
        ) : !meses.length ? (
          <p className="vazio">Nenhum balancete publicado ainda.</p>
        ) : anos.map(([ano, lista]) => (
          <section key={ano} className="apr__grupo" aria-label={`Meses de ${ano}`}>
            <h2 className="apr__ano">{ano} <span>{lista.length}</span></h2>
            <div className="apr__grade">
              {lista.map((m) => (
                <a key={m.id} href={`#/relatorios/balancetes/${m.id}`} className="apr__card"
                  onClick={(e) => { e.preventDefault(); ir(m.id); }}>
                  <span className="apr__corpo">
                    <span className="apr__doc" aria-hidden="true"><i /><i /><i /></span>
                    <span className="apr__nome">{longo(m.id)}</span>
                    <span className="apr__mes">{curto(m.id).toUpperCase()}</span>
                    <span className="bal__arqs">
                      {DOCS.map((d) => (
                        <span key={d.id} className="bal__arq">
                          {d.nome}
                          <span>
                            {m.docs[d.id]?.pdf && <span className="bal__tag bal__tag--pdf">PDF</span>}
                            {m.docs[d.id]?.excel && <span className="bal__tag">Excel</span>}
                            {!m.docs[d.id]?.pdf && !m.docs[d.id]?.excel && <span className="bal__falta">—</span>}
                          </span>
                        </span>
                      ))}
                    </span>
                  </span>
                  <span className="apr__rodape">
                    <span className="apr__abrir">Abrir →</span>
                    <span>{qtdArquivos(m)} {qtdArquivos(m) === 1 ? "arquivo" : "arquivos"}</span>
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

// ------------------------------------------------------------------ o mês

function Mes({ aba, onAba, meses, erro, mes, doc, onIr, onVoltar }) {
  const [falha, setFalha] = useState(null);
  const item = meses?.find((m) => m.id === mes) || null;
  const arqs = item?.docs[doc] || {};
  const nomeDoc = DOCS.find((d) => d.id === doc)?.nome || "Balancete";

  const baixar = async (formato) => {
    const arq = arqs[formato];
    if (!arq) return;
    setFalha(null);
    try { await apiBalancetes.baixar(mes, doc, arq); } catch (e) { setFalha(e.message); }
  };

  return (
    <>
      <BarraTopo aba={aba} onAba={onAba} />
      <div className="pagina">
        <div className="cabeca-pagina apr__cabeca">
          <div>
            <button type="button" className="botao-texto relatorio__voltar" onClick={onVoltar}>← Balancete e Razão</button>
            <h1 className="page-title">Balancete e Razão</h1>
            <p className="page-sub">FIDC Vox — {LONGOS[Number(mes.slice(5, 7)) - 1]} de {mes.slice(0, 4)}</p>
          </div>
          <div className="apr__acoes">
            <label className="apr__campo">
              <span>Mês</span>
              <select value={item ? mes : ""} onChange={(e) => onIr(e.target.value, doc)} disabled={!meses?.length}>
                {!item && <option value="">{curto(mes)}</option>}
                {(meses || []).map((m) => <option key={m.id} value={m.id}>{curto(m.id)}</option>)}
              </select>
            </label>
            <button type="button" className="button button--pequeno" onClick={() => baixar("pdf")} disabled={!arqs.pdf}
              title={arqs.pdf ? arqs.pdf.nome : `${nomeDoc} sem PDF neste mês`}>
              <span aria-hidden="true">↓</span> Baixar PDF
            </button>
            <button type="button" className="button button--pequeno" onClick={() => baixar("excel")} disabled={!arqs.excel}
              title={arqs.excel ? arqs.excel.nome : `${nomeDoc} sem Excel neste mês`}>
              <span aria-hidden="true">↓</span> Baixar Excel
            </button>
          </div>
        </div>

        {falha && <p className="aviso" role="alert">{falha}</p>}
        {erro && !meses ? (
          <p className="vazio" role="status">{erro}</p>
        ) : !meses ? (
          <p className="vazio" role="status">Carregando…</p>
        ) : !item ? (
          <p className="vazio">Não há balancete publicado para {longo(mes)}.</p>
        ) : (
          <>
            <div className="bal__barra">
              <nav className="bal__abas" aria-label="Documento">
                {DOCS.map((d) => (
                  <button key={d.id} type="button" className={`bal__aba${doc === d.id ? " bal__aba--ativa" : ""}`}
                    aria-pressed={doc === d.id} onClick={() => onIr(mes, d.id, { rolar: false })}>
                    {d.nome}
                  </button>
                ))}
              </nav>
              <span className="bal__nome">{(arqs.pdf || arqs.excel)?.nome.replace(/\.[^.]+$/, "") || ""}</span>
            </div>
            {arqs.pdf ? (
              <VisorPdf key={`${mes}-${doc}-${arqs.pdf.publicadoEm}`} titulo={`${nomeDoc} — ${longo(mes)}`}
                carregar={() => apiBalancetes.arquivo(mes, doc, arqs.pdf)} />
            ) : arqs.excel ? (
              <p className="vazio bal__aviso">Este mês o {nomeDoc.toLowerCase()} está só em Excel. Use “Baixar Excel”.</p>
            ) : (
              <p className="vazio bal__aviso">Não há {nomeDoc.toLowerCase()} publicado para {longo(mes)}.</p>
            )}
          </>
        )}
      </div>
    </>
  );
}
