# Bingo Manager

Aplicação web (PWA, pensada primeiro para o celular) para jogar bingo de 75 bolas (B I N G O):

- **Acompanhar cartelas:** cadastre as suas cartelas e marque os números sorteados em todas de uma vez, com 23 modos de vitória e aviso de BINGO.
- **Sorteador:** sorteie as bolas com animação, voz e modo telão (tela cheia) para projetar, e transmita os números para os celulares dos participantes.
- **Gerador de cartelas:** monte cartelas com vários jogos ou jogos avulsos e baixe em PDF para imprimir, com lista de conferência.
- **Cadastro por foto com IA:** tire uma foto da cartela e a IA (Claude, OpenAI, Gemini ou Ollama local, com modelos de reserva) preenche o número e os jogos para você conferir.

Tudo roda no navegador e fica salvo no próprio aparelho. Funciona sem internet depois do primeiro acesso.

## Como funciona

### Tela inicial

- **Minhas cartelas:** o app começa vazio. **Adicionar cartela** (na tela inicial, na tela de novo jogo e dentro da partida) cadastra à mão e salva no aparelho:
  - Nome e número da cartela (pelo menos um dos dois). O número não pode se repetir.
  - Um ou mais **jogos** por cartela (ex.: um por rodada ou por prêmio), cada um com nome livre. **Adicionar jogo** inclui outro, e a lixeira ao lado do nome remove.
  - Com mais de um jogo, os números podem ser os mesmos em todos (como em muitas cartelas impressas) ou diferentes por jogo, com uma aba para cada.
  - Os 24 números podem ser digitados um a um ou todos de uma vez (linha por linha), ou lidos de uma foto (veja **Cadastro por foto com IA**). As colunas B, I, N, G e O são validadas.
  - **Salvar e jogar** já abre o novo jogo com a cartela selecionada; com uma partida em andamento, **Salvar e incluir na partida** coloca os jogos nela na hora, já marcando os números sorteados até ali.
- O nome da cartela pode ser trocado direto no cartão, no botão de lápis ao lado dele.
- **Editar números e jogos** corrige uma cartela (as correções valem também para a partida em andamento) ou a exclui.
- Atalhos para o **Sorteador** (com a quantidade de bolas já sorteadas) e para o **Gerador de cartelas**.
- Partida em andamento (continuar ou finalizar), histórico de partidas finalizadas e backup em arquivo JSON.

### Iniciar jogo

1. Escolha as cartelas e, em cada uma, os jogos que valem nesta partida. O **atalho por jogo** seleciona de uma vez o jogo com o mesmo nome em todas as cartelas (ex.: "Rodada 1").
2. Escolha um ou mais modos de vitória (o espaço livre do centro sempre conta como marcado):
   - **Tradicionais:** Quadra, Quina, Cartela cheia.
   - **Linhas:** Linha vertical, Diagonal, Linha em qualquer direção, Quadra em qualquer direção, Duas linhas, Duas quinas.
   - **Figuras:** Quatro cantos, Selo, Cruz, Letras X, T, L, U, H, N e Z, Moldura, Quadrado do meio, Losango, Pirâmide.
3. Dê um nome à partida (opcional; por padrão usa os nomes dos jogos escolhidos).

### Durante a partida

