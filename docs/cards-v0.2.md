# Cartas e monte compartilhado — v0.2

## Responsabilidades

| Arquivo | Responsabilidade |
| --- | --- |
| `src/game/cards/cardDefinitions.js` | Gera e congela as 52 combinações de quatro naipes e 13 valores, sem Joker. |
| `src/game/cards/cardFactory.js` | Cria instâncias, protege sua identidade e guarda sua localização lógica. |
| `src/game/cards/cardModifiers.js` | Manipula um encantamento e uma coleção de modificadores por carta, apenas como dados. |
| `src/game/deck/Deck.js` | Mantém o cadastro único, o monte, as compras e as transições entre zonas. |
| `src/game/DemoGame.js` | Distribui as mãos e a vira do protótipo e valida a propriedade antes de jogar. |
| `src/logic/HandState.js` | Controla interação por `instanceId` e ponteiro, além das posições relativas da apresentação. |
| `src/ui/cardPresentation.js` | Converte valor e naipe para apresentação; cartas ocultas não expõem dados privados. |
| `src/ui/cardView.js` | Desenha containers Phaser e configura hitboxes/arrasto; ponto de substituição futura por sprites. |
| `src/scenes/GameScene.js` | Conecta a demonstração à entrada, aos tweens e ao layout responsivo. |

Os módulos de `game/` não importam Phaser. O projeto usa a dependência já instalada, Phaser 4.2.1; esta implementação não altera sua versão.

## Definição, instância e localização

Uma definição como `hearts-K` contém somente `definitionId`, `suit` e `rank`, todos imutáveis. Cada instância recebe um `instanceId` diferente, inclusive entre baralhos criados durante a mesma execução. Esses IDs permanecem estáveis por toda a vida da instância; não são IDs de objetos gráficos.

`instanceId`, `definitionId`, `suit` e `rank` não podem ser reatribuídos. A instância contém também `enchantment: null`, `modifiers: []` e a localização somente para leitura `runtime: { zone, ownerId }`. Não existe força definitiva nem coordenada visual na carta.

`Deck.getCard(instanceId)` retorna o mesmo objeto que circula entre zonas. As consultas `cardsIn(zone, ownerId)` são derivadas de uma única localização por carta; não são listas independentes que possam registrar a mesma carta em duas zonas. As zonas atuais são `deck`, `playerHand`, `opponentHand`, `vira`, `table` e `discard`. `vira` é separada de `table` para não misturar a referência pública com cartas jogadas.

Usar `draw`, `move` e `collectAndShuffle` para movimentação. `setCardLocation` é um detalhe interno entre a fábrica e o baralho, não uma API de jogada para a interface. O cadastro e a ordem do monte são privados; os arrays públicos de consulta são cópias.

## Compras e reembaralhamento

```js
const deck = new Deck();
deck.shuffle(Math.random); // Fisher–Yates; RNG injetável retorna números em [0, 1)
const hand = deck.draw(3, { zone: 'playerHand', ownerId: 'player' });
const opponent = deck.draw(3, { zone: 'opponentHand', ownerId: 'opponent' });
const [vira] = deck.draw(1, { zone: 'vira' });
```

O topo é o final do array interno. `draw()` retorna um array, mesmo para uma carta. Por padrão, a zona de destino de uma compra sem opções é `discard`; a cena sempre especifica o destino. Quantidades não inteiras, menores que um ou maiores que o monte causam `RangeError` sem compra parcial. Mãos exigem um `ownerId`. Não há reposição automática.

`shuffle` altera apenas a ordem das cartas ainda no monte. `collectAndShuffle({ zones: ['discard'], rng })` recolhe explicitamente as zonas elegíveis e embaralha; permite somente `discard`, `table` e `vira`. Cartas ainda nas mãos são excluídas e uma tentativa de incluir zonas de mão é rejeitada. Nenhuma dessas operações recria cartas ou apaga seus metadados. RNG inválido falha sem modificar parcialmente o monte.

## Fluxos da demonstração

- Início: um único `Deck`, embaralhado, fornece três cartas ao jogador, três ao adversário e uma vira. Restam 45 cartas.
- Soltura válida: `DemoGame.play` confirma zona e dono, move a mesma instância de `playerHand` para `table` e preserva `ownerId`. A mão deixa de contê-la imediatamente. Uma repetição retorna `false`.
- Interação válida: `inHand → dragging → played`. A cena desativa o arrasto e a interação antes de atualizar a apresentação. As posições relativas são guardadas no controlador de apresentação, fora da instância lógica.
- Soltura inválida: `inHand → dragging → returning → inHand`. A carta continua em `playerHand`; somente o callback de conclusão do tween restaura a entrada. Não há temporizador adicional nem recriação de hitbox.
- Resize: a apresentação é reconstruída, arrastos/retornos pendentes são cancelados e cartas da mão voltam à posição de mão. As cartas jogadas conservam posições relativas, limitadas para caber na mesa. Eventos/callbacks de containers antigos são ignorados.
- **NOVA MÃO**: usa o mesmo baralho. No protótipo, recolhe a mão anterior de ambos os jogadores, a vira e as cartas da mesa para `discard`, então compra outras sete do monte. Isso é uma convenção de demonstração, não uma regra definitiva de Truco. Identidades e metadados permanecem intactos. Se restarem menos de sete cartas, a operação preserva a mão atual e mostra um aviso, sem reembaralhar.
- **REINICIAR DEMO**: ação explícita no cabeçalho. Cria outra demonstração com 52 instâncias novas e metadados iniciais. Não equivale a reembaralhar durante uma partida. Voltar ao menu e iniciar novamente também começa outra demonstração.

