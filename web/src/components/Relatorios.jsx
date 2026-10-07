import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRelatorios } from "../api.js";
import { BarraTopo } from "./Cabecalho.jsx";
import { useAutoAtualizacao } from "../hooks/useAutoAtualizacao.js";
import { brl, curta, valorNum } from "../formato.js";

// Aba "Relatórios" (só o admin vê, por enquanto): lista de relatórios e cada relatório.
// #/relatorios = lista; #/relatorios/desagio = Deságio das cessões de URFA.

const RELATORIOS = [
  { id: "desagio", nome: "Deságio", descricao: "Valor nominal x valor pago das cessões de URFA, com o deságio de cada remessa." },
];

const subDaUrl = () => window.location.hash.match(/^#\/relatorios\/([\w-]+)/)?.[1] ?? null;

export default function Relatorios({ aba, onAba }) {
  const [sub, setSub] = useState(subDaUrl());
  useEffect(() => {
    const aoMudar = () => setSub(subDaUrl());
    window.addEventListener("hashchange", aoMudar);
    return () => window.removeEventListener("hashchange", aoMudar);
  }, []);
  const abrir = (id) => { window.location.hash = id ? `#/relatorios/${id}` : "#/relatorios"; setSub(id); window.scrollTo(0, 0); };

  if (sub === "desagio") return <Desagio aba={aba} onAba={onAba} onVoltar={() => abrir(null)} />;
  return (
    <>
      <BarraTopo aba={aba} onAba={onAba} />
      <div className="pagina">
        <div className="cabeca-pagina">
          <div>
            <h1 className="page-title">Relatórios</h1>
            <p className="page-sub">Visível só para o administrador enquanto está em teste.</p>
          </div>
        </div>
        <div className="grade grade--3">
          {RELATORIOS.map((r) => (
            <a key={r.id} href={`#/relatorios/${r.id}`} className="card relatorio-item"
              onClick={(e) => { e.preventDefault(); abrir(r.id); }}>
              <span className="relatorio-item__nome">{r.nome}</span>
              <span className="relatorio-item__desc">{r.descricao}</span>
              <span className="relatorio-item__abrir" aria-hidden="true">Abrir →</span>
            </a>
          ))}
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Deságio

const NOMES_MES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const rotuloMes = (id) => `${NOMES_MES[Number(id.slice(5, 7)) - 1]} ${id.slice(0, 4)}`;
const dataBr = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const ultimoDia = (mes) => {
  const [a, m] = mes.split("-").map(Number);
  return `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
};
// deságio em % com 4 casas (os valores ficam perto de 0,2%)
const pct4 = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 4, maximumFractionDigits: 4 });
const pctD = (v) => (v == null || !Number.isFinite(v) ? "—" : pct4.format(v));

function totais(linhas) {
  const nominal = linhas.reduce((t, l) => t + l.nominal, 0);
  const pago = linhas.reduce((t, l) => t + l.pago, 0);
  return { nominal, pago, valor: nominal - pago, taxa: nominal ? (nominal - pago) / nominal : null, qtd: linhas.length };
}

// CSV no padrão do Excel em português: ";" entre colunas, vírgula decimal, com BOM (acentos).
function baixarCsv(linhas, nomeArquivo) {
  const n = (v, casas = 2) => (v == null ? "" : v.toFixed(casas).replace(".", ","));
  const esc = (s) => (/[;"\n]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : s);
  const cab = ["Data", "Nome Arquivo", "Remessa", "Tipo", "Valor Nominal", "Valor Pago", "Deságio (R$)", "Deságio (%)"];
  const corpo = linhas.map((l) => [dataBr(l.data), esc(l.arquivo), l.remessa, esc(l.tipo), n(l.nominal), n(l.pago),
    n(l.nominal - l.pago), n(l.desagio * 100, 4)].join(";"));
  const blob = new Blob(["﻿" + [cab.join(";"), ...corpo].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Desagio({ aba, onAba, onVoltar }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [modo, setModo] = useState("mes");            // "mes" | "periodo"
  const [mes, setMes] = useState(null);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [meta, setMeta] = useState(null);

  const buscar = useCallback(async () => {
    try {
      const r = await apiRelatorios.desagio();
      setDados(r);
      setMeta(r.meta);
      setErro(null);
      setMes((m) => m ?? r.hoje.slice(0, 7));          // padrão: mês atual
    } catch (e) {
      setErro(e.message);
      throw e;
    }
  }, []);
  const intervaloMs = (meta?.intervaloAtualizacaoMin || 10) * 60 * 1000;
  useAutoAtualizacao(buscar, { chave: "desagio", intervaloMs, temDados: Boolean(dados) });

  // meses com remessa + o mês atual, em ordem
  const meses = useMemo(() => {
    if (!dados) return [];
    return [...new Set([...dados.linhas.map((l) => l.data.slice(0, 7)), dados.hoje.slice(0, 7)])].sort();
  }, [dados]);
  const i = meses.indexOf(mes);
  const anterior = i > 0 ? meses[i - 1] : null;
  const proximo = i >= 0 && i < meses.length - 1 ? meses[i + 1] : null;

  const [ini, fim] = modo === "mes"
    ? (mes ? [`${mes}-01`, ultimoDia(mes)] : ["", ""])
    : [de || "0000-01-01", ate || "9999-12-31"];
  const periodoInvalido = modo === "periodo" && de && ate && de > ate;
  const linhas = useMemo(() => (dados?.linhas || []).filter((l) => l.data >= ini && l.data <= fim), [dados, ini, fim]);
  const t = totais(linhas);

  const descricao = modo === "mes"
    ? (mes ? rotuloMes(mes) : "")
    : de && ate ? `De ${dataBr(de)} a ${dataBr(ate)}` : de ? `A partir de ${dataBr(de)}` : ate ? `Até ${dataBr(ate)}` : "Todo o histórico";
  const nomeCsv = modo === "mes" ? `desagio_${mes}.csv` : `desagio_${de || "inicio"}_a_${ate || "hoje"}.csv`;

  // ao trocar para "Período", começa com o mês que estava aberto
  const irParaPeriodo = () => {
    if (modo === "periodo") return;
    if (!de && !ate && mes) { setDe(`${mes}-01`); setAte(ultimoDia(mes)); }
    setModo("periodo");
  };

  return (
    <>
      <BarraTopo aba={aba} onAba={onAba} />

      <div className="pagina pagina--larga">
        <div className="cabeca-pagina">
          <div>
            <button type="button" className="botao-texto relatorio__voltar" onClick={onVoltar}>← Relatórios</button>
            <h1 className="page-title">Deságio</h1>
            <p className="page-sub">{descricao}{linhas.length ? ` · ${linhas.length} ${linhas.length === 1 ? "remessa" : "remessas"} de URFA` : ""}</p>
          </div>
          <div className="cabeca-pagina__direita filtro-relatorio">
            <nav className="navegacao" aria-label="Escolher período">
              <span className="contexto__seg" role="group" aria-label="Tipo de filtro">
                <button type="button" className={modo === "mes" ? "on" : undefined} aria-pressed={modo === "mes"} onClick={() => setModo("mes")}>Mês</button>
                <button type="button" className={modo === "periodo" ? "on" : undefined} aria-pressed={modo === "periodo"} onClick={irParaPeriodo}>Período</button>
              </span>
              {modo === "mes" ? (
                <>
                  <button type="button" className="btn-icone" onClick={() => setMes(anterior)} disabled={!anterior} aria-label="Mês anterior">‹</button>
                  <select value={mes || ""} onChange={(e) => setMes(e.target.value)} aria-label="Mês">
                    {meses.map((m) => <option key={m} value={m}>{rotuloMes(m)}</option>)}
                  </select>
                  <button type="button" className="btn-icone" onClick={() => setMes(proximo)} disabled={!proximo} aria-label="Próximo mês">›</button>
                </>
              ) : (
                <>
                  <input type="date" value={de} onChange={(e) => setDe(e.target.value)} aria-label="De" max={ate || undefined} />
                  <span className="periodo__ate">até</span>
                  <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Até" min={de || undefined} />
                </>
              )}
            </nav>
            <button type="button" className="button button--pequeno publicacao__baixar"
              disabled={!linhas.length || periodoInvalido} onClick={() => baixarCsv(linhas, nomeCsv)}>
              <span aria-hidden="true">↓</span> Baixar CSV
            </button>
          </div>
        </div>

        {erro && !dados ? (
          <p className="vazio" role="status">{erro}</p>
        ) : !dados ? (
          <p className="vazio" role="status">Carregando…</p>
        ) : periodoInvalido ? (
          <p className="vazio">A data inicial é depois da data final.</p>
        ) : (
          <main className="report">
            <div className="grade grade--4">
              <Indicador rotulo="Valor nominal" valor={brl(t.nominal)} legenda="Soma das remessas" />
              <Indicador rotulo="Valor pago" valor={brl(t.pago)} legenda="Soma das remessas" />
              <Indicador rotulo="Deságio" valor={brl(t.valor)} legenda="Nominal − pago" />
              <Indicador rotulo="Deságio médio" valor={pctD(t.taxa)} legenda="Ponderado pelo valor nominal" destaque />
            </div>
            {!linhas.length ? (
              <p className="vazio">Nenhuma remessa de URFA neste período.</p>
            ) : (
              <>
                <GraficoDesagio linhas={linhas} media={t.taxa} />
                <Tabela linhas={linhas} totais={t} />
              </>
            )}
          </main>
        )}
      </div>
    </>
  );
}

function Indicador({ rotulo, valor, legenda, destaque = false }) {
  return (
    <div className={`card card--indicador${destaque ? " card--fechamento" : ""}`}>
      <span className="card__rotulo">{rotulo}</span>
      <span className="card__valor">{valor}</span>
      {legenda && <span className="card__legenda">{legenda}</span>}
    </div>
  );
}

// ------------------------------------------------------------------ gráfico

function useLargura() {
  const ref = useRef(null);
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setLargura(Math.floor(e.contentRect.width)));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, largura];
}

const M = { top: 22, right: 16, bottom: 30, left: 66 };
const ALTURA = 260;
const pct2 = (v) => `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

function escala(max, passos = 4) {
  if (max <= 0) return { topo: 0.001, ticks: [0, 0.001] };
  const bruto = max / passos;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= bruto);
  const topo = Math.ceil(max / passo) * passo;
  return { topo, ticks: Array.from({ length: Math.round(topo / passo) + 1 }, (_, k) => k * passo) };
}

// Barras: deságio (%) de cada remessa; linha tracejada: deságio médio ponderado do período.
function GraficoDesagio({ linhas, media }) {
  const [ref, largura] = useLargura();
  const [ativo, setAtivo] = useState(null);
  const w = largura || 600;
  const base = ALTURA - M.bottom;
  const { topo, ticks } = escala(Math.max(...linhas.map((l) => l.desagio), media || 0));
  const passo = (w - M.left - M.right) / linhas.length;
  const barra = Math.max(3, Math.min(36, passo * 0.6));
  const cx = (k) => M.left + passo * (k + 0.5);
  const y = (v) => M.top + (1 - Math.max(0, v) / topo) * (base - M.top);
  const cabem = Math.max(2, Math.floor((w - M.left - M.right) / 52));
  const salto = Math.max(1, Math.ceil(linhas.length / cabem));
  const l = ativo != null ? linhas[ativo] : null;
  const dicaEsquerda = ativo != null && cx(ativo) > w - 220;

  const mover = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const k = Math.floor((e.clientX - r.left - M.left) / passo);
    setAtivo(k >= 0 && k < linhas.length ? k : null);
  };

  return (
    <section className="card card--grafico" aria-label="Deságio por remessa">
      <div className="card--grafico__topo">
        <h2 className="card__rotulo">Deságio por remessa</h2>
        <ul className="legenda-graf">
          <li><span className="legenda-graf__cor legenda-graf__cor--desagio" />Deságio da remessa</li>
          <li><span className="legenda-graf__traco" />Média ponderada {pct2(media || 0)}</li>
        </ul>
      </div>
      <div className="graf" ref={ref}>
        {largura > 0 && (
          <svg width={w} height={ALTURA} role="img" onPointerMove={mover} onPointerLeave={() => setAtivo(null)}
            aria-label={`Deságio de ${linhas.length} remessas, média ponderada de ${pct2(media || 0)}`}>
            {ticks.map((tk) => (
              <g key={tk}>
                <line x1={M.left} x2={w - M.right} y1={y(tk)} y2={y(tk)} className="graf__grade" />
                <text x={M.left - 10} y={y(tk)} className="graf__eixo" textAnchor="end" dominantBaseline="middle">{pct2(tk)}</text>
              </g>
            ))}
            {ativo != null && <rect x={cx(ativo) - passo / 2} y={M.top} width={passo} height={base - M.top} className="graf__foco" />}
            {linhas.map((ln, k) => (
              <rect key={`${ln.remessa}-${k}`} x={cx(k) - barra / 2} y={y(ln.desagio)} width={barra} height={base - y(ln.desagio)}
                className={`graf__barra--desagio${ativo === k ? " ativo" : ""}`} />
            ))}
            {media != null && <line x1={M.left} x2={w - M.right} y1={y(media)} y2={y(media)} className="graf__guia" />}
            <line x1={M.left} x2={w - M.right} y1={base} y2={base} className="graf__base" />
            {linhas.map((ln, k) => (k % salto === 0 || k === ativo) && (
              <text key={`x-${k}`} x={cx(k)} y={ALTURA - 8} textAnchor="middle"
                className={`graf__eixo${k === ativo ? " graf__eixo--sel" : ""}`}>{curta(ln.data)}</text>
            ))}
          </svg>
        )}
        {l && (
          <div className="graf__dica" style={dicaEsquerda ? { right: w - cx(ativo) + 14 } : { left: cx(ativo) + 14 }}>
            <strong>{curta(l.data)} · REMESSA {l.remessa}</strong>
            <span>Deságio {pctD(l.desagio)}</span>
            <span>Nominal {brl(l.nominal)}</span>
            <span>Pago {brl(l.pago)}</span>
            <span>Diferença {brl(l.nominal - l.pago)}</span>
          </div>
        )}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ tabela

function Tabela({ linhas, totais: t }) {
  return (
    <section className="card card--tabela" aria-labelledby="titulo-desagio">
      <div className="card--tabela__topo">
        <h2 id="titulo-desagio" className="card__rotulo">Remessas</h2>
        <span className="card--tabela__nota">Valores em R$</span>
      </div>
      <div className="tabela-rolagem" tabIndex={0} role="region" aria-label="Remessas de URFA, role para o lado">
        <table className="caixa-tabela tabela-desagio">
          <thead>
            <tr>
              <th scope="col">Data</th>
              <th scope="col">Arquivo</th>
              <th scope="col" className="num">Remessa</th>
              <th scope="col">Tipo</th>
              <th scope="col" className="num">Valor nominal</th>
              <th scope="col" className="num">Valor pago</th>
              <th scope="col" className="num">Deságio (R$)</th>
              <th scope="col" className="num">Deságio (%)</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, k) => (
              <tr key={`${l.remessa}-${k}`}>
                <th scope="row">{dataBr(l.data)}</th>
                <td className="tabela-desagio__arquivo">{l.arquivo}</td>
                <td className="num">{l.remessa}</td>
                <td>{l.tipo}</td>
                <td className="num">{valorNum(l.nominal)}</td>
                <td className="num">{valorNum(l.pago)}</td>
                <td className="num">{valorNum(l.nominal - l.pago)}</td>
                <td className="num tabela-desagio__pct">{pctD(l.desagio)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td colSpan={3}>{t.qtd} {t.qtd === 1 ? "remessa" : "remessas"}</td>
              <td className="num">{valorNum(t.nominal)}</td>
              <td className="num">{valorNum(t.pago)}</td>
              <td className="num">{valorNum(t.valor)}</td>
              <td className="num tabela-desagio__pct">{pctD(t.taxa)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
