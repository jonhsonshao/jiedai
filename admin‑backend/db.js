const Database = require('better-sqlite3');
const db = new Database('./data.db');

db.exec(`
CREATE TABLE IF NOT EXISTS user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet TEXT UNIQUE,
  inviterId INTEGER,
  pool1Flag INTEGER DEFAULT 0,
  lockToken REAL DEFAULT 0,
  freeToken REAL DEFAULT 0,
  refPool2Count INTEGER DEFAULT 0,
  refPool3Count INTEGER DEFAULT 0,
  refTotalCount INTEGER DEFAULT 0,
  rankRewardToken REAL DEFAULT 0,
  createAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscribe_record (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER,
  poolNo INTEGER,
  payAmount REAL,
  tokenAmount REAL,
  lockEndTime DATETIME,
  createAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(userId) REFERENCES user(id)
);

CREATE TABLE IF NOT EXISTS reward_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    rewardType TEXT,
    tokenAmount REAL,
    createAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userId) REFERENCES user(id)
);

CREATE TABLE IF NOT EXISTS exchange_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    payToken REAL,
    getUsdt REAL,
    createAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userId) REFERENCES user(id)
);

CREATE TABLE IF NOT EXISTS withdraw_apply (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    withdrawToken REAL,
    status TEXT DEFAULT 'pending',
    createAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(userId) REFERENCES user(id)
);

CREATE TABLE IF NOT EXISTS admin_user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  password TEXT
);
`);

const initAdmin = db.prepare(`SELECT * FROM admin_user WHERE username='admin'`).get();
if(!initAdmin){
  db.prepare(`INSERT INTO admin_user(username,password) VALUES (?,?)`).run('admin','123456');
}

module.exports = db;