## Encantamentos e modificadores

```js
import { setEnchantment, removeEnchantment, addModifier, removeModifier }
  from '../src/game/cards/cardModifiers.js';

setEnchantment(card, { id: 'blood', level: 1 });
// Uma segunda adição falha; substituição exige intenção explícita:
setEnchantment(card, { id: 'blood', level: 2 }, { replace: true });
removeEnchantment(card);

addModifier(card, { id: 'example-1', source: 'test', duration: 'hand', params: {} });
removeModifier(card, 'example-1');
```

O exemplo armazena dados, sem executar efeitos. Consultar `card.enchantment` e `card.modifiers`. O ID de modificador é único dentro da carta; IDs distintos permitem representar aplicações individuais. As funções copiam e congelam os dados recebidos e rejeitam funções e valores incompatíveis com JSON. Não aplicar modificadores com `Object.assign(card, modifier)` nem substituir os campos diretamente: usar as funções de manipulação.

As transições não removem encantamentos nem expiram modificadores, mesmo que os dados indiquem `duration: 'hand'`. A interpretação e a duração serão definidas pelo futuro motor de regras. `createCardView` aceita um callback opcional `renderEnchantment`, sem ícone padrão e nunca chamado para cartas ocultas. Nenhum efeito está implementado.

`JSON.stringify(card)` e `JSON.stringify(deck)` produzem dados simples. O snapshot do baralho contém as instâncias e a ordem dos IDs do monte. Não foi implementado carregamento de saves nem persistência de expedição.

## Validação e preparação para Git

```text
npm test
node scripts/browser-regression.mjs
npm run build
```

Os testes nativos cobrem geração, identidade, shuffle determinístico, compras atômicas, distribuição compartilhada, vira, zonas, jogadas repetidas, metadados, reembaralhamento, serialização e os handlers de arrasto anteriores. Os testes de handlers usam adaptadores determinísticos; não substituem o navegador.

O script opcional de navegador usa Edge headless e o protocolo DevTools com recursos nativos do Node, sem dependência adicional. Para outro executável Chromium, definir `BROWSER_PATH`. Ele inicia o Vite localmente e verifica mouse desktop e toque emulado em portrait/landscape, retornos repetidos, três jogadas, cliques rápidos, bloqueio de novos arrastos, resize, nova mão, reinício e navegação entre cenas. Capturas ficam em `artifacts/cards-v0.2/`. A emulação de toque é ativada antes do carregamento da página, quando o Phaser escolhe seus gerenciadores de entrada. A validação em celular físico continua recomendada.

Resultado nesta entrega: 17 testes nativos aprovados; regressão no Edge aprovada nos três modos; build de produção aprovado, com o aviso de tamanho do bundle. Também foi verificado que o aviso de monte insuficiente aparece sem consumir ou descartar cartas. O layout compacto do adversário foi ajustado para manter seu rótulo acima da mesa.

Não há efeitos, IA, pontuação, tokens funcionais, HP nem novas regras de Truco. Os botões de Truco/tokens conservam o comportamento demonstrativo anterior. O build pode emitir o aviso já existente de tamanho do bundle do Phaser.

Commit sugerido (executar somente após revisão e aprovação):

```text
feat: implement card architecture and shared deck for v0.2

- generate immutable definitions and stable card instances
- add shared deck, explicit zone transitions and prototype hand lifecycle
- store enchantments/modifiers without effect resolution
- integrate instance IDs with responsive card views and guarded drag/drop
- cover card invariants and interaction regressions; document architecture
```

Nenhum commit, push ou tag é realizado pelos scripts.
O diretório de trabalho fornecido não contém um repositório Git reconhecido (`git rev-parse --show-toplevel` falhou). Não foi criado um repositório automaticamente.

Inventário da entrega:

- Criados: `src/game/cards/cardDefinitions.js`, `cardFactory.js`, `cardModifiers.js`; `src/game/deck/Deck.js`; `src/game/DemoGame.js`; `src/ui/cardPresentation.js`, `cardView.js`; `tests/cards.test.js`; `scripts/browser-regression.mjs`; este documento e três capturas em `artifacts/cards-v0.2/`.
- Alterados: `src/scenes/GameScene.js`, `src/logic/HandState.js`, `src/ui/draw.js`, `tests/drag-drop.test.js`, `package.json` e `package-lock.json`. Os metadados do pacote passam a `0.2.0`; não há atualização de dependências. `npm run test:browser` também executa a regressão no navegador.
- Removidos: nenhum arquivo. O desenho de cartas foi extraído de `draw.js` para `cardView.js`, eliminando a duplicação entre cartas estáticas e arrastáveis.
