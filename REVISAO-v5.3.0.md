# Revisão técnica v5.3.0

## Corrigido / reforçado

- Endpoints de cadastro, edição, exclusão, ajustes e férias agora exigem login no servidor.
- Visitante público não recebe botões de alteração na interface.
- ADMIN e USUARIO podem editar; somente ADMIN gerencia contas.
- Senhas usam scrypt + salt aleatório e não são armazenadas em texto puro.
- Token de sessão é assinado, expira e cada operação revalida se a conta continua ativa.
- Administrador logado não pode desativar ou rebaixar a própria conta.
- Férias podem ser editadas por PUT, com validação de datas e de sobreposição ignorando o próprio registro.
- Histórico registra ALTERAR_FERIAS.
- Proteção básica contra repetidas tentativas de login.
- Headers Netlify adicionados contra clickjacking, MIME sniffing e uso indevido de câmera/microfone/geolocalização.
- Cache da aplicação continua desabilitado para evitar frontend antigo após deploy.

## Validações executadas

- `node --check app.js`
- `node --check public/app.js`
- `node --check netlify/functions/api.js`
- `npm run build`
- Conferência automática de IDs HTML referenciados pelo JavaScript: nenhuma referência ausente e nenhum ID duplicado.
- Conferência dos endpoints de escrita: todos protegidos, exceto o endpoint de login.

## Limitação de teste

Não houve conexão com o PostgreSQL de produção durante a preparação deste pacote. A criação/migração das novas estruturas foi projetada para ser aditiva (`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`) e não apagar dados existentes.
