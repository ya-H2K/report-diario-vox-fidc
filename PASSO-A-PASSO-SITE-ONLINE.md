# Passo a passo: colocar o dashboard online

Tempo total: uns 20 minutos. Faça na ordem e não pule nenhuma parte.

Os nomes dos botões do Supabase e do GitHub estão em inglês, do jeito que aparecem na tela.
Se algum nome estiver um pouco diferente, procure o mais parecido.

---

## Parte 1: criar a conta e o projeto no Supabase (5 min)

1. Abra **https://supabase.com** e clique em **Start your project**.
2. Clique em **Continue with GitHub** e entre com a mesma conta do GitHub do projeto.
3. Clique em **New project**.
   - **Name:** `vox-dashboard`
   - **Database Password:** clique em **Generate a password**, copie a senha e guarde num lugar seguro.
     Você quase nunca vai usar essa senha, mas guarde.
   - **Region:** escolha **South America (São Paulo)**.
   - Clique em **Create new project**.
4. Espere 1 a 2 minutos, até a tela parar de mostrar "Setting up project".

## Parte 2: preparar o banco (2 min)

1. No menu da esquerda do Supabase, clique em **SQL Editor** (o ícone parece um terminal `>_`).
2. Clique em **New query** (ou no **+**).
3. No seu PC, abra a pasta `dashboard-fluxo-vox`, depois a pasta `supabase`.
   Clique com o botão direito em `configurar.sql` → **Abrir com** → **Bloco de Notas**.
4. No Bloco de Notas: aperte **Ctrl+A** (seleciona tudo) e **Ctrl+C** (copia).
5. Volte ao Supabase, clique na área grande de texto e aperte **Ctrl+V** (cola).
6. Clique em **Run** (canto de baixo, à direita).
   - Se aparecer um aviso falando em "destructive operation", clique em **Run this query**.
     O aviso aparece porque o arquivo pode ser rodado de novo sem estragar nada.
7. Embaixo deve aparecer: **Pronto! Banco do dashboard Vox configurado.** ✅

## Parte 3: desligar a confirmação por e-mail (1 min)

O site não manda e-mails: quem libera o acesso é o admin. Por isso:

1. No menu da esquerda, clique em **Authentication**.
2. Clique em **Sign In / Providers** (ou **Providers**) e depois em **Email**.
3. **Desligue** a opção **Confirm email**.
4. Se tiver o campo **Minimum password length**, coloque **8**.
5. Clique em **Save**.

> Se esquecer esta parte, quem tentar pedir acesso vai ver a mensagem
> "Configuração pendente no Supabase: desligue a opção Confirm email".

## Parte 4: pegar as 3 informações do Supabase (2 min)

Deixe esta página aberta, porque você vai copiar daqui na Parte 6.

1. No menu da esquerda, clique na **engrenagem** (**Project Settings**).
2. Clique em **API Keys**. Você vai ver:
   - **Publishable key**: começa com `sb_publishable_...` (pode ser vista por qualquer um, é normal).
   - **Secret keys**: começa com `sb_secret_...`. Se aparecer escondida, clique no **olho**
     para mostrar. Se não tiver nenhuma, clique em **New secret key** e dê o nome `publicador`.
     ⚠️ **Essa chave é como uma senha mestra: nunca mande para ninguém nem cole em outro lugar.**
3. Para achar a **Project URL** (algo como `https://abcdefgh.supabase.co`): em **Project Settings**,
   clique em **Data API** (ou volte à página inicial do projeto e clique em **Connect**).

## Parte 5: avisar o GitHub que o site é publicado pelo "Actions" (1 min)

1. Abra **https://github.com/ya-H2K/report-diario-vox-fidc/settings/pages**
2. Em **Build and deployment** → **Source**, escolha **GitHub Actions**.
3. Pronto, não precisa salvar nada (muda na hora).

## Parte 6: rodar o configurador no seu PC (5 min)

