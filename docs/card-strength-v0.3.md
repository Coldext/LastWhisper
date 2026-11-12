# CardStrength — v0.3.0, Pacote 1

`src/game/rules/CardStrength.js` contém funções puras em módulos ES, sem Phaser.
As ordens imutáveis `RANK_ORDER` e `SUIT_ORDER` são próprias das regras; não
alteram a ordem de criação ou distribuição do baralho existente.

```js
import { getManilhaRank, isManilha, getCardStrength, compareCards }
  from '../src/game/rules/CardStrength.js';

const vira = { rank: '3', suit: 'hearts' };
const first = { rank: '4', suit: 'diamonds' };
const second = { rank: '3', suit: 'clubs' };
getManilhaRank(vira);              // '4' (hierarquia circular)
isManilha(first, vira);            // true
getCardStrength(first, vira);      // 52
compareCards(first, second, vira); // 1: primeira carta vence
```

As funções aceitam definições, instâncias existentes ou objetos com `rank` e
`suit` válidos. Todos os valores são strings exatas, sem conversão implícita.
Não exigem IDs nem validam metadados, pois a força depende somente de valor,
naipe e vira. Nenhuma função modifica as cartas ou aplica efeitos.

- Valores crescentes: `4, 5, 6, 7, 8, 9, 10, J, Q, K, A, 2, 3`.
- Naipes crescentes: `diamonds, spades, hearts, clubs`.
- Manilha: próximo valor da vira; todas superam cartas comuns.
- `getCardStrength(card, vira)`: índice do valor × 4 + índice do naipe;
  manilhas usam índice de valor 13. A força é contextual, calculada em cada
  chamada, sem armazenar um campo na carta.
- `compareCards(first, second, vira)`: retorna `1`, `-1` ou `0` conforme a
  primeira carta seja maior, menor ou tenha o mesmo valor e naipe da segunda.
  IDs diferentes não afetam a comparação. Naipe desempata também cartas comuns.
- Todas as entradas, incluindo a vira e ambas as cartas, são validadas.
  Objetos/campos com tipos incorretos geram `TypeError`; strings de valor ou
  naipe desconhecidas geram `RangeError`. Não há vira padrão.

Validação: `npm test` inclui `tests/card-strength.test.js`, com comparação de
todos os pares das 52 definições para os 13 valores de vira, circularidade,
entradas inválidas, identidade e preservação de metadados. `npm run build`
valida o build existente; o módulo ainda não está conectado à apresentação.

Este pacote não implementa turnos, vazas, IA, apostas ou interface de regras.