- No topo fica sempre o campo para digitar o número sorteado (aceita `7`, `07`, `B7` ou `b-07`). O último número aparece em destaque.
- Os jogos aparecem separados por cartela, com o nome da cartela (que também pode ser trocado ali). Todos são marcados automaticamente ao mesmo tempo.
- Quando um modo é completado aparece o aviso **BINGO!** no topo (com som e vibração, que podem ser desligados), e a conquista fica registrada com o número e a posição do sorteio em que aconteceu. O aviso não bloqueia a tela: o campo continua ativo para o próximo número e o aviso some sozinho depois de 3 números (ou no X).
- Quando todos os padrões que valem são fechados, a partida continua aberta: dá para seguir marcando, incluir outros modos (por exemplo, cartela cheia depois da quina) ou finalizar.
- O painel **Falta 1 número** mostra quais números completam algum modo no próximo sorteio.
- Lista dos números sorteados em ordem ou em painel de 1 a 75 (o painel também permite marcar tocando no número). O card pode ser **recolhido**: aí mostra só uma linha com os números, do mais recente para o mais antigo, com rolagem horizontal e altura fixa (volta sozinho para o mais recente a cada número). Por padrão ele aparece expandido, e a escolha fica salva.
- **Visão compacta** (botão na lista de jogos): todos os jogos numa grade bem densa, com cartelas pequenas, números menores, sem a linha B I N G O e com margens mínimas, para ver todos de uma vez. Num celular comum ficam 5 por linha; em telas de 360px ficam 4 por linha. Cada modo vira um selo com quanto falta para fechar (dourado quando já fechou). A página continua rolando quando não cabe tudo, e a escolha fica salva.
  - **Colunas:** com a visão compacta ligada, escolha **Auto** ou uma quantidade fixa de colunas. Com menos colunas os cartões, números e selos crescem. As opções vão até o máximo que mantém os números legíveis na largura da tela (5 num celular comum, 4 em 360px, até 8 em tablet ou computador); se a tela diminuir, o valor salvo é ajustado sozinho.
- Desfazer o último número ou remover qualquer número sorteado; as marcações e conquistas são recalculadas.
- É possível editar os jogos e modos com a partida em andamento.
- A partida continua mesmo depois de completar algum modo, até você decidir finalizá-la. Partidas finalizadas podem ser reabertas pelo histórico.
- Opção para manter a tela do celular ligada durante a partida.

### Sorteador

- **Sortear** tira uma bola do globo, sem repetir, com sorteio uniforme (`crypto.getRandomValues`).
- Animações: **Globo** (os números passam cada vez mais devagar até parar na bola sorteada), **Simples** (a bola balança e revela) ou **Sem animação**, com duração rápida, normal ou lenta. Quem pede menos movimento no sistema recebe o sorteio sem animação.
- Painel com todas as bolas (por letra no bingo de 75), as últimas bolas sorteadas e a contagem de quantas restam.
- **Desfazer** devolve a última bola ao globo; **Reiniciar** (com confirmação) devolve todas.
- **Configurações** (botão de engrenagem):
  - Bolas no globo: 75 (B I N G O), 90 ou outra quantidade de 10 a 99. Só muda com o globo cheio.
  - Mostrar a letra junto do número (no bingo de 75).
  - **Sortear automaticamente** a cada N segundos (de 3 a 120), com barra de tempo e botão para pausar.
  - Anunciar o número por voz (em português, quando o navegador tem voz disponível) e efeitos sonoros.
  - **Marcar também na partida em andamento:** cada bola sorteada entra na partida aberta, e desfazer no sorteador tira a bola da partida. Só no bingo de até 75 bolas.
- **Modo telão:** tela cheia com a bola bem grande, as últimas bolas e o painel, para projetar. Sai pelo botão **Sair do telão** ou pela tecla Esc. Onde o navegador não permite tela cheia (iPhone), o modo telão ocupa a janela inteira mesmo assim.
- Atalhos de teclado: **Espaço** ou **Enter** sorteia, **F** liga e desliga o modo telão.
- O sorteio fica salvo: recarregar a página ou fechar o navegador não perde as bolas já sorteadas.

### Transmissão do sorteio para os celulares

Opcional, para quem sorteia: os participantes recebem cada bola sorteada direto na partida deles, sem digitar.

