# Bingo Manager: Show de Prêmios APAE 2026

Aplicação web (PWA, pensada primeiro para o celular) para acompanhar, durante o sorteio, as cartelas do **Show de Prêmios 2026 da APAE de Santa Rita do Sapucaí** (08/11/2026, Ginásio da APAE).

Ainda não é uma plataforma genérica: as cartelas, os prêmios e as regras foram modelados especificamente para este bingo.

## Como funciona

### Tela inicial

- Lista das cartelas disponíveis, cada uma separada e identificada por um **nome** (Bruna, Kátia e Ruan já vêm cadastradas, com os números conferidos nas fotos). O nome pode ser trocado direto no cartão, no botão de lápis ao lado dele.
- Cada cartela tem 5 jogos, um para cada prêmio/rodada:
  1. Bicicleta Aro 26
  2. Smartphone
  3. R$ 1.500,00
  4. Smart TV 43"
  5. Moto 0 km
- **Adicionar cartela ou jogo avulso** (na tela inicial, na tela de novo jogo e dentro da partida) cadastra à mão e salva no aparelho:
  - **Cartela do Show:** os 5 jogos dos prêmios, com os mesmos números (como na cartela impressa) ou números diferentes por jogo.
  - **Jogo avulso:** um ou mais jogos com nome livre (ex.: binguinho), cada um com seus números.
  - Os 24 números podem ser digitados um a um ou todos de uma vez (linha por linha). As colunas B, I, N, G e O são validadas.
  - **Salvar e jogar** já abre o novo jogo com a cartela selecionada; com uma partida em andamento, **Salvar e incluir na partida** coloca os jogos nela na hora, já marcando os números sorteados até ali.
- **Editar números e jogos** corrige uma cartela (as correções valem também para a partida em andamento) ou a exclui.
- Partida em andamento (continuar ou finalizar), histórico de partidas finalizadas e backup em arquivo JSON.

### Iniciar jogo

1. Escolha as cartelas e, em cada uma, os jogos (prêmios) que valem nesta partida. O atalho **Nª rodada** seleciona o mesmo jogo em todas as cartelas de uma vez.
2. Escolha um ou mais modos de vitória (o espaço livre do centro sempre conta como marcado):
   - **Tradicionais:** Quadra, Quina, Cartela cheia.
   - **Linhas:** Linha vertical, Diagonal, Linha em qualquer direção, Quadra em qualquer direção, Duas linhas, Duas quinas.
   - **Figuras:** Quatro cantos, Selo, Cruz, Letras X, T, L, U, H, N e Z, Moldura, Quadrado do meio, Losango, Pirâmide.
3. Dê um nome à partida (opcional; por padrão usa o nome da rodada).

### Durante a partida

- No topo fica sempre o campo para digitar o número sorteado (aceita `7`, `07`, `B7` ou `b-07`). O último número aparece em destaque.
- Os jogos aparecem separados por cartela, com o nome da cartela (que também pode ser trocado ali). Todos são marcados automaticamente ao mesmo tempo.
- Quando um modo é completado aparece o aviso **BINGO!** no topo (com som e vibração, que podem ser desligados), e a conquista fica registrada com o número e a posição do sorteio em que aconteceu. O aviso não bloqueia a tela: o campo continua ativo para o próximo número e o aviso some sozinho depois de 3 números (ou no X).
- Quando todos os padrões que valem são fechados, a partida continua aberta: dá para seguir marcando, incluir outros modos (por exemplo, cartela cheia depois da quina) ou finalizar.
- O painel **Falta 1 número** mostra quais números completam algum modo no próximo sorteio.
- Lista dos números sorteados em ordem ou em painel de 1 a 75 (o painel também permite marcar tocando no número).
- **Visão compacta** (botão na lista de jogos): todos os jogos numa grade bem densa, com cartelas pequenas, números menores, sem a linha B I N G O e com margens mínimas, para ver todos de uma vez. Num celular comum ficam 5 por linha e os 15 jogos das 3 cartelas cabem numa tela; em telas de 360px ficam 4 por linha. Cada modo vira um selo com quanto falta para fechar (dourado quando já fechou). A página continua rolando quando não cabe tudo, e a escolha fica salva.
- Desfazer o último número ou remover qualquer número sorteado; as marcações e conquistas são recalculadas.
- É possível editar os jogos e modos com a partida em andamento.
- A partida continua mesmo depois de completar algum modo, até você decidir finalizá-la. Partidas finalizadas podem ser reabertas pelo histórico.
- Opção para manter a tela do celular ligada durante a partida.

### Armazenamento

Tudo (cartelas, partida em andamento, números sorteados, histórico e preferências) fica salvo no `localStorage` do navegador e é recuperado sempre que a página é aberta. Abas abertas ao mesmo tempo ficam sincronizadas. Para levar os dados para outro aparelho use **Exportar backup** e **Importar backup**.

