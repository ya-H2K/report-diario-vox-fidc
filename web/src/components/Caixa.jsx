import { useCallback, useEffect, useRef, useState } from "react";
import { apiCaixa } from "../api.js";
import { BarraTopo } from "./Cabecalho.jsx";
import { GraficoSaldo, GraficoEntradasSaidas, GraficoEnquadramento, GraficoRendimento } from "./Graficos.jsx";
import { useAutoAtualizacao } from "../hooks/useAutoAtualizacao.js";
import { brl, curta, pct, valorNum } from "../formato.js";

const dataHora = (iso) => {
  const d = new Date(iso);
  const dia = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(d);
  const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(d);
  return `${dia} às ${hora}`;
};

// Aba "Fluxo de caixa": o conteúdo da sheet "Dashboard" do arquivo do mês.

// Cabeçalho da tabela: quebra de linha fixa, para todos ficarem uniformes.
const COLUNAS = [
  ["saldoInicial", "Saldo inicial", "caixa"],
  ["entradas", "Entradas", "(baixas)"],
  ["saidas", "", "Saídas"],
  ["aplicacoes", "", "Aplicações"],
  ["resgates", "", "Resgates"],
  ["rendimento", "Rendimento", "aplicações"],
  ["saldoFinalCC", "Saldo final", "C/C"],
  ["saldoAplicacoes", "Saldo total", "aplicações"],
  ["saldoCaixaTotal", "Saldo caixa", "total"],
];

const sinal = (v) => (v === null || v === undefined ? "" : v < 0 ? " negativo" : v === 0 ? " zero" : "");

// Faixas do enquadramento: 67% é o limite (abaixo disso o fundo desenquadra).
export function faixaEnquadramento(v) {
  if (v == null) return "";
  if (v >= 0.75) return "ok";
  if (v >= 0.72) return "atencao";
  if (v >= 0.67) return "limite";
  return "desenq";
}

const Titulo = ({ l1, l2 }) => (
  <><span className="th-linha">{l1 || "\u00a0"}</span><span className="th-linha">{l2}</span></>
);

function Indicador({ rotulo, valor, legenda, legendaDireita, destaque = false, negativo = false }) {
  return (
    <div className={`card card--indicador${destaque ? " card--fechamento" : ""}`}>
      <span className="card__rotulo">{rotulo}</span>
      <span className={`card__valor${negativo ? " card__valor--negativo" : ""}`}>{brl(valor)}</span>
      {(legenda || legendaDireita) && (
        <span className="card__legendas">
          <span className="card__legenda">{legenda}</span>
          {legendaDireita && <span className="card__legenda">{legendaDireita}</span>}
        </span>
      )}
    </div>
  );
}

const Op = ({ children, nome }) => <span className="ponte__op" role="img" aria-label={nome}>{children}</span>;

const Variacao = ({ v, sufixo }) => v == null ? null : (
  <span className={v < 0 ? "negativo" : "positivo"}>{v < 0 ? "▼" : "▲"} {pct(v)} {sufixo}</span>
);

// Os 4 indicadores como uma conta: inicial + entradas − saídas = fechamento.
// Sem dia selecionado, é o mês; com um dia, é o movimento daquele dia.
function Ponte({ indicadores: i, linhas, dia }) {
  if (dia) {
    const k = linhas.findIndex((l) => l.data === dia.data);
    const anterior = linhas[k - 1];
    return (
      <div className="ponte ponte--dia">
        <Indicador rotulo="Caixa inicial do dia" valor={anterior?.saldoCaixaTotal}
          legenda={anterior ? `Saldo de fechamento em ${curta(anterior.data)}` : null} />
        <Op nome="mais">+</Op>
        <Indicador rotulo="Entradas do dia" valor={(dia.entradas || 0) + (dia.rendimento || 0)} legenda="Baixas e rendimento das aplicações" />
        <Op nome="menos">−</Op>
        <Indicador rotulo="Saídas do dia" valor={Math.abs(dia.saidas || 0)} legenda="Pagamentos no dia" negativo />
        <Op nome="igual a">=</Op>
        <Indicador rotulo="Caixa total fechamento" valor={dia.saldoCaixaTotal} destaque
          legenda={<Variacao v={dia.variacaoCaixa} sufixo="no dia" />} legendaDireita={`Saldo em ${curta(dia.data)}`} />
      </div>
    );
  }
  const abertura = linhas.find((l) => l.abertura)?.data;
  const ultimo = linhas.filter((l) => !l.abertura).at(-1)?.data;
  const variacao = i.caixaInicial ? i.caixaTotalFechamento / i.caixaInicial - 1 : null;
  return (
    <div className="ponte">
      <Indicador rotulo="Caixa inicial" valor={i.caixaInicial}
        legenda={abertura ? `Saldo de fechamento em ${curta(abertura)}` : null} />
      <Op nome="mais">+</Op>
      <Indicador rotulo="Entradas acumuladas" valor={i.entradasAcumuladas} legenda="Baixas e rendimento das aplicações" />
      <Op nome="menos">−</Op>
      <Indicador rotulo="Saídas acumuladas" valor={Math.abs(i.saidasAcumuladas)} legenda="Pagamentos no mês" negativo />
      <Op nome="igual a">=</Op>
      <Indicador rotulo="Caixa total fechamento" valor={i.caixaTotalFechamento} destaque
        legenda={<Variacao v={variacao} sufixo="no mês" />} legendaDireita={ultimo ? `Saldo em ${curta(ultimo)}` : null} />
    </div>
  );
}

