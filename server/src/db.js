const config = require('./config');
const knex = require('knex')({
  client: 'mysql2',
  connection: {
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    charset: 'utf8mb4',
    dateStrings: true
  },
  pool: { min: 2, max: 10 }
});

module.exports = knex;