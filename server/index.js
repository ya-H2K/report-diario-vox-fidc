import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { config, agora } from "./config.js";
import { obterBases } from "./planilha.js";
import { montarDia, datasDisponiveis, isoLocal } from "./status.js";
import { obterCaixa, listarPublicados, prepararPublicados } from "./caixa.js";
import { rotasAuth, rotasAdmin, exigirLogin, exigirAdmin, avisosDeSeguranca } from "./auth.js";

const app = express();
app.disable("x-powered-by");
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// ---------- login: tudo em /api exige estar logado, menos as rotas de login ----------
app.use("/api/auth", rotasAuth);
app.use("/api/admin", exigirAdmin, rotasAdmin);
app.use("/api", exigirLogin);

async function contexto(forcar = false) {
  const leitura = await obterBases(config.planilha, { forcar });
  if (leitura.erro) console.warn(`[aviso] ${leitura.erro}`);
  const now = agora();
  return {
    leitura,
    opcoes: { agora: now, horaFechamento: config.horaFechamento, horaEncerramento: config.horaEncerramento,
      limiteRpe: config.limiteRpe,
      limiteEndosso: config.limiteEndosso,
      limiteUrfa: config.limiteUrfa, limiteArquivosBauk: config.limiteArquivosBauk,
      limiteFlash: config.limiteFlash, mostrarResponsavel: config.mostrarResponsavel },
    // Só o necessário para a tela: nada de caminhos de arquivo ou horários internos.
    meta: { hoje: isoLocal(now), intervaloAtualizacaoMin: config.intervaloAtualizacaoMin,
      mostrarResponsavel: config.mostrarResponsavel },
  };
}

// Erros detalhados ficam só na janela do servidor; a tela recebe uma mensagem genérica.
const rota = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ erro: e.message });
    console.error(`[erro] ${e.message}`);
    res.status(503).json({ erro: "Os dados estão indisponíveis no momento. Tente novamente em instantes." });
  }
};

// Verificação leve (só a data do arquivo, sem ler a planilha): a tela usa para
// se atualizar sozinha logo depois que a automação salva a planilha.
app.get("/api/versao", async (req, res) => {
  try {
    const { mtimeMs } = await fs.promises.stat(config.planilha);
    res.json({ versao: mtimeMs });
  } catch {
    res.status(503).json({ versao: null });
  }
});

app.get("/api/inicio", rota(async () => {
  const { leitura, meta } = await contexto();
  const datas = datasDisponiveis(leitura.bases, agora());
  return { meta, datas, sugerida: datas.includes(meta.hoje) ? meta.hoje : datas.at(-1) };
}));

app.get("/api/dia/:data", rota(async (req) => {
  if (!ISO.test(req.params.data)) throw Object.assign(new Error("Data inválida. Use AAAA-MM-DD."), { status: 400 });
  const { leitura, opcoes, meta } = await contexto(req.query.atualizar === "1");
  return { meta, dia: montarDia(leitura.bases, req.params.data, opcoes) };
}));

// ---------- Fluxo de caixa (só versões publicadas) ----------
const MES = /^(\d{4})-(\d{2})$/;

async function publicadoDoMes(id) {
  if (!MES.test(id)) throw Object.assign(new Error("Mês inválido. Use AAAA-MM."), { status: 400 });
  const publicado = (await listarPublicados(config.caixaPublicado, config.caixaDesde)).find((m) => m.id === id);
  if (!publicado) throw Object.assign(new Error("Não há fluxo de caixa publicado para este mês."), { status: 404 });
  return publicado;
}

const semCaminho = ({ caminho, mtimeMs, ...resto }) => ({ ...resto, publicadoEm: new Date(mtimeMs).toISOString() });

app.get("/api/caixa/meses", rota(async () => {
  const hoje = agora();
  const meses = (await listarPublicados(config.caixaPublicado, config.caixaDesde)).map(semCaminho);
  const atual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  return {
    meta: { intervaloAtualizacaoMin: config.intervaloAtualizacaoMin },
    meses,
    sugerido: meses.some((m) => m.id === atual) ? atual : meses.at(-1)?.id ?? null,
  };
}));

app.get("/api/caixa/:mes", rota(async (req) => {
  const publicado = await publicadoDoMes(req.params.mes);
  const dados = await obterCaixa(publicado.caminho, { forcar: req.query.atualizar === "1" });
  return { meta: { intervaloAtualizacaoMin: config.intervaloAtualizacaoMin }, mes: publicado.id,
    arquivo: semCaminho(publicado), caixa: dados };
}));

// Download do arquivo publicado do mês (o arquivo completo, como vai para os clientes).
// O caminho vem sempre da listagem da pasta de publicação, nunca do pedido.
app.get("/api/caixa/:mes/arquivo", async (req, res) => {
  try {
    const publicado = await publicadoDoMes(req.params.mes);
    res.download(publicado.caminho, publicado.nome);
  } catch (e) {
    if (!e.status) console.error(`[erro] ${e.message}`);
    res.status(e.status || 503).json({ erro: e.status ? e.message : "Arquivo indisponível no momento." });
  }
});

// Em produção (npm run build + npm start), serve a interface já compilada.
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => (req.path.startsWith("/api") ? next() : res.sendFile(path.join(dist, "index.html"))));
}

app.listen(config.porta, () => {
  avisosDeSeguranca();
  console.log(`Dashboard: http://localhost:${config.porta}`);
  console.log(`Planilha:  ${config.planilha}`);
  if (config.simularAgora) console.log(`Simulando agora = ${config.simularAgora}`);
  // Fluxo de caixa: garante a pasta de publicados e a cópia inicial dos meses.
  prepararPublicados({ pasta: config.caixaPublicado, modeloTrabalho: config.caixaTrabalho, importar: config.caixaImportar })
    .then((copiados) => {
      console.log(`Fluxo de caixa publicado em: ${config.caixaPublicado}`);
      if (copiados.length) console.log(`  Cópia inicial: ${copiados.join(", ")}`);
    })
    .catch((e) => console.error(`[erro] Pasta de publicados do fluxo de caixa: ${e.message}`));
  // Já lê a planilha ao ligar, para a primeira abertura da tela ser rápida.
  const t = Date.now();
  obterBases(config.planilha)
    .then(() => console.log(`Planilha carregada em ${((Date.now() - t) / 1000).toFixed(1)} s. Pronto.`))
    .catch((e) => console.error(`[erro] ${e.message}`));
});
