# Dashboard do fluxo operacional (Vox FIDC)

> **Agora o site roda online** (GitHub Pages + Supabase): veja a seção *Site online* e o
> arquivo `PASSO-A-PASSO-SITE-ONLINE.md`. As seções *Como rodar no seu computador*, *Login*
> e *API* descrevem o servidor antigo (localhost), que o site não usa mais.

Painel web que lê a planilha **Acompanhamento de Fluxo Operacional - Vox.xlsx**
(a mesma que a automação em Python preenche) e mostra, dia a dia, o status das
etapas: Extração RPE, Processamento Bauk, Liquidação URFA, Liquidação Endosso e
Baixas, além dos controles, valores e observações.

## Como rodar no seu computador

Requisito: [Node.js](https://nodejs.org) 20 ou mais novo.

**Jeito mais fácil (Windows):** dê dois cliques em `iniciar-dashboard.bat`. Ele cria o `.env`,
instala as bibliotecas na primeira vez, inicia tudo e abre o navegador.

Ou, pelo terminal:

```bash
npm install
copy .env.example .env      # no Windows (no Mac/Linux: cp .env.example .env)
npm run dev
```

Abra **http://localhost:5173**. A tela abre sempre no dia de hoje e busca dados novos
sozinha a cada 10 minutos. No canto superior direito aparece quando foi a última busca,
a próxima e o botão **Atualizar agora**, que faz o servidor reler a planilha na hora.

**Atualização automática.** A cada minuto a tela confere, de forma leve (só a data do
arquivo), se a planilha foi salva de novo. Quando a automação em Python termina de gravar,
por exemplo marcando "Sim" numa liquidação, a tela se atualiza sozinha em até 1 minuto.

**Planilha aberta:** o dashboard consegue ler a planilha mesmo com ela aberta no Excel,
mas enxerga só o que foi **salvo**. A automação em Python, por outro lado, precisa da
planilha fechada para gravar.

Para rodar como seria em produção (um único servidor, porta 3001):

```bash
npm run build
npm start
```

e abra **http://localhost:3001**.

## Site online (GitHub Pages + Supabase)

O site fica em **https://ya-h2k.github.io/report-diario-vox-fidc/** e não depende do PC
ligado para abrir. O passo a passo da primeira configuração está em
`PASSO-A-PASSO-SITE-ONLINE.md`.

```
Planilha no PC ──> publicador (iniciar-publicador.bat) ──> Supabase ──> site no GitHub Pages
```

- **Publicador** (`publicador/`): roda no PC, confere a cada minuto se a planilha ou a pasta
  de publicados do caixa mudaram e, se mudaram, envia **só os status e valores** que o site
  mostra (as mesmas regras de `server/status.js`). Nomes de arquivo, caminhos e observações
  internas nunca saem do PC. Com o PC desligado o site continua no ar, com os últimos dados.
- **Status por horário**: para o dia de hoje o publicador manda um cenário para cada horário
  de corte (14h, 15h, 17h, 18h, 19h) e a tela escolhe o cenário pelo relógio (horário de
  Brasília). Assim "Aguardando" vira "Não realizado" na hora certa, mesmo sem novo envio.
- **Supabase**: guarda os dados (tabela `painel`), as planilhas do caixa (bucket privado
  `caixa`) e os logins. Tudo passa pelas funções `vox_*` de `supabase/configurar.sql`, que
  só entregam dados a quem tem cadastro aprovado e sessão válida.
- **Site**: a mesma interface React, compilada pelo GitHub Actions
  (`.github/workflows/pages.yml`, copiado de `publicador/github-pages.yml` pelo
  `configurar-online.bat`) a cada `git push`. Só usa a chave **publishable**
  (`web/src/config-publica.js`); a chave **secret** fica só no `.env` do PC.

Arquivos `.bat`:

| Arquivo | Para que serve |
|---|---|
| `configurar-online.bat` | Primeira configuração: chaves, admin, primeiro envio e envio do site ao GitHub. |
| `iniciar-publicador.bat` | Liga o publicador (deixe a janela aberta, pode minimizar). |
| `ligar-publicador-com-o-windows.bat` | Faz o publicador ligar sozinho quando você entra no Windows. |
| `enviar-site-github.bat` | Manda mudanças no código do site para o GitHub (republica em 1 a 3 min). |

Comandos úteis: `node publicador/publicar.js --uma-vez` (publica agora) e `--tudo`
(reenvia tudo, mesmo o que não mudou).

### Login no site online

Funciona como antes (pedir acesso, aprovação do admin, esqueci minha senha com aprovação,
bloquear/excluir na hora), com estas diferenças:

- O admin entra com **e-mail** (`ADMIN_EMAIL`) e a senha `ADMIN_SENHA` do `.env`.
  Para trocar a senha do admin: mude `ADMIN_SENHA` e rode `configurar-online.bat` de novo.
- Os cadastros do site antigo (`server/dados/usuarios.json`) não passam para o online:
  as pessoas pedem acesso de novo.
- Limite de tentativas de login: o do próprio Supabase (por endereço de internet), no lugar
  do "5 tentativas / 15 min".
- Domínios permitidos: tabela `dominios_permitidos` no Supabase (Table Editor).

## Servidor antigo (server/index.js)

O site não usa mais o servidor Node nem o túnel do Cloudflare. `server/planilha.js`,
`server/status.js`, `server/caixa.js` e `server/config.js` continuam sendo usados pelo
publicador. `npm run dev` abre a interface em http://localhost:5173 já lendo do Supabase
(útil para testar mudanças na tela antes de mandar para o GitHub).

## Configuração (.env)

| Variável | Para que serve |
|---|---|
| `PLANILHA_PATH` | Caminho da planilha. |
| `CAIXA_PUBLICADO` | Pasta com a versão final (publicada) do fluxo de caixa de cada mês. Criada sozinha se não existir. |
| `CAIXA_IMPORTAR` | Meses copiados para a pasta de publicados na primeira vez (padrão `2026-07:2026-09`). |
| `CAIXA_TRABALHO` | Onde ficam os arquivos de trabalho de cada mês, com `{ANO}`, `{MES}` e `{MES_NOME}` (usado só na cópia inicial). |
| `CAIXA_DESDE` | Primeiro mês que aparece no filtro (padrão `2026-07`). |
| `PORTA` | Porta do servidor (padrão 3001). |
| `HORA_ENCERRAMENTO` | A partir deste horário, com liquidação ou baixas conciliadas pendentes, o dia fica "Encerrado" (padrão 18:00). |
| `LIMITE_RPE` | Até que horas arquivos RPE faltando aparecem como "Aguardando" (padrão 14:00). |
| `LIMITE_LIQUIDACAO_ENDOSSO` / `LIMITE_LIQUIDACAO_URFA` | Até que horas uma liquidação sem saída no extrato aparece como "Aguardando" (padrão 15:00 e 17:00). |
| `HORA_FECHAMENTO` | Horário a partir do qual o dia de hoje é considerado consolidado (padrão 19:00). |
| `INTERVALO_ATUALIZACAO_MIN` | De quantos em quantos minutos a tela busca dados novos (padrão 10). |
| `MOSTRAR_RESPONSAVEL` | `true` mostra a coluna Responsável no quadro de observações; `false` esconde (e ela nem sai do servidor). |
| `SIMULAR_AGORA` | Só para testes, ex.: `2026-09-22T14:30`. Faz o sistema agir como se fosse esse momento. |

## O que o painel mostra

Exatamente o conteúdo do **Dashboard Operacional** da planilha, na mesma ordem:

- Processos: Extração RPE, Processamento Bauk, Liquidação URFA, Liquidação Endosso, Baixas.
- Arquivos e valores: Informação dos Arquivos, Flash Reports + BKs, Cessão de URFA, Endosso, Baixas Processadas.
- Consolidação: Liquidação Total, Pendente Dia e Pendente Acumulado; Baixas Conciliadas, Represadas Dia e Represadas Acumulado.

- Quadro de observações: igual ao quadro H4:K10 da aba **Quadro de Observações**.
  Os 5 processos com o status, a observação e o responsável digitados nas colunas D e E,
  e a linha de Baixas Represadas (colunas E, F e G da aba Baixas Represadas).
  Para esconder a coluna Responsável, use `MOSTRAR_RESPONSAVEL=false` no `.env`.

Os acumulados vêm das mesmas células do Excel, preenchidas à mão:
`Liquidação URFA!P2` + `Liquidação Endosso!P2` e `Baixas Represadas!J2`.

O servidor envia para a tela **somente** esses status e valores. Nomes de arquivo,
listas de operações, observações internas e caminhos de pastas não saem do servidor,
então o cliente não os vê nem abrindo o endereço da API. Erros detalhados aparecem
só na janela do servidor.

## Login

Todo o site exige login (os dados, a API e o download da planilha).

- **Admin:** usuário e senha de `ADMIN_USUARIO` / `ADMIN_SENHA` no `.env` (padrão `admin` /
  `admin2027`; o servidor avisa enquanto for a senha padrão). Só o admin vê a aba **Usuários**.
- **Pedir acesso:** a pessoa informa nome completo, e-mail, CPF e cria a senha (mínimo 8
  caracteres, 1 número e 1 caractere especial). Só e-mails dos domínios de `DOMINIOS_PERMITIDOS`
  (domínio exato). O pedido aparece em **Usuários → Solicitações pendentes**, com Aprovar e
  Recusar; enquanto não for aprovado, a pessoa não entra.
- **Esqueci minha senha:** a pessoa informa o e-mail e uma nova senha; o pedido aparece nas
  solicitações como "Nova senha" e só vale depois de aprovado (até lá, a senha antiga continua).
- **Como não há confirmação por e-mail, a aprovação do admin é a verificação:** confira com a
  pessoa antes de aprovar um pedido que você não reconhece.
- **Admin também pode** bloquear, desbloquear e excluir. Bloquear ou excluir tira o acesso na
  hora, mesmo de quem está com o site aberto.
- **Segurança:** senhas guardadas com hash (ninguém consegue lê-las); CPF mascarado na lista;
  5 tentativas erradas seguidas travam o login por 15 minutos; sessão de 12 horas (`SESSAO_HORAS`).
- **Onde ficam os dados:** `server/dados/`. Essa pasta nunca vai para o GitHub; faça cópia de
  segurança dela quando o site estiver no ar.

## Situação do dia (topo da aba operacional)

- **Concluído** (verde): baixas conciliadas preenchidas e todas as liquidações do dia feitas
  (dia sem URFA ou sem endosso conta como resolvido).
- **Em andamento** (âmbar, piscando): falta algum desses pontos e ainda não deu 18h.
- **Encerrado** (vermelho): deu 18h (`HORA_ENCERRAMENTO`) e algo ficou pendente; o dia terminou,
  mas não necessariamente OK. Logo abaixo aparece o que ficou pendente.

## Detalhes, quadro de observações e aparência

- **Cards de processo (1ª linha)**: clicando, o card mostra o detalhe do dia, só com
  quantidades (nunca nomes de arquivos): RPE "x de 6 arquivos recebidos" (e quais tipos
  faltam), Bauk "x arquivos gerados", URFA/Endosso "x de y liquidados (com sucesso)",
  Baixas "x de 4 baixas principais". Um card aberto por vez.
- **Quadro de observações**: mostra só os processos com apontamento (observação digitada
  na planilha). **Baixas Represadas aparece sempre**. Sem apontamentos, aparece "Nenhum
  apontamento nos processos do dia".
- **Aparência**: a engrenagem na barra superior abre os Ajustes: Escuro (padrão), Claro
  ou Sistema (segue o computador). Fica salvo no navegador de cada pessoa.

## Aba "Fluxo de caixa"

Mostra o conteúdo da sheet **Dashboard** do fluxo de caixa:

- os 4 indicadores como uma conta (Caixa inicial + Entradas − Saídas = Caixa total
  fechamento), com uma legenda curta embaixo de cada valor;
- a tabela de movimentação diária;
- dois gráficos: a variação do caixa (saldo caixa total, dia a dia) e entradas x saídas
  por dia. Passando o mouse (ou o dedo) aparece o valor de cada dia.

**Dia selecionado.** Clicando numa data da tabela, ou num dia de qualquer gráfico, a conta
de cima passa a mostrar o movimento daquele dia (saldo do dia anterior + entradas e
rendimento − saídas = saldo do dia; a conta fecha em todos os dias), a linha fica destacada
e os três gráficos marcam o dia. Clicar de novo, em "Mês inteiro" ou apertar Esc volta ao mês.
A barra acima da conta mostra o que está sendo exibido e o enquadramento do dia (ou do
último dia do mês).

**Enquadramento.** A coluna da tabela ganha cor por faixa: verde a partir de 75%, amarelo de
72% a 75%, vermelho de 67% a 72% e vermelho forte abaixo de 67% (limite: abaixo disso o fundo
desenquadra). O gráfico de enquadramento mostra a variação no mês, com o eixo começando no
limite de 67%.

As sheets de cada dia (01.09, 02.09…) não aparecem na tela.

**Pasta de publicados.** O site lê **somente** a pasta `CAIXA_PUBLICADO`. Na primeira vez
que o servidor liga, ele cria essa pasta e copia para ela os meses de `CAIXA_IMPORTAR`
(padrão: julho a setembro de 2026), buscando nas pastas de trabalho (`CAIXA_TRABALHO`).
Um arquivo já publicado nunca é substituído por essa cópia automática.

**Rotina.** No fim do dia, salve na pasta de publicados a versão final do mês,
substituindo a anterior. Durante o dia, nada do arquivo de trabalho aparece no site. O
mês vem do nome do arquivo ("CashFlow Vox - Setembro 2026.xlsx", "CashFlow Vox - Julho -
2026.xlsx" etc.). Temporários do Excel (`~$`) e arquivos sem mês no nome são ignorados.

**Atualização.** Essa aba não tem botão de atualizar: a tela confere sozinha, em
silêncio, se entrou uma versão nova ou um mês novo na pasta, e mostra a data da
publicação ao lado do botão "Baixar planilha".

**Filtro de meses.** Lista os meses publicados a partir de `CAIXA_DESDE` (padrão
2026-07). Mês fechado é lido uma vez e fica guardado.

**Leitura robusta.** As colunas são achadas pelo nome do cabeçalho, não pela posição.
O Caixa total fechamento é o saldo da última linha da tabela (em alguns meses a célula
J4 usa `XLOOKUP(TODAY())`, que vira erro se o arquivo for salvo depois do fim do mês).

## Como os status são calculados

As regras em `server/status.js` replicam as fórmulas do Dashboard Operacional
(validadas contra o histórico: 294 de 295 status iguais aos calculados pelo Excel).
A diferença proposital:

- **Dia em andamento** (hoje, antes de `HORA_FECHAMENTO`): o que já está OK aparece
  como OK; o resto aparece como **Aguardando informações**.
- **Dia consolidado**: o status final, igual ao da planilha.
- **Extração RPE**: até as 14h (`LIMITE_RPE`), enquanto faltar algum dos 6 arquivos, o card
  mostra "Aguardando informações". Depois das 14h vale a planilha: "Parcial" se chegou parte,
  "Não realizado" se não chegou nenhum. Com os 6 arquivos, OK a qualquer hora.
- **Liquidação URFA e Endosso**: com operação no dia, o card só fica OK quando a coluna H
  ("Liquidado") estiver "Sim". A automação em Python marca "Sim" quando acha a saída do
  valor no extrato do Vox (API Singulare). Até lá, com o dia em andamento, o card mostra
  "Aguardando informações" até o horário limite: **15h para o Endosso** e **17h para a
  URFA** (`LIMITE_LIQUIDACAO_ENDOSSO` e `LIMITE_LIQUIDACAO_URFA` no `.env`). Passado o
  horário sem a saída, fica "Não realizado". Se a saída aparecer depois, vira OK.

O servidor usa os valores que o Excel deixou calculados no arquivo (não recalcula
fórmulas), então a planilha precisa ter sido salva pelo Excel, como a automação faz.

## Estrutura

```
server/
  index.js      API (Express) e entrega da interface compilada
  planilha.js   leitura da planilha, com cache enquanto o arquivo não muda
  status.js     regras de status e valores
  config.js     variáveis do .env
web/
  index.html
  src/          interface em React
```

## API

- `GET /api/inicio`: datas disponíveis e o dia sugerido para abrir.
- `GET /api/dia/AAAA-MM-DD`: status e valores do dia.
- `GET /api/caixa/meses`: meses publicados.
- `GET /api/caixa/AAAA-MM`: indicadores e tabela diária do dashboard do mês.
- `GET /api/caixa/AAAA-MM/arquivo`: download do arquivo publicado do mês.
