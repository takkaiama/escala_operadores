# Escala BIOTEC 5.8.0 — log tradicional

- Histórico apresentado com ação em português, responsável, data/hora, colaborador e tabela **Informação / Antes / Depois**.
- Em edições, apenas campos operacionais efetivamente modificados são apresentados (não há objetos JSON visíveis).
- Em criação ou exclusão, exibe os dados relevantes existentes, sem IDs, hashes, tokens e metadados de gravação.
- Eventos de login e backup mostram resumos legíveis; períodos de férias, ajustes e mudanças de perfil recebem nomes de campo em português.
- Ajustes recorrentes continuam exibindo a prévia dos ciclos afetados, sem alterar a regra de cálculo ou os dados históricos.
- Eventos antigos que não armazenaram a escala anterior recebem aviso; o sistema não inventa dados anteriores.
- Exportação CSV da página usa descrição e campos Antes/Depois em texto, sem JSON.
- Alteração exclusiva na apresentação do log. **Não modifica o servidor, os bancos do Neon, as tabelas ou as permissões.**

Para atualizar: preserve DATABASE_URL, as variáveis de login e a base existente. Execute `npm test` e `npm run build` e publique os arquivos na raiz do repositório GitHub conectado ao Netlify.
