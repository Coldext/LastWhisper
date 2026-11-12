# Motor de turnos e distribuição — v0.3.0, Pacote 2

Atualizado pelo [Pacote 3 — resolução de vazas](trick-resolution-v0.3.md).

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
sem mão ativa, preservando suas instâncias e metadados. Não reembaralha entre
mãos nem repõe cartas automaticamente. Falta de sete cartas aborta antes de
descartar a mão anterior ou mudar o primeiro jogador.

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
| `ready` | `startHand()` prepara a distribuição. |
| `dealing` | `deal()` distribui e libera o primeiro jogador. |
| `awaitingPlay` | `play()` passa a vez ou aguarda resolução após duas cartas. |
| `resolvingTrick` | `resolveTrick()` registra a vaza e libera o vencedor ou encerra a mão. |
| `handComplete` | `startHand()` permite preparar a próxima mão. |
| `awaitingBetResponse` | Reservada; sem ações ou transições de aposta implementadas. |
| `matchComplete` | Reservada; sem pontuação ou término de partida implementados. |

No Pacote 3, a antiga fronteira provisória `completeHand()` foi substituída por
`resolveTrick()`. A mão encerra automaticamente quando um jogador conquista duas
vazas; o chamador não pode encerrar antecipadamente. O vencedor de cada vaza
inicia a seguinte. Não há pontuação de partida. Consulte a documentação do
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
pelas cenas. Não há IA, apostas, pontuação de partida ou interface nova.
