# Pontuação e ciclo completo — v0.3.0, Pacote 7

O `MatchController` mantém o placar oficial e o mesmo Deck durante toda a partida.
`MATCH_TARGET` é 12. Toda distribuição começa com aposta aceita 1, sem regra
especial aos 11 pontos. O encerramento lógico de uma mão credita seus pontos
uma única vez e produz um resultado imutável com o placar após aquela mão.

- Duas vitórias em vazas: o vencedor recebe o valor aceito.
- Recusa: o proponente recebe o último valor aceito, sem o aumento recusado.
- Ao alcançar ou ultrapassar 12, o motor entra em `matchComplete`; não limita o
  placar a 12. `matchWinnerId` e `matchResult` expõem o vencedor final.

```js
const match = new MatchController({ rng: Math.random });
match.startHand(); // Somente a primeira preparação: ready -> dealing.
match.deal();      // Primeira distribuição.

// A futura apresentação mostra match.handResult ao receber handCompleted.
// Depois de terminar a apresentação, confirma o número daquela mão:
match.acknowledgeHandResult(presentedHandNumber);
// Se a partida continua, a próxima mão já está distribuída e liberada.
```

O motor não usa timers, callbacks de apresentação ou animações. Em `handComplete`,
aguarda a confirmação externa para preservar as cartas e o resultado visível.
`acknowledgeHandResult(handNumber)` inicia e distribui a próxima mão de forma
síncrona, alternando o primeiro jogador. Retorna `false` sem mutação para números
incorretos, confirmações repetidas ou fases incompatíveis. O número obrigatório
impede que um callback antigo avance uma mão posterior.

`startHand()` só é permitido em `ready`: não contorna a apresentação de resultados.
Ao terminar a partida, a fase muda imediatamente para `matchComplete`, o resultado
final permanece disponível e nenhuma confirmação pode iniciar outra mão.
Jogadas e apostas ficam bloqueadas. Uma nova partida exige outro controlador.

Consultas novas:

| Consulta | Conteúdo |
| --- | --- |
| `score` | Snapshot imutável `{ player, opponent }`, inicialmente zero. |
| `matchWinnerId` | ID do vencedor final ou `null`. |
| `matchResult` | `{ winnerId, score, handNumber }` imutável, ou `null`. |
| `deckEpoch` | Geração de circulação do baralho; começa em 0 e aumenta ao reciclar descarte. |
| `events` | Cópia do histórico de eventos imutáveis. |
| `eventsSince(sequence = 0)` | Eventos posteriores ao cursor, sem consumir a lista. |

Cada resultado de mão também registra `score` e `deckEpoch`. Os resultados e
placares anteriores não mudam com a distribuição ou pontuação das mãos seguintes.

Eventos destinados à integração futura:

| Tipo | Dados adicionais |
| --- | --- |
| `distributionStarted` | `nextHandNumber` |
| `discardCollected` | `count` de cartas retiradas da mão encerrada |
| `deckReshuffled` | `count` do descarte recolhido, `deckEpoch` |
| `handStarted` | `firstPlayerId`, `deckEpoch` |
| `trickResolved` | `result` da vaza |
| `handCompleted` | `result` da mão, `score` atualizado |
| `matchCompleted` | `result` final |

Todos incluem `sequence` monotônico e `handNumber` do estado naquele momento.
Durante preparação/reembaralhamento, esse número ainda é o da mão anterior;
`nextHandNumber` identifica a próxima. Uma mão final emite `handCompleted` seguido
de `matchCompleted`. Os eventos são dados consultáveis; não executam código de
interface dentro das transições e não expõem cartas ocultas ou ordem do monte.

Após a apresentação, somente as seis cartas distribuídas na mão encerrada e sua
vira são retiradas para `discard`. Outras cartas em mãos, na mesa ou em outra
zona de vira não são varridas. Se restarem pelo menos sete cartas no monte, não
há reembaralhamento. Caso contrário, o motor chama
`Deck.collectAndShuffle({ zones: ['discard'], rng })`, incluindo no embaralhamento
as cartas restantes do monte e todo descarte elegível. O motor não repõe cartas
durante uma mão ativa ou pendente de apresentação.

O mesmo RNG do construtor é reutilizado. Antes de alterar zonas, o motor verifica
a disponibilidade e coleta/valida todos os valores necessários ao shuffle; depois
os repassa ao Deck. Falta de cartas elegíveis, localizações inconsistentes ou RNG
inválido falham sem alterar cartas, placar, resultados, fase ou eventos. A chamada
ao RNG pode consumir seu estado externo; o motor não tenta reverter a função do
chamador. A confirmação pode ser repetida após corrigir a origem do erro.

Nenhuma carta é recriada. IDs, referências, encantamentos e modificadores são
preservados, inclusive quando os dados indicam duração de mão; não há efeitos.

`createMatchObservation` passa a usar `match.score` por padrão e expõe o resultado
final e a geração do baralho. O antigo argumento opcional `score` só é aceito
quando coincide com o placar oficial; valores divergentes são rejeitados.
O histórico público completo permanece disponível, mas `revealedCards` inclui
somente revelações da geração atual: faces de gerações anteriores podem voltar
ao baralho e não devem ser excluídas das estimativas da IA. Essa mudança não
revela descartes privados nem a ordem reembaralhada.

`tests/match-cycle.test.js` cobre pontuação em todos os níveis, recusas, espera
de apresentação, confirmações antigas, vitória exata e acima de 12 para ambos,
11 sem regra especial, 23 mãos com três reembaralhamentos, cartas protegidas,
metadados, erro de RNG no meio da preparação, eventos e observação após reciclagem.
As simulações da IA agora usam o placar e o ciclo reais, até o fim da partida,
sem placar paralelo ou substituição de Deck no teste.

Validação: `npm test` e `npm run build`. Nenhuma integração visual, timer,
animação, efeito de carta ou mecânica de corte foi adicionada.
