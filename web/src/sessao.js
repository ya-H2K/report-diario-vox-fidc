import { createContext, useContext } from "react";

// Quem está logado e como sair; qualquer componente pode ler.
export const SessaoContexto = createContext({ usuario: null, sair: () => {} });
export const useSessao = () => useContext(SessaoContexto);
