# Escala BIOTEC v5.1.0 — teste no Netlify

Esta variante mantém o frontend e as regras da v5.1.0 e troca o SQLite local por PostgreSQL para funcionar de forma persistente no Netlify.

## Variáveis obrigatórias

- `DATABASE_URL`: string de conexão PostgreSQL (Neon funciona normalmente).
- `APP_TIMEZONE`: opcional. Padrão: `America/Sao_Paulo`.

## Publicação pelo GitHub + Netlify

1. Crie um repositório GitHub para este teste e envie o conteúdo desta pasta.
2. No Netlify: Add new project > Import an existing project > GitHub.
3. Selecione o repositório.
4. O arquivo `netlify.toml` já define:
   - Build command: `npm run build`
   - Publish directory: `public`
   - Functions directory: `netlify/functions`
5. Em Project configuration > Environment variables, adicione `DATABASE_URL`.
6. Faça o deploy.
7. Teste primeiro `/api/v5/health`; depois abra a página inicial.

## Dados iniciais

`bootstrap-data.json` foi extraído do `escala.db` da versão recebida. No primeiro acesso a um banco vazio, a aplicação cria as tabelas e importa esses dados automaticamente.

## Segurança

Esta versão de teste mantém o comportamento da v5.1.0 e ainda não adiciona autenticação. Não use como produção pública com dados sensíveis antes de implementar login/admin e autorização nos endpoints de escrita.


## v5.2.0 — impressão e exportações

- Botão **Imprimir** com layout A4 paisagem.
- Botão **Excel** (verde) exporta a visualização atual para `.xlsx`.
- Botão **PDF** (vermelho) exporta a visualização atual para PDF A3 paisagem.
- Exportações respeitam categoria, função, pesquisa e filtro "Somente alterados".
- ExcelJS e jsPDF são carregados por CDN com versões fixadas para gerar os arquivos no navegador.
