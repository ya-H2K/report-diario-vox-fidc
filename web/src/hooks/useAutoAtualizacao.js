import { useCallback, useEffect, useRef, useState } from "react";

// Busca dados de tempos em tempos (padrão 30 min), com "Atualizar agora".
// buscar(forcar) deve lançar erro se falhar. chave = o que está selecionado (ex.: o mês);
// quando muda, busca na hora.
export function useAutoAtualizacao(buscar, { chave, intervaloMs, temDados }) {
  const [ultima, setUltima] = useState(null);
  const [atualizando, setAtualizando] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [ciclo, setCiclo] = useState(0);

  const buscarRef = useRef(buscar);
  buscarRef.current = buscar;
  const temRef = useRef(temDados);
  temRef.current = temDados;
  const falhouRef = useRef(false);
  falhouRef.current = falhou;
  const ocupado = useRef(false);

  const executar = useCallback(async (forcar = false) => {
    if (ocupado.current && !forcar) return;
    ocupado.current = true;
    setAtualizando(true);
    try {
      await buscarRef.current(forcar);
      setFalhou(false);
      setUltima(new Date());
    } catch {
      setFalhou(true);
    } finally {
      ocupado.current = false;
      setAtualizando(false);
      setCiclo((c) => c + 1);
    }
  }, []);

  // mudou a seleção: busca na hora
  useEffect(() => { if (chave != null) executar(); }, [chave, executar]);

  // agenda a próxima: no intervalo; sem dados ainda ou com falha, tenta antes
  useEffect(() => {
    if (chave == null) return;
    const espera = !temRef.current ? 3000 : falhouRef.current ? Math.min(60000, intervaloMs) : intervaloMs;
    const t = setTimeout(() => executar(), espera);
    return () => clearTimeout(t);
  }, [ciclo, chave, intervaloMs, executar]);

  const proxima = ultima ? new Date(ultima.getTime() + intervaloMs) : null;

  // computador dormiu ou a aba ficou em segundo plano: ao voltar, se passou da hora, busca
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === "visible" && proxima && Date.now() >= proxima.getTime()) executar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, [proxima, executar]);

  return { ultima, proxima, atualizando, falhou, atualizarAgora: () => executar(true) };
}
