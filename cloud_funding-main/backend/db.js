// db.js
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root', // 실제 환경에서는 보안을 고려한 계정 사용
  password: '1234', // 실제 환경에서는 환경 변수 등으로 관리
  database: 'cloud_funding',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = {
  getConnection: () => pool.getConnection(), // DB 트랜잭션 처리를 위해 추가
  execute: (...args) => pool.execute(...args),
  // query: (...args) => pool.query(...args), // 필요시 추가
  // pool // 풀 자체를 직접 사용해야 할 경우 (권장하지는 않음)
};