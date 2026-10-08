import { useCallback, useEffect, useRef, useState } from "react";
import { apiApresentacoes } from "../api.js";
import { BarraTopo } from "./Cabecalho.jsx";
import { useAutoAtualizacao } from "../hooks/useAutoAtualizacao.js";

// Relatórios > Apresentações de Resultados.
//   #/relatorios/apresentacoes          lista (cards por ano)
//   #/relatorios/apresentacoes/AAAA-MM  o PDF do mês na tela, com "Abrir PDF" e "Baixar"
// Os PDFs vêm da pasta de publicados (publicador/publicar.js → bucket "caixa", apresentacoes/AAAA-MM.pdf).

const LONGOS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const longo = (id) => `${LONGOS[Number(id.slice(5, 7)) - 1]} ${id.slice(0, 4)}`;
const curto = (id) => `${CURTOS[Number(id.slice(5, 7)) - 1]}/${id.slice(0, 4)}`;
const dataBr = (iso) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));

const mesDaUrl = () => window.location.hash.match(/^#\/relatorios\/apresentacoes\/(\d{4}-\d{2})/)?.[1] ?? null;

export default function Apresentacoes({ aba, onAba, onVoltar }) {
  const [itens, setItens] = useState(null);
  const [erro, setErro] = useState(null);
  const [meta, setMeta] = useState(null);
  const [mes, setMes] = useState(mesDaUrl());

  useEffect(() => {
    const aoMudar = () => setMes(mesDaUrl());
    window.addEventListener("hashchange", aoMudar);
    return () => window.removeEventListener("hashchange", aoMudar);
  }, []);

  const buscar = useCallback(async () => {
    try {
      const r = await apiApresentacoes.lista();
      setItens(r.itens);
      setMeta(r.meta);
      setErro(null);
    } catch (e) {
      setErro(e.message);
      throw e;
    }
  }, []);
  const intervaloMs = (meta?.intervaloAtualizacaoMin || 10) * 60 * 1000;
  useAutoAtualizacao(buscar, { chave: "apresentacoes", intervaloMs, temDados: Boolean(itens) });

  const abrir = (id) => {
    window.location.hash = id ? `#/relatorios/apresentacoes/${id}` : "#/relatorios/apresentacoes";
    setMes(id);
    window.scrollTo(0, 0);
  };

  const item = mes && itens ? itens.find((i) => i.id === mes) : null;
  if (mes) return <Visor aba={aba} onAba={onAba} itens={itens} item={item} mes={mes} erro={erro} onTrocar={abrir} onVoltar={() => abrir(null)} />;

  // agrupado por ano, do mais recente para o mais antigo
  const anos = [];
  for (const i of itens || []) {
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
            <h1 className="page-title">Apresentações de Resultados</h1>
            <p className="page-sub">
              Apresentações mensais do FIDC Vox
              {itens?.length ? ` — ${itens.length} ${itens.length === 1 ? "publicada" : "publicadas"}` : ""}
            </p>
          </div>
          {itens?.length > 0 && <p className="apr__ultima">Última edição: {curto(itens[0].id)}</p>}
        </div>

        {erro && !itens ? (
          <p className="vazio" role="status">{erro}</p>
        ) : !itens ? (
          <p className="vazio" role="status">Carregando…</p>
        ) : !itens.length ? (
          <p className="vazio">Nenhuma apresentação publicada ainda.</p>
        ) : anos.map(([ano, lista]) => (
          <section key={ano} className="apr__grupo" aria-label={`Apresentações de ${ano}`}>
            <h2 className="apr__ano">{ano} <span>{lista.length}</span></h2>
            <div className="apr__grade">
              {lista.map((i) => (
                <a key={i.id} href={`#/relatorios/apresentacoes/${i.id}`} className="apr__card"
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

function Visor({ aba, onAba, itens, item, mes, erro, onTrocar, onVoltar }) {
  const [falha, setFalha] = useState(null);

  const abrirPdf = async () => {
    if (!item) return;
    const janela = window.open("", "_blank");            // abre já no clique (evita bloqueio de pop-up)
    try {
      const url = await apiApresentacoes.link(item);
      if (janela) janela.location.href = url; else window.location.href = url;
    } catch (e) { janela?.close(); setFalha(e.message); }
  };
  const baixar = async () => {
    if (!item) return;
    try {
      const url = await apiApresentacoes.link(item, { baixar: true, segundos: 60 });
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
            <button type="button" className="botao-texto relatorio__voltar" onClick={onVoltar}>← Apresentações</button>
            <h1 className="page-title">Apresentação de Resultados</h1>
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
            <button type="button" className="button button--pequeno" onClick={abrirPdf} disabled={!item}>Abrir PDF</button>
            <button type="button" className="botao-texto apr__baixar" onClick={baixar} disabled={!item}>Baixar</button>
          </div>
        </div>

        {falha && <p className="aviso" role="alert">{falha}</p>}
        {erro && !itens ? (
          <p className="vazio" role="status">{erro}</p>
        ) : !itens ? (
          <p className="vazio" role="status">Carregando…</p>
        ) : !item ? (
          <p className="vazio">Não há apresentação publicada para {longo(mes)}.</p>
        ) : (
          <Paginas key={`${item.id}-${item.publicadoEm}`} item={item} />
        )}
      </div>
    </>
  );
}

// Desenha as páginas do PDF uma embaixo da outra (pdf.js, carregado só quando precisa).
function Paginas({ item }) {
  const caixa = useRef(null);
  const [estado, setEstado] = useState({ carregando: true, erro: null, paginas: 0 });

  useEffect(() => {
    let cancelado = false;
    let doc = null;
    (async () => {
      try {
        const [pdfjs, { default: worker }] = await Promise.all([
          import("pdfjs-dist"),
          import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
        ]);
        pdfjs.GlobalWorkerOptions.workerSrc = worker;
        const url = await apiApresentacoes.link(item);
        doc = await pdfjs.getDocument({ url }).promise;
        if (cancelado) return;
        setEstado({ carregando: false, erro: null, paginas: doc.numPages });
        const largura = Math.min(caixa.current?.clientWidth || 960, 1100);
        const escalaTela = Math.min(window.devicePixelRatio || 1, 2);
        for (let n = 1; n <= doc.numPages && !cancelado; n++) {
          const pagina = await doc.getPage(n);
          const base = pagina.getViewport({ scale: 1 });
          const viewport = pagina.getViewport({ scale: (largura / base.width) * escalaTela });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.className = "apr__pagina";
          canvas.setAttribute("role", "img");
          canvas.setAttribute("aria-label", `Página ${n} de ${doc.numPages}`);
          canvas.style.aspectRatio = `${base.width} / ${base.height}`;
          if (cancelado) break;
          caixa.current?.appendChild(canvas);
          await pagina.render({ canvas, canvasContext: canvas.getContext("2d"), viewport }).promise;
        }
      } catch {
        if (!cancelado) setEstado({ carregando: false, erro: "Não foi possível mostrar o PDF aqui. Use “Abrir PDF” ou “Baixar”.", paginas: 0 });
      }
    })();
    return () => { cancelado = true; doc?.destroy(); if (caixa.current) caixa.current.innerHTML = ""; };
  }, [item]);

  return (
    <div className="apr__visor">
      {estado.carregando && <p className="vazio" role="status">Carregando a apresentação…</p>}
      {estado.erro && <p className="vazio" role="alert">{estado.erro}</p>}
      <div ref={caixa} className="apr__paginas" />
    </div>
  );
}
