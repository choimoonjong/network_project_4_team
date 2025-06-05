// backend/routes/balance.js

const express = require('express');
const router = express.Router();
const Web3 = require('web3');
const db = require('../db');

const web3 = new Web3('http://localhost:8545'); // Geth RPC 주소

// POST /api/update-balance/:userId
router.post('/update-balance/:userId', async (req, res) => {
  const userId = req.params.userId;
  console.log('------------------------------------------------------');
  console.log(`[BALANCE API /update-balance] 사용자 [${userId}] 잔액 업데이트 요청 수신:`, new Date().toISOString());

  try {
    console.log(`[BALANCE API /update-balance] 사용자 [${userId}]의 ETH 주소 조회 시도.`);
    const [rows] = await db.execute(
      'SELECT eth_address FROM user_balances WHERE user_id = ?',
      [userId]
    );

    const address = rows[0]?.eth_address;
    console.log(`[BALANCE API /update-balance] 사용자 [${userId}]의 ETH 주소 결과: ${address}`);

    if (!address) {
      console.warn(`[BALANCE API /update-balance] 사용자 [${userId}]의 ETH 주소를 찾을 수 없음.`);
      return res.status(404).json({ success: false, message: '사용자 주소가 없습니다.' });
    }

    console.log(`[BALANCE API /update-balance] 사용자 [${address}]의 최신 ETH 잔액 조회 시도 (Geth).`);
    const wei = await web3.eth.getBalance(address);
    const balance = web3.utils.fromWei(wei, 'ether');
    console.log(`[BALANCE API /update-balance] 사용자 [${address}]의 최신 ETH 잔액 (from Geth): ${balance} ETH.`);

    console.log(`[BALANCE API /update-balance] user_balances 테이블에 사용자 [${userId}]의 잔액 업데이트 시도.`);
    const [updateResult] = await db.execute(
      `UPDATE user_balances SET balance_eth = ?, updated_at = NOW()
       WHERE user_id = ?`,
      [balance, userId]
    );
    console.log(`[BALANCE API /update-balance] user_balances 테이블 업데이트 결과:`, updateResult);

    if (updateResult.affectedRows === 0) {
      // 해당 userId가 user_balances 테이블에 없는 경우. (정상적인 경우라면 LoginPage에서 users 배열 기반으로 미리 데이터가 있어야 함)
      console.warn(`[BALANCE API /update-balance] 사용자 [${userId}]의 잔액 정보가 user_balances 테이블에 없어 업데이트되지 않았습니다. 해당 사용자가 DB에 있는지 확인이 필요합니다.`);
      // 이 경우, 사용자는 존재하지만 잔액 정보만 없는 것이므로, 에러를 반환하기보다는 성공으로 처리하고 잔액을 반환할 수 있습니다.
      // 또는, 여기서 INSERT를 시도할 수도 있지만, users 테이블 관리는 다른 곳에서 하는 것이 더 적절할 수 있습니다.
      // 일단은 성공으로 간주하고 클라이언트가 잔액을 표시하도록 합니다.
      // return res.status(404).json({ success: false, message: '잔액 정보를 업데이트할 사용자를 찾을 수 없습니다.' });
    }
    
    console.log(`[BALANCE API /update-balance] 사용자 [${userId}] 잔액 업데이트 성공. 응답 전송.`);
    return res.json({ success: true, balance });

  } catch (error) {
    console.error('------------------------------------------------------');
    console.error(`[BALANCE API /update-balance] !!! 사용자 [${userId}] 잔액 업데이트 중 심각한 오류 발생 !!!`, new Date().toISOString());
    console.error(`[BALANCE API /update-balance] 오류 객체:`, error);
    console.error('------------------------------------------------------');
    return res.status(500).json({ success: false, message: '서버 오류로 잔액 업데이트에 실패했습니다.' });
  } finally {
    console.log(`[BALANCE API /update-balance] 사용자 [${userId}] 요청 처리 종료:`, new Date().toISOString());
    console.log('------------------------------------------------------');
  }
});

// GET /api/get-balance/:userId
router.get('/get-balance/:userId', async (req, res) => {
  const userId = req.params.userId;
  console.log('------------------------------------------------------');
  console.log(`[BALANCE API /get-balance] 사용자 [${userId}] 잔액 조회 요청 수신:`, new Date().toISOString());

  try {
    console.log(`[BALANCE API /get-balance] user_balances 테이블에서 사용자 [${userId}]의 잔액 조회 시도.`);
    const [rows] = await db.execute(
      'SELECT balance_eth FROM user_balances WHERE user_id = ?',
      [userId]
    );

    if (rows.length === 0) {
      console.warn(`[BALANCE API /get-balance] 사용자 [${userId}]의 잔액 정보가 user_balances 테이블에 없음.`);
      // 잔액 정보가 없더라도, Geth에서 직접 조회하여 반환 시도 (선택적)
      // 또는 단순히 '잔액 정보 없음'으로 응답
      // 여기서는 일단 '잔액 정보 없음'으로 처리
      return res.status(404).json({ success: false, message: '잔액 정보가 없습니다. 먼저 잔액 업데이트를 시도해주세요.' });
    }
    
    const balanceFromDB = rows[0].balance_eth;
    console.log(`[BALANCE API /get-balance] 사용자 [${userId}]의 DB 저장된 잔액: ${balanceFromDB} ETH. 응답 전송.`);
    return res.json({ success: true, balance: balanceFromDB });

  } catch (error) {
    console.error('------------------------------------------------------');
    console.error(`[BALANCE API /get-balance] !!! 사용자 [${userId}] 잔액 조회 중 심각한 오류 발생 !!!`, new Date().toISOString());
    console.error(`[BALANCE API /get-balance] 오류 객체:`, error);
    console.error('------------------------------------------------------');
    return res.status(500).json({ success: false, message: '서버 오류로 잔액 조회에 실패했습니다.' });
  } finally {
    console.log(`[BALANCE API /get-balance] 사용자 [${userId}] 요청 처리 종료:`, new Date().toISOString());
    console.log('------------------------------------------------------');
  }
});

module.exports = router;