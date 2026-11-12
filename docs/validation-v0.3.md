# Validação final — Last Whisper v0.3.0

Data: 12/11/2026. Branch: `feat/v0.3-playable-truco`.

Os critérios essenciais de Truco jogável foram atendidos. A v0.3.0 conclui os
nove pacotes de regras, IA, ciclo de partida e integração Phaser. Não inclui
combate, progressão roguelite ou outras funcionalidades planejadas para fases
posteriores. Não foi realizado merge na `main`, push ou criação de tag.

## Funcionalidades concluídas

- 52 cartas únicas compartilhadas, com identidade e metadados preservados.
- Hierarquias de valores/naipes, manilhas circulares e comparação sem empates
  entre faces distintas, em funções puras sem Phaser.
- Distribuição alternada de três cartas por jogador e uma vira, alternância
  do primeiro jogador e validação de zona, dono, turno e uso da carta.
- Até três vazas, vencedor iniciando a seguinte e mão encerrada na segunda vitória.
- Apostas `1 → 3 → 6 → 9 → 12`, aceite, recusa e contra-aposta, com proposta
  pendente separada do aceito e retorno ao turno suspenso.
- IA intermediária de cartas/apostas, blefes limitados, RNG injetável e acesso
  somente à observação autorizada.
- Placar oficial até 12 ou mais, sem regra especial em 11, resultados imutáveis,
  transições após a apresentação e reembaralhamento exclusivo do descarte elegível.
- Interface Phaser com Drag & Drop, cartas ocultas, indicadores, animação breve
  da IA, modal de apostas, resultados, Vitória/Derrota, reinício e menu.

As [regras finais](rules-v0.3.md) são a referência funcional da versão.

## Ambiente e comandos executados

Windows, Node.js `26.13.0`, npm `11.20.0`, Phaser `4.2.1`, Vite `8.3.7` e Edge
headless via protocolo DevTools. Dependências não foram atualizadas neste pacote.

| Comando/check | Resultado final |
| --- | --- |
| `npm test` | 82 testes aprovados, zero falhas, cancelamentos ou testes ignorados. |
| `npm run build` | Aprovado; bundle JS aproximadamente 1.404 kB, 370 kB gzip. |
| `npm run test:browser` | Aprovado nos nove viewports abaixo, sem exceções de navegador. |
| Versão dos manifests | `0.3.0` em `package.json`, raiz do lockfile e pacote raiz do lockfile. |
| `git diff --check` | Sem erros de whitespace. |

O build mantém o aviso de chunk acima de 500 kB. Ele não é tratado como falha
nem como uma otimização já implementada.

Duas tentativas iniciais do navegador no sandbox expiraram em `Runtime.enable`,
antes de carregar o jogo. A execução fora desse isolamento funcionou. Depois
das correções visuais, `npm run test:browser` foi executado novamente fora do
sandbox e passou em toda a matriz. Não foi atribuído esse timeout ao motor.

## Matriz de navegador

As larguras pedidas são as dimensões curtas dos dispositivos emulados. Foram
validadas as duas orientações de cada par, além de desktop:

| Referência | Portrait | Landscape | Entrada |
| --- | --- | --- | --- |
| 320 px | 320 × 568 | 568 × 320 | Toque emulado |
| 375 px | 375 × 667 | 667 × 375 | Toque emulado |
| 390 px | 390 × 844 | 844 × 390 | Toque emulado |
| 768 px | 768 × 1024 | 1024 × 768 | Toque emulado |
| Desktop | — | 1100 × 760 | Mouse |

Cada cenário cobre arrastos e retornos inválidos, rotação durante arrasto e
durante tarefas da IA, bloqueios visuais, modal durante resize, aceite, recusa,
contra-aposta, limite 12, resultado da mão, próxima distribuição, tela final,
reinício, menu, reentrada e insets simulados. A regressão verifica também que
as cartas não sobrepõem a barra de ações e que o texto cabe nos botões.

Foram exercitadas Vitória e Derrota com fixtures determinísticas e uma partida
completa na interface contra a IA intermediária real. Os cenários específicos
usam tempos visuais menores; os tempos de produção continuam 420/240/700/1600 ms.
As 27 capturas estão em `artifacts/truco-v0.3/`; `*-table` mostra a mesa após rotação.

## Simulações e consistência

O teste novo de release executa 408 partidas: 68 sementes (incluindo zero e
extremos de 32 bits), ambos os iniciadores e três políticas de jogador:
paciente, aleatória legal e pressão por aumentos.

Resultado determinístico observado:

