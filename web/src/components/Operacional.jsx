import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { BarraTopo, CabecaPagina } from "./Cabecalho.jsx";
import Report from "./Report.jsx";
import Horarios from "./Horarios.jsx";
import { useSessao } from "../sessao.js";

// Aba "Fluxo operacional": a mesma tela de antes, agora como uma das abas do site.
export default function Operacional({ aba, onAba }) {
  const { usuario } = useSessao();
  const admin = Boolean(usuario?.admin);
  const [vista, setVista] = useState("resumo");           // resumo | horarios (aba Horários: só o admin)
  const [datas, setDatas] = useState([]);
  const [meta, setMeta] = useState(null);
  const [hoje, setHoje] = useState(null);                // dia sugerido pelo servidor (hoje, ou o último útil)
  const [selecionada, setSelecionada] = useState(null);
  const [dia, setDia] = useState(null);
  const [conexao, setConexao] = useState("conectando"); // conectando | ok | instavel

  // Controle da atualização automática
  const [ultima, setUltima] = useState(null);           // quando os dados foram buscados pela última vez
  const [atualizando, setAtualizando] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [ciclo, setCiclo] = useState(0);                 // muda a cada busca, para reagendar a próxima

  const seguirHoje = useRef(true);                       // em "hoje", acompanha a virada do dia
  const selecionadaRef = useRef(null);
  selecionadaRef.current = selecionada;
  const temDiaRef = useRef(false);
  temDiaRef.current = Boolean(dia);
  const falhouRef = useRef(false);
  falhouRef.current = falhou;

  const intervaloMs = (meta?.intervaloAtualizacaoMin || 10) * 60 * 1000;
  const proxima = ultima ? new Date(ultima.getTime() + intervaloMs) : null;

  // Abertura: sempre no dia de hoje. Se o servidor ainda estiver ligando, tenta de novo sozinho.
  useEffect(() => {
    let vivo = true;
    let timer;
    const tentar = async (n = 0) => {
      try {
        const ini = await api.inicio();
        if (!vivo) return;
        setDatas(ini.datas);
        setMeta(ini.meta);
        setHoje(ini.sugerida);
        setSelecionada((s) => s ?? ini.sugerida);
        setConexao("ok");
      } catch {
        if (!vivo) return;
        setConexao("conectando");
        timer = setTimeout(() => tentar(n + 1), Math.min(1500 * (n + 1), 8000));
      }
    };
    tentar();
    return () => { vivo = false; clearTimeout(timer); };
  }, []);

  // Busca os dados do dia. forcar = true pede ao servidor para reler a planilha na hora.
  const carregar = useCallback(async (iso, forcar = false) => {
    if (!iso) return;
    setAtualizando(true);
    try {
      const d = await api.dia(iso, forcar);             // primeiro o dia (faz a releitura, se forçada)
      const ini = await api.inicio();
      setDatas(ini.datas);
      setMeta(d.meta);
      setHoje(ini.sugerida);
      setConexao("ok");
      setFalhou(false);
      setUltima(new Date());
      // Passou da meia-noite com a tela aberta em "hoje": vai para o novo dia.
      if (seguirHoje.current && ini.sugerida !== iso) { setSelecionada(ini.sugerida); return; }
      if (selecionadaRef.current === iso) setDia(d.dia);
    } catch {
      setFalhou(true);                                   // mantém na tela o que já estava
      setConexao((c) => (c === "conectando" ? c : "instavel"));
    } finally {
      setAtualizando(false);
      setCiclo((c) => c + 1);
    }
  }, []);

  // Trocou de dia: busca na hora.
  useEffect(() => { carregar(selecionada); }, [selecionada, carregar]);

  // A cada minuto confere se a planilha foi salva de novo (ex.: a automação acabou de
  // gravar "Sim" na liquidação). Se foi, atualiza a tela na hora, sem esperar os 10 min.
  const versaoRef = useRef(null);
  useEffect(() => {
    const conferir = async () => {
      try {
        const { versao } = await api.versao();
        if (versao == null) return;
        if (versaoRef.current != null && versao !== versaoRef.current && selecionadaRef.current) {
          carregar(selecionadaRef.current, true);
        }
        versaoRef.current = versao;
      } catch { /* servidor indisponível: tenta no próximo minuto */ }
    };
    conferir();
    const t = setInterval(conferir, 60 * 1000);
    return () => clearInterval(t);
  }, [carregar]);

  // Agenda a próxima busca: a cada 10 min; se ainda não carregou nada ou falhou, tenta antes.
  useEffect(() => {
    if (!selecionada) return;
    const espera = !temDiaRef.current ? 3000 : falhouRef.current ? Math.min(60000, intervaloMs) : intervaloMs;
    const t = setTimeout(() => carregar(selecionadaRef.current), espera);
    return () => clearTimeout(t);
  }, [ciclo, selecionada, intervaloMs, carregar]);

  // Computador dormiu ou a aba ficou em segundo plano: ao voltar, se já passou da hora, busca.
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === "visible" && proxima && Date.now() >= proxima.getTime()) {
        carregar(selecionadaRef.current);
      }
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, [proxima, carregar]);

  const atualizarAgora = useCallback(() => carregar(selecionadaRef.current, true), [carregar]);

  const irPara = useCallback((iso) => {
    if (!iso) return;
    seguirHoje.current = iso === hoje;
    setSelecionada(iso);
  }, [hoje]);

  const indice = datas.indexOf(selecionada);
  const anterior = indice > 0 ? datas[indice - 1] : null;
  const proximo = indice >= 0 && indice < datas.length - 1 ? datas[indice + 1] : null;

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest("input, select, textarea, button")) return;
      if (e.key === "ArrowLeft" && anterior) irPara(anterior);
      if (e.key === "ArrowRight" && proximo) irPara(proximo);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anterior, proximo, irPara]);

  const diaAtual = dia && dia.data === selecionada ? dia : null;

  return (
    <>
      <BarraTopo aba={aba} onAba={onAba}>
        <nav className="navegacao" aria-label="Escolher dia">
          <button type="button" className="btn-icone" onClick={() => irPara(anterior)} disabled={!anterior}
            aria-label="Dia anterior">‹</button>
          <input type="date" value={selecionada || ""} min={datas[0]} max={datas.at(-1)}
            onChange={(e) => e.target.value && irPara(e.target.value)} aria-label="Data do movimento" />
          <button type="button" className="btn-icone" onClick={() => irPara(proximo)} disabled={!proximo}
            aria-label="Próximo dia">›</button>
          <button type="button" className="button button--pequeno" onClick={() => irPara(hoje)}
            disabled={!hoje || selecionada === hoje}>Hoje</button>
        </nav>
      </BarraTopo>
      <div className="pagina">
        <CabecaPagina dia={diaAtual} selecionada={selecionada} ultima={ultima} proxima={proxima}
          atualizando={atualizando} falhou={falhou} onAtualizar={atualizarAgora} />
        {!diaAtual ? (
          <p className="vazio" role="status">
            {conexao === "conectando" ? "Conectando ao servidor e carregando o dia de hoje…" : "Carregando…"}
          </p>
        ) : !diaAtual.temDados && !diaAtual.aberto ? (
          <p className="vazio">Sem movimento registrado neste dia.</p>
        ) : (
          <>
            {admin && (
              <nav className="abas-report" aria-label="Visão do report">
                {[["resumo", "Resumo"], ["horarios", "Horários"]].map(([id, nome]) => (
                  <button key={id} type="button" className={vista === id ? "on" : undefined}
                    aria-pressed={vista === id} onClick={() => setVista(id)}>{nome}</button>
                ))}
              </nav>
            )}
            {admin && vista === "horarios"
              ? <Horarios dia={diaAtual} />
              : <Report dia={diaAtual} mostrarResponsavel={meta?.mostrarResponsavel !== false} />}
          </>
        )}
      </div>
    </>
  );
}
