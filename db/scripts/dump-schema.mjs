// Generates db/schema.sql for phpMyAdmin imports (cPanel File Manager-only deploys).
// Dumps table DDL plus the knex migration bookkeeping rows, so importing it into a
// fresh DB and then turning on AUTO_MIGRATE is safe (knex skips already-applied ones).
//
// Uses mysqldump (Laragon/cPanel typically include it). Override the binary with
// MYSQLDUMP and DB settings via env (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME).
import 'dotenv/config';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const db = process.env.DB_NAME || 'the100';
const user = process.env.DB_USER || 'root';
const pass = process.env.DB_PASSWORD || '';
const host = process.env.DB_HOST || '127.0.0.1';

function findBin() {
  if (process.env.MYSQLDUMP) return process.env.MYSQLDUMP;
  const candidates = [
    'mysqldump',
    'C:/laragon/bin/mysql/mysql-8.4.3-winx64/bin/mysqldump.exe'
  ];
  for (const c of candidates) {
    try {
      execSync(`"${c}" --version`, { stdio: 'ignore' });
      return c;
    } catch {
      /* try next */
    }
  }
  return 'mysqldump';
}

const bin = findBin();
const env = { ...process.env, MYSQL_PWD: pass };
const base = `"${bin}" --no-data -h ${host} -u ${user}`;
const data = `"${bin}" --no-create-info -h ${host} -u ${user}`;

let sql = execSync(`${base} ${db}`, { env, encoding: 'utf8' });
sql += execSync(`${data} ${db} knex_migrations knex_migrations_lock`, { env, encoding: 'utf8' });
sql = sql.replace(/^CREATE DATABASE[^\n]*$/gm, '').replace(/^USE [^\n]*$/gm, '');

const out = new URL('../schema.sql', import.meta.url);
fs.writeFileSync(out, sql);
console.log(`schema.sql written (${sql.split('\n').filter((l) => l.includes('CREATE TABLE')).length} tables)`);