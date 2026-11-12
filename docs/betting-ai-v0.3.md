# IA de apostas e blefes — v0.3.0, Pacote 6

`src/game/ai/BettingAI.js` acrescenta uma única política intermediária de apostas
à estratégia de cartas do Pacote 4. Não importa Phaser nem recebe o controlador.

```js
import { createTrucoAI } from '../src/game/ai/BettingAI.js';
import { createMatchObservation } from '../src/game/ai/matchObservation.js';

const ai = createTrucoAI({
  rng: Math.random,
  parameters: { bluffProbability: 0.08, bluffMaxValue: 6 },
});
const view = createMatchObservation(match, 'opponent', { score: publicScore });
const action = ai.chooseAction(view);
// O coordenador aplica somente a ação escolhida ao motor:
if (action?.type === 'playCard') match.play(action.playerId, action.instanceId);
else if (action?.type === 'requestRaise') match.requestRaise(action.playerId, action.value);
else if (action?.type === 'counterRaise') match.counterRaise(action.playerId, action.value);
else if (action?.type === 'acceptBet') match.acceptBet(action.playerId);
else if (action?.type === 'fold') match.fold(action.playerId);
```

O exemplo espera um placar público fornecido pelo coordenador. Sem placar,
omitir o terceiro argumento do adaptador; `score` continuará `null` e a política
usará um contexto neutro. Não foi implementado placar acumulado neste pacote.

O adaptador inclui em `legalActions` todas as ações permitidas pelo motor para
o observador, em objetos imutáveis:

| Tipo | Dados |
| --- | --- |
| `playCard` | `playerId`, `instanceId` |
| `requestRaise` | `playerId`, `value` (próximo nível) |
| `acceptBet` | `playerId` |
| `fold` | `playerId` |
| `counterRaise` | `playerId`, `value` (próximo nível) |

Durante a negociação, só o destinatário recebe ações de resposta; em 12 não há
contra-aposta. Fora do turno ou depois do encerramento, a lista é vazia.
Os métodos `canRequestRaise`, `canRespondToBet` e `canCounterRaise` do motor
definem essa lista. A estratégia nunca fabrica uma ação ausente da observação.
O wrapper compartilhado valida tipo, jogador, carta e valor antes de retornar
o próprio objeto autorizado. A aplicação deve atualizar a observação antes de
decidir novamente; o motor continua validando todas as ações aplicadas.

`createCardAI` mantém o comportamento de jogar somente cartas, retornando `null`
em propostas pendentes. `createTrucoAI` compõe essa política com apostas: decide
primeiro se aumenta ou responde e, quando deve jogar, delega à IA de cartas.
Não há outro nível de dificuldade ou perfil de personagem implementado.

A avaliação de apostas estima a força relativa das cartas próprias contra as
faces desconhecidas do baralho, excluindo a informação pública já revelada.
Combina chances aproximadas de vitória nas vazas restantes e a quantidade de
vitórias necessária para ganhar a mão. Uma carta do adversário já revelada é
comparada diretamente; uma carta própria já jogada considera que o respondente
pode escolher entre suas cartas restantes.

Essa estimativa usa uma aproximação de independência entre vazas. Não deduz a
mão oculta real, não executa busca perfeita de apostas e não garante estratégia
ótima. O histórico público influencia as faces ainda possíveis. As decisões
claras são determinísticas; decisões próximas dos limiares recebem uma pequena
variação do RNG.

O aceite compara o risco de disputar o valor proposto com a perda do valor já
aceito ao correr. Quando existe placar público, ganhos e perdas são limitados
aos pontos ainda necessários até 12. Pedidos e contra-apostas exigem confiança
maior, ajustada por valor, cautela, agressividade e diferença de placar.

Parâmetros exportados em `DEFAULT_BETTING_PARAMETERS`:

| Parâmetro | Padrão | Uso |
| --- | --- | --- |
| `aggression` | `0.5` | Reduz/aumenta os limiares de pedido e contra-aposta. |
| `riskTolerance` | `0.45` | Controla a margem de cautela, inclusive no aceite. |
| `bluffProbability` | `0.08` | Probabilidade condicional de blefar em contexto elegível. |
| `bluffMaxValue` | `6` | Maior valor que pode ser proposto por blefe. |
| `decisionNoise` | `0.04` | Amplitude da variação em decisões próximas do limiar. |

Os parâmetros fracionários aceitam números finitos em `[0, 1]`; `bluffMaxValue`
aceita `3`, `6`, `9` ou `12`. Nomes desconhecidos e valores inválidos são
rejeitados. A configuração é copiada e congelada na criação da IA, sem depender
de mudanças posteriores no objeto do chamador. A injeção de `strategy` permanece
disponível para futuras personalidades, recebendo somente observação, RNG e
parâmetros. Não há catálogo de personalidades ou níveis novos.

Um blefe só ocorre quando a ação é legal, a confiança fica entre `0.18` e `0.7`,
o valor não excede o máximo configurado e o jogador ainda não fez uma proposta
na mão. Essa última condição limita o blefe a uma proposta e também impede um
blefe posterior a um aumento verdadeiro. Se o placar mostra que o aumento pode
dar a partida ao adversário, o blefe é bloqueado. `bluffProbability: 0` desativa
blefes; `1` garante o blefe somente quando todas essas condições são atendidas.
A ação pública não informa se foi blefe. RNG inválido falha ao ser consumido.

`tests/betting-ai.test.js` cobre todas as decisões, efeitos de cartas/vazas/
placar/valor, limites e fronteiras da probabilidade de blefe, privacidade com
proxies que falham ao ler dados ocultos, parâmetros, RNG, ações legais e payloads
inválidos. As 40 combinações de semente/iniciador são simuladas duas vezes:
80 partidas até 12 pontos, com todas as cinco ações exercitadas e resultados
reproduzíveis.

O placar e o encerramento aos 12 nas simulações pertencem ao teste. Ele usa o
mesmo Deck por até sete mãos e fornece outra fixture se o monte se esgotar;
isso não implementa reembaralhamento ou ciclo de partida em produção.
As simulações verificam consistência, não uma taxa de vitória ou calibração
estatística de dificuldade.

Validação: `npm test` e `npm run build`. Sem interface visual, modal, novos
níveis de IA, efeitos, corte ou alterações no controlador e no Deck.
