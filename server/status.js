// Regras de status do dia. Cada regra replica a fórmula correspondente do
// "Dashboard Operacional" da planilha. A diferença proposital: enquanto o dia
// está em andamento, tudo que ainda não fechou OK aparece como "aguardando".

export const ROTULOS = {
  ok: "OK",
  parcial: "Parcial",
  nao_realizado: "Não realizado",
  aguardando: "Aguardando informações",
  sem_movimento: "Sem movimento",
};

const soma = (itens, campo) => itens.reduce((t, i) => t + (Number(i[campo]) || 0), 0);
const doDia = (itens, iso) => itens.filter((i) => i.data === iso);
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function st(status, detalhe, extra = {}) {
  return { status, rotulo: extra.rotulo ?? ROTULOS[status], detalhe, ...extra };
}

// Com o dia em andamento, "aguardando" só aparece quando a planilha ainda não tem
// nenhum registro daquele item no dia. Havendo registro, vale o que a planilha diz.
function aplicarAberto(resultado, aberto, temInformacao) {
  if (!aberto || temInformacao || resultado.status === "ok") return { ...resultado, final: resultado.status };
  return { ...resultado, final: resultado.status, status: "aguardando", rotulo: ROTULOS.aguardando };
}

// O que indica que a informação de cada item já chegou na planilha naquele dia.
// URFA e Endosso saem do arquivo da Bauk: se a Visão Geral já tem o dia, "Sem URFA"
// e "Sem endosso" são resultado de verdade, não espera.
function informacaoDoDia(b, iso) {
  const tem = (base) => doDia(base, iso).length > 0;
  const bauk = tem(b.visaoGeral);
  // Liquidação: com operação no dia, só é definitiva quando o extrato confirma a saída
  // (coluna H = Sim). Até lá, com o dia em andamento, fica "Aguardando".
  // Sem operação no dia, "Sem URFA"/"Sem endosso" vale assim que a Bauk do dia chegou.
  const liquidacao = (base) => {
    const linhas = doDia(base, iso);
    const temOperacao = linhas.some((i) => i.operacao !== "");
    return temOperacao ? false : linhas.length > 0 || bauk;
  };
  return {
    // RPE: os arquivos chegam ao longo do dia; até o horário limite (14h), o que não
    // estiver completo fica "Aguardando". Depois, vale o resultado da planilha.
    rpe: false,
    bauk,
    urfa: liquidacao(b.liquidacaoUrfa),
    endosso: liquidacao(b.liquidacaoEndosso),
    baixas: tem(b.baixasBauk),
    arquivosRpe: tem(b.arquivosRpe),
    flash: tem(b.flash),
    represadas: tem(b.represadas) || bauk,
  };
}

// ---------- Extração RPE  ('Extração RPE'!I) ----------
function extracaoRpe(b, iso) {
  const itens = doDia(b.extracaoRpe, iso);
  const recebidos = itens.filter((i) => i.recebido === "Sim").length;
  const faltando = itens.length - recebidos;
  const detalhe = itens.length ? `${recebidos} de ${itens.length} arquivos recebidos` : "Nenhum arquivo registrado";
  let s;
  if (!itens.length || recebidos === 0) s = "nao_realizado";
  else if (faltando === 0) s = "ok";
  else s = "parcial";
  return { ...st(s, detalhe), itens };
}

// ---------- Processamento Bauk  ('Visão Geral Bauk'!K:M) ----------
const PADROES_DEMAIS = ["BX_ENDOSSO_PARCIAL", "BX_ENDOSSO_TOTAL", "BX_URFA_PARCIAL", "BX_URFA_TOTAL", "CB_URFA_"];
// Usa o que a planilha marcou (colunas H/I); se vazio, aplica a mesma regra pelo nome.
const ehEndosso = (i) => i.marcaEndosso ?? (!i.nome.includes("BX_ENDOSSO_") && i.nome.includes("ENDOSSO_") ? 1 : 0);
const ehDemais = (i) => i.marcaDemais ?? (PADROES_DEMAIS.some((p) => i.nome.includes(p)) ? 1 : 0);

function processamentoBauk(b, iso) {
  const itens = doDia(b.visaoGeral, iso);
  const endosso = itens.reduce((t, i) => t + ehEndosso(i), 0);
  const demais = itens.reduce((t, i) => t + ehDemais(i), 0);
  const sEndosso = endosso === 0 ? "nao_realizado" : "ok";
  const sDemais = demais === 0 ? "nao_realizado" : demais <= 3 ? "parcial" : "ok";
  let s;
  if (sEndosso === "ok" && sDemais === "ok") s = "ok";
  else if (sEndosso === "nao_realizado" && sDemais === "nao_realizado") s = "nao_realizado";
  else s = "parcial";
  const detalhe = itens.length
    ? `${plural(itens.length, "arquivo", "arquivos")}, endosso ${endosso ? "recebido" : "pendente"}`
    : "Nenhum arquivo na fila";
  return { ...st(s, detalhe), itens, criterios: { endosso: sEndosso, demais: sDemais, qtdDemais: demais } };
}