- **Quem sorteia:** em Configurações do sorteador, marque **Transmitir os números para os celulares dos participantes**. Aparecem o **código do sorteio** (8 letras e números, como `7KQ2-M9XA`), um **QR code** e os botões **Copiar link**, **Compartilhar** e **Parar transmissão**. No modo telão, o QR code e o código ficam num canto da tela, sem cobrir a bola.
- **Quem joga:** lê o QR code com a câmera (o link abre a nova partida já com a recepção ligada) ou, na partida, toca em **Receber do sorteador** (no card de números sorteados) e digita o código. Uma faixa no topo da partida mostra o sorteador e o estado da conexão.
- As bolas chegam como se tivessem sido digitadas: marcação, som, vibração e aviso de BINGO. Quem entra no meio recebe todas as bolas já sorteadas. Números digitados à mão continuam valendo junto com os recebidos.
- **Desfazer** no sorteador tira a bola da partida de quem recebe (só as que vieram da transmissão). **Reiniciar** no sorteador começa um novo sorteio: a partida aberta não muda e a faixa avisa para finalizar e começar outra, que já recebe o sorteio novo. Uma partida nova aberta antes do sorteador reiniciar espera o próximo sorteio, ou recebe o atual em **Usar o sorteio atual**.
- O código é o mesmo nos próximos sorteios (fica salvo no aparelho de quem sorteia), e a transmissão volta sozinha se a página for recarregada.

**Como funciona e o que é preciso:** um site não consegue abrir um servidor (o navegador não deixa nenhuma página escutar conexões, nem instalada como app), então não dá para os celulares se conectarem direto no aparelho do sorteador. Em vez disso, o sorteador publica o estado do sorteio em dois servidores MQTT públicos e gratuitos ao mesmo tempo (EMQX e HiveMQ, por WebSocket seguro), que só repassam a mensagem a quem assinou o mesmo código. Por isso **o sorteador e os participantes precisam de internet** enquanto a transmissão estiver ligada; sem nenhuma rede, os números continuam sendo digitados à mão. Se um dos servidores cair, o outro entrega.

**Segurança:** cada mensagem é assinada pelo aparelho do sorteador (ECDSA P-256), e o código é tirado do resumo (SHA-256) da chave pública dele. Quem recebe confere as duas coisas, então ninguém consegue mandar números falsos usando o código de outra pessoa. Os números sorteados não são segredo: qualquer um com o código consegue acompanhar. A chave do sorteador fica só no aparelho (`bingo-manager:transmissao`), fora do backup.

Arquivos: `src/lib/mqtt.ts` (cliente MQTT 3.1.1 mínimo sobre WebSocket), `src/lib/broadcast.ts` (código, assinatura e regras de aplicação na partida) e `src/lib/useBroadcast.ts` (conexões do transmissor e do receptor).

### Gerador de cartelas em PDF

- **O que gerar:**
  - **Cartelas com vários jogos:** cada cartela tem de 1 a 6 jogos (ex.: um por rodada), com nome para cada jogo. Os números podem ser os mesmos em todos os jogos da cartela ou diferentes.
  - **Jogos avulsos:** cada jogo é uma tabela sozinha, com número próprio, e várias cabem na mesma folha para recortar.
  - Quantidade (até 1000) e numeração inicial. Os números impressos têm sempre o mesmo tamanho (ex.: Nº 0001).
- **Textos:** título, subtítulo e rodapé (ex.: data, local e valor), e linhas para nome e telefone de quem comprou.
- **Números:** espaço livre no centro (opcional) e números de cada coluna em ordem crescente (opcional). Cada coluna usa a sua faixa (B de 1 a 15, I de 16 a 30, N de 31 a 45, G de 46 a 60, O de 61 a 75), e nenhuma tabela se repete no lote.
- **Impressão:** papel A4 ou Carta, quantas cartelas (1, 2 ou 4) ou jogos avulsos (1 a 12) por folha, com linhas tracejadas para recortar, e a cor do cabeçalho.
- **Prévia** da primeira página, com a quantidade de cartelas e de páginas. Se a combinação deixar os números pequenos demais para imprimir (casa com menos de 6 mm), o app avisa.
- **Baixar PDF:** o arquivo é gerado no próprio aparelho (jsPDF), com fontes padrão do PDF, então fica pequeno e abre em qualquer leitor.
- **Lista de conferência (CSV):** uma linha por jogo com todos os números (colunas B1 a O5), para conferir quem ganhou. Abre direto no Excel em português.
- **Outros números** sorteia um novo lote. Mudar textos, nomes ou cor não troca os números, então a prévia, o PDF e a lista são sempre do mesmo lote.
- **Adicionar às minhas cartelas** cadastra as cartelas geradas no app, para acompanhar a partida com elas (cartelas com número já existente são ignoradas).
- A configuração fica salva para a próxima vez.

