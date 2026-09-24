# Escala BIOTEC v5.4.0 — histórico de versões

## Fontes verificadas no pacote recebido
- `seed-data.json`: 37 motoristas e 33 operadores; é uma fonte de cadastro, não um backup datado do site.
- `bootstrap-data.json`: 70 colaboradores, nenhum ajuste/férias/histórico; datas dos dados são distintas da data de publicação; **não comprova a primeira escala publicada**.
- O PostgreSQL da produção não foi acessado na preparação do pacote. A opção **Fontes encontradas** consulta contagens atuais apenas após publicar e entrar como administrador.

## Como preservar os dois marcos
1. Faça cópia externa do banco Neon antes de publicar.
2. Publicar v5.4.0. O deploy só cria tabela de snapshots; não cria nem substitui automaticamente uma suposta versão original.
3. Login como admin → Versões salvas → leia o painel Fontes.
4. Clicar **Preservar base histórica disponível no código**: snapshot estático da base `bootstrap-data.json`, rotulado explicitamente como origem não comprovada.
5. Clicar **Salvar escala atual agora**: cópia consistente das quatro tabelas de dados com todos os colaboradores (inclusive inativos), ajustes, férias e logs, sem credenciais.
6. Baixe ambos os arquivos JSON; no modo Visualizar escala, exporte cada categoria/mês para Excel/PDF e retorne à escala atual após consultar.

## Garantias e limitações
- Os snapshots são gravados em PostgreSQL, em tabela separada, sem endpoints de edição, exclusão ou restauração.
- Somente administrador cria; equipe autenticada consulta e baixa backups; visitantes não acessam o arquivo completo.
- Dados originais só podem ser recuperados exatamente se existir uma cópia histórica fiel. Logs parciais não garantem reconstrução de um estado passado.
- O estado das férias é preservado em ausencias_v5; senhas e contas nunca são exportadas.
- Não existe backup automático fora do banco Neon: baixe os JSON para armazenamento externo.