// ---------- Liquidação URFA / Endosso  (colunas L:N) ----------
function liquidacao(itensBase, iso, semMovimento) {
  const itens = doDia(itensBase, iso).filter((i) => i.operacao !== "" || i.liquidado);
  const operacoes = itens.filter((i) => i.operacao !== "");
  if (!itens.length) return { ...st("sem_movimento", "Nenhuma operação no dia", { rotulo: semMovimento }), itens };
  const liquidadas = itens.filter((i) => i.liquidado === "Sim").length;
  const pendentes = itens.length - liquidadas;
  let s;
  if (pendentes === 0) s = "ok";
  else if (liquidadas === 0) s = "nao_realizado";
  else s = "parcial";
  const detalhe = operacoes.length
    ? `${plural(operacoes.length, "operação", "operações")}, ${liquidadas} liquidada${liquidadas === 1 ? "" : "s"}`
    : "Registrado sem operação";
  return { ...st(s, detalhe), itens: operacoes };
}

// ---------- Baixas  ('Baixas Bauk'!J:K) ----------
const PADROES_BAIXA = ["ENDOSSO_PARCIAL", "ENDOSSO_TOTAL", "URFA_PARCIAL", "URFA_TOTAL"];

function baixas(b, iso) {
  const itens = doDia(b.baixasBauk, iso);
  const represadas = doDia(b.represadas, iso);
  // Coluna F da planilha (respeita ajustes manuais); se vazia, regra pelo nome.
  const principal = (i) => i.marcaPrincipal ?? (PADROES_BAIXA.some((p) => i.nome.includes(p)) ? 1 : 0);
  const principais = itens.reduce((t, i) => t + principal(i), 0);
  const represada = (i) => represadas.some((r) => (r.nome && r.nome === i.nome) || (r.operacao !== "" && r.operacao === i.codigo));
  const qtdRepresadas = itens.filter(represada).length;
  const s = principais >= 4 ? "ok" : principais > 0 ? "parcial" : "nao_realizado";
  const detalhe = `${principais} de 4 baixas principais` +
    (qtdRepresadas ? `, ${qtdRepresadas} represada${qtdRepresadas === 1 ? "" : "s"}` : `, ${plural(itens.length, "arquivo", "arquivos")}`);
  return {
    ...st(s, detalhe), itens,
    principais,
    qiTech: doDia(b.qiTech, iso),
    represadas,
  };
}

// ---------- Controles ----------
function arquivosRpe(b, iso) {                        // Dashboard!A8
  const itens = doDia(b.arquivosRpe, iso);
  const corretos = soma(itens, "corretos");
  const incorretos = soma(itens, "incorretos");
  if (!itens.length) return { ...st("nao_realizado", "Nenhum arquivo conferido", { rotulo: "Sem arquivos" }), itens };
  if (corretos === 6) return { ...st("ok", "6 de 6 arquivos conferidos", { rotulo: "Corretos" }), itens };
  if (corretos === 0) return { ...st("nao_realizado", "Nenhum arquivo correto", { rotulo: "Incorretos" }), itens };
  return { ...st("parcial", `${corretos} de 6 arquivos corretos`, { rotulo: `${incorretos} incorreto(s)` }), itens };
}

function flashReports(b, iso) {                       // Dashboard!E8
  const itens = doDia(b.flash, iso);
  const ok = itens.some((i) => i.arquivo && i.arquivo !== "NAO ENCONTRADO");
  return ok
    ? { ...st("ok", itens.map((i) => i.arquivo).join(", "), { rotulo: "Processados" }), itens }
    : { ...st("nao_realizado", "Arquivo não encontrado", { rotulo: "Não processado" }), itens };
}