// Barra discreta acima da conta: o que está sendo mostrado + enquadramento do dia.
function BarraContexto({ dia, ultimo, onMes }) {
  const ref = dia || ultimo;
  const f = faixaEnquadramento(ref?.enquadramento);
  return (
    <div className="contexto">
      <div className="contexto__modo">
        <span className="contexto__seg" role="group" aria-label="Período mostrado">
          <button type="button" className={!dia ? "on" : undefined} aria-pressed={!dia} onClick={onMes}>Mês inteiro</button>
          <button type="button" className={dia ? "on" : undefined} aria-pressed={Boolean(dia)} disabled={!dia}>
            {dia ? `Dia ${curta(dia.data)}` : "Dia"}
          </button>
        </span>
        {dia ? (
          <>
            <span>Mostrando o movimento de {curta(dia.data)}.</span>
            <button type="button" className="botao-texto" onClick={onMes}>Ver o mês inteiro</button>
          </>
        ) : (
          <span>Clique numa data da tabela ou dos gráficos para ver o movimento do dia.</span>
        )}
      </div>
      {ref?.enquadramento != null && (
        <div className={`contexto__enq enq--${f}`}>
          Enquadramento em {curta(ref.data)} <b>{pct(ref.enquadramento)}</b><span className="contexto__ponto" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

function Tabela({ linhas, selecionada, onSelecionar }) {
  const ultimaData = linhas.filter((l) => !l.abertura).at(-1)?.data;
  return (
    <section className="card card--tabela" aria-labelledby="titulo-mov">
      <div className="card--tabela__topo">
        <h2 id="titulo-mov" className="card__rotulo">Movimentação diária</h2>
        <span className="card--tabela__nota">Valores em R$</span>
      </div>
      <div className="tabela-rolagem" tabIndex={0} role="region" aria-label="Movimentação diária, role para o lado">
        <table className="caixa-tabela">
          <thead>
            <tr>
              <th scope="col"><Titulo l2="Data" /></th>
              {COLUNAS.map(([id, l1, l2]) => <th key={id} scope="col" className="num"><Titulo l1={l1} l2={l2} /></th>)}
              <th scope="col" className="num"><Titulo l1="Variação" l2="caixa" /></th>
              <th scope="col" className="num"><Titulo l2="Enquadramento" /></th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const sel = l.data === selecionada;
              const classe = l.abertura ? "abertura" : sel ? "linha-sel" : !selecionada && l.data === ultimaData ? "recente" : undefined;
              return (
                <tr key={l.data} className={classe}>
                  <th scope="row">
                    {l.abertura ? curta(l.data) : (
                      <button type="button" className="data-btn" aria-pressed={sel}
                        onClick={() => onSelecionar(l.data)} title={sel ? "Voltar ao mês inteiro" : "Ver o movimento deste dia"}>
                        {curta(l.data)}
                      </button>
                    )}
                    {l.abertura && <span className="abertura__rotulo">Saldo de abertura</span>}
                  </th>
                  {COLUNAS.map(([id]) => (
                    <td key={id} className={`num${sinal(l[id])}`}>{l.abertura && l[id] === null ? "" : valorNum(l[id])}</td>
                  ))}
                  <td className={`num${l.variacaoCaixa === null ? "" : l.variacaoCaixa < 0 ? " negativo" : " positivo"}`}>
                    {l.abertura ? "" : pct(l.variacaoCaixa)}
                  </td>
                  <td className="num">
                    {l.abertura || l.enquadramento == null ? "" :
                      <span className={`enq-chip enq--${faixaEnquadramento(l.enquadramento)}`}>{pct(l.enquadramento)}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Caixa({ aba, onAba }) {
  const [meses, setMeses] = useState([]);
  const [meta, setMeta] = useState(null);
  const [mes, setMes] = useState(null);
  const [dados, setDados] = useState(null);
  const [arquivo, setArquivo] = useState(null);     // versão publicada do mês (nome, data)
  const [erro, setErro] = useState(null);
  const [diaSel, setDiaSel] = useState(null);       // data selecionada (null = mês inteiro)
  const [baixando, setBaixando] = useState(false);
  const [falhaBaixar, setFalhaBaixar] = useState(false);
  const mesRef = useRef(null);
  mesRef.current = mes;

  // Lista de meses disponíveis (tenta de novo se o servidor ainda estiver ligando).
  useEffect(() => {
    let vivo = true;
    let timer;
    const tentar = async (n = 0) => {
      try {
        const r = await apiCaixa.meses();
        if (!vivo) return;
        setMeses(r.meses);
        setMeta(r.meta);
        setMes((m) => m ?? r.sugerido);
        setErro(null);
      } catch (e) {
        if (!vivo) return;
        setErro(e.message);
        timer = setTimeout(() => tentar(n + 1), Math.min(2000 * (n + 1), 10000));
      }
    };
    tentar();
    return () => { vivo = false; clearTimeout(timer); };
  }, []);

  // Sem botão: de tempos em tempos confere, em silêncio, se entrou uma versão nova
  // na pasta de publicados (ou um mês novo).
  const buscar = useCallback(async (forcar) => {
    const alvo = mesRef.current;
    apiCaixa.meses().then((m) => setMeses(m.meses)).catch(() => {});
    const r = await apiCaixa.mes(alvo, forcar);
    setMeta(r.meta);
    if (mesRef.current === alvo) { setDados(r.caixa); setArquivo(r.arquivo); }
  }, []);

  const intervaloMs = (meta?.intervaloAtualizacaoMin || 10) * 60 * 1000;
  useAutoAtualizacao(buscar, { chave: mes, intervaloMs, temDados: Boolean(dados) });

  const irPara = (id) => { if (id && id !== mes) { setDados(null); setArquivo(null); setDiaSel(null); setMes(id); } };
  // clicar no mesmo dia de novo volta ao mês inteiro
  const selecionar = useCallback((data) => setDiaSel((atual) => (atual === data ? null : data)), []);

  // Esc volta ao mês inteiro
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") setDiaSel(null); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);
  const i = meses.findIndex((m) => m.id === mes);
  const anterior = i > 0 ? meses[i - 1].id : null;
  const proximo = i >= 0 && i < meses.length - 1 ? meses[i + 1].id : null;
  const rotuloMes = meses[i]?.rotulo ?? "";
  const diasDoMes = dados?.linhas.filter((l) => !l.abertura) ?? [];
  const posicao = diasDoMes.at(-1)?.data;
  const dia = diasDoMes.find((l) => l.data === diaSel) ?? null;

  return (
    <>
      <BarraTopo aba={aba} onAba={onAba}>
        <nav className="navegacao" aria-label="Escolher mês">
          <button type="button" className="btn-icone" onClick={() => irPara(anterior)} disabled={!anterior}
            aria-label="Mês anterior">‹</button>
          <select value={mes || ""} onChange={(e) => irPara(e.target.value)} aria-label="Mês do fluxo de caixa">
            {meses.map((m) => <option key={m.id} value={m.id}>{m.rotulo}</option>)}
          </select>
          <button type="button" className="btn-icone" onClick={() => irPara(proximo)} disabled={!proximo}
            aria-label="Próximo mês">›</button>
        </nav>
      </BarraTopo>

      <div className="pagina pagina--larga">
        <div className="cabeca-pagina">
          <div>
            <h1 className="page-title">Fluxo de Caixa</h1>
            <p className="page-sub">
              {rotuloMes}{dia ? `, dia ${curta(dia.data)} selecionado` : posicao ? `, posição de ${curta(posicao)}` : ""}
            </p>
          </div>
          <div className="cabeca-pagina__direita">
            {arquivo && (
              <div className="publicacao">
                <span className="publicacao__info">
                  Versão publicada em {dataHora(arquivo.publicadoEm)}
                </span>
                <a className="button button--pequeno publicacao__baixar" href="#baixar"
                  aria-disabled={baixando || undefined}
                  onClick={async (e) => {
                    e.preventDefault();
                    if (baixando) return;
                    setBaixando(true);
                    setFalhaBaixar(false);
                    try { await apiCaixa.baixar(arquivo); } catch { setFalhaBaixar(true); } finally { setBaixando(false); }
                  }}>
                  <span aria-hidden="true">↓</span> {baixando ? "Baixando…" : falhaBaixar ? "Falhou, tente de novo" : "Baixar planilha"}
                </a>
              </div>
            )}
          </div>
        </div>

        {erro && !meses.length ? (
          <p className="vazio" role="status">Conectando ao servidor e procurando o fluxo de caixa…</p>
        ) : meta && !meses.length ? (
          <p className="vazio">Nenhum fluxo de caixa publicado ainda.</p>
        ) : !dados ? (
          <p className="vazio" role="status">Carregando…</p>
        ) : (
          <main className="report">
            <BarraContexto dia={dia} ultimo={diasDoMes.at(-1)} onMes={() => setDiaSel(null)} />
            <Ponte indicadores={dados.indicadores} linhas={dados.linhas} dia={dia} />
            <div className="grade grade--graficos">
              <GraficoSaldo linhas={dados.linhas} selecionada={dia?.data ?? null} onSelecionar={selecionar} />
              <GraficoEntradasSaidas linhas={dados.linhas} selecionada={dia?.data ?? null} onSelecionar={selecionar} />
            </div>
            <div className="grade grade--graficos">
              <GraficoEnquadramento linhas={dados.linhas} selecionada={dia?.data ?? null} onSelecionar={selecionar} />
              <GraficoRendimento linhas={dados.linhas} selecionada={dia?.data ?? null} onSelecionar={selecionar} />
            </div>
            <Tabela linhas={dados.linhas} selecionada={dia?.data ?? null} onSelecionar={selecionar} />
          </main>
        )}
      </div>
    </>
  );
}
