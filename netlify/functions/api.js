const serverless = require('serverless-http');
const { app, initDb } = require('../../app');

const expressHandler = serverless(app);

exports.handler = async (event, context) => {
  await initDb();
  return expressHandler(event, context);
};