### Cadastro por foto com IA

- No formulário de cartela, **Tirar ou escolher foto** abre a câmera ou a galeria do celular. A foto vai para o modelo de IA configurado, que devolve o número da cartela, o nome escrito nela (se houver) e todas as tabelas, cada uma com o nome impresso junto dela (prêmio, rodada) e os 25 números.
- O formulário é preenchido com o que foi lido, mas **nada é salvo sem a pessoa conferir**: casas que a IA não conseguiu ler ou que estão fora da faixa da coluna já aparecem marcadas em vermelho, e os avisos da leitura (por exemplo, "casa borrada na linha 1, coluna B") aparecem logo abaixo da foto. Se todas as tabelas tiverem os mesmos números, a opção "Mesmos números em todos os jogos" já vem marcada.

#### Configuração: provedor, modelos e chaves

Na primeira leitura ou em **Preferências e dados > Leitura de cartelas por foto**, a tela **Provedor e credenciais** monta uma **fila de até 6 modelos**: o principal e até 5 reservas.

- **Provedor** de cada modelo: Claude (Anthropic), OpenAI, Gemini (Google) ou Ollama (local). Escolha modelos que leem imagens.
- **Modelo:** a lista é **consultada agora no provedor**, com a chave digitada (700 ms depois de parar de digitar, guardada por 10 minutos). Da OpenAI só entram modelos de conversa, do mais novo para o mais antigo; do Gemini, só os que geram conteúdo. Se a consulta falhar (sem chave, sem internet, chave recusada), aparece o catálogo do app, que pode estar desatualizado. Há sempre **Padrão do provedor** e **Nome customizado**, para digitar qualquer ID.
- **Chave de API** de cada provedor, guardada só neste aparelho. Uma reserva do mesmo provedor de um modelo anterior mostra **Chave já preenchida no modelo N** e usa a mesma chave (assim dá para alternar entre modelos de um provedor digitando a chave uma vez); **Usar outra chave** separa.
- **Ollama:** em vez da chave, o endereço do servidor local (padrão `http://localhost:11434`). Para o navegador conseguir falar com ele, abra o Ollama liberando o site, por exemplo `OLLAMA_ORIGINS=https://ruanps.com.br ollama serve`, e use um modelo com visão (gemma3, qwen2.5vl, llama3.2-vision). O navegador pode pedir permissão para o site acessar a rede local.
- **Trocar o provedor** de um modelo zera o modelo e a chave dele. A lixeira remove uma reserva.
- **Testar modelos** faz uma chamada curta a cada um e mostra "Funcionou" ou a frase do provedor (chave recusada, modelo inexistente, sem conexão).
- **Remover configuração** apaga tudo do aparelho.

#### Fila com reserva

- A leitura começa pelo principal. Se ele falhar, o app tenta o próximo da lista sozinho, e a pessoa só vê o resultado.
- O modelo que falhou **sai da frente por um tempo**, em memória (recarregar a página volta a tentar todos): limite de uso, ocupado ou sem resposta, pelo tempo que o provedor pedir (`retry-after`; 60 s se não disser, no máximo 10 min); modelo inexistente, 30 min; chave recusada, 60 s. Os dois últimos só saem da frente quando há reserva. Ele vai para o fim da fila, não some: se todos os outros falharem, ainda é tentado. A tela de configuração mostra quem está fora da frente e a frase do provedor.
- Todos falhando, a mensagem é a do **modelo principal**, com a frase do provedor (por exemplo, qual modelo saiu do ar).
- Prazos: 90 s por modelo e 3 min para a leitura inteira. Cancelar a leitura não passa para a reserva.
- A resposta é pedida como JSON no texto ("Responda APENAS com o objeto JSON..."), o que funciona igual nos quatro provedores. O app acha o objeto (mesmo dentro de uma cerca de código), confere cada tabela e só então preenche o formulário. JSON malformado é pedido de novo (até 3 vezes); erro de provedor não, porque a fila inteira já foi tentada.

