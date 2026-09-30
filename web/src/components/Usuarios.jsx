import { useCallback, useEffect, useMemo, useState } from "react";
import { apiAdmin } from "../api.js";
import { BarraTopo } from "./Cabecalho.jsx";

const SITUACAO = {
  ativo: ["Ativo", "ok"],
  pendente: ["Aguardando aprovação", "aguardando"],
  bloqueado: ["Bloqueado", "nao_realizado"],
};

const dataHora = (iso) => (iso
  ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
  : "—");

// Aba "Usuários": só aparece para o administrador.
export default function Usuarios({ aba, onAba }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [confirmando, setConfirmando] = useState(null);     // id do usuário a excluir
  const [ocupado, setOcupado] = useState(null);

  const carregar = useCallback(async () => {
    try { setDados(await apiAdmin.usuarios()); setErro(""); } catch (e) { setErro(e.message); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const acao = async (id, fn) => {
    setOcupado(id);
    try { await fn(id); setConfirmando(null); await carregar(); window.dispatchEvent(new Event("vox:pendentes")); }
    catch (e) { setErro(e.message); } finally { setOcupado(null); }
  };

  // Solicitações: acessos novos (pendentes) e pedidos de nova senha.
  const solicitacoes = useMemo(() => (dados?.usuarios || [])
    .filter((u) => u.status === "pendente" || u.pediuNovaSenha)
    .map((u) => ({ ...u, tipo: u.status === "pendente" ? "acesso" : "senha", quando: u.status === "pendente" ? u.solicitadoEm : u.novaSenhaEm }))
    .sort((a, b) => String(a.quando).localeCompare(String(b.quando))), [dados]);
  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (dados?.usuarios || []).filter((u) => u.status !== "pendente")
      .filter((u) => !t || u.nome.toLowerCase().includes(t) || u.email.includes(t));
  }, [dados, busca]);
  const conta = (s) => (dados?.usuarios || []).filter((u) => u.status === s).length;

  return (
    <>
      <BarraTopo aba={aba} onAba={onAba} />
      <div className="pagina">
        <div className="cabeca-pagina">
          <div>
            <h1 className="page-title">Usuários</h1>
            <p className="page-sub">Quem tem acesso ao site. Visível só para o administrador.</p>
          </div>
        </div>

        {erro && <div className="aviso" role="alert">{erro}</div>}
        {!dados ? <p className="vazio">Carregando…</p> : (
          <main className="report">
            <div className="grade grade--3">
              <div className="card card--indicador"><span className="card__rotulo">Ativos</span><span className="card__valor">{conta("ativo")}</span></div>
              <div className="card card--indicador"><span className="card__rotulo">Solicitações pendentes</span><span className="card__valor">{solicitacoes.length}</span></div>
              <div className="card card--indicador"><span className="card__rotulo">Bloqueados</span><span className="card__valor">{conta("bloqueado")}</span></div>
            </div>

            <section className={`card card--tabela${solicitacoes.length ? " card--destaque" : ""}`}>
              <div className="card--tabela__topo">
                <h2 className="card__rotulo">Solicitações pendentes</h2>
                <span className="card--tabela__nota">Confira com a pessoa antes de aprovar um pedido que você não reconhece.</span>
              </div>
              {solicitacoes.length === 0 ? <p className="vazio">Nenhuma solicitação esperando aprovação.</p> : (
                <div className="tabela-rolagem">
                  <table className="usuarios">
                    <thead><tr><th>Pedido</th><th>Nome</th><th>E-mail</th><th>CPF</th><th>Enviado em</th><th className="num">Ações</th></tr></thead>
                    <tbody>
                      {solicitacoes.map((u) => (
                        <tr key={`${u.id}-${u.tipo}`}>
                          <td><span className={`carimbo carimbo--${u.tipo === "acesso" ? "aguardando" : "parcial"}`}>{u.tipo === "acesso" ? "Novo acesso" : "Nova senha"}</span></td>
                          <td>{u.nome}</td>
                          <td className="usuarios__email">{u.email}</td>
                          <td className="usuarios__cpf">{u.cpf}</td>
                          <td>{dataHora(u.quando)}</td>
                          <td className="num usuarios__acoes">
                            <button type="button" className="botao-texto" disabled={ocupado === u.id}
                              onClick={() => acao(u.id, u.tipo === "acesso" ? apiAdmin.aprovar : apiAdmin.aprovarSenha)}>Aprovar</button>
                            <button type="button" className="botao-texto botao-texto--perigo" disabled={ocupado === u.id}
                              onClick={() => acao(u.id, u.tipo === "acesso" ? apiAdmin.recusar : apiAdmin.recusarSenha)}>Recusar</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card card--tabela">
              <div className="card--tabela__topo">
                <h2 className="card__rotulo">Cadastrados</h2>
                <input className="usuarios__busca" type="search" placeholder="Buscar por nome ou e-mail"
                  value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar usuário" />
              </div>
              {lista.length === 0 ? (
                <p className="vazio">{busca ? "Nenhum usuário encontrado nessa busca." : "Nenhum acesso aprovado ainda."}</p>
              ) : (
                <div className="tabela-rolagem">
                  <table className="usuarios">
                    <thead>
                      <tr><th>Nome</th><th>E-mail</th><th>CPF</th><th>Situação</th><th>Aprovado em</th><th>Último acesso</th><th className="num">Ações</th></tr>
                    </thead>
                    <tbody>
                      {lista.map((u) => {
                        const [rotulo, cor] = SITUACAO[u.status] || [u.status, ""];
                        return (
                          <tr key={u.id}>
                            <td>{u.nome}</td>
                            <td className="usuarios__email">{u.email}</td>
                            <td className="usuarios__cpf">{u.cpf}</td>
                            <td><span className={`carimbo carimbo--${cor}`}>{rotulo}</span></td>
                            <td>{dataHora(u.aprovadoEm || u.confirmadoEm || u.criadoEm)}</td>
                            <td>{dataHora(u.ultimoAcesso)}</td>
                            <td className="num usuarios__acoes">
                              {confirmando === u.id ? (
                                <>
                                  <span className="usuarios__pergunta">Excluir {u.nome.split(" ")[0]}?</span>
                                  <button type="button" className="botao-texto botao-texto--perigo" disabled={ocupado === u.id}
                                    onClick={() => acao(u.id, apiAdmin.excluir)}>Sim, excluir</button>
                                  <button type="button" className="botao-texto" onClick={() => setConfirmando(null)}>Cancelar</button>
                                </>
                              ) : (
                                <>
                                  {u.status === "ativo" && (
                                    <button type="button" className="botao-texto" disabled={ocupado === u.id} onClick={() => acao(u.id, apiAdmin.bloquear)}>Bloquear</button>
                                  )}
                                  {u.status === "bloqueado" && (
                                    <button type="button" className="botao-texto" disabled={ocupado === u.id} onClick={() => acao(u.id, apiAdmin.desbloquear)}>Desbloquear</button>
                                  )}
                                  <button type="button" className="botao-texto botao-texto--perigo" onClick={() => setConfirmando(u.id)}>Excluir</button>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="usuarios__nota">
                Podem se cadastrar e-mails destes domínios: {dados.dominios.map((d) => `@${d}`).join(", ")}.
                Bloquear ou excluir tira o acesso na hora, mesmo de quem está com o site aberto.
              </p>
            </section>
          </main>
        )}
      </div>
    </>
  );
}
