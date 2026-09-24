# Escala BIOTEC v5.3.0 — Netlify + PostgreSQL

## O que mudou

- O link público continua abrindo a escala sem login, em modo **somente visualização**.
- Botão **Login** no topo.
- Perfis `USUARIO` e `ADMIN` podem cadastrar, editar, ajustar, desativar colaboradores e gerenciar férias.
- Somente `ADMIN` pode criar, ativar/desativar usuários, alterar perfil e redefinir senhas.
- Botões de edição/exclusão/ajuste não aparecem para visitantes.
- Os endpoints de escrita também exigem autenticação no servidor; esconder botões não é a única proteção.
- Férias existentes agora podem ser editadas, além de removidas.
- Senhas são armazenadas com `scrypt` e salt aleatório; nunca são gravadas em texto puro.
- Sessões são assinadas e revalidam no banco se o usuário ainda está ativo.

## Primeiro administrador

Antes do primeiro deploy desta versão, configure no Netlify em **Environment variables**:

- `ESCALA_ADMIN_USER` — usuário inicial do administrador, por exemplo `admin.biotec`
- `ESCALA_ADMIN_PASSWORD` — senha inicial, mínimo 8 caracteres
- `ESCALA_ADMIN_NAME` — opcional, nome exibido
- `ESCALA_AUTH_SECRET` — recomendado: uma chave longa e aleatória. Se omitida, o sistema deriva uma chave estável da `DATABASE_URL`.

A conta inicial só é criada quando a tabela de usuários ainda está vazia. Depois disso, novos usuários e administradores devem ser criados pelo botão **Usuários** dentro do sistema.

## Banco

A versão cria automaticamente as tabelas/colunas adicionais necessárias (`usuarios_v5` e `ausencias_v5.atualizado_em`) sem apagar os dados existentes.

## Publicação

O Netlify continua usando:

- `npm run build`
- pasta publicada: `public`
- Functions: `netlify/functions`
- redirecionamento `/api/*` para a Function

Depois de publicar, faça um novo deploy após configurar as variáveis do primeiro administrador.