#### Privacidade e detalhes técnicos

- As chaves ficam só neste aparelho, numa entrada separada do `localStorage` (`bingo-manager:ia`): não entram no backup, não são sincronizadas entre abas junto com os dados e só são enviadas ao provedor de cada modelo, junto com a foto, na hora da leitura. Como o app não tem servidor, as chamadas saem direto do navegador. Na memória, a identidade de cada modelo na fila usa só um resumo (SHA-256) da chave.
- A configuração da primeira versão (só Claude, `{apiKey, model}`) vira uma fila com um modelo, sem perder a chave.
- Arquivos: `src/lib/ai/models.ts` (provedores, catálogo, fila e herança de chave, armazenamento), `src/lib/ai/providers.ts` (adaptadores, prazos, classificação de erros, quarentena e fila), `src/lib/ai/modelList.ts` (lista de modelos ao vivo) e `src/lib/ai/scan.ts` (foto e leitura da cartela).
- Claude pelo SDK oficial `@anthropic-ai/sdk`, com esforço `medium` nos modelos do catálogo e o fallback do servidor da Anthropic (`fallbacks: "default"`) ligado. OpenAI (Chat Completions, com `max_completion_tokens`), Gemini (`generateContent`, com a chave no cabeçalho e não na URL) e Ollama (`/api/chat`) por `fetch` direto nas APIs, para não acrescentar mais dois SDKs ao arquivo único do app.
- A foto é aberta já na orientação certa, reduzida para no máximo 2576 px no maior lado e enviada em JPEG.

### Tema escuro

- Em **Preferências e dados**, na tela inicial: **Automático** (segue o tema do celular ou do computador), **Claro** ou **Escuro**.
- Na partida, o botão de sol/lua no topo troca na hora entre claro e escuro.
- O tema salvo é aplicado antes de a página aparecer, sem piscar em claro ao abrir.
- Os testes conferem que todos os textos têm contraste de pelo menos 4,5 (WCAG AA) nos dois temas, inclusive no sorteador, no gerador e na leitura por foto.

### Armazenamento

Tudo (cartelas, partida em andamento, números sorteados, histórico, sorteador, configuração do gerador e preferências) fica salvo no `localStorage` do navegador, na chave `bingo-manager:v1`, e é recuperado sempre que a página é aberta. Abas abertas ao mesmo tempo ficam sincronizadas. Para levar os dados para outro aparelho use **Exportar backup** e **Importar backup**.

Dados salvos pela primeira versão do app (chave `bingo-apae-2026:v1`) são lidos e convertidos automaticamente no primeiro acesso, sem perder cartelas nem histórico.

## Instalar no celular (PWA)

O app pode ser instalado e funciona sem internet depois do primeiro acesso.

- **Android (Chrome):** abra o site e toque em **Instalar** no aviso da tela inicial (ou no menu do Chrome, em Instalar app).
- **iPhone/iPad (Safari):** toque no botão Compartilhar e escolha **Adicionar à Tela de Início**.
- **Computador (Chrome ou Edge):** use o ícone de instalação na barra de endereço.

Arquivos do PWA: `public/manifest.webmanifest`, `public/sw.js` (service worker) e `public/icons/`.

## Publicação no GitHub Pages

A pipeline fica em `.github/workflows/`:

- `testes.yml`: roda em todo pull request, com dois jobs em paralelo. **Tipos, unitários e fluxos** confere formatação, tipos, testes unitários e os testes de ponta a ponta dos fluxos, do sorteador, do gerador, da leitura por foto e da transmissão. **Simulação de 60 partidas** roda a simulação completa.
- `deploy.yml`: roda a cada merge (push) na `main`. Executa só os testes rápidos (a simulação já passou no pull request) e, se tudo passar, gera o build e publica no GitHub Pages.

Para ativar uma única vez: no GitHub, abra **Settings > Pages** e em **Build and deployment > Source** escolha **GitHub Actions**.

## Desenvolvimento

Requisitos: Node.js 20 ou superior.

