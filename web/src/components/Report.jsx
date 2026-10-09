import { useState } from "react";
import Carimbo from "./Carimbo.jsx";
import { brl } from "../formato.js";

// Mesmo conteúdo e mesma ordem do "Dashboard Operacional" da planilha.

function CardStatus({ item }) {
  return (
    <div className="card">
      <span className="card__rotulo">{item.nome}</span>
      <Carimbo status={item.status}>{item.rotulo}</Carimbo>
    </div>
  );
}

const plural = (n, um, varios) => (n === 1 ? um : varios);

// O que aparece dentro do card ao clicar: quantidades, sem nomes de arquivos.
function Detalhe({ id, d }) {
  if (!d) return null;
  if (id === "rpe") {
    return (
      <>
        <div className="det__quadros" aria-hidden="true">
          {d.arquivos.map((a) => <i key={a.tipo} className={a.recebido ? "on" : "falta"} title={a.tipo} />)}
        </div>
        <span className="det__principal"><b>{d.recebidos} de {d.total}</b> arquivos recebidos</span>
        {d.faltando.length > 0 && <span className="det__nota">Faltam: {d.faltando.join(", ")}</span>}
      </>
    );
  }
  if (id === "bauk") {
    return (
      <>
        <span className="det__principal"><b>{d.arquivos}</b> {plural(d.arquivos, "arquivo gerado", "arquivos gerados")} pela Bauk</span>
        {d.arquivos > 0 && (
          <span className="det__nota">
            {d.tipos} {plural(d.tipos, "tipo de arquivo", "tipos de arquivo")}{d.endosso ? " · endosso recebido" : ""}
          </span>
        )}
      </>
    );
  }
  if (id === "urfa" || id === "endosso") {
    const nome = id === "urfa" ? ["URFA", "URFAs"] : ["endosso", "endossos"];
    if (!d.total) {
      return <span className="det__principal">{id === "urfa" ? "Nenhuma cessão de URFA no dia" : "Nenhum endosso no dia"}</span>;
    }
    const todas = d.liquidadas === d.total;
    const feminino = id === "urfa";
    // concorda com o total: "0 de 1 endosso liquidado", "1 de 2 URFAs liquidadas"
    const liquidada = feminino ? plural(d.total, "liquidada", "liquidadas") : plural(d.total, "liquidado", "liquidados");
    return (
      <>
        <span className="det__principal">
          <b>{d.liquidadas} de {d.total}</b> {plural(d.total, nome[0], nome[1])} {liquidada}{todas ? " com sucesso" : ""}
        </span>
        <div className="det__barra" aria-hidden="true"><i style={{ width: `${(d.liquidadas / d.total) * 100}%` }} /></div>
        {d.fases && (d.fases.aprovacao > 0 || d.fases.liquidacao > 0) && (
          <span className="det__nota">
            Na Bauk: {[d.fases.aprovacao && `${d.fases.aprovacao} aguardando aprovações`,
              d.fases.liquidacao && `${d.fases.liquidacao} aguardando liquidação`].filter(Boolean).join(" · ")}
          </span>
        )}
      </>
    );
  }
  if (id === "baixas") {
    return (
      <>
        <span className="det__principal"><b>{d.principais} de {d.esperadas}</b> baixas principais</span>
        <span className="det__nota">{d.arquivos} {plural(d.arquivos, "arquivo", "arquivos")} de baixa no dia</span>
      </>
    );
  }
  return null;
}

// Hora em que a etapa ficou OK, discreta, no fim do detalhe (só aparece com o card aberto).
const PALAVRA_HORA = { rpe: "completo às", bauk: "arquivos às", urfa: "liquidada às", endosso: "liquidado às", baixas: "concluídas às" };
function HoraEtapa({ id, d }) {
  if (d?.concluidoAs) return <span className="det__hora">{PALAVRA_HORA[id] || "concluído às"} <b>{d.concluidoAs}</b></span>;
  if (id === "rpe" && d?.primeiroAs) return <span className="det__hora">1º arquivo às <b>{d.primeiroAs}</b></span>;
  return null;
}

// Card de processo (1ª linha): clicável, abre o detalhe dentro do próprio card.
function CardProcesso({ item, aberto, onClicar }) {
  return (
    <button type="button" className={`card card--processo${aberto ? " card--aberto" : ""}`}
      aria-expanded={aberto} onClick={onClicar}>
      <span className="card__rotulo">{item.nome}</span>
      <Carimbo status={item.status}>{item.rotulo}</Carimbo>
      {aberto && <div className="det"><Detalhe id={item.id} d={item.detalhe} /><HoraEtapa id={item.id} d={item.detalhe} /></div>}
    </button>
  );
}