1. Abra a pasta `dashboard-fluxo-vox` e dê **dois cliques** em **`configurar-online.bat`**.
2. Vai abrir uma janela preta. Ela instala o que precisa (espere) e depois faz perguntas.
   Para colar na janela preta: **clique com o botão direito** dentro dela (ou aperte Ctrl+V)
   e depois aperte **Enter**.
   - **Project URL:** cole a URL da Parte 4.
   - **Chave PUBLISHABLE:** cole a `sb_publishable_...`.
   - **Chave SECRET:** cole a `sb_secret_...`.
   - **E-mail do ADMIN:** o e-mail que você vai usar para entrar no site (tem que ser
     @h2kapital.com.br, @voxcred.com.br ou @tendaatacado.com.br).
   - **Senha do admin:** crie uma senha nova (8 ou mais caracteres, com 1 número e 1 símbolo
     como `!` ou `@`). **Anote essa senha.**
3. Ele vai mostrar vários **[OK]**. No final, ele manda o site para o GitHub.
   - Se abrir uma janela pedindo login do GitHub, faça o login.
4. Quando aparecer **"Pronto. Pode fechar esta janela"**, aperte qualquer tecla.

> Se aparecer **[ERRO]**, leia a mensagem: ela diz exatamente o que faltou (por exemplo,
> "faltou rodar o configurar.sql"). Corrija e dê dois cliques no `configurar-online.bat` de novo.
> Ele lembra do que você já preencheu: é só apertar **Enter** para manter.

## Parte 7: ligar o publicador (1 min)

O publicador é quem manda os dados da planilha para o site sempre que ela é salva.

1. Dê **dois cliques** em **`iniciar-publicador.bat`**. Vai abrir uma janela preta escrito
   "Publicador ligado". **Deixe essa janela aberta** (pode minimizar).
2. Para ele ligar sozinho toda vez que você entrar no Windows, dê **dois cliques** em
   **`ligar-publicador-com-o-windows.bat`** (só precisa fazer isso uma vez).

> Com o PC desligado, o site **continua no ar**, mostrando os últimos dados enviados.
> Quando o PC ligar de novo, o publicador manda o que mudou.

## Parte 8: testar 🎉

1. Espere uns 3 minutos depois da Parte 6 (é o tempo do GitHub montar o site).
   Para acompanhar: **https://github.com/ya-H2K/report-diario-vox-fidc/actions**.
   Bolinha amarela = montando; ✅ verde = pronto.
2. Abra **https://ya-h2k.github.io/report-diario-vox-fidc/**
3. Entre com o **e-mail e a senha do admin** da Parte 6.
4. Confira o fluxo operacional, o fluxo de caixa (inclusive o botão **Baixar planilha**) e a aba **Usuários**.

Esse endereço não muda nunca. Pode mandar para as pessoas.

---

## Dia a dia

- **Nada muda na sua rotina:** a automação em Python salva a planilha, e em até 1 minuto o
  publicador manda para o site. As telas abertas se atualizam sozinhas.
- **Fluxo de caixa:** continua igual: salve a versão final do mês na pasta de publicados.
- **Novos usuários:** a pessoa clica em "Solicitar acesso" no site, e você aprova na aba **Usuários**.
  (Os cadastros do site antigo não vieram junto: quem já tinha acesso precisa pedir de novo.)

## Se algo der errado

| O que aconteceu | O que fazer |
|---|---|
| Site mostra dados velhos | Veja se a janela do publicador está aberta e sem **[aviso]**. Se não estiver aberta, dê dois cliques em `iniciar-publicador.bat`. |
| "Ainda não há dados publicados" | O publicador ainda não mandou nada. Abra o `iniciar-publicador.bat` e confira se o caminho da planilha (`PLANILHA_PATH` no `.env`) está certo. |
| Site não abre (erro 404) | Confira a Parte 5 e se a última execução em **Actions** está ✅. |
| Esqueceu a senha do admin | Abra o `.env` no Bloco de Notas, troque a linha `ADMIN_SENHA=` e rode o `configurar-online.bat` de novo. |
| Mudou algo no código do site | Dê dois cliques em `enviar-site-github.bat`. |

**Nunca** mande para ninguém o arquivo `.env` nem a chave `sb_secret_...`.
Se achar que ela vazou: Supabase → Project Settings → API Keys → apague a chave e crie
outra, e rode o `configurar-online.bat` de novo com a chave nova.
