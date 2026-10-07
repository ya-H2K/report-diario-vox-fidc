import "dotenv/config";

export const config = {
  planilha: process.env.PLANILHA_PATH ||
    "H:\\3. Gestão\\VOX FIDC\\8.Estudos e levantamentos\\2026\\Fluxo Operacional\\Acompanhamento de Fluxo Operacional - Vox.xlsx",
  // Fluxo de caixa: pasta com a versão final (publicada) de cada mês.
  // O site lê só daqui; o mês é reconhecido pelo nome do arquivo.
  caixaPublicado: process.env.CAIXA_PUBLICADO ||
    "H:\\3. Gestão\\VOX FIDC\\8.Estudos e levantamentos\\CashFlow VOX - Publicado",
  // Onde ficam os arquivos de trabalho do fluxo de caixa (usado só para a cópia inicial).
  caixaTrabalho: process.env.CAIXA_TRABALHO ||
    "H:\\3. Gestão\\VOX FIDC\\8.Estudos e levantamentos\\{ANO}\\CashFlow VOX\\{MES}\\CashFlow Vox - {MES_NOME} {ANO}.xlsx",
  // Meses copiados para a pasta de publicados na primeira vez (só os que ainda não estão lá).
  caixaImportar: process.env.CAIXA_IMPORTAR ?? "2026-07:2026-09",
  // Primeiro mês que aparece no filtro do site.
  caixaDesde: process.env.CAIXA_DESDE || "2026-07",
  porta: Number(process.env.PORTA || 3001),
  // A partir deste horário o dia de hoje é considerado consolidado.
  horaFechamento: process.env.HORA_FECHAMENTO || "19:00",
  // Até esse horário, liquidação sem saída no extrato aparece como "Aguardando";
  // depois, como "Não realizado".
  limiteRpe: process.env.LIMITE_RPE || "14:00",
  // Até esse horário os arquivos da Bauk ainda estão chegando: Processamento Bauk, Baixas e
  // "Sem URFA/Sem endosso" ficam "Aguardando informações" (nunca "Não realizado").
  limiteArquivosBauk: process.env.LIMITE_ARQUIVOS_BAUK || "10:30",
  // Flash Reports + BKs saem da Bauk alguns minutos depois do endosso: até esse horário,
  // sem arquivo processado, o card fica "Aguardando informações" (depois, "Não processado").
  limiteFlash: process.env.LIMITE_FLASH_REPORT || "11:00",
  // A partir deste horário, se faltar liquidação ou baixas conciliadas, o dia fica "Encerrado".
  horaEncerramento: process.env.HORA_ENCERRAMENTO || "18:00",
  limiteEndosso: process.env.LIMITE_LIQUIDACAO_ENDOSSO || "15:00",
  limiteUrfa: process.env.LIMITE_LIQUIDACAO_URFA || "17:00",
  // De quantos em quantos minutos a tela busca dados novos na planilha.
  intervaloAtualizacaoMin: Number(process.env.INTERVALO_ATUALIZACAO_MIN || 10),
  // Mostra a coluna "Responsável" no quadro de observações (true/false).
  mostrarResponsavel: (process.env.MOSTRAR_RESPONSAVEL || "true").toLowerCase() !== "false",
  // ---------------- login ----------------
  // Acesso de administrador (troque a senha antes de colocar o site no ar).
  adminUsuario: process.env.ADMIN_USUARIO || "admin",
  adminSenha: process.env.ADMIN_SENHA || "admin2027",
  // Só e-mails destes domínios podem se cadastrar (domínio exato, depois do @).
  dominiosPermitidos: (process.env.DOMINIOS_PERMITIDOS || "h2kapital.com.br,voxcred.com.br,tendaatacado.com.br")
    .split(",").map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean),
  sessaoHoras: Number(process.env.SESSAO_HORAS || 12),
  sessaoSegredo: process.env.SESSAO_SEGREDO || "",
  // Cookie só por HTTPS (ligue quando o site estiver online com https).
  cookieSeguro: (process.env.COOKIE_SEGURO || "false").toLowerCase() === "true",
  // Para testes: finge que "agora" é esta data/hora (ex.: 2026-09-22T14:30).
  simularAgora: process.env.SIMULAR_AGORA || "",
};

export const agora = () => (config.simularAgora ? new Date(config.simularAgora) : new Date());
