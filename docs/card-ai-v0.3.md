# IA de cartas — v0.3.0, Pacote 4

O [Pacote 6 — IA de apostas](betting-ai-v0.3.md) compõe esta estratégia em
`createTrucoAI`. `createCardAI` continua restrita a cartas; `legalActions` agora
inclui também apostas autorizadas, que essa estratégia ignora.

Os novos módulos em `src/game/ai/` são independentes do Phaser e não alteram
o controlador, o Deck ou a demonstração visual existente.

```js
import { createMatchObservation } from '../src/game/ai/matchObservation.js';
import { createCardAI } from '../src/game/ai/CardAI.js';

const ai = createCardAI({ rng: Math.random }); // RNG separado do embaralhamento.
const view = createMatchObservation(match, 'opponent');
const action = ai.chooseAction(view);
if (action) match.play(action.playerId, action.instanceId);
// O coordenador continua chamando match.resolveTrick() na fase correspondente.
```

`createMatchObservation` é a fronteira confiável entre o estado completo e a IA.
Ela copia uma lista explícita de campos e congela profundamente o snapshot:

| Campo | Informação autorizada |
| --- | --- |
| `playerId`, `opponentId` | Identificação dos dois jogadores. |
| `phase`, `handNumber`, `firstPlayerId`, `activePlayerId` | Contexto público. |
| `ownHand` | IDs e faces das cartas do observador. |
| `opponentCardCount` | Quantidade de cartas restantes do outro jogador. |
| `vira`, `plays`, `tricks`, `handResults`, `trickWins` | Referência e histórico públicos. |
| `revealedCards` | Faces já reveladas, incluindo viras e jogadas de mãos anteriores. |
| `score` | Pontuação pública disponível, ou `null`. |
| `legalActions` | Ações `{ type: 'playCard', playerId, instanceId }` permitidas agora. |

Não há referência ao controlador ou Deck, ordem do monte, cartas ocultas,
metadados ou métodos no snapshot. A mão do outro jogador é consultada somente
para sua quantidade. Cartas não utilizadas ao final de mãos anteriores não são
reveladas pelo histórico. A lista de faces do baralho padrão é conhecimento das
regras; ela não representa conhecimento de onde as cartas estão na partida.

O controlador ainda não implementa pontuação de partida. Por padrão, `score`
é `null`; um futuro coordenador pode fornecer `{ score: { player, opponent } }`
como terceiro argumento do adaptador. Somente esses dois valores inteiros não
negativos são copiados. Este pacote não calcula pontos nem usa placares para
decidir apostas.

A estratégia intermediária:

1. Responde com a carta mais fraca que vence a carta revelada. Sem vencedora,
   usa a mais fraca, preservando as demais para as próximas vazas.
2. Ao iniciar uma vaza, exclui suas cartas e todas as faces públicas conhecidas
   do universo de cartas possíveis. Sorteia 48 mãos hipotéticas, sem reposição
   dentro de cada amostra, com a quantidade restante do outro jogador.
3. Para cada candidata, avalia a vitória da mão com busca minimax das vazas
   restantes, considerando as vitórias atuais e o vencedor iniciando a próxima.
   Todas as candidatas usam as mesmas amostras para reduzir ruído comparativo.
4. Entre resultados próximos (diferença máxima de duas amostras), prefere a
   carta de menor força. Cartas com forças adjacentes dentro desse limite
   podem ser desempatados pelo RNG. Se todas as amostras preveem derrota e o
   adversário já tem uma vaza, usa a mais forte para tentar sobreviver.

As amostras são hipóteses baseadas apenas no conhecimento autorizado. A busca
avalia continuações com informação completa **dentro de cada hipótese**, sem
receber cartas reais ocultas. É uma aproximação intermediária; não estima o
estilo do oponente nem garante estratégia ótima. Faces de cartas desconhecidas
de mãos anteriores continuam possíveis nas estimativas, pois o adaptador não
expõe descartes privados. A memória pública é suficiente para as mãos deste
pacote; reembaralhamento futuro precisará definir sua política de observação.

`chooseAction(view)` retorna uma das ações legais ou `null` quando não há
jogada disponível. A decisão não modifica a observação nem o estado da partida.
Uma observação pode ficar desatualizada; `match.play` continua sendo a autoridade
para aceitar ou rejeitar a ação. RNG deve ser uma função que retorna número
finito em `[0, 1)`; valores inválidos são rejeitados quando utilizados.

O ponto de extensão é `createCardAI({ rng, strategy })`. A estratégia recebe
somente `(observation, { rng })` e deve retornar uma ação legal ou `null`;
o wrapper rejeita ações fora da lista. Isso permite futuros perfis de personagem
ou dificuldade sem criar esses perfis agora. O adaptador deve ficar fora das
estratégias: nunca passar o controlador completo para uma estratégia.

`tests/card-ai.test.js` cobre campos privados com proxies que falham ao serem
lidos, observações imutáveis/serializáveis, histórico público, respostas para
todos os valores de vira, economia de cartas fortes, contexto das vazas, RNG,
extensão de estratégia e simulações reproduzíveis de sete mãos consecutivas.
São 24 cenários (12 sementes × dois iniciadores), repetidos para comparar os
resultados: 336 mãos simuladas com IA adversária e jogador aleatório legal.
Essas simulações verificam funcionamento e consistência, não uma taxa de vitória
alvo ou avaliação estatística de dificuldade.

Validação: `npm test` e `npm run build`. Sem apostas, blefes, integração visual,
pontuação funcional, efeitos, corte ou reembaralhamento automático.