// ---------- Valores (mesmas células do Dashboard do Excel) ----------
function valores(b, iso, aberto) {
  const somaLiq = (itens, filtro) => soma(itens.filter((i) => i.data === iso && filtro(i)), "valor");
  const liquidado = (i) => i.liquidado === "Sim";
  const naoLiquidado = (i) => i.liquidado === "Não";
  const operacao = (i) => i.operacao !== "";
  // Cards "Cessão de URFA" e "Endosso": valor das operações do dia, liquidadas ou não
  // (só a título de informação).
  const cessaoUrfa = somaLiq(b.liquidacaoUrfa, operacao);           // I8
  const endosso = somaLiq(b.liquidacaoEndosso, operacao);           // M8
  // "Liquidação Total": só o que foi de fato liquidado (Liquidado = Sim).
  const liquidacaoTotal = somaLiq(b.liquidacaoUrfa, liquidado) + somaLiq(b.liquidacaoEndosso, liquidado);
  const conc = b.aceitas.find((i) => i.data === iso);
  const conciliadas = conc ? conc.aceitas : null;                   // L11
  return {
    cessaoUrfa,
    endosso,
    baixasProcessadas: soma(doDia(b.baixasBauk, iso), "valor"),     // Q8
    liquidacaoTotal,                                                // F11
    baixasConciliadas: conciliadas ?? (aberto ? null : 0),          // null = aguardando
    liquidacaoPendenteDia:                                          // F14
      somaLiq(b.liquidacaoUrfa, naoLiquidado) + somaLiq(b.liquidacaoEndosso, naoLiquidado),
    baixasRepresadasDia: soma(doDia(b.represadas, iso), "valor"),   // L14
    liquidacaoPendenteAcumulado: b.liquidacaoPendenteAcumulado,     // F17 (P2 manual)
    baixasRepresadasAcumulado: b.represadasAcumulado,               // L17 (J2)
  };
}

// ---------- montagem ----------
export const ETAPAS = [
  { id: "rpe", nome: "Extração RPE", processo: "Extração RPE" },
  { id: "bauk", nome: "Processamento Bauk", processo: "Processamento Bauk" },
  { id: "urfa", nome: "Liquidação URFA", processo: "Liquidação URFA" },
  { id: "endosso", nome: "Liquidação Endosso", processo: "Liquidação Endosso" },
  { id: "baixas", nome: "Baixas", processo: "Baixas" },
];

export function diaAberto(iso, agora, horaFechamento) {
  const hoje = isoLocal(agora);
  if (iso > hoje) return true;
  if (iso < hoje) return false;
  const [h, m] = horaFechamento.split(":").map(Number);
  return agora.getHours() * 60 + agora.getMinutes() < h * 60 + (m || 0);
}

