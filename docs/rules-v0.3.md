# Regras implementadas — Last Whisper v0.3.0

Esta é a referência das regras jogáveis. Os documentos dos Pacotes 1 a 8
descrevem APIs e decisões de arquitetura; esta página consolida o comportamento
final, sem incluir mecânicas futuras como se estivessem disponíveis.

## Cartas e manilhas

Um baralho compartilhado tem 52 faces únicas: 13 valores em quatro naipes, sem
Joker. Cada carta física conserva seu `instanceId` durante toda a partida.

Hierarquia crescente dos valores:

```text
4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A < 2 < 3
```

Hierarquia crescente dos naipes, aplicada a todos os valores:

```text
diamonds < spades < hearts < clubs
ouros    < espadas < copas  < paus
```

A manilha é o valor imediatamente posterior ao da vira nessa hierarquia,
circularmente: vira `3` produz manilhas `4`. Todas as manilhas vencem qualquer
carta comum, e os naipes também desempatam manilhas. Como o baralho não contém
faces repetidas, duas cartas distintas não empatam. IDs e metadados não alteram
a força nesta versão.

## Distribuição e turnos

O jogador inicial da primeira mão é configurável no motor; a interface inicia
com o jogador humano. Ele alterna a cada nova mão, independentemente do vencedor.

O monte é embaralhado com Fisher–Yates. A distribuição entrega uma carta ao
primeiro jogador e uma ao outro, repetindo até ambos terem três. Só então a
sétima carta é retirada como vira. Uma compra nunca repõe cartas durante a mão.

Somente o jogador ativo pode jogar. A carta deve pertencer à sua mão atual,
ter zona e dono corretos e não ter sido usada. O motor rejeita ações inválidas,
repetidas ou fora de turno sem modificar o estado. A carta jogada permanece na
mesa como a mesma instância física.

## Vazas e mão

Cada vaza recebe uma carta de cada jogador. O CardStrength compara as duas usando
a vira da mão. O resultado registra faces, identidades, ordem e vencedor; este
inicia a próxima vaza. O primeiro a vencer duas vazas ganha a mão. Um placar de
vazas 2–0 encerra imediatamente a mão, deixando a terceira dupla sem jogar.

A resolução é uma ação lógica explícita após as duas cartas. A apresentação
Phaser usa essa fronteira para exibir a jogada antes de conferir o resultado.
Não existe uma segunda regra de resolução dentro da cena.

## Apostas

Toda mão começa valendo 1. O único caminho de aumento é:

```text
1 → 3 → 6 → 9 → 12
```

O valor aceito e a proposta pendente são separados. Uma proposta bloqueia todas
as jogadas até a resposta; não muda quem deve jogar depois da negociação.

O jogador ativo pode pedir o próximo aumento antes de jogar sua carta. Isso vale
no início da vaza ou ao responder à primeira carta. Não há aumentos durante
distribuição, resolução de vaza ou após terminar a mão. O último proponente não
pode pedir outro aumento após um aceite: o outro jogador detém esse direito,
mas precisa esperar seu próprio turno. A nova vaza não reinicia esse direito.

Somente o destinatário da proposta pode:

- **Aceitar:** o valor proposto passa a ser o aceito e o turno suspenso retorna.
- **Correr:** a mão termina; o proponente ganha o último valor aceito.
- **Aumentar:** aceita implicitamente o valor pendente e propõe o próximo nível,
  invertendo os papéis de proponente e destinatário. Não existe aumento além de 12.

Exemplo: jogador pede 3; IA contrapropõe 6. O valor aceito já é 3. Se o jogador
correr, a IA recebe 3, não 6. Não é possível correr sem proposta pendente.

## Pontuação e fim de partida

O vencedor por vazas recebe o valor aceito. Em uma recusa, o proponente recebe
esse mesmo valor anterior à proposta recusada. Os pontos são creditados uma
única vez no encerramento lógico da mão.

Quem alcançar ou ultrapassar 12 pontos vence a partida. O placar não é truncado;
por exemplo, 11 + 3 resulta em 14. Não existe regra especial de mão de 11.
Após o encerramento final, cartas, apostas e novas mãos ficam bloqueadas.

## Resultados, próximas mãos e descarte

O motor não possui timers ou animações. Uma mão não final fica em `handComplete`
enquanto seu resultado é apresentado. Depois, o coordenador visual confirma
`acknowledgeHandResult(handNumber)` e a próxima distribuição é automática.
Confirmações antigas ou repetidas não avançam outra mão.

Somente as seis cartas distribuídas e a vira da mão encerrada são retiradas para
`discard`. Se o monte ainda tem sete cartas, não há reembaralhamento. Caso
contrário, recolhe-se apenas o descarte elegível e embaralha-se esse conjunto
com as cartas que restaram no monte. Cartas de mãos ativas ou de outras zonas
não são varridas. IDs, encantamentos e modificadores são preservados.

O reembaralhamento aumenta `deckEpoch`: o histórico completo permanece público,
mas revelações antigas podem voltar a circular e deixam de ser excluídas das
estimativas da IA. Ordem do monte e descartes privados não são expostos.

## IA e informações autorizadas

A IA intermediária recebe somente observações imutáveis com suas cartas, vira,
jogadas públicas, histórico, contagem da mão humana, placar e ações legais.
Não recebe o controlador, a mão humana oculta ou a ordem do monte.

Ela procura ganhar gastando a menor carta suficiente, avalia contextos de vazas
e apostas e pode blefar sob limites configuráveis. As decisões são heurísticas,
não uma estratégia perfeita. RNG pode ser injetado para reprodução em testes.
Parâmetros e hooks preparam extensões futuras; não há níveis adicionais ou
habilidades específicas de personagens nesta versão.

## Fora do escopo da versão

Encantamentos e modificadores armazenam somente dados. HP, dano, escudo, tokens
funcionais, loja, expedições roguelite, efeitos de cartas, multiplayer, áudio e
mecânica de corte não estão implementados. A Fase 3 ainda precisa de escopo e
regras próprios; este lançamento não inclui combate funcional.
