# Escala BIOTEC v5.8.1 — início da recorrência no ciclo correto

- Ao informar uma saída que já pertence a um ciclo posterior e selecionar **Este ciclo e todos os seguintes**, a interface identifica o ciclo de destino, apresenta as datas originais dele e pede confirmação explícita antes de salvar. As datas digitadas não são substituídas.
- O ajuste recorrente passa a iniciar somente no ciclo de destino confirmado, preservando ciclos anteriores e eventuais regras recorrentes já aplicadas neles. A partir do novo marco, o ciclo-base de 30 dias segue o deslocamento informado.
- O servidor mantém a validação de ausência de sobreposições e rejeita tentativas diretas de associar uma saída do mês seguinte ao ciclo anterior; a resposta informa o ciclo sugerido.
- A alteração é registrada no histórico e no log de auditoria já existentes.
- Não há migração de dados, reinicialização nem alteração do banco existente.

**Exemplo:** ciclo original 20/08 a 27/08, nova saída 22/09 e retorno 29/09. O sistema propõe iniciar a recorrência no ciclo original de 19/09 a 26/09; agosto fica preservado. A opção de recorrência não fixa o mesmo dia de cada mês: o regime 23/7 tem ciclo de 30 dias.

Antes de publicar, crie uma versão salva da escala atual no sistema. Execute `npm test` e `npm run build`. A validação completa com o banco de produção deve ser feita após o deploy.
