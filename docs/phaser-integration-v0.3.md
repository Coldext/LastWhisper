# Truco jogável no Phaser — v0.3.0, Pacote 8

`GameScene` agora cria `MatchController` e `createTrucoAI`. `Deck`, CardStrength,
turnos, pontuação, apostas e a memória autorizada da IA continuam nos módulos do
motor, sem dependência de Phaser. `DemoGame` permanece como infraestrutura da
demonstração anterior, mas a cena jogável não o utiliza.

Responsabilidades:

| Arquivo | Responsabilidade |
| --- | --- |
| `src/scenes/GameScene.js` | Ciclo da cena, entrada, Drag & Drop, resize e adaptação dos tweens. |
| `src/ui/MatchPresenter.js` | Coordenação visual com relógio e renderização injetados; chama ações do motor. |
| `src/ui/gameTableView.js` | Desenho da mesa, cartas, indicadores, modais e telas finais. |
| `src/ui/cardView.js` | Apresentação existente das cartas; versos nunca recebem a instância oculta. |
| `src/ui/draw.js` | Componentes visuais e botões com estado habilitado/desabilitado. |

O jogador vê suas cartas, a vira, as cartas públicas da vaza atual ou da última
resolvida, os vencedores das vazas, o turno, o placar e o valor aceito da mão.
As cartas da IA permanecem viradas até serem jogadas. Cartas da mão do jogador
continuam visíveis, mas têm entrada bloqueada durante o turno adversário,
animações, propostas pendentes e resultados.

Arrastar para a área indicada joga uma carta somente se o controlador permitir.
A posição da soltura é limitada para a carta caber na mesa e armazenada como
coordenadas relativas, fora das instâncias lógicas. Uma soltura inválida retorna
em 170 ms; a entrada só é restaurada no término do tween e se a carta ainda
pertencer à vista e ao turno atuais. Resize cancela estados transitórios e
reconstrói a mesa, conservando posições relativas e o estado real do jogo.

O botão inferior pede Truco ou o próximo nível autorizado. Na proposta pendente,
o modal mostra separadamente o valor aceito e o proposto. Aceitar, Correr e
Aumentar são desenhados a partir de `legalActions`; Aumentar não aparece em 12.
Durante uma resposta da IA, o modal fica em espera. O bloqueador cobre a mesa,
preservando Menu e Reiniciar no cabeçalho.

O coordenador valida novamente o payload completo na observação antes de aplicar
qualquer ação. O motor permanece a autoridade final. A IA recebe somente a
observação autorizada. `GameScene` não compara cartas, calcula pontos ou decide
vencedores, nem mantém um segundo estado de apostas.

Tempos visuais padrão em `PRESENTATION_TIMINGS`:

- Decisão da IA: 420 ms.
- Movimento da carta da IA: 240 ms.
- Pausa para conferir as duas cartas: 700 ms.
- Resultado da mão: 1600 ms antes de confirmar a apresentação ao motor.

Esses tempos pertencem somente à apresentação. Após o resultado, o coordenador
chama `acknowledgeHandResult(handNumber)` e o motor distribui a próxima mão.
Em `matchComplete`, exibe Vitória ou Derrota e não agenda outra mão. Jogar
novamente cria uma partida nova; Menu encerra a sessão da cena.

Existe no máximo uma tarefa agendada pelo coordenador. Cada tarefa guarda a mão,
fase, jogador ativo e proposta que a originaram. Callbacks repetidos ou de um
estado anterior não executam outra ação. Reinício e shutdown cancelam a tarefa
pendente e invalidam a sessão. Cada vista recebe uma versão; cliques de botões
antigos e callbacks de containers destruídos são ignorados. Resize não agenda
novamente a IA. Uma animação interrompida por resize simplesmente dá lugar à
posição final já confirmada pelo motor.

Pontos de extensão simples na cena:

- `matchFactory` e `aiFactory` permitem injetar dependências para testes.
- `presentationTimings` permite ajustar os tempos da apresentação.
- `presentationHooks.animateCard(scene, view, { target, duration })` substitui
  apenas a animação visual, sem callback de regras.
- `presentationHooks.decorateBet(scene, modalGeometry, proposal)` permite decorar
  o modal sem decidir ou alterar a aposta. Pode ser chamado novamente no resize.

Não foram adicionadas animações dramáticas, perfis de personagens ou regras.
O layout conserva a paleta e tipografia do projeto e respeita o tamanho do
elemento hospedeiro. O CSS existente mantém `100dvh`, `viewport-fit=cover` e os
insets de safe area; o canvas inicial passa a medir o espaço interno desse host.

Validação executada:

- `npm test`: 81 testes, incluindo os handlers reais de arrasto e seis testes
  novos de coordenação, cancelamento, cliques repetidos e partidas completas.
- `npm run build`: build de produção, com o aviso existente de tamanho do bundle.
- `node scripts/browser-regression.mjs`: Edge headless aprovado em desktop,
  portrait com toque e landscape com toque, sem exceções de navegador.

A regressão usa eventos reais de mouse/toque para jogar, apostar e navegar.
Cobre retornos inválidos, rotação durante arrasto, decisões/animações pendentes,
modal durante rotação, aceite/recusa/contra-aposta, limite 12, resultado visível,
transição automática, Vitória e Derrota, reinício com tarefa antiga, reentrada sem
listeners duplicados e insets simulados. Verifica que a mão não sobrepõe a barra
de ações. Usa fixtures determinísticas para cenários específicos e também joga
uma partida completa contra a IA intermediária real. Capturas em
`artifacts/truco-v0.3/`; os arquivos `*-table` mostram a mesa após rotação.

Os scripts mantêm o protocolo DevTools e as bibliotecas nativas do Node; não há
dependências novas. Safe areas e toque são emulados. A verificação em aparelhos
físicos continua pendente. Não há HP, tokens funcionais, efeitos, loja, roguelite,
multiplayer ou corte.