function CardValor({ rotulo, valor }) {
  return (
    <div className="card">
      <span className="card__rotulo">{rotulo}</span>
      <span className="card__valor">{brl(valor)}</span>
    </div>
  );
}

function CardResumo({ rotulo, valor, aguardando, linhas }) {
  return (
    <div className="card card--resumo">
      <span className="card__rotulo">{rotulo}</span>
      {aguardando
        ? <span className="card__valor card__valor--grande card__valor--aguardando">Aguardando...</span>
        : <span className="card__valor card__valor--grande">{brl(valor)}</span>}
      <dl className="card__linhas">
        {linhas.map(([nome, v]) => (
          <div key={nome}>
            <dt>{nome}</dt>
            <dd>{brl(v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// Igual ao quadro da aba "Quadro de Observações" da planilha.
function QuadroObservacoes({ linhas: todas, mostrarResponsavel }) {
  // Só os processos com apontamento; Baixas Represadas aparece sempre.
  const represadas = todas.find((l) => l.processo === "Baixas Represadas");
  const apontamentos = todas.filter((l) => l.processo !== "Baixas Represadas" && l.observacao);
  const linhas = [...apontamentos, ...(represadas ? [{ ...represadas,
    observacao: represadas.observacao || (represadas.rotulo === "Não" ? "Nenhuma baixa represada" : ""),
    semApontamento: !represadas.observacao }] : [])];
  return (
    <section className="card card--quadro" aria-labelledby="titulo-quadro">
      <h2 id="titulo-quadro" className="card__rotulo">Quadro de observações</h2>
      <table className="quadro-obs">
        <thead>
          <tr>
            <th scope="col">Processo</th>
            <th scope="col">Status</th>
            <th scope="col">Observação</th>
            {mostrarResponsavel && <th scope="col">Responsável</th>}
          </tr>
        </thead>
        <tbody>
          {apontamentos.length === 0 && (
            <tr className="quadro-obs__vazio">
              <td colSpan={mostrarResponsavel ? 4 : 3}>Nenhum apontamento nos processos do dia.</td>
            </tr>
          )}
          {linhas.map((l) => (
            <tr key={l.processo} className={l.observacao && !l.semApontamento ? "com-obs" : undefined}>
              <th scope="row">{l.processo}</th>
              <td data-rotulo="Status"><Carimbo status={l.status}>{l.rotulo}</Carimbo></td>
              <td data-rotulo="Observação" className={l.observacao ? undefined : "vazio-cel"}>{l.observacao || "—"}</td>
              {mostrarResponsavel && (
                <td data-rotulo="Responsável" className={l.responsavel ? undefined : "vazio-cel"}>{l.responsavel || "—"}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function Report({ dia, mostrarResponsavel = true }) {
  const v = dia.valores;
  const [aberto, setAberto] = useState(null);
  const [diaAberto, setDiaAberto] = useState(dia.data);
  if (diaAberto !== dia.data) { setDiaAberto(dia.data); setAberto(null); }
  return (
    <main className="report">
      <section aria-label="Processos">
        <div className="grade grade--5">
          {dia.processos.map((p) => (
            <CardProcesso key={p.id} item={p} aberto={aberto === p.id}
              onClicar={() => setAberto((a) => (a === p.id ? null : p.id))} />
          ))}
        </div>
      </section>

      <section aria-label="Arquivos e valores">
        <div className="grade grade--5">
          {dia.arquivos.map((a) => <CardStatus key={a.id} item={a} />)}
          <CardValor rotulo="Cessão de URFA" valor={v.cessaoUrfa} />
          <CardValor rotulo="Endosso" valor={v.endosso} />
          <CardValor rotulo="Baixas Processadas" valor={v.baixasProcessadas} />
        </div>
      </section>

      <section aria-label="Consolidação">
        <div className="grade grade--2">
          <CardResumo rotulo="Liquidação Total" valor={v.liquidacaoTotal}
            linhas={[["Liquidação Pendente Dia", v.liquidacaoPendenteDia],
                     ["Liquidação Pendente Acumulado", v.liquidacaoPendenteAcumulado]]} />
          <CardResumo rotulo="Baixas Conciliadas" valor={v.baixasConciliadas}
            aguardando={v.baixasConciliadas === null}
            linhas={[["Baixas Represadas Dia", v.baixasRepresadasDia],
                     ["Baixas Represadas Acumulado", v.baixasRepresadasAcumulado]]} />
        </div>
      </section>

      {dia.observacoes && <QuadroObservacoes linhas={dia.observacoes} mostrarResponsavel={mostrarResponsavel} />}
    </main>
  );
}