```bash
npm install
npm run dev          # servidor de desenvolvimento
npm test             # testes unitários (Vitest)
npm run test:e2e     # todos os testes de ponta a ponta (Playwright)
npm run test:e2e:fluxos      # fluxos, ferramentas, leitura por foto e transmissão (rápido)
npm run test:e2e:simulacao   # só a simulação de 60 partidas
npm run typecheck    # tipos do app e dos testes
npm run format       # formata o código (Prettier)
npm run build        # gera dist/
```

Para os testes de ponta a ponta na sua máquina, instale o navegador uma vez com `npx playwright install chromium`. Eles rodam sobre o build de produção: se já houver um servidor aberto na porta 4173, ele é reaproveitado, então gere o build de novo (`npm run build`) depois de mudar o código.

O build gera um único `dist/index.html` com todo o JavaScript e CSS embutidos, mais o manifesto, o service worker e os ícones. O jsPDF, o SDK da Anthropic e o gerador de QR code entram no mesmo arquivo; as dependências opcionais dele (html2canvas, DOMPurify e canvg, usadas só para converter HTML em PDF) são trocadas por um módulo vazio em `vite.config.ts`.

### Testes

- Unitários (`src/**/*.test.ts`): pacotes MQTT, código e assinatura da transmissão (mensagens alteradas ou de outra chave recusadas) e as regras de aplicação na partida, fila de modelos da IA (herança de chave, quarentena por tipo de erro, reserva assumindo, erro do principal quando todos falham, cancelar), classificação e frase dos erros dos provedores, leitura do JSON e repetições, migração e armazenamento da configuração da IA, leitura da resposta da cartela, regras dos modos, validação das grades, estado e migração dos dados antigos, sorteador (sem repetir, sincronizar com a partida, mudar o globo), geração das cartelas (faixas das colunas, lote sem tabelas repetidas, CSV), layout de impressão (tudo dentro da folha em todas as combinações) e o PDF gerado (textos com acento, páginas, compressão).
- `tests/e2e/simulacao.spec.ts`: simula **20 partidas para cada uma de 3 cartelas** usando o campo de número como um usuário. As cartelas são gravadas no armazenamento antes de abrir o app (ele começa vazio). Depois de cada número a mensagem do app e o aviso de BINGO são conferidos, e a cada 10 números (e depois de cada ação especial) a tela inteira é comparada com um oráculo independente (`tests/e2e/oracle.ts`, que reescreve as regras dos 23 modos de outra forma). Passa por: seleção pelo atalho por jogo, por cartela e jogo a jogo; os 23 modos; Enter, botão Marcar e painel 1 a 75; formatos `7`, `07`, `B7`, `b-07`; números inválidos e repetidos; desfazer; remover número (cancelando e confirmando); recarregar a página; sair e continuar; editar modos no meio da partida; renomear cartela; ordenar por proximidade; visão compacta com colunas automáticas e fixas; card de números sorteados recolhido; som e tela ligada; finalizar pela partida e pelo início; histórico; reabrir partida.
- `tests/e2e/fluxos.spec.ts`: cadastro, validação, renomeação, edição e exclusão de cartelas; cartela de um jogo e cartela com números diferentes por jogo, com Salvar e jogar e inclusão na partida em andamento; backup; migração dos dados da primeira versão; botão voltar e endereços inválidos; sincronização entre abas; PWA (manifesto, ícones, service worker, uso offline e convite de instalação, inclusive a dica do iPhone); continuar a partida depois de fechar padrões; visão compacta e escolha de colunas; card de números sorteados recolhido em uma linha; tema escuro (automático, claro e escuro, sem piscar e com contraste conferido); layout em 360px sem rolagem lateral; interface sem emojis, setas ou travessões, inclusive no sorteador e no gerador.
- `tests/e2e/transmissao.spec.ts`: sorteador e participante em navegadores separados, conversando por um servidor MQTT simulado no próprio teste (escrito à parte do cliente do app, a partir da especificação). Confere o pacote de conexão, código, QR code e link, recepção ao entrar no meio, bolas novas, desfazer, número digitado à mão, recarregar a página, novo sorteio, partida nova esperando o sorteio novo e "Usar o sorteio atual", fim da transmissão, parar de receber, link do QR code levando à nova partida, um servidor fora do ar, mensagens falsas (alteradas, de outra chave ou inválidas) ignoradas, o código no canto do telão sem cobrir a bola, contraste no tema escuro e layout em 360px.
- `tests/e2e/ia.spec.ts`: cadastro por foto com os quatro provedores simulados (nenhum teste usa a rede nem uma chave de verdade). Confere a tela da fila (provedores, lista de modelos consultada no provedor e catálogo sem chave, filtros da OpenAI e do Gemini, chave herdada e "Usar outra chave", Ollama com endereço, nome customizado, remover reserva, Testar modelos), o que cada provedor recebe (chave no cabeçalho certo, modelo, imagem em JPEG reduzida para 2576 px, JSON pedido no texto), a reserva assumindo quando o principal bate no limite ou tem a chave recusada, o principal fora da frente na leitura seguinte e na tela, JSON malformado pedido de novo, todos falhando com a mensagem do principal, sem conexão, cancelar sem passar para a reserva, o preenchimento do formulário com casas duvidosas marcadas, a migração da configuração da primeira versão, as chaves fora dos dados do app e do backup, o Esc fechando só a janela de cima e o contraste no tema escuro.
- `tests/e2e/ferramentas.spec.ts`: começo sem cartelas; sorteador (bolas sem repetir pelo botão, Espaço e Enter, desfazer, reiniciar, sorteio salvo ao recarregar, globo de 90 e de outra quantidade até acabar, modo automático com pausa usando relógio controlado, modo telão em tela cheia, atalhos de teclado e marcação na partida em andamento); gerador (PDF aberto e conferido: páginas, título e textos; CSV com os mesmos números do PDF; números que não mudam ao trocar o título; Outros números; adicionar às minhas cartelas sem duplicar; jogos avulsos com colunas em ordem e sem espaço livre; aviso de números pequenos); sorteador, telão e gerador em 360px no tema escuro e no claro, sem rolagem lateral e com contraste conferido.

