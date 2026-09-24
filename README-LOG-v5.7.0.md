# Escala BIOTEC v5.7.0 — log de ajustes legível

## Motivo

Antes, um novo ajuste sem linha prévia em `ajustes_v5` era auditado com `antes=null`, embora existisse uma programação efetiva no calendário original ou herdada de recorrência.

## Alterações

- Ao salvar ou reverter um ajuste, os estados efetivos ANTES e DEPOIS são calculados a partir de `anchor_saida`, regime e todos os ajustes existentes no momento da operação.
- Os estados exibem colaborador, função, ciclo original, datas efetivas, regime, tipo de regra, início da série e observações.
- Eventos recorrentes mostram uma **prévia** dos próximos 12 ciclos, com os ciclos efetivamente afetados e as datas antes/depois. A prévia **não determina uma data final para recorrências**; exceções pontuais e futuras séries são consideradas dentro da janela.
- O JSON técnico permanece disponível em "Dados técnicos do evento" e no CSV; os registros anteriores não são reescritos ou inventados.
- A gravação dos estados e dos dois registros de log de ajuste permanece na mesma transação PostgreSQL que altera ou reverte o ajuste. Se uma dessas gravações falhar, o ajuste é revertido pela transação.
- Nenhuma migração destrutiva ou alteração de tabelas foi adicionada nesta versão.

## Limites

A precisão dos registros capturados depende da programação e dos ajustes efetivamente existentes no instante da gravação. Férias são registradas à parte: o estado do ciclo representa as datas de saída/retorno programadas, não uma contagem de dias com férias sobrepostas. Registros históricos antigos que não guardaram estado ANTES não são preenchidos retroativamente. A atomicidade citada aplica-se às rotas de ajuste/reversão; outras alterações do aplicativo podem utilizar transações separadas e exigem revisão própria para conformidade estrita.

## Implantação

Execute os testes `npm test` e `npm run build`, publique o código na raiz do repositório GitHub já conectado ao Netlify, sem trocar `DATABASE_URL`, senhas ou banco. Faça um backup em "Versões salvas" antes de publicar.
