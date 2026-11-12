# Motor de turnos e distribuição — v0.3.0, Pacote 2

Atualizado pelo [Pacote 3 — resolução de vazas](trick-resolution-v0.3.md).
As janelas de aumento e o encerramento por recusa estão no
[Pacote 5 — sistema de apostas](betting-v0.3.md).
O [Pacote 7 — ciclo de partida](match-cycle-v0.3.md) acrescenta placar,
confirmação da apresentação e reciclagem do descarte.

`src/game/MatchController.js` usa `Deck` e consulta a manilha pelo CardStrength.
É independente do Phaser e não altera `DemoGame`, a interface ou o Drag & Drop.

```js
import { MatchController } from '../src/game/MatchController.js';

const match = new MatchController({ rng: Math.random, firstPlayerId: 'player' });
match.startHand(); // ready -> dealing (sem compras)
match.deal();      // dealing -> awaitingPlay
const id = match.activePlayerId;
match.play(id, match.handOf(id)[0].instanceId); // true, passa a vez
```

Os jogadores são `player` e `opponent`, nas zonas existentes `playerHand` e
`opponentHand`. A distribuição faz seis compras de uma carta, alternando os
jogadores a partir do primeiro da mão; a sétima compra é a vira. A primeira mão
usa `firstPlayerId`; cada distribuição concluída alterna o primeiro da próxima.
`handNumber` só aumenta quando a distribuição termina. `manilhaRank` consulta
`getManilhaRank(vira)`; antes da primeira distribuição retorna `null`.

O construtor embaralha uma vez com RNG injetável. Aceita opcionalmente um `Deck`
sem mão ativa, preservando suas instâncias e metadados. A partir do Pacote 7,
recicla somente o descarte quando o monte não permite a próxima distribuição.
Isso acontece após confirmar a apresentação, nunca durante uma mão ativa.

`canPlay(playerId, instanceId)` e `play(...)` retornam `false` para ações
inválidas, sem mutação: fase incorreta, jogador fora do turno, ID desconhecido,
carta de outro jogador, zona/dono incorretos ou carta já utilizada. O registro
da distribuição exige que a carta pertença à mão atual. Uma jogada move a mesma
instância para `table`, preserva o dono e registra `{ playerId, instanceId }`.
Após duas jogadas, a fase é `resolvingTrick`, sem jogador ativo; novas jogadas
ficam bloqueadas até `resolveTrick()` comparar as cartas e registrar o vencedor.

Fases exportadas em `MATCH_PHASES`:

| Fase | Transição disponível neste pacote |
| --- | --- |
| `ready` | `startHand()` prepara somente a primeira distribuição. |
| `dealing` | `deal()` distribui e libera o primeiro jogador. |
| `awaitingPlay` | `play()` passa a vez ou aguarda resolução após duas cartas. |
| `resolvingTrick` | `resolveTrick()` registra a vaza e libera o vencedor ou encerra a mão. |
| `handComplete` | `acknowledgeHandResult(handNumber)` confirma apresentação e distribui a próxima. |
| `awaitingBetResponse` | Destinatário pode aceitar, correr ou contra-apostar. |
| `matchComplete` | Partida encerrada aos 12 ou mais pontos; nenhuma nova mão. |

No Pacote 3, a antiga fronteira provisória `completeHand()` foi substituída por
`resolveTrick()`. A mão encerra automaticamente quando um jogador conquista duas
vazas ou quando o destinatário corre de uma proposta (Pacote 5). O vencedor de cada vaza
inicia a seguinte. O Pacote 7 integra os resultados ao placar. Consulte a documentação do
Pacote 3 para histórico, resultados e consistência de zonas.

As transições de ciclo inválidas lançam erro sem alteração de estado. Consultas
de mãos e jogadas retornam cópias dos arrays; registros de jogada são imutáveis.
Fase, contador e jogadores ativos são privados e expostos por getters.
`deck` e as cartas retornadas são referências do motor para integração lógica
confiável, não uma visão de informação autorizada para IA. Movimentações devem
passar pelo controlador durante uma partida; a futura IA exigirá sua própria
visão restrita. Encantamentos e modificadores permanecem dados sem efeitos.

Separar preparação e distribuição fornece uma fronteira para futuras regras
anteriores à compra. Não existe corte, callback de corte ou operação equivalente.

Validação: `npm test` cobre ordem de compra, alternância, turnos, ações inválidas,
repetições, fases, RNG, esgotamento e preservação de instâncias e metadados.
`npm run build` valida a aplicação existente; o controlador ainda não é importado
pelas cenas. Não há interface nova neste motor.
