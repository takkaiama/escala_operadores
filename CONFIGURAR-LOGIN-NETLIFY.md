# Configuração rápida do login no Netlify

1. Abra o projeto `escala-operadores` no Netlify.
2. Vá em **Project configuration > Environment variables**.
3. Adicione `ESCALA_ADMIN_USER`.
4. Adicione `ESCALA_ADMIN_PASSWORD` com pelo menos 8 caracteres.
5. Opcional: `ESCALA_ADMIN_NAME`.
6. Recomendado: adicione `ESCALA_AUTH_SECRET` com uma chave longa e exclusiva.
7. Salve e faça **Trigger deploy / Deploy site** novamente.
8. Abra o site e use o botão **Login**.
9. Logado como administrador, use **Usuários** para criar os demais acessos.

Visitantes continuam visualizando a escala normalmente, mas sem botões de alteração.
