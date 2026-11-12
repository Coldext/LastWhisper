# Publicação no GitHub Pages

URL esperada após a primeira publicação bem-sucedida:
<https://coldext.github.io/LastWhisper/>.

## Configuração

`vite.config.js` define somente `base: '/LastWhisper/'`. Na inspeção inicial não
havia arquivo de configuração Vite no disco nem workflows em `.github/`.
Nenhuma configuração existente foi substituída e nenhuma regra do jogo foi alterada.

O Vite reescreve a entrada de `index.html` e as referências de JS/CSS do build.
As cartas Phaser atuais são desenhadas programaticamente; não há carregadores
de texturas com caminhos absolutos da raiz. Para futuros arquivos de `public/`,
usar `import.meta.env.BASE_URL + 'arquivo.png'`; para arquivos de `src/`, usar
imports ou `new URL('./arquivo.png', import.meta.url)` compatíveis com o Vite.
Evitar `/assets/...` fixo, que apontaria para fora de `/LastWhisper/`.

O workflow `.github/workflows/deploy-pages.yml`:

1. Executa em push para `main` ou manualmente selecionando `main`.
2. Usa Node.js 26 e o lockfile do projeto.
3. Executa `npm ci`, `npm test` e `npm run build`, nessa ordem.
4. Envia exclusivamente `dist` com `actions/upload-pages-artifact`.
5. Publica esse artefato no environment `github-pages`, após o build passar.

Os jobs verificam `github.ref == 'refs/heads/main'`: uma execução manual em outra
branch é ignorada. O deploy tem `pages: write` e `id-token: write`; o build tem
somente leitura do repositório. Usa-se `GITHUB_TOKEN`, sem PAT ou branch `gh-pages`.
Publicações são serializadas sem interromper uma publicação em andamento.
O navegador não é exigido no workflow Ubuntu; os testes Node e o build são obrigatórios.

## Ativação no GitHub

1. Abra o repositório **Coldext/LastWhisper → Settings → Pages**.
2. Em **Build and deployment → Source**, selecione **GitHub Actions**.
3. Se houver restrições em **Settings → Environments → github-pages**, permita
   deployments da `main` e atenda às aprovações exigidas pelo repositório.
4. Depois de aprovar e integrar as alterações à `main`, acompanhe **Actions →
   Deploy Last Whisper to GitHub Pages**. O push do merge dispara a publicação.
5. Se o merge ocorreu antes de ativar Pages, use **Run workflow** selecionando
   `main`. A URL final aparecerá no environment e na execução do deploy.

Referências oficiais: [GitHub Pages com workflows personalizados](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
e [deploy de Vite no Pages](https://vite.dev/guide/static-deploy.html#github-pages).

## Como levar as alterações à main

As alterações estão na branch `chore/github-pages`, com base na v0.3.0
(`755716d`). Não foi feito push, merge ou alteração remota de Settings.

Quando quiser enviar a branch para revisão:

```sh
git push -u origin chore/github-pages
```

No GitHub, crie um pull request de `chore/github-pages` para `main` e revise o
conjunto antes de aprovar o merge. A `main` local ainda estava na v0.2 durante a
inspeção: se a v0.3.0 ainda não foi integrada, esse PR também incluirá os nove
commits do Truco jogável. É possível revisar/integrar a branch da v0.3.0 primeiro
e então revisar este PR. Nenhuma dessas integrações foi executada automaticamente.

O workflow precisa existir em `.github/workflows/deploy-pages.yml` na `main`,
junto com `vite.config.js` e o código a publicar. Não copie apenas o YAML sem
o base path. Não é necessário adicionar `dist` ao Git: ele é gerado pelo workflow.

## Validação local

```sh
npm ci
npm test
npm run build
npm run preview
```

Abra o endereço de preview com `/LastWhisper/`, normalmente
`http://localhost:4173/LastWhisper/`. O mesmo prefixo se aplica a `npm run dev`.

Para validar o build compilado no Edge:

```sh
node scripts/browser-regression.mjs --preview
```

Esse modo serve somente `dist` pelo preview Vite, verifica URLs e MIME types dos
assets, exige HTTP 200 para JS/CSS e SVG público, inicia o Phaser e usa o botão
real para entrar na mesa. Não importa módulos de `/src` nem injeta estado no jogo.
A captura da mesa compilada fica em `artifacts/pages/preview.png`.

A regressão completa continua em `npm run test:browser`. Seu servidor e imports
agora respeitam o `base` resolvido do Vite. Ela também falha se observar respostas
HTTP de erro para assets sob esse prefixo. Para não atualizar capturas existentes,
defina `BROWSER_SCREENSHOTS=0`; no PowerShell:

```powershell
$env:BROWSER_SCREENSHOTS='0'
npm run test:browser
```

A validação desta configuração executou `npm ci`, os 82 testes Node e o build.
O teste de produção confirmou dois assets compilados e o SVG público com HTTP
200, e a mesa Phaser abriu sem exceções sob `/LastWhisper/`. A regressão completa
passou nos nove viewports de desktop, portrait e landscape com o mesmo prefixo,
sem exceções de navegador ou respostas HTTP de erro nos assets monitorados.
O aviso existente
de tamanho do bundle permanece. A execução remota no GitHub Actions e o endereço
público só poderão ser confirmados após ativação de Pages e merge aprovado.