- 2.102 mãos encerradas e 13.649 ações legais aplicadas.
- 439 encerramentos por recusa e 102 reembaralhamentos.
- 408 partidas terminadas aos 12 ou mais, sem exceder 23 mãos por partida.
- Nenhuma aposta sem resposta legal, travamento, carta duplicada ou perda de identidade.
- Pontuação conferida por uma contagem independente dos resultados de mãos.
- Ações inválidas injetadas não alteraram cartas, fase, proposta, placar ou eventos.
- Metadados preservados e o mesmo Deck mantido durante cada partida.

Essas políticas venceram 25 partidas e a IA venceu 383. O teste mede consistência
e conclusão, não equilíbrio de dificuldade ou representatividade de jogadores
humanos. As simulações anteriores de reprodução, partidas entre IAs, privacidade,
vazas, apostas, falhas de RNG e 23 mãos com três reciclagens também passaram.

## Correções deste pacote

1. Textos longos, principalmente “Jogar novamente” e “Aumentar 9”, excediam
   botões estreitos em 320 px. O componente ajusta o tamanho pela largura real
   do texto, preservando margem interna. A regressão passou a verificar isso.
2. O placar em portrait estreito ficava próximo dos botões do cabeçalho. Seu
   posicionamento e o início da sombra modal foram ajustados.
3. A regressão foi ampliada de três para nove viewports, mantendo os cenários
   anteriores. A versão foi atualizada nos manifests, sem mudanças de dependências.

Não foi encontrada falha de regras que exigisse alterar CardStrength, Deck ou
MatchController neste pacote.

## Commits da v0.3.0

| Pacote | Commit | Entrega |
| --- | --- | --- |
| 1 | `7cf40e7` | CardStrength puro e testes. |
| 2 | `a714740` | Distribuição e turnos. |
| 3 | `44f3bf1` | Resolução de vazas e mãos. |
| 4 | `ccabeff` | Observação autorizada e IA de cartas. |
| 5 | `742aad9` | Apostas completas e recusa. |
| 6 | `d0ed7d6` | IA de apostas e blefes. |
| 7 | `ee15ccc` | Placar e ciclo completo. |
| 8 | `51c1225` | Integração Phaser e regressão. |
| 9 | Este commit | Validação final, correções de 320 px, versão e documentação. |

`git log --oneline -9` identifica o hash do commit que contém este relatório.

## Arquivos de referência

- `src/game/rules/CardStrength.js`: comparação e manilha.
- `src/game/deck/Deck.js`: instâncias, monte e zonas.
- `src/game/MatchController.js`: turnos, apostas, resultados, placar e ciclo.
- `src/game/ai/matchObservation.js`: fronteira de informação autorizada.
- `src/game/ai/CardAI.js` e `BettingAI.js`: estratégias intermediárias.
- `src/ui/MatchPresenter.js`, `gameTableView.js` e `src/scenes/GameScene.js`:
  coordenação visual, desenho e entrada, sem regras paralelas.
- `tests/release-validation.test.js`: matriz de sementes e invariantes.
- `scripts/browser-regression.mjs` e `truco-browser-scenarios.mjs`: regressão real.
- `docs/rules-v0.3.md`: regras consolidadas; documentos por pacote detalham as APIs.

## Como executar

```sh
npm ci
npm run dev
```

Para validar: `npm test`, `npm run build` e `npm run test:browser`.
Para abrir o build local: `npm run preview`. O script de navegador usa Edge no
caminho padrão do Windows; `BROWSER_PATH` pode indicar outro Chromium compatível.
Seu processo e perfil temporário são próprios e o encerramento limpa somente
o diretório temporário criado pelo teste.

## Limitações e próximos trabalhos

- Toque e safe areas foram emulados; aparelhos físicos continuam pendentes.
- Safari, Firefox e outros sistemas operacionais não foram validados nesta entrega.
- A IA é heurística e não foi calibrada com jogadores humanos. Não há níveis novos.
- Cartas são programáticas e animações são básicas; não há áudio ou recursos
  dramáticos específicos de personagens. Interromper um tween no resize mostra
  a posição final já confirmada pelo motor.
- Não há save/load nem persistência entre partidas. Reiniciar cria outra partida.
- Encantamentos e modificadores são dados sem efeitos ou expiração funcional.
- HP, dano, escudo, tokens, loja, roguelite, multiplayer e corte são futuros.

Para a Fase 3, recomenda-se primeiro definir e aprovar regras de HP, dano e escudo.
O combate deve consumir resultados/eventos do motor, em um módulo separado,
sem duplicar placar, vazas ou apostas na cena. Definir também duração e ciclo de
vida de modificadores antes de ativar efeitos. Conservar as regressões de
sementes, identidade e cancelamento de callbacks, testar em celulares reais e
medir dificuldade e desempenho antes de acrescentar progressão ou loja.
