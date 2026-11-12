# Sistema de apostas — v0.3.0, Pacote 5

O [Pacote 6 — IA de apostas](betting-ai-v0.3.md) acrescenta decisões de aposta
e blefes sobre as mesmas regras. A observação passa a listar apostas legais;
a IA restrita a cartas continua sem respondê-las.

O `MatchController` controla a progressão imutável `BET_VALUES = [1, 3, 6, 9, 12]`.
O valor aceito e a proposta pendente são estados independentes. Não há saltos de
nível nem valores acima de 12.

```js
match.requestRaise('player'); // aceita 1; propõe 3 ao opponent; suspende a jogada.
match.counterRaise('opponent'); // aceita 3; propõe 6 ao player.
match.acceptBet('player'); // aceita 6; restaura a vez original do player.
// Ou match.fold('player') durante a proposta de 6: opponent ganha 3 pontos.
```

Momentos legais de aumento:

- Somente em `awaitingPlay`, pelo jogador ativo, antes de jogar sua carta.
  Isso inclui o início de qualquer vaza e o turno de resposta à primeira carta.
- O vencedor de uma vaza começa a próxima e pode pedir aumento se detiver o
  direito. A nova vaza não reinicia o direito de aumentar.
- O último proponente não pode pedir outro aumento após um aceite. O direito
  passa ao outro jogador, que ainda precisa aguardar seu turno de jogar.
- Com uma proposta pendente, somente seu destinatário pode aceitar, correr ou
  contra-apostar. A contra-aposta aceita implicitamente o valor pendente e
  propõe o próximo nível, invertendo proponente e destinatário.
- Não há pedidos durante preparação, distribuição, resolução de vaza ou após
  encerramento da mão. Com duas cartas jogadas, é preciso resolver a vaza antes
  de um eventual aumento na seguinte. Com valor aceito 12, não há novo aumento.

API de ações (todas retornam `true` no sucesso e `false` sem mutação na rejeição):

| Método | Regra |
| --- | --- |
| `requestRaise(playerId, value = nextRaiseValue)` | Pede Truco ou o próximo nível no turno autorizado. |
| `acceptBet(playerId)` | O destinatário aceita a proposta e o jogo de cartas retoma. |
| `counterRaise(playerId, value = nextRaiseValue)` | O destinatário aceita o pendente e contrapropõe o próximo nível. |
| `fold(playerId)` | O destinatário corre; o proponente vence pelo valor já aceito. |

`value`, quando informado, deve ser exatamente o próximo número da progressão,
sem conversão de tipos. `canRequestRaise`, `canRespondToBet` e `canCounterRaise`
permitem consultar a disponibilidade sem alterar o estado. Não é possível correr
sem proposta pendente.

Consultas públicas:

| Getter | Conteúdo |
| --- | --- |
| `acceptedBet` | Valor atualmente aceito; começa em 1. |
| `pendingBet` | `{ proposerId, responderId, value }` imutável, ou `null`. |
| `resumePlayerId` | Quem deve jogar ao final da negociação, ou `null`. |
| `lastProposerId` | Último jogador que propôs um aumento nesta mão. |
| `nextRaiseValue` | Próximo nível da proposta pendente ou do aceito; `null` após 12. |
| `bettingHistory` | Cópia da lista de eventos imutáveis da mão atual. |

Uma proposta muda a fase para `awaitingBetResponse` e põe `activePlayerId = null`.
Enquanto isso, `play` retorna `false` para ambos. O turno suspenso não muda ao
contra-apostar, e o aceite o restaura, independentemente de quem respondeu por
último. As cartas já jogadas e suas zonas não são alteradas pela negociação.

Um evento de histórico registra `type` (`raise`, `accept`, `counterRaise` ou
`fold`), `playerId`, `value`, `acceptedValue`, `trickNumber` e `playedCards`.
O valor aceito do evento é o estado após aquela ação; uma contra-aposta registra
o aceite implícito no mesmo evento.

O resultado da mão agora inclui `reason` (`tricks` ou `fold`), `foldedBy`,
`acceptedValue`, `points`, `vira`, `plays` e `bettingHistory`, além dos campos
anteriores. Por duas vitórias, o vencedor recebe o valor aceito. Por recusa,
o proponente recebe esse mesmo valor, nunca o valor da proposta recusada.
`points` representa os pontos concedidos ao vencedor **nesta mão**. O
[Pacote 7](match-cycle-v0.3.md) aplica esses pontos ao placar e encerra a partida
aos 12 ou mais, sem regra especial de mão de 11.

Uma mão recusada termina imediatamente, mesmo sem vazas resolvidas ou durante
uma vaza incompleta. A vaza incompleta não ganha vencedor. A vira e as cartas
já reveladas permanecem registradas no resultado; cartas ocultas não aparecem.
Cartas e metadados ficam nas zonas atuais até confirmar a apresentação do resultado.
A distribuição seguinte reinicia a aposta em 1 e preserva o histórico da mão
anterior. Monte insuficiente recicla somente descarte elegível; falhas de
preparação não apagam o resultado nem as apostas.

O adaptador `createMatchObservation` copia o estado público em `betting` e os
novos campos dos resultados, sem expor dados privados. A IA de cartas não recebe
ações de carta enquanto aguarda uma aposta e retorna `null`. A política completa
do Pacote 6 pode escolher entre as ações de aposta autorizadas na mesma observação.

Validação: `tests/betting.test.js` cobre todos os níveis, aceite, recusa,
contra-apostas, turnos suspensos, alternância do direito, novas vazas, rejeições
sem mutação, histórico público e preservação de cartas/metadados. Executar
`npm test` e `npm run build`. Sem interface modal ou alterações de Drag & Drop.