export function isoLocal(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// abertos = { geral, urfa, endosso }: se cada etapa ainda está dentro do seu horário.
// Liquidação tem limite próprio: sem a saída no extrato até o horário (Endosso 15h,
// URFA 17h), deixa de ser "Aguardando" e passa a "Não realizado".
function calcularEtapas(b, iso, abertos) {
  const brutos = {
    rpe: extracaoRpe(b, iso),
    bauk: processamentoBauk(b, iso),
    urfa: liquidacao(b.liquidacaoUrfa, iso, "Sem URFA"),
    endosso: liquidacao(b.liquidacaoEndosso, iso, "Sem endosso"),
    baixas: baixas(b, iso),
  };
  const info = informacaoDoDia(b, iso);
  return Object.fromEntries(Object.entries(brutos).map(([k, v]) =>
    [k, aplicarAberto(v, abertos[k] ?? abertos.geral, info[k])]));
}

// Só o que aparece no painel: status e valores. Nada de nomes de arquivo,
// listas de operações ou observações internas sai do servidor.
const resumo = (id, nome, r) => ({ id, nome, status: r.status, rotulo: r.rotulo });

// Os 6 relatórios RPE esperados todo dia (mesmos nomes da coluna B da Extração RPE).
const TIPOS_RPE = ["Extrato Diario", "Cobrança Diário", "Cadastro Diario", "Movimento Diário",
  "Operação Diário", "Cobrança Recebimento Diário"];

// O que aparece ao clicar no card: só contagens e tipos de relatório, nunca nomes de arquivos.
function detalheDe(id, r) {
  const itens = r.itens || [];
  switch (id) {
    case "rpe": {
      const recebidos = new Set(itens.filter((i) => i.recebido === "Sim").map((i) => i.tipo));
      return { recebidos: TIPOS_RPE.filter((t) => recebidos.has(t)).length, total: TIPOS_RPE.length,
        arquivos: TIPOS_RPE.map((t) => ({ tipo: t, recebido: recebidos.has(t) })),
        faltando: TIPOS_RPE.filter((t) => !recebidos.has(t)) };
    }
    case "bauk":
      return { arquivos: itens.length, tipos: new Set(itens.map((i) => i.tipo).filter(Boolean)).size,
        endosso: r.criterios?.endosso === "ok" };
    case "urfa":
    case "endosso":
      return { total: itens.length, liquidadas: itens.filter((i) => i.liquidado === "Sim").length };
    case "baixas":
      return { principais: r.principais ?? 0, esperadas: 4, arquivos: itens.length };
    default:
      return null;
  }
}

// Igual ao quadro H4:K10 da aba "Quadro de Observações": os 5 processos
// (observação e responsável digitados nas colunas D e E) e a linha de Baixas Represadas
// (colunas E, F e G da aba Baixas Represadas).
function quadroObservacoes(b, iso, aberto, processos, mostrarResponsavel) {
  const obsDia = doDia(b.observacoes, iso);
  const linhas = processos.map((p) => {
    const o = obsDia.find((x) => x.processo === p.nome);
    return { processo: p.nome, status: p.status, rotulo: p.rotulo,
      observacao: o?.observacao || "", responsavel: o?.responsavel || "" };
  });

  const represada = doDia(b.represadas, iso)[0];
  let st;
  if (represada && represada.represada === "Sim") st = { status: "nao_realizado", rotulo: "Sim" };
  else if (!represada && aberto && !informacaoDoDia(b, iso).represadas) st = { status: "aguardando", rotulo: ROTULOS.aguardando };
  else st = { status: "ok", rotulo: "Não" };
  linhas.push({ processo: "Baixas Represadas", ...st,
    observacao: represada?.motivo || "", responsavel: represada?.responsavel || "" });

  return mostrarResponsavel ? linhas : linhas.map(({ responsavel, ...resto }) => resto);
}

// Situação do dia (topo da tela):
//   Concluído    = baixas conciliadas preenchidas e todas as liquidações do dia feitas
//                  (dia sem URFA ou sem endosso conta como resolvido);
//   Em andamento = falta algo e ainda não chegou o horário de encerramento (18h);
//   Encerrado    = chegou o horário e algo ficou pendente (terminou, mas não necessariamente OK).
function situacaoDoDia(b, iso, agora, horaEncerramento) {
  const bauk = doDia(b.visaoGeral, iso).length > 0;
  const pendentes = (base) => doDia(base, iso).filter((i) => i.operacao !== "" && i.liquidado !== "Sim").length;
  const conc = b.aceitas.find((i) => i.data === iso);
  const pendencias = [];
  if (!bauk) pendencias.push("arquivos da Bauk");
  else {
    if (pendentes(b.liquidacaoUrfa)) pendencias.push("liquidação da URFA");
    if (pendentes(b.liquidacaoEndosso)) pendencias.push("liquidação do endosso");
  }
  if (!conc || conc.aceitas == null) pendencias.push("baixas conciliadas");
  if (!pendencias.length) return { estado: "concluido", rotulo: "Concluído", pendencias };
  if (diaAberto(iso, agora, horaEncerramento)) return { estado: "andamento", rotulo: "Em andamento", pendencias };
  return { estado: "encerrado", rotulo: "Encerrado", pendencias };
}

export function montarDia(b, iso, { agora, horaFechamento, horaEncerramento = "18:00", limiteRpe = "14:00",
  limiteEndosso = "15:00", limiteUrfa = "17:00", mostrarResponsavel = true }) {
  const aberto = diaAberto(iso, agora, horaFechamento);
  const etapas = calcularEtapas(b, iso, {
    geral: aberto,
    rpe: aberto && diaAberto(iso, agora, limiteRpe),
    urfa: aberto && diaAberto(iso, agora, limiteUrfa),
    endosso: aberto && diaAberto(iso, agora, limiteEndosso),
  });
  const temDados = Object.values(etapas).some((e) => (e.itens?.length ?? 0) > 0);
  const processos = ETAPAS.map((e) => ({ ...resumo(e.id, e.nome, etapas[e.id]), detalhe: detalheDe(e.id, etapas[e.id]) }));
  const info = informacaoDoDia(b, iso);
  return {
    data: iso,
    aberto,
    horaFechamento,
    temDados,
    processos,
    arquivos: [
      resumo("arquivosRpe", "Informação dos Arquivos", aplicarAberto(arquivosRpe(b, iso), aberto, info.arquivosRpe)),
      resumo("flash", "Flash Reports + BKs", aplicarAberto(flashReports(b, iso), aberto, info.flash)),
    ],
    valores: valores(b, iso, aberto),
    observacoes: quadroObservacoes(b, iso, aberto, processos, mostrarResponsavel),
    situacao: situacaoDoDia(b, iso, agora, horaEncerramento),
  };
}

// Datas que têm algum registro, mais hoje (se for dia útil).
export function datasDisponiveis(b, agora) {
  const set = new Set();
  for (const base of [b.visaoGeral, b.extracaoRpe, b.observacoes, b.baixasBauk]) {
    for (const i of base) if (i.data) set.add(i.data);
  }
  const dow = agora.getDay();
  if (dow !== 0 && dow !== 6) set.add(isoLocal(agora));
  return [...set].sort();
}
