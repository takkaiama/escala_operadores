# Escala BIOTEC v5.4.0 — histórico de versões

## Antes de publicar
Faça um backup externo do seu banco Neon e mantenha `DATABASE_URL`, `ESCALA_ADMIN_USER`, `ESCALA_ADMIN_PASSWORD` e `ESCALA_AUTH_SECRET` no Netlify. Não copie essas variáveis para o GitHub.

## Depois do deploy
1. Entre com o administrador e abra **Versões salvas**.
2. Confira o painel **Fontes encontradas**: ele consulta as contagens do PostgreSQL atual e apresenta a quantidade de registros incorporados ao arquivo `bootstrap-data.json` (não é a primeira escala publicada comprovada).
3. Clique **Preservar base histórica disponível no código**, caso deseje guardar a base parcial disponibilizada pelo projeto.
4. Clique **Salvar escala atual agora** para preservar um segundo marco com o banco ativo. Use um nome descritivo.
5. Baixe o JSON de ambas as versões. Você pode abrir cada versão, alternar entre Motoristas/Operadores e meses e baixar Excel/PDF ou imprimir.
6. Clique **Voltar à escala atual** para sair do modo histórico. A consulta histórica não reverte nem edita o banco de trabalho.

## Limitações de autenticidade
- `bootstrap-data.json` contém 70 colaboradores e nenhum ajuste, férias ou registro de auditoria. Não representa, necessariamente, a primeira publicação do site.
- `seed-data.json` é uma base auxiliar com 37 motoristas e 33 operadores. Não documenta o momento em que cada alteração foi publicada.
- O histórico de alterações do banco **não garante** recuperação integral de uma escala já modificada; somente um backup integral anterior comprova seu estado exato.
- Não houve acesso ao PostgreSQL de produção durante o preparo deste ZIP. As contagens e a primeira data do banco ativo somente serão consultadas no painel **Fontes encontradas** após publicar.
- Nenhum snapshot foi criado no banco de produção durante o preparo do pacote. É necessário criar ambos, uma vez, na interface, após o deploy.

## Proteções
- Snapshot é imutável: a API não oferece endpoint de editar, restaurar ou excluir backups.
- Somente ADMIN cria versões. ADMIN e USUARIO logados visualizam e exportam, visitantes sem login não acessam o histórico.
- Os snapshots incluem cadastro de colaboradores (ativos e inativos), ajustes, férias e histórico de alterações; não incluem contas nem hashes de senhas.
- O conteúdo histórico é armazenado no PostgreSQL na tabela isolada `snapshots_escala_v5` e transacionado com isolamento REPEATABLE READ.
- Para ter backup fora do Neon, **baixe os JSON** e guarde cópias separadas.

## Publicação
Copie os arquivos deste pacote para a raiz do repositório `takkaiama/escala_operadores` (preservando `.git` e os dados e variáveis do Netlify), faça commit e push. O Netlify fará o deploy pelo GitHub.
