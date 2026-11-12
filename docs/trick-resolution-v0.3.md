# Resolução de vazas — v0.3.0, Pacote 3

O `MatchController` integra `compareCards` do CardStrength usando a mesma vira
durante toda a mão. Uma vaza recebe exatamente uma carta de cada jogador.
A segunda jogada coloca o motor em `resolvingTrick`, sem jogador ativo; o
chamador executa `resolveTrick()` para registrar o resultado. Essa fronteira
explícita permite uma futura apresentação das duas cartas antes da resolução.
Não há temporizadores ou integração visual neste pacote.

```js
// Depois de duas jogadas aceitas por match.play(playerId, instanceId):
const result = match.resolveTrick();
console.log(result.winnerId, result.plays);
// awaitingPlay: o vencedor inicia a próxima vaza.
// handComplete: o vencedor já conquistou duas vazas.
```

O primeiro jogador a vencer duas vazas ganha a mão. Ela termina em duas ou três
vazas; em um resultado 2–0, as cartas restantes continuam nas mãos. Não existe
terceira vaza após a segunda vitória. O motor bloqueia jogadas até a resolução
pendente e depois do encerramento da mão. `resolveTrick()` fora da fase correta
lança erro sem mutação. A antiga API provisória `completeHand()` foi removida;
a mão só pode ser encerrada pela resolução de duas vitórias.

Consultas para apresentação futura:

| Consulta | Conteúdo |
| --- | --- |
| `plays` | Jogadas pendentes da vaza, em ordem; esvazia após resolução. |
| `tricks` | Vazas resolvidas da mão atual, em ordem. |
| `trickWins` | Contagem `{ player, opponent }` da mão atual. |
| `handWinnerId` | Vencedor da mão atual, ou `null` enquanto não decidida. |
| `handResult` | Resultado da mão atual encerrada, ou `null`. |
| `handResults` | Histórico de todas as mãos encerradas. |

Cada resultado de vaza contém `handNumber`, `trickNumber`, `vira`, `plays` e
`winnerId`. Cada jogada no resultado contém `playerId`, `instanceId`,
`definitionId`, `rank` e `suit`. O array preserva a ordem real das jogadas;
seu primeiro registro identifica o iniciador. O resultado de mão contém
`handNumber`, `winnerId`, `trickWins` e `tricks`.

Resultados, registros e seus arrays internos são imutáveis e serializáveis.
Consultas de listas retornam cópias. Identidades e faces são copiadas para o
histórico, sem referências ao `runtime` mutável ou aos metadados da instância.
Uma distribuição seguinte limpa somente as consultas da mão atual e preserva
o histórico das mãos encerradas.

Resolver não movimenta cartas: todas as cartas jogadas continuam em `table`,
com seus donos, até a distribuição seguinte recolher a mão anterior para
`discard`. A vira continua separada. Um registro privado de cartas usadas
impede reutilização entre vazas. Antes de resolver, o motor confere as zonas e
os donos das cartas pendentes e a zona da vira; inconsistências provocadas por
movimentação externa são rejeitadas antes de registrar qualquer resultado.
Como já documentado, o acesso direto ao Deck destina-se à integração confiável;
ações normais passam pelo controlador.

As 52 faces do baralho são únicas e os naipes desempatam todos os valores;
uma comparação igual é tratada como quebra de invariantes, sem regra de empate.
Instâncias, encantamentos e modificadores permanecem intactos e não têm efeitos.

Os testes anteriores de ciclo de vida agora encerram mãos através de vazas reais.
`tests/trick-resolution.test.js` cobre todas as seis sequências possíveis de
vitória com ambos os iniciadores, manilhas circulares, desempates por naipe,
resolução duplicada ou incompleta, jogadas inválidas, encerramento antecipado,
histórico imutável entre mãos, metadados e consistência de zonas.

Validação: `npm test` e `npm run build`. Não há apostas, IA, pontuação de partida,
reembaralhamento automático, corte ou alterações de interface/Drag & Drop.
