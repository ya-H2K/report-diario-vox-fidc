import { useEffect, useRef, useState } from "react";
import { brl, curta, pct } from "../formato.js";

// Largura real do contêiner, para desenhar o SVG em pixels (texto nítido, sem distorcer).
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

// "R$ 30 mi", "R$ 2,5 mi", "R$ 800 mil"
export function milhoes(v, casas) {
  const a = Math.abs(v);
  if (a >= 1e6) {
    const c = casas ?? (a >= 1e7 ? 0 : 1);
    return `R$ ${(v / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: casas ?? 0, maximumFractionDigits: c })} mi`;
  }
  if (a >= 1e3) return `R$ ${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return `R$ ${v.toLocaleString("pt-BR")}`;
}

// Escala "redonda" de 0 até pouco acima do máximo.
function escala(max, passos = 4) {
  if (max <= 0) return { topo: 1, ticks: [0, 1] };
  const bruto = max / passos;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= bruto);
  const topo = Math.ceil(max / passo) * passo;
  return { topo, ticks: Array.from({ length: Math.round(topo / passo) + 1 }, (_, i) => i * passo) };
}

const M = { top: 22, right: 16, bottom: 30, left: 66 };
const ALTURA = 260;
const limitar = (v, a, b) => Math.min(Math.max(v, a), b);

function Grade({ ticks, y, largura, formato }) {
  return ticks.map((t) => (
    <g key={t}>
      <line x1={M.left} x2={largura - M.right} y1={y(t)} y2={y(t)} className="graf__grade" />
      <text x={M.left - 10} y={y(t)} className="graf__eixo" textAnchor="end" dominantBaseline="middle">{formato(t)}</text>
    </g>
  ));
}

// Rótulos do eixo X: alguns dias, conforme o espaço; a data selecionada sempre aparece (em dourado).
function EixoX({ itens, xDe, largura, selecionada }) {
  const cabem = Math.max(2, Math.floor((largura - M.left - M.right) / 52));
  const salto = Math.max(1, Math.ceil(itens.length / cabem));
  let indices = itens.map((_, i) => i).filter((i) => i % salto === 0);
  const ultimo = itens.length - 1;
  if (indices.at(-1) !== ultimo) {
    if (ultimo - indices.at(-1) < salto * 0.6) indices.pop();
    indices.push(ultimo);
  }
  const k = itens.findIndex((it) => it.data === selecionada);
  if (k >= 0) {
    indices = indices.filter((i) => i === k || Math.abs(xDe(i) - xDe(k)) > 44);
    if (!indices.includes(k)) indices.push(k);
  }
  return indices.sort((a, b) => a - b).map((i) => (
    <text key={itens[i].data} x={xDe(i)} y={ALTURA - 8} textAnchor="middle"
      className={`graf__eixo${itens[i].data === selecionada ? " graf__eixo--sel" : ""}`}>
      {curta(itens[i].data)}
    </text>
  ));
}

// Etiqueta dourada com texto (valor do dia selecionado, valor na altura do mouse).
function Etiqueta({ x, y, texto, largura = 88, ancora = "meio" }) {
  const x0 = ancora === "direita" ? x - largura : x - largura / 2;
  return (
    <g className="graf__etiqueta" pointerEvents="none">
      <rect x={x0} y={y - 10} width={largura} height={20} />
      <text x={x0 + largura / 2} y={y} textAnchor="middle" dominantBaseline="middle">{texto}</text>
    </g>
  );
}

function Dica({ estilo, children }) {
  if (!estilo) return null;
  return <div className="graf__dica" style={estilo}>{children}</div>;
}

function Cartao({ titulo, lateral, children }) {
  return (
    <section className="card card--grafico" aria-label={titulo}>
      <div className="card--grafico__topo">
        <h2 className="card__rotulo">{titulo}</h2>
        {lateral}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Variação do caixa: mira livre que segue o mouse; clique seleciona o dia mais próximo.
export function GraficoSaldo({ linhas, selecionada, onSelecionar }) {
  const [ref, largura] = useLargura();
  const [mouse, setMouse] = useState(null);           // { x, y } em pixels dentro do SVG
  const pontos = linhas.filter((l) => l.saldoCaixaTotal != null);
  const { topo, ticks } = escala(Math.max(...pontos.map((p) => p.saldoCaixaTotal)));
  const w = largura || 600;
  const base = ALTURA - M.bottom;
  const x = (i) => M.left + (pontos.length === 1 ? 0 : (i * (w - M.left - M.right)) / (pontos.length - 1));
  const y = (v) => M.top + (1 - v / topo) * (base - M.top);
  const valorEm = (py) => topo * (1 - (py - M.top) / (base - M.top));
  const maisProximo = (px) => limitar(Math.round(((px - M.left) / (w - M.left - M.right)) * (pontos.length - 1)), 0, pontos.length - 1);
  const linha = pontos.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.saldoCaixaTotal)}`).join(" ");
  const area = `${linha} L${x(pontos.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;

  const mover = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMouse({ x: limitar(e.clientX - r.left, M.left, w - M.right), y: limitar(e.clientY - r.top, M.top, base) });
  };
  const perto = mouse ? maisProximo(mouse.x) : null;
  const p = perto != null ? pontos[perto] : null;
  const ks = pontos.findIndex((pt) => pt.data === selecionada);
  const dicaEsquerda = mouse && mouse.x > w - 200;

  return (
    <Cartao titulo="Variação do caixa" lateral={<span className="card--tabela__nota">Saldo caixa total, dia a dia</span>}>
      <div className="graf" ref={ref}>
        {largura > 0 && (
          <svg width={w} height={ALTURA} role="img" className="graf__svg--clicavel"
            aria-label={`Saldo caixa total de ${curta(pontos[0].data)} a ${curta(pontos.at(-1).data)}`}
            onPointerMove={mover} onPointerLeave={() => setMouse(null)}
            onClick={() => perto != null && !pontos[perto].abertura && onSelecionar?.(pontos[perto].data)}>
            <defs>
              <linearGradient id="grad-saldo" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" style={{ stopColor: "var(--gold)", stopOpacity: 0.26 }} />
                <stop offset="1" style={{ stopColor: "var(--gold)", stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            <Grade ticks={ticks} y={y} largura={w} formato={(t) => milhoes(t)} />
            <EixoX itens={pontos} xDe={x} largura={w} selecionada={selecionada} />
            {ks >= 0 && <rect x={x(ks) - 14} y={M.top} width={28} height={base - M.top} className="graf__faixa-sel" />}
            <path d={area} fill="url(#grad-saldo)" />
            <path d={linha} fill="none" className="graf__linha" />
            {pontos.map((pt, i) => (
              <circle key={pt.data} cx={x(i)} cy={y(pt.saldoCaixaTotal)} r={perto === i ? 4.5 : 2.5}
                className={`graf__ponto${perto === i ? " graf__ponto--ativo" : ""}`} />
            ))}
            {ks >= 0 && (
              <>
                <line x1={x(ks)} x2={x(ks)} y1={M.top} y2={base} className="graf__linha-sel" />
                <circle cx={x(ks)} cy={y(pontos[ks].saldoCaixaTotal)} r={6} className="graf__ponto-sel" />
                <Etiqueta x={limitar(x(ks), M.left + 44, w - M.right - 44)} y={y(pontos[ks].saldoCaixaTotal) - 22}
                  texto={milhoes(pontos[ks].saldoCaixaTotal, 2)} />
              </>
            )}
            {mouse && (
              <g pointerEvents="none">
                <Etiqueta x={M.left - 4} y={mouse.y} largura={60} ancora="direita" texto={milhoes(valorEm(mouse.y), 1)} />
              </g>
            )}
          </svg>
        )}
        <Dica estilo={mouse && p ? {
          top: Math.max(0, mouse.y - 12),
          ...(dicaEsquerda ? { right: w - mouse.x + 16 } : { left: mouse.x + 16 }),
        } : null}>
          {p && (
            <>
              <strong>{curta(p.data)}{p.abertura ? " (abertura)" : ""}</strong>
              <span>{brl(p.saldoCaixaTotal)}</span>
              {!p.abertura && p.variacaoCaixa != null && (
                <span className={p.variacaoCaixa < 0 ? "negativo" : "positivo"}>{pct(p.variacaoCaixa)} no dia</span>
              )}
            </>
          )}
        </Dica>
      </div>
    </Cartao>
  );
}

// ---------------------------------------------------------------------------
// Entradas x saídas por dia, em colunas lado a lado. Com um dia selecionado, os
// outros ficam esmaecidos.
export function GraficoEntradasSaidas({ linhas, selecionada, onSelecionar }) {
  const [ref, largura] = useLargura();
  const [ativo, setAtivo] = useState(null);
  const dias = linhas.filter((l) => !l.abertura);
  const { topo, ticks } = escala(Math.max(...dias.map((d) => Math.max((d.entradas || 0) + (d.rendimento || 0), Math.abs(d.saidas || 0)))));
  const w = largura || 600;
  const faixa = (w - M.left - M.right) / Math.max(dias.length, 1);
  const barra = Math.max(2, Math.min(18, faixa * 0.32));
  const centro = (i) => M.left + faixa * (i + 0.5);
  const y = (v) => M.top + (1 - v / topo) * (ALTURA - M.top - M.bottom);
  const base = y(0);
  const ks = dias.findIndex((d) => d.data === selecionada);
  const d = ativo != null ? dias[ativo] : null;
  const entrada = (dia) => (dia.entradas || 0) + (dia.rendimento || 0);

  const mover = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - r.left - M.left) / faixa);
    setAtivo(i >= 0 && i < dias.length ? i : null);
  };

  return (
    <Cartao titulo="Entradas x saídas" lateral={
      <ul className="legenda-graf">
        <li><span className="legenda-graf__cor legenda-graf__cor--entrada" />Entradas</li>
        <li><span className="legenda-graf__cor legenda-graf__cor--saida" />Saídas</li>
      </ul>}>
      <div className="graf" ref={ref}>
        {largura > 0 && (
          <svg width={w} height={ALTURA} role="img" aria-label="Entradas e saídas de cada dia do mês" className="graf__svg--clicavel"
            onPointerMove={mover} onPointerLeave={() => setAtivo(null)}
            onClick={() => ativo != null && onSelecionar?.(dias[ativo].data)}>
            <Grade ticks={ticks} y={y} largura={w} formato={(t) => milhoes(t)} />
            <EixoX itens={dias} xDe={centro} largura={w} selecionada={selecionada} />
            {ks >= 0 && <rect x={centro(ks) - faixa / 2} y={M.top} width={faixa} height={base - M.top} className="graf__faixa-sel" />}
            {d && ativo !== ks && <rect x={centro(ativo) - faixa / 2} y={M.top} width={faixa} height={base - M.top} className="graf__foco" />}
            {dias.map((dia, i) => {
              const ent = entrada(dia);
              const sai = Math.abs(dia.saidas || 0);
              const apagado = ks >= 0 ? i !== ks && ativo !== i : ativo != null && ativo !== i;
              return (
                <g key={dia.data} opacity={apagado ? (ks >= 0 ? 0.28 : 0.45) : 1}>
                  <rect x={centro(i) - barra - 1} y={y(ent)} width={barra} height={base - y(ent)} className="graf__barra--entrada" />
                  <rect x={centro(i) + 1} y={y(sai)} width={barra} height={base - y(sai)} className="graf__barra--saida" />
                </g>
              );
            })}
            {ks >= 0 && (
              <g pointerEvents="none">
                <text x={centro(ks) - barra / 2 - 1} y={y(entrada(dias[ks])) - 8} textAnchor="middle" className="graf__valor graf__valor--entrada">
                  {milhoes(entrada(dias[ks]), 1)}
                </text>
                <text x={centro(ks) + barra / 2 + 1} y={y(Math.abs(dias[ks].saidas || 0)) - 8} textAnchor="middle" className="graf__valor graf__valor--saida">
                  {milhoes(Math.abs(dias[ks].saidas || 0), 1)}
                </text>
              </g>
            )}
            <line x1={M.left} x2={w - M.right} y1={base} y2={base} className="graf__base" />
          </svg>
        )}
        <Dica estilo={d ? { top: 0, left: limitar(centro(ativo), 90, w - 90), transform: "translateX(-50%)" } : null}>
          {d && (
            <>
              <strong>{curta(d.data)}</strong>
              <span className="positivo">Entradas {brl(entrada(d))}</span>
              <span className="negativo">Saídas {brl(Math.abs(d.saidas || 0))}</span>
            </>
          )}
        </Dica>
      </div>
    </Cartao>
  );
}

// ---------------------------------------------------------------------------
// Enquadramento: só a variação no mês, com o piso no limite de 67%.
export const LIMITE_ENQUADRAMENTO = 0.67;

export function GraficoEnquadramento({ linhas, selecionada, onSelecionar }) {
  const [ref, largura] = useLargura();
  const [mouse, setMouse] = useState(null);           // { x, y } em pixels dentro do SVG
  const dias = linhas.filter((l) => !l.abertura && l.enquadramento != null);
  if (!dias.length) return null;
  const lo = Math.min(LIMITE_ENQUADRAMENTO, ...dias.map((d) => d.enquadramento));
  const hi = Math.max(1, Math.ceil((Math.max(...dias.map((d) => d.enquadramento)) + 0.02) * 20) / 20);
  const w = largura || 600;
  const base = ALTURA - M.bottom;
  const x = (i) => M.left + (dias.length === 1 ? 0 : (i * (w - M.left - M.right)) / (dias.length - 1));
  const y = (v) => M.top + (1 - (v - lo) / (hi - lo)) * (base - M.top);
  const ticks = [0.8, 0.9, 1.0, 1.1, 1.2].filter((t) => t <= hi + 1e-9 && t - lo > 0.06);
  const linha = dias.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.enquadramento)}`).join(" ");
  const area = `${linha} L${x(dias.length - 1)},${y(lo)} L${x(0)},${y(lo)} Z`;
  const ks = dias.findIndex((d) => d.data === selecionada);

  const valorEm = (py) => lo + (hi - lo) * (1 - (py - M.top) / (base - M.top));
  const mover = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMouse({ x: limitar(e.clientX - r.left, M.left, w - M.right), y: limitar(e.clientY - r.top, M.top, base) });
  };
  const ativo = mouse ? limitar(Math.round(((mouse.x - M.left) / (w - M.left - M.right)) * (dias.length - 1)), 0, dias.length - 1) : null;
  const d = ativo != null ? dias[ativo] : null;
  const dicaEsquerda = mouse && mouse.x > w - 200;

  return (
    <Cartao titulo="Enquadramento" lateral={<span className="card--tabela__nota">Variação no mês</span>}>
      <div className="graf" ref={ref}>
        {largura > 0 && (
          <svg width={w} height={ALTURA} role="img" className="graf__svg--clicavel"
            aria-label={`Enquadramento de ${curta(dias[0].data)} a ${curta(dias.at(-1).data)}`}
            onPointerMove={mover} onPointerLeave={() => setMouse(null)}
            onClick={() => ativo != null && onSelecionar?.(dias[ativo].data)}>
            <defs>
              <linearGradient id="grad-enq" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" style={{ stopColor: "var(--gold)", stopOpacity: 0.22 }} />
                <stop offset="1" style={{ stopColor: "var(--gold)", stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            <Grade ticks={ticks} y={y} largura={w} formato={(t) => `${Math.round(t * 100)}%`} />
            <line x1={M.left} x2={w - M.right} y1={y(LIMITE_ENQUADRAMENTO)} y2={y(LIMITE_ENQUADRAMENTO)} className="graf__limite" />
            <text x={M.left - 10} y={y(LIMITE_ENQUADRAMENTO)} className="graf__eixo graf__eixo--limite" textAnchor="end" dominantBaseline="middle">
              {Math.round(LIMITE_ENQUADRAMENTO * 100)}%
            </text>
            <EixoX itens={dias} xDe={x} largura={w} selecionada={selecionada} />
            <path d={area} fill="url(#grad-enq)" />
            <path d={linha} fill="none" className="graf__linha" />
            {dias.map((dd, i) => (
              <circle key={dd.data} cx={x(i)} cy={y(dd.enquadramento)} r={ativo === i ? 4.5 : 2.5}
                className={`graf__ponto${ativo === i ? " graf__ponto--ativo" : ""}`} />
            ))}
            {ks >= 0 && (
              <g pointerEvents="none">
                <line x1={x(ks)} x2={x(ks)} y1={M.top} y2={base} className="graf__linha-sel" />
                <circle cx={x(ks)} cy={y(dias[ks].enquadramento)} r={6} className="graf__ponto-sel" />
                <Etiqueta x={limitar(x(ks), M.left + 34, w - M.right - 34)} y={y(dias[ks].enquadramento) - 22}
                  largura={64} texto={pct(dias[ks].enquadramento)} />
              </g>
            )}
            {mouse && (
              <g pointerEvents="none">
                <Etiqueta x={M.left - 4} y={mouse.y} largura={60} ancora="direita" texto={pct(valorEm(mouse.y))} />
              </g>
            )}
          </svg>
        )}
        <Dica estilo={mouse && d ? {
          top: Math.max(0, mouse.y - 12),
          ...(dicaEsquerda ? { right: w - mouse.x + 16 } : { left: mouse.x + 16 }),
        } : null}>
          {d && (
            <>
              <strong>{curta(d.data)}</strong>
              <span>Enquadramento {pct(d.enquadramento)}</span>
            </>
          )}
        </Dica>
      </div>
    </Cartao>
  );
}

// ---------------------------------------------------------------------------
// Rendimento das aplicações: uma coluna por dia; tracejado = média diária do mês.
// Ao lado do título, o total do mês. Clique seleciona o dia (igual aos outros gráficos).
export function GraficoRendimento({ linhas, selecionada, onSelecionar }) {
  const [ref, largura] = useLargura();
  const [ativo, setAtivo] = useState(null);
  const dias = linhas.filter((l) => !l.abertura);
  if (!dias.length) return null;
  const total = dias.reduce((t, d) => t + (d.rendimento || 0), 0);
  const comValor = dias.filter((d) => d.rendimento);
  const media = comValor.length ? total / comValor.length : 0;
  const { topo, ticks } = escala(Math.max(...dias.map((d) => d.rendimento || 0), media));
  const w = largura || 600;
  const faixa = (w - M.left - M.right) / dias.length;
  const barra = Math.max(3, Math.min(22, faixa * 0.55));
  const centro = (i) => M.left + faixa * (i + 0.5);
  const y = (v) => M.top + (1 - v / topo) * (ALTURA - M.top - M.bottom);
  const base = y(0);
  const ks = dias.findIndex((d) => d.data === selecionada);
  const d = ativo != null ? dias[ativo] : null;
  // saldo aplicado no início do dia = saldo de aplicações da linha anterior
  const aplicadoAntes = (data) => {
    const k = linhas.findIndex((l) => l.data === data);
    return k > 0 ? linhas[k - 1].saldoAplicacoes : null;
  };
  const acumuladoAte = (i) => dias.slice(0, i + 1).reduce((t, x) => t + (x.rendimento || 0), 0);
  const taxa = (dia) => { const s = aplicadoAntes(dia.data); return s ? (dia.rendimento || 0) / s : null; };
  const pct3 = (v) => `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%`;
  const mil = (v) => (!v ? "R$ 0" : Math.abs(v) >= 1e6 ? milhoes(v, 2) : `R$ ${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`);

  const mover = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - r.left - M.left) / faixa);
    setAtivo(i >= 0 && i < dias.length ? i : null);
  };

  return (
    <Cartao titulo="Rendimento das aplicações" lateral={
      <span className="card--tabela__nota"><b className="graf__total">{brl(total)}</b> no mês · média de {mil(media)} por dia (tracejado)</span>}>
      <div className="graf" ref={ref}>
        {largura > 0 && (
          <svg width={w} height={ALTURA} role="img" className="graf__svg--clicavel"
            aria-label={`Rendimento diário das aplicações; total de ${brl(total)} no mês`}
            onPointerMove={mover} onPointerLeave={() => setAtivo(null)}
            onClick={() => ativo != null && onSelecionar?.(dias[ativo].data)}>
            <Grade ticks={ticks} y={y} largura={w} formato={(t) => mil(t)} />
            <EixoX itens={dias} xDe={centro} largura={w} selecionada={selecionada} />
            {ks >= 0 && <rect x={centro(ks) - faixa / 2} y={M.top} width={faixa} height={base - M.top} className="graf__faixa-sel" />}
            {d && ativo !== ks && <rect x={centro(ativo) - faixa / 2} y={M.top} width={faixa} height={base - M.top} className="graf__foco" />}
            {dias.map((dia, i) => {
              const v = dia.rendimento || 0;
              const apagado = ks >= 0 && i !== ks && ativo !== i;
              return <rect key={dia.data} x={centro(i) - barra / 2} y={y(v)} width={barra} height={base - y(v)}
                className={`graf__barra--rend${i === ks ? " sel" : ""}`} opacity={apagado ? 0.35 : 1} />;
            })}
            {media > 0 && (
              <g pointerEvents="none">
                <line x1={M.left} x2={w - M.right} y1={y(media)} y2={y(media)} className="graf__guia" />
              </g>
            )}
            {ks >= 0 && (
              <Etiqueta x={limitar(centro(ks), M.left + 40, w - M.right - 40)} y={y(dias[ks].rendimento || 0) - 16}
                largura={80} texto={mil(dias[ks].rendimento || 0)} />
            )}
            <line x1={M.left} x2={w - M.right} y1={base} y2={base} className="graf__base" />
          </svg>
        )}
        <Dica estilo={d ? { top: 0, left: limitar(centro(ativo), 100, w - 100), transform: "translateX(-50%)" } : null}>
          {d && (
            <>
              <strong>{curta(d.data)}</strong>
              <span>Rendimento {brl(d.rendimento || 0)}</span>
              {taxa(d) != null && <span>{pct3(taxa(d))} sobre {milhoes(aplicadoAntes(d.data), 1)} aplicados</span>}
              <span>Acumulado no mês {brl(acumuladoAte(ativo))}</span>
            </>
          )}
        </Dica>
      </div>
    </Cartao>
  );
}
