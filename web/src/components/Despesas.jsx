import { useCallback, useState } from "react";
import { apiRelatorios } from "../api.js";
import { BarraTopo } from "./Cabecalho.jsx";
import { useAutoAtualizacao } from "../hooks/useAutoAtualizacao.js";
import { brl, valorNum } from "../formato.js";

// Relatório de Despesas do fundo (Relatórios > Despesas). Dados da planilha publicada uma vez
// por mês: { meses: ["2025-05", ...], linhas: [{ fornecedor, servico, categoria, valores }], arquivo }.
// A tela mostra um mês: total, variação em relação ao anterior, pizza por categoria e o que foi pago.

// Categorias: usa a coluna "Categoria" da planilha quando existir; senão, deduz pelo serviço.
const CATEGORIAS = [
  { id: "gestao", nome: "Gestão", teste: (l) => l.fornecedor === "H2 Kapital" },
  { id: "operacao", nome: "Operação do fundo", teste: (l) => /certificadora|custodia|lastro|r.?gistradora|extratora|contabil/.test(sem(l.servico)) && !/auditoria/.test(sem(l.servico)) },
  { id: "auditoria", nome: "Auditoria", teste: (l) => /auditoria/.test(sem(l.servico)) },
  { id: "taxas", nome: "Taxas e registros", teste: (l) => /anbima|selic|cvm/.test(sem(`${l.fornecedor} ${l.servico}`)) },
  { id: "cobranca", nome: "Agente de cobrança", teste: (l) => /agente de cobranca/.test(sem(l.fornecedor)) },
  { id: "outros", nome: "Outros", teste: () => true },
];
const sem = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
function categoriaDe(l) {
  if (l.categoria) {
    const conhecida = CATEGORIAS.find((c) => sem(c.nome) === sem(l.categoria));
    return conhecida || { id: `c:${sem(l.categoria)}`, nome: l.categoria };
  }
  return CATEGORIAS.find((c) => c.teste(l));
}

const NOMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const LONGOS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const curto = (m) => `${NOMES[Number(m.slice(5)) - 1]}/${m.slice(2, 4)}`;
const longo = (m) => `${LONGOS[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
const pct = (v) => `${(Math.abs(v) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
const fatia = (v) => (v > 0 && v < 0.005 ? "<1%" : pct(v));
const dataHora = (iso) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));

export default function Despesas({ aba, onAba, onVoltar }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [mes, setMes] = useState(null);
  const [meta, setMeta] = useState(null);
  const [baixando, setBaixando] = useState(false);
  const [falhaBaixar, setFalhaBaixar] = useState(false);

  const buscar = useCallback(async () => {
    try {
      const r = await apiRelatorios.despesas();
      setDados(r.despesas);
      setMeta(r.meta);
      setErro(null);
      setMes((m) => (m && r.despesas.meses.includes(m) ? m : r.despesas.meses.at(-1) ?? null));   // padrão: último mês publicado
    } catch (e) {
      setErro(e.message);
      throw e;
    }
  }, []);
  const intervaloMs = (meta?.intervaloAtualizacaoMin || 10) * 60 * 1000;
  useAutoAtualizacao(buscar, { chave: "despesas", intervaloMs, temDados: Boolean(dados) });

  const meses = dados?.meses || [];
  const i = meses.indexOf(mes);
  const ant = i > 0 ? meses[i - 1] : null;
  const prox = i >= 0 && i < meses.length - 1 ? meses[i + 1] : null;

  const baixar = async () => {
    if (baixando || !dados?.arquivo) return;
    setBaixando(true);
    setFalhaBaixar(false);
    try { await apiRelatorios.baixarDespesas(dados.arquivo); } catch { setFalhaBaixar(true); } finally { setBaixando(false); }
  };

  return (
    <>
      <BarraTopo aba={aba} onAba={onAba} />
      <div className="pagina">
        <div className="cabeca-pagina">
          <div>
            <button type="button" className="botao-texto relatorio__voltar" onClick={onVoltar}>← Relatórios</button>
            <h1 className="page-title">Despesas</h1>
            <p className="page-sub">Despesas pagas pelo fundo{mes ? ` · ${longo(mes)}` : ""}</p>
          </div>
          <div className="cabeca-pagina__direita filtro-relatorio">
            {meses.length > 0 && (
              <nav className="navegacao" aria-label="Escolher mês">
                <button type="button" className="btn-icone" onClick={() => setMes(ant)} disabled={!ant} aria-label="Mês anterior">‹</button>
                <select value={mes || ""} onChange={(e) => setMes(e.target.value)} aria-label="Mês">
                  {meses.map((m) => <option key={m} value={m}>{longo(m)}</option>)}
                </select>
                <button type="button" className="btn-icone" onClick={() => setMes(prox)} disabled={!prox} aria-label="Próximo mês">›</button>
              </nav>
            )}
            {dados?.arquivo && (
              <button type="button" className="button button--pequeno publicacao__baixar" onClick={baixar} disabled={baixando}
                title={`${dados.arquivo.nome} · publicada em ${dataHora(dados.arquivo.publicadoEm)}`}>
                <span aria-hidden="true">↓</span> {baixando ? "Baixando…" : falhaBaixar ? "Falhou, tente de novo" : "Baixar planilha"}
              </button>
            )}
          </div>
        </div>

        {erro && !dados ? (
          <p className="vazio" role="status">{erro}</p>
        ) : !dados ? (
          <p className="vazio" role="status">Carregando…</p>
        ) : !mes ? (
          <p className="vazio">A planilha publicada não tem valores.</p>
        ) : (
          <Extrato linhas={dados.linhas} mes={mes} ant={ant} />
        )}
      </div>
    </>
  );
}

