# Escala BIOTEC v5.5.0 — versões e log de atividades

O pacote inclui a implementação do histórico de versões da v5.4.0 e adiciona o log administrativo. Publique via GitHub preservando DATABASE_URL e os dados do Neon.

## Histórico de versões

Depois do deploy, entre como ADMIN, abra Versões salvas e crie separadamente a base histórica disponível no código e o snapshot atual. A base do código não comprova ser a primeira escala publicada. Faça download do JSON de cada versão e armazene fora do Neon.

## Log de atividades

O botão Log de atividades aparece apenas ao administrador autenticado. Registra login aceito e recusado, criação e alteração de contas, criação de versões e alterações de colaboradores, ciclos e férias. Registra autor, hora (visualização em Brasília), ação e estados anterior/posterior quando disponíveis, sem armazenar senhas/hashes/tokens. Pesquisa por usuário, ação e datas; exporta CSV da página consultada. Os logs anteriores à instalação NÃO podem ser retroativamente atribuídos aos usuários.

## Limitações e cuidados

O log de alterações de colaboradores reaproveita os eventos históricos existentes, mas os registros operacionais e o log são escritas separadas. Uma interrupção excepcional entre elas pode deixar uma alteração sem log; para trilha de auditoria de conformidade estrita, será necessário migrar toda alteração para transação única com auditoria atômica. Não confundir backup da escala no Neon com backup independente do banco: mantenha exportações JSON externas. Não publique credenciais no repositório.
