import { useEffect, useRef, useState } from "react";
import { escolherTema, temaEscolhido } from "../tema.js";
import { useSessao } from "../sessao.js";

const OPCOES = [
  ["escuro", "Escuro"],
  ["claro", "Claro"],
  ["sistema", "Sistema"],
];

// Engrenagem discreta na barra superior; abre um painel pequeno de ajustes.
export default function Ajustes() {
  const { usuario, sair } = useSessao();
  const [aberto, setAberto] = useState(false);
  const [tema, setTema] = useState(temaEscolhido());
  const ref = useRef(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    const esc = (e) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto]);

  const escolher = (t) => { setTema(t); escolherTema(t); };

  return (
    <div className="ajustes" ref={ref}>
      {usuario && <span className="ajustes__nome" title={usuario.email || usuario.nome}>{String(usuario.nome).split(" ")[0]}</span>}
      <button type="button" className={`ajustes__botao${aberto ? " ajustes__botao--aberto" : ""}`}
        onClick={() => setAberto((a) => !a)} aria-expanded={aberto} aria-haspopup="dialog" aria-label="Ajustes">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      </button>
      {aberto && (
        <div className="ajustes__painel" role="dialog" aria-label="Ajustes">
          <h2 className="ajustes__titulo">Ajustes</h2>
          {usuario && (
            <div className="ajustes__conta">
              <div>
                <div className="ajustes__conta-nome">{usuario.nome}</div>
                <div className="ajustes__conta-email">{usuario.admin ? "Administrador" : usuario.email}</div>
              </div>
              <button type="button" className="botao-texto" onClick={sair}>Sair</button>
            </div>
          )}
          <div className="ajustes__rotulo" id="rotulo-aparencia">Aparência</div>
          <div className="ajustes__opcoes" role="radiogroup" aria-labelledby="rotulo-aparencia">
            {OPCOES.map(([id, nome]) => (
              <button key={id} type="button" role="radio" aria-checked={tema === id}
                className={`ajustes__opcao${tema === id ? " ajustes__opcao--on" : ""}`} onClick={() => escolher(id)}>
                {nome}
              </button>
            ))}
          </div>
          <p className="ajustes__nota">Salvo neste navegador. "Sistema" segue o modo claro/escuro do seu computador.</p>
        </div>
      )}
    </div>
  );
}