function Variacao({ atual, antes }) {
  if (!antes) return null;
  const v = atual / antes - 1;
  if (Math.abs(v) < 0.005) return <span className="d2-var d2-var--neutra">=</span>;
  return <span className={`d2-var ${v > 0 ? "d2-var--sobe" : "d2-var--cai"}`}>{v > 0 ? "▲" : "▼"} {pct(v)}</span>;
}

// Uma folha só, como uma fatura: o total e a pizza no alto; embaixo, o que foi pago, por categoria.
function Extrato({ linhas, mes, ant }) {
  const soma = (m) => linhas.reduce((t, l) => t + (l.valores[m] || 0), 0);
  const total = soma(mes);
  const totalAnt = ant ? soma(ant) : 0;
  const grupos = [];
  for (const l of linhas) {
    if (!l.valores[mes]) continue;
    const c = categoriaDe(l);
    let g = grupos.find((x) => x.id === c.id);
    if (!g) grupos.push(g = { id: c.id, nome: c.nome, itens: [], v: 0 });
    g.itens.push(l);
    g.v += l.valores[mes];
  }
  const ordem = (g) => { const k = CATEGORIAS.findIndex((c) => c.id === g.id); return k < 0 ? CATEGORIAS.length - 1.5 : k; };
  grupos.sort((a, b) => ordem(a) - ordem(b));

  return (
    <section className="card d2-folha">
      <header className="d2-folha__topo">
        <div>
          <span className="d2-rotulo">Total do mês</span>
          <strong className="d2-total">{brl(total)}</strong>
          {totalAnt > 0 && <span className="d2-sub"><Variacao atual={total} antes={totalAnt} /> em relação a {curto(ant)}</span>}
        </div>
        {total > 0 && <Pizza grupos={grupos} total={total} />}
      </header>
      {grupos.map((g) => (
        <div key={g.id} className="d2-grupo">
          <div className="d2-grupo__cab">
            <span>{g.nome}</span>
            <span className="d2-grupo__valor">{valorNum(g.v)}</span>
          </div>
          {g.itens.map((l) => (
            <div key={l.fornecedor + l.servico} className="d2-item">
              <span>{l.fornecedor} <small>{l.servico && sem(l.servico) !== sem(l.fornecedor) ? l.servico : ""}</small></span>
              <span className="d2-item__valor">{valorNum(l.valores[mes])}</span>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

// Rosca com a fatia de cada categoria no mês, legenda ao lado.
// As fatias crescem uma após a outra ao abrir; passando o mouse (ou o foco) numa fatia ou na
// legenda, ela se destaca, as outras esmaecem e o centro mostra a categoria, o valor e o %.
const COR = { gestao: 1, operacao: 2, auditoria: 3, taxas: 4, cobranca: 5, outros: 6 };
function Pizza({ grupos, total }) {
  const [ativa, setAtiva] = useState(null);
  const T = 168, c = T / 2, raio = 62, espessura = 22, gap = 2.5;
  const circ = 2 * Math.PI * raio;
  let inicio = 0;
  const fatias = grupos.map((g, k) => {
    const frac = g.v / total;
    const len = frac * circ;
    const f = { ...g, frac, cor: COR[g.id] ?? (k % 6) + 1, ini: inicio,
      traco: grupos.length > 1 ? Math.max(len - gap, 0.6) : circ };
    inicio += len;
    return f;
  });
  const sel = fatias.find((f) => f.id === ativa);
  return (
    <div className={`d2-pizza${sel ? " d2-pizza--foco" : ""}`} onMouseLeave={() => setAtiva(null)}>
      <div className="d2-rosca" style={{ width: T, height: T }}>
        <svg width={T} height={T} viewBox={`0 0 ${T} ${T}`} role="img"
          aria-label={fatias.map((f) => `${f.nome} ${fatia(f.frac)}`).join(", ")}>
          <circle cx={c} cy={c} r={raio} className="d2-rosca__trilho" strokeWidth={espessura} />
          {fatias.map((f, k) => (
            <circle key={f.id} cx={c} cy={c} r={raio} transform={`rotate(-90 ${c} ${c})`}
              className={`d2-rosca__fatia d2-stroke-${f.cor}${ativa === f.id ? " ativa" : ""}`}
              strokeWidth={espessura}
              style={{ strokeDasharray: `${f.traco} ${circ}`, strokeDashoffset: -f.ini, "--circ": circ, animationDelay: `${k * 120}ms` }}
              onMouseEnter={() => setAtiva(f.id)} />
          ))}
        </svg>
        <div className="d2-rosca__centro" aria-hidden="true">
          {sel && (
            <>
              <span key={`v-${sel.id}`} className="d2-rosca__valor">{brl(sel.v)}</span>
              <span key={`n-${sel.id}`} className="d2-rosca__nome">{sel.nome}</span>
            </>
          )}
        </div>
      </div>
      <ul className="d2-pizza__legenda">
        {fatias.map((f) => (
          <li key={f.id} tabIndex={0} className={ativa === f.id ? "ativa" : undefined}
            onMouseEnter={() => setAtiva(f.id)} onFocus={() => setAtiva(f.id)} onBlur={() => setAtiva(null)}
            aria-label={`${f.nome}: ${brl(f.v)}, ${fatia(f.frac)}`}>
            <i className={`d2-cor-${f.cor}`} /><span>{f.nome}</span><b>{fatia(f.frac)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
