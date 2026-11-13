# LastWhisper v0.3.2 — Painel de Dicas na Mesa

## Comportamento

O cabeçalho da mesa inclui DICAS, com alvo de toque de 80×44 px. Em telas estreitas, MENU, REINICIAR e DICAS ocupam a primeira linha; o placar mantém a identificação do Errante logo abaixo. O painel também pode ser consultado durante apostas, resultados e encerramento da partida.

DICAS abre uma cena Phaser sobreposta, sem pausar, reiniciar ou encerrar `GameScene`. A IA, as animações e a distribuição automática preservam seus temporizadores. A referência se atualiza se a mão mudar enquanto estiver aberta. Não executa ações, consome recursos ou oferece recomendações.

O fundo semitransparente intercepta cliques e toques em toda a mesa. Há guardas adicionais para eventos antigos de cartas, apostas e demais controles. FECHAR permanece fora da área de rolagem; Escape também fecha. Roda do mouse, arrasto e teclas de navegação permitem consultar conteúdo em telas pequenas. A orientação acompanha `Phaser.Scale.RESIZE` e as safe areas aplicadas ao contêiner existente.

Reutiliza `draw.js`, o tema e `createCardView`. O recorte segue as APIs já utilizadas pelo tutorial: filtro de máscara em WebGL do Phaser 4 e máscara geométrica em Canvas. Não há novas dependências.

## Conteúdo e regras

1. **Força das cartas:** 3 > 2 > A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4, derivada de `RANK_ORDER`.
2. **Força dos naipes:** ♣ Paus > ♥ Copas > ♠ Espadas > ♦ Ouros, derivada de `SUIT_ORDER`; numerada da mais forte para a mais fraca, com símbolos vermelhos para copas/ouros.
3. **Manilha atual:** vira pública da mão → quatro faces ilustrativas do valor calculado por `getManilhaRank`. Todas as cartas desse valor são manilhas; o naipe determina a força relativa entre elas.

O motor coloca **Q acima de J**, diferentemente da sugestão do prompt, e aplica desempate por naipe a **cartas comuns e manilhas**. A UI reflete essas duas regras reais. A ordem é circular: uma vira 3 produz manilhas 4. Nenhuma regra, força de carta, aposta, pontuação ou decisão da IA foi alterada.

## Dados públicos

`GameScene` envia somente `{handNumber, vira: {rank, suit}}` ao painel. Quando a mesa é redesenhada, emite esse mesmo recorte público; a cena de referência só se redesenha quando a mão/vira muda.

`tableTips(vira)` recebe a face pública da vira, sem acesso ao controlador, às mãos, ao monte ou aos metadados. A ilustração das quatro manilhas não representa cartas de um jogador: são todas as faces possíveis desse valor, sem IDs de instância nem indicação de posse. Abrir ou fechar não chama nenhuma ação do controlador/presenter.

## Arquivos

| Arquivo | Alteração |
| --- | --- |
| `src/scenes/TipsScene.js` | Nova cena de referência sobreposta e rolável, com FECHAR fixo. |
| `src/ui/tableTips.js` | Modelo de apresentação que consome as ordens e a função do motor. |
| `src/scenes/GameScene.js` | Abertura, notificações públicas, encerramento e guardas de entrada. |
| `src/ui/gameTableView.js` | Botão DICAS e acomodação do cabeçalho em telas estreitas. |
| `src/main.js`, `src/version.js` | Registro da cena e identificação da atualização no título da página. |
| `package.json`, `package-lock.json` | Versão 0.3.2, sem mudanças de dependências; comando `test:tips`. |
| `tests/table-tips.test.js` | Validação das 52 viras, hierarquias e restrição de acesso aos dados. |
| `tests/drag-drop.test.js` | Adaptador de cena atualizado e regressões de bloqueio/retorno de cartas. |
| `scripts/tips-browser-scenarios.mjs` | Cenários dedicados do painel. |
| `scripts/browser-regression.mjs` | Opção `--tips` para selecionar esses cenários. |
| `scripts/truco-browser-scenarios.mjs` | Consulta a DICAS durante aposta pendente e no resultado final. |
| `README.md`, `docs/tips-v0.3.2.md` | Identificação da versão, controles e relatório. |
| `artifacts/tips-v0.3.2/` | Capturas do painel em desktop e mobile. |

## Validação

- `npm test`: 86 testes aprovados, incluindo a matriz de 408 partidas; os testes novos conferem todas as viras contra o motor, recorte público de dados e proteção de eventos de arrasto/aposta enquanto o painel está aberto.
- `npm run build`: build de produção aprovado, com o aviso existente de bundle maior que 500 kB.
- `npm run test:tips`: aprovado nos nove viewports. Verifica conteúdo, hierarquias, vira/manilha, ausência de IDs de cartas privadas no painel, abertura/fechamento sem mudança de estado, bloqueio de entrada, continuidade dos temporizadores da IA e das apostas, atualização automática na próxima mão, rolagem, rotação e safe areas simuladas. Geradas 18 capturas.
- `npm run test:browser`: regressão da mesa aprovada nos nove viewports, incluindo consulta a DICAS durante uma contraproposta e na tela final, preservando aposta, fase e placar. A conexão DevTools apresentou o timeout já observado no isolamento; a execução fora dele concluiu a suíte sem exceções.

Matriz de navegador: 1100×760, 320×568, 568×320, 375×667, 667×375, 390×844, 844×390, 768×1024 e 1024×768, com mouse ou toque emulado no Edge headless. Aparelhos físicos, Safari, Firefox e o fallback Canvas não foram validados visualmente.
