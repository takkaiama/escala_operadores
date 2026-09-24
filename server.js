const { app, initDb } = require('./app');
const PORT = Number(process.env.PORT || 3000);

initDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('=================================================');
    console.log('ESCALA BIOTEC - V5.3.0 LOGIN/PERMISSOES/FERIAS');
    console.log(`Local: http://localhost:${PORT}`);
    console.log('=================================================');
  });
}).catch(err => {
  console.error('Falha ao iniciar:', err);
  process.exit(1);
});
