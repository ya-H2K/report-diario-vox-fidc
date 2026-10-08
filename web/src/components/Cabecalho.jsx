import { useEffect, useState } from "react";
import { ano, diaMes, diaSemana } from "../formato.js";
import { apiAdmin } from "../api.js";
import Ajustes from "./Ajustes.jsx";
import { useSessao } from "../sessao.js";
import { LogoH2, LogoVox } from "./Logos.jsx";

const hhmm = (d) => (d ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(d) : "");

const ABAS = [
  { id: "operacional", nome: "Fluxo Operacional", href: "#/report" },
  { id: "caixa", nome: "Fluxo de Caixa", href: "#/caixa" },
  { id: "relatorios", nome: "Relatórios", href: "#/relatorios", soAdmin: true },
  { id: "usuarios", nome: "Usuários", href: "#/usuarios", soAdmin: true },
];

// Admin: quantas solicitações de acesso/nova senha estão esperando (confere a cada minuto).
function usePendentes(ativo) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!ativo) return;
    const conferir = () => apiAdmin.pendentes().then((r) => setN(r.pendentes)).catch(() => {});
    conferir();
    const t = setInterval(conferir, 60 * 1000);
    window.addEventListener("vox:pendentes", conferir);
    return () => { clearInterval(t); window.removeEventListener("vox:pendentes", conferir); };
  }, [ativo]);
  return n;
}

// Barra superior: marca, abas do site e, à direita, a navegação da aba aberta.
// No início (home) as abas não aparecem no topo: ficam em destaque no meio da página.
export function BarraTopo({ aba, onAba, children, semAbas = false }) {
  const { usuario } = useSessao();
  const abas = ABAS.filter((a) => !a.soAdmin || usuario?.admin);
  const pendentes = usePendentes(usuario?.admin);
  return (
    <header className="topbar">
      <div className="topbar__esquerda">
        <a className="marca" href="#/" title="Ir para o início"
          onClick={(e) => { e.preventDefault(); onAba("home"); }}>
          <LogoH2 />
          <span className="brand">Vox FIDC</span>
        </a>
        {!semAbas && <nav className="abas" aria-label="Telas do site">
          {abas.map((a) => (
            <a key={a.id} href={a.href}
              className={`aba${aba === a.id ? " aba--ativa" : ""}`}
              aria-current={aba === a.id ? "page" : undefined}
              onClick={(e) => { e.preventDefault(); onAba(a.id); }}>
              {a.nome}
              {a.id === "usuarios" && pendentes > 0 && <span className="aba__contador" title="Solicitações pendentes">{pendentes}</span>}
            </a>
          ))}
        </nav>}
      </div>
      <div className="topbar__direita">
        {children}
        <Ajustes />
        <span className="topbar__parceiro" title="Vox"><LogoVox /></span>
      </div>
    </header>
  );
}

// Texto discreto de atualização + botão "Atualizar agora" (usado nas duas abas).
export function Sincronia({ ultima, proxima, atualizando, falhou, onAtualizar }) {
  if (!ultima && !atualizando && !falhou) return null;
  let info = null;
  if (atualizando) info = "Atualizando…";
  else if (falhou) info = "Não foi possível atualizar. Tentando de novo em instantes.";
  else info = <>Atualizado às {hhmm(ultima)}.<span className="sync__proxima"> Próxima às {hhmm(proxima)}.</span></>;
  return (
    <div className="sync" aria-live="polite">
      <span className={`sync__info${falhou ? " sync__info--falha" : ""}`}>{info}</span>
      <button type="button" className="sync__botao" onClick={onAtualizar} disabled={atualizando}>
        <span className={`sync__icone${atualizando ? " sync__icone--girando" : ""}`} aria-hidden="true">↻</span>
        Atualizar agora
      </button>
    </div>
  );
}

// Título, data e, à direita, o estado do dia com a atualização discreta embaixo.
export function CabecaPagina({ dia, selecionada, ultima, proxima, atualizando, falhou, onAtualizar }) {
  if (!selecionada) return null;
  return (
    <div className="cabeca-pagina">
      <div>
        <h1 className="page-title">Report Operacional</h1>
        <p className="page-sub">{diaSemana(selecionada)}, {diaMes(selecionada)} de {ano(selecionada)}</p>
      </div>
      <div className="cabeca-pagina__direita">
        {dia?.situacao && (
          <span className={`estado estado--${dia.situacao.estado}`}
            title={dia.situacao.pendencias.length ? `Pendente: ${dia.situacao.pendencias.join(", ")}` : "Liquidações e baixas conciliadas concluídas"}>
            <span className="ponto" aria-hidden="true" />
            {dia.situacao.rotulo}
          </span>
        )}
        {dia?.situacao?.estado === "encerrado" && (
          <span className="estado__pendencias">Pendente: {dia.situacao.pendencias.join(", ")}</span>
        )}
        <Sincronia ultima={ultima} proxima={proxima} atualizando={atualizando} falhou={falhou} onAtualizar={onAtualizar} />
      </div>
    </div>
  );
}
