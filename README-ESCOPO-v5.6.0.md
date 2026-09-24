# Escala BIOTEC v5.6.0 — aplicação do ajuste

- Somente este ciclo: altera apenas a ocorrência selecionada. Se a folga passar da virada do mês, o mês seguinte mostra os dias dessa ocorrência.
- Este ciclo e todos os seguintes: desloca saída e retorno no mesmo número de dias em cada ocorrência futura do regime 24/6 ou 23/7; não converte uma ocorrência pontual em nova regra de dias trabalhados. Mantém a quantidade de dias de folga.
- Uma alteração pontual de ciclo futuro substitui o resultado recorrente naquele ciclo, sem interromper a série nos demais. Um ajuste recorrente posterior substitui a série anterior a partir da nova data-base selecionada.
- Reverter um ciclo herdado remove a origem da série (com confirmação explícita); reverter um ciclo pontual remove apenas o registro dele.
- A data-base original e ajustes preexistentes permanecem; coluna `escopo` é adicionada com valor padrão `UNICO` nos ajustes já salvos. Backups de versões antigas sem esta coluna permanecem compatíveis.
- Alterações de ajustes e registro de auditoria/histórico são feitos dentro da mesma transação, com bloqueio por colaborador.
- Nenhum banco de produção ou variável de ambiente está incluído no ZIP. Antes de implantar, crie um backup da escala atual pela opção **Versões salvas**.