### Estrutura

```
src/
  data/constants.ts       nome do app e configurações padrão do sorteador e do gerador
  data/modes.ts           modos de vitória (padrões da cartela 5x5)
  lib/bingo.ts            lógica de marcação, progresso e conquistas
  lib/cards.ts            cartelas e jogos da partida
  lib/drawer.ts           sorteio sem repetir, letras e voz do sorteador
  lib/ai/models.ts        provedores de IA, catálogo, fila de modelos e configuração salva no aparelho
  lib/ai/providers.ts     adaptadores (Claude, OpenAI, Gemini, Ollama), prazos, quarentena e fila com reserva
  lib/ai/modelList.ts     lista de modelos consultada no provedor
  lib/ai/scan.ts          foto e leitura da cartela pela IA
  lib/mqtt.ts             cliente MQTT mínimo sobre WebSocket
  lib/broadcast.ts        transmissão do sorteio: código, assinatura e aplicação na partida
  lib/useBroadcast.ts     conexões de quem transmite e de quem recebe
  lib/cardgen.ts          geração das cartelas e lista de conferência (CSV)
  lib/printLayout.ts      layout das folhas em milímetros (usado pelo PDF e pela prévia)
  lib/pdf.ts              desenho do PDF com o jsPDF
  lib/storage.ts          leitura, gravação, migração e backup do localStorage
  lib/usePwaInstall.ts    convite de instalação do PWA
  state.ts                ações e reducer do estado da aplicação
  views/HomeView.tsx      tela inicial
  views/MatchView.tsx     tela da partida
  views/DrawerView.tsx    sorteador e modo telão
  views/GeneratorView.tsx gerador de cartelas em PDF
  components/             grade de bingo, nome da cartela, configuração da partida, editor (com a leitura por foto), configuração da IA, campo numérico, QR code, prévia de impressão, diálogos, ícones
public/                   manifesto, service worker e ícones do PWA
tests/e2e/                testes de ponta a ponta e oráculo
```
