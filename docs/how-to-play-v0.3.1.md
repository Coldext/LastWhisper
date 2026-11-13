# LastWhisper v0.3.1 — Como Jogar

Atualização de interface e documentação. O motor de regras, a IA, as cartas e a pontuação permanecem os da v0.3.0.

## Interface

- `MenuScene`: JOGAR, seguido imediatamente de COMO JOGAR, com os mesmos componentes de botão, cores e feedback de toque.
- `HowToPlayScene`: seções Objetivo, Força das Cartas, Manilha e Como Funciona, nessa ordem. Conteúdo com rolagem vertical e cabeçalho/rodapé fixos. VOLTAR retorna ao menu sem criar uma partida.
- Usa `Phaser.Scale.RESIZE`, as safe areas já aplicadas ao contêiner e as fontes/paleta existentes. Texto adapta sua largura à tela; a altura disponível limita apenas a janela de rolagem.
- Roda do mouse, arrasto com mouse/toque, setas, Page Up/Down, Home/End e Escape. Ilustrações reutilizam `createCardView` e definições existentes, sem criar cartas físicas no baralho.
- Recorte com filtro de máscara em WebGL do Phaser 4 e máscara geométrica no renderizador Canvas.
- `package.json` é a fonte da versão, consumida por `src/version.js` para o menu e o título da página. Somente a versão do aplicativo foi alterada no lockfile.

## Regras conferidas no código

Fontes: `src/game/rules/CardStrength.js` e `src/game/MatchController.js`.

- Vitória ao alcançar ou ultrapassar 12 pontos; não há HP ou dano.
- Cartas comuns: **3 > 2 > A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4**. A sequência visual deriva diretamente de `RANK_ORDER`.
- Naipes: **♣ > ♥ > ♠ > ♦**, para todos os valores, derivados de `SUIT_ORDER`.
- Vira define o próximo valor na ordem crescente, com retorno circular de 3 para 4. O exemplo usa definições 3♦ e 4♣, calculando o segundo valor com `getManilhaRank`. Todos os 4 são manilhas nesse exemplo; não há conjunto fixo de manilhas.
- Três cartas para cada jogador e uma vira por mão; uma carta por jogador a cada vaza. O vencedor abre a próxima vaza. Duas vitórias em vazas encerram a mão.
- Não há empate entre cartas distintas: naipes desempatam e as 52 faces são únicas.
- Apostas 1 → 3 → 6 → 9 → 12. Proposta suspende jogadas; respostas: aceitar, correr ou aumentar. Aumento aceita implicitamente o pedido anterior. Após aceite, só o outro jogador pode pedir o próximo aumento no próprio turno.
- Mão paga o valor aceito. Recusa paga ao proponente o último valor aceito, anterior ao pedido recusado. Próxima mão automática, até o encerramento da partida.

## Arquivos da atualização

| Arquivo | Alteração |
| --- | --- |
| `src/scenes/HowToPlayScene.js` | Nova cena com conteúdo, exemplos e rolagem. |
| `src/scenes/MenuScene.js` | Botões, identificação da versão e ajuste para telas de pouca altura. |
| `src/main.js` | Registro da cena e título da página. |
| `src/version.js` | Identificação visível derivada da versão do aplicativo. |
| `package.json`, `package-lock.json` | Versão 0.3.1; comando de validação do tutorial no package.json. |
| `scripts/how-to-play-browser-scenarios.mjs` | Novos cenários de navegação e layout do tutorial. |
| `scripts/browser-regression.mjs` | Seleção dos cenários com `--how-to-play`. |
| `scripts/truco-browser-scenarios.mjs` | Coordenadas de JOGAR atualizadas. |
| `README.md` | Versão atual, navegação e controles. |
| `docs/how-to-play-v0.3.1.md` | Regras verificadas, diferenças e validação. |
| `artifacts/how-to-play-v0.3.1/` | 18 capturas do início/fim do tutorial em nove viewports. |

## Diferenças em relação ao texto de referência

A sugestão de hierarquia tradicional colocava J acima de Q. O código coloca **Q acima de J**. Além disso, o desempate por naipe não se restringe às manilhas. O tutorial documenta o comportamento implementado, sem alterar as regras. Não foi encontrada regra de empate de mão aplicável ao baralho atual: cartas distintas nunca empatam.

## Validação

- `npm test`: 82 testes aprovados, incluindo 408 partidas com sementes fixas.
- `npm run build`: build de produção aprovado; aviso de chunk maior que 500 kB devido ao bundle do jogo.
- `npm run test:how-to-play`: nove viewports, desktop e toque emulado: 1100×760, 320×568, 568×320, 375×667, 667×375, 390×844, 844×390, 768×1024 e 1024×768. Verifica ordem dos botões, quatro seções, hierarquia, naipes, limites horizontais do texto, rolagem até o final, VOLTAR, rotação, safe areas simuladas, reabertura e distribuição normal após JOGAR. Capturas em `artifacts/how-to-play-v0.3.1/`.
- `npm run test:browser`: regressão da mesa aprovada nos nove viewports, cobrindo arrastos, IA, apostas, transições de mão, tela final, reinício, rotação, safe areas e retorno ao menu. Coordenadas do menu atualizadas para o espaço ocupado pelo novo botão. A conexão inicial com DevTools apresentou timeout no isolamento; a execução fora dele completou a suíte.

Navegador de validação: Edge headless. Toque emulado e safe areas simuladas não substituem teste em aparelhos físicos; Safari, Firefox e o fallback Canvas não foram verificados visualmente.
