# Bingo Manager: Show de Prêmios APAE 2026

Aplicação web para acompanhar, durante o sorteio, as cartelas do **Show de Prêmios 2026 da APAE de Santa Rita do Sapucaí** (08/11/2026, Ginásio da APAE).

Ainda não é uma plataforma genérica: as cartelas, os prêmios e as regras foram modelados especificamente para este bingo.

## Como funciona

### Tela inicial

- Lista das cartelas disponíveis (01062, 01064 e 01065 já vêm cadastradas, com os números conferidos nas fotos).
- Cada cartela tem 5 jogos, um para cada prêmio/rodada:
  1. Bicicleta Aro 26
  2. Smartphone
  3. R$ 1.500,00
  4. Smart TV 43"
  5. Moto 0 km
- Botão **Adicionar** para cadastrar outras cartelas (número, dono e os 24 números, com validação das colunas B, I, N, G e O).
- Partida em andamento (continuar ou finalizar), histórico de partidas finalizadas e backup em arquivo JSON.

### Iniciar jogo

1. Escolha as cartelas e, em cada uma, os jogos (prêmios) que valem nesta partida. O atalho **Nª rodada** seleciona o mesmo jogo em todas as cartelas de uma vez.
2. Escolha um ou mais modos de vitória (o espaço livre do centro sempre conta como marcado):
   - **Tradicionais:** Quadra, Quina, Cartela cheia.
   - **Linhas:** Linha vertical, Diagonal, Linha em qualquer direção, Quadra em qualquer direção, Duas linhas, Duas quinas.
   - **Figuras:** Quatro cantos, Selo, Cruz, Letras X, T, L, U, H, N e Z, Moldura, Quadrado do meio, Losango, Pirâmide.
3. Dê um nome à partida (opcional; por padrão usa o nome da rodada).

### Durante a partida

- No topo fica sempre o campo para digitar o número sorteado (aceita `7`, `07` ou `B7`). O último número aparece em destaque.
- Todas as cartelas/jogos da partida são marcados automaticamente ao mesmo tempo.
- Quando um modo é completado aparece o aviso **BINGO!** (com som e vibração, que podem ser desligados), e a conquista fica registrada com o número e a posição do sorteio em que aconteceu.
- O painel **Falta 1 número** mostra quais números completam algum modo no próximo sorteio.
- Lista dos números sorteados em ordem ou em painel de 1 a 75 (o painel também permite marcar tocando no número).
- Desfazer o último número ou remover qualquer número sorteado; as marcações e conquistas são recalculadas.
- É possível editar os jogos e modos com a partida em andamento.
- A partida continua mesmo depois de completar algum modo, até você decidir finalizá-la.
- Opção para manter a tela do celular ligada durante a partida.

### Armazenamento

Tudo (cartelas, partida em andamento, números sorteados, histórico e preferências) fica salvo no `localStorage` do navegador e é recuperado sempre que a página é aberta. Abas abertas ao mesmo tempo ficam sincronizadas. Para levar os dados para outro aparelho use **Exportar backup** e **Importar backup**.

## Desenvolvimento

Requisitos: Node.js 20 ou superior.

```bash
npm install
npm run dev      # servidor de desenvolvimento
npm test         # testes da lógica do bingo (Vitest)
npm run build    # gera dist/index.html
```

O build gera um único arquivo `dist/index.html` com todo o JavaScript e CSS embutidos. Ele funciona em qualquer hospedagem estática e também abrindo o arquivo direto no navegador, sem internet.

### Publicação no GitHub Pages

O workflow `.github/workflows/deploy.yml` publica o app a cada push na branch `main` (ou manualmente pela aba Actions). Para ativar, em **Settings > Pages** selecione **GitHub Actions** como origem.

### Estrutura

```
src/
  data/event.ts        prêmios, informações do evento e cartelas cadastradas
  data/modes.ts        modos de vitória (padrões da cartela 5x5)
  lib/bingo.ts         lógica de marcação, progresso e conquistas
  lib/storage.ts       leitura, gravação e backup do localStorage
  state.ts             ações e reducer do estado da aplicação
  views/HomeView.tsx   tela inicial
  views/MatchView.tsx  tela da partida
  components/          grade de bingo, configuração da partida, editor de cartela, diálogos
```

## Observações

- O resultado oficial é o do sistema informatizado do evento; este app serve para acompanhar as suas cartelas.
- O regulamento cita a bicicleta como "Aro 20" e uma 6ª rodada (Honda Biz 125 ES) que não aparece nas cartelas. O app segue o que está impresso na cartela (5 jogos, Bicicleta Aro 26).