## Instalar no celular (PWA)

O app pode ser instalado e funciona sem internet depois do primeiro acesso.

- **Android (Chrome):** abra o site e toque em **Instalar** no aviso da tela inicial (ou no menu do Chrome, em Instalar app).
- **iPhone/iPad (Safari):** toque no botão Compartilhar e escolha **Adicionar à Tela de Início**.
- **Computador (Chrome ou Edge):** use o ícone de instalação na barra de endereço.

Arquivos do PWA: `public/manifest.webmanifest`, `public/sw.js` (service worker) e `public/icons/`.

## Publicação no GitHub Pages

A pipeline fica em `.github/workflows/`:

- `testes.yml`: roda em todo pull request, com dois jobs em paralelo. **Tipos, unitários e fluxos** confere formatação, tipos, testes unitários e os fluxos de ponta a ponta (cerca de 1 minuto). **Simulação de 60 partidas** roda a simulação completa (cerca de 3 minutos).
- `deploy.yml`: roda a cada merge (push) na `main`. Executa só os testes rápidos (a simulação já passou no pull request) e, se tudo passar, gera o build e publica no GitHub Pages.

Para ativar uma única vez: no GitHub, abra **Settings > Pages** e em **Build and deployment > Source** escolha **GitHub Actions**. O site fica em `https://<usuário>.github.io/bingo-manager/`.

## Desenvolvimento

Requisitos: Node.js 20 ou superior.

```bash
npm install
npm run dev          # servidor de desenvolvimento
npm test             # testes unitários da lógica do bingo (Vitest)
npm run test:e2e     # todos os testes de ponta a ponta (Playwright)
npm run test:e2e:fluxos      # só os fluxos (rápido)
npm run test:e2e:simulacao   # só a simulação de 60 partidas
npm run typecheck    # tipos do app e dos testes
npm run format       # formata o código (Prettier)
npm run build        # gera dist/
```

Para os testes de ponta a ponta na sua máquina, instale o navegador uma vez com `npx playwright install chromium`.

O build gera um único `dist/index.html` com todo o JavaScript e CSS embutidos, mais o manifesto, o service worker e os ícones.

### Testes de ponta a ponta

- `tests/e2e/simulacao.spec.ts`: simula **20 partidas para cada uma das 3 cartelas** usando o campo de número como um usuário. Depois de cada número a mensagem do app e o aviso de BINGO são conferidos, e a cada 10 números (e depois de cada ação especial) a tela inteira é comparada com um oráculo independente (`tests/e2e/oracle.ts`, que reescreve as regras dos 23 modos de outra forma). Passa por: seleção por rodada, por cartela e jogo a jogo; os 23 modos; Enter, botão Marcar e painel 1 a 75; formatos `7`, `07`, `B7`, `b-07`; números inválidos e repetidos; desfazer; remover número (cancelando e confirmando); recarregar a página; sair e continuar; editar modos no meio da partida; renomear cartela; ordenar por proximidade; visão compacta; som e tela ligada; finalizar pela partida e pelo início; histórico; reabrir partida.
- `tests/e2e/fluxos.spec.ts`: cadastro, validação, renomeação, edição e exclusão de cartelas; cadastro manual de jogo avulso e de cartela com números diferentes por jogo, com Salvar e jogar e inclusão na partida em andamento; backup; migração de dados antigos; botão voltar e endereços inválidos; sincronização entre abas; PWA (manifesto, ícones, service worker, uso offline e convite de instalação, inclusive a dica do iPhone); continuar a partida depois de fechar padrões; visão compacta; layout em 360px sem rolagem lateral; interface sem emojis, setas ou travessões.

### Estrutura

```
src/
  data/event.ts         prêmios, informações do evento e cartelas cadastradas
  data/modes.ts         modos de vitória (padrões da cartela 5x5)
  lib/bingo.ts          lógica de marcação, progresso e conquistas
  lib/storage.ts        leitura, gravação, migração e backup do localStorage
  lib/usePwaInstall.ts  convite de instalação do PWA
  state.ts              ações e reducer do estado da aplicação
  views/HomeView.tsx    tela inicial
  views/MatchView.tsx   tela da partida
  components/           grade de bingo, nome da cartela, configuração da partida, editor, diálogos, ícones
public/                 manifesto, service worker e ícones do PWA
tests/e2e/              testes de ponta a ponta e oráculo
```

## Observações

- O resultado oficial é o do sistema informatizado do evento; este app serve para acompanhar as suas cartelas.
- O regulamento cita a bicicleta como "Aro 20" e uma 6ª rodada (Honda Biz 125 ES) que não aparece nas cartelas. O app segue o que está impresso na cartela (5 jogos, Bicicleta Aro 26).
