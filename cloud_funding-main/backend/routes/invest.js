// backend/routes/invest.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { web3, sendEth, getEthBalance, SYSTEM_MASTER_ACCOUNT_ADDRESS } = require('../services/ethereumService');

const ETH_TO_KRW_EXCHANGE_RATE = 10; // 1 ETH = 10 KRW

// POST /api/invest - 상품에 투자하기 (기존과 동일)
router.post('/invest', async (req, res) => {
  console.log('------------------------------------------------------');
  console.log('[INVEST API /invest] 요청 수신:', new Date().toISOString());
  console.log('[INVEST API /invest] Request Body:', req.body);

  const { user_id, product_id, amount_krw } = req.body;

  if (!user_id || !product_id || amount_krw == null || parseFloat(amount_krw) <= 0) {
    console.warn('[INVEST API /invest] 잘못된 요청 데이터:', { user_id, product_id, amount_krw });
    return res.status(400).json({ success: false, message: '잘못된 요청입니다. 모든 필드를 확인해주세요.' });
  }

  const investmentAmountKRW = parseFloat(amount_krw);
  const investmentAmountETH = investmentAmountKRW / ETH_TO_KRW_EXCHANGE_RATE;
  console.log(`[INVEST API /invest] 투자금액(KRW): ${investmentAmountKRW}, 변환된 ETH: ${investmentAmountETH.toFixed(18)}`);

  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    console.log('[INVEST API /invest] DB 트랜잭션 시작됨.');

    // 1. 사용자 ETH 주소 및 잔액 확인
    console.log(`[INVEST API /invest] 사용자 [${user_id}]의 ETH 주소 조회 시도.`);
    const [userRows] = await connection.execute(
      'SELECT eth_address FROM user_balances WHERE user_id = ?',
      [user_id]
    );
    const userAddress = userRows[0]?.eth_address;
    console.log(`[INVEST API /invest] 사용자 [${user_id}]의 ETH 주소 결과: ${userAddress}`);

    if (!userAddress) {
      await connection.rollback();
      console.warn(`[INVEST API /invest] 사용자 [${user_id}]의 ETH 주소를 찾을 수 없음.`);
      return res.status(404).json({ success: false, message: '사용자의 이더리움 주소가 없습니다.' });
    }

    console.log(`[INVEST API /invest] 사용자 [${userAddress}]의 ETH 잔액 조회 시도.`);
    const ethBalance = parseFloat(await getEthBalance(userAddress));
    console.log(`[INVEST API /invest] 사용자 [${userAddress}]의 ETH 잔액: ${ethBalance} ETH. 필요한 ETH: ${investmentAmountETH} ETH.`);

    if (ethBalance < investmentAmountETH) {
      await connection.rollback();
      console.log(`[INVEST API /invest] 사용자 [${userAddress}]의 ETH 잔액 부족.`);
      return res.status(400).json({ success: false, message: `ETH 잔액이 부족합니다. (현재 잔액: ${ethBalance.toFixed(6)} ETH, 필요 ETH: ${investmentAmountETH.toFixed(6)} ETH)` });
    }

    // 2. 상품 정보 및 상태 확인
    console.log(`[INVEST API /invest] 상품 ID [${product_id}] 정보 조회 시도.`);
    const [productRows] = await connection.execute('SELECT * FROM products WHERE product_id = ? FOR UPDATE', [product_id]);
    if (productRows.length === 0) {
      await connection.rollback();
      console.warn(`[INVEST API /invest] 상품 ID [${product_id}]를 찾을 수 없음.`);
      return res.status(404).json({ success: false, message: '상품을 찾을 수 없습니다.' });
    }
    const product = productRows[0];
    console.log(`[INVEST API /invest] 상품 정보:`, product);

    if (product.status !== '펀딩중') {
      await connection.rollback();
      let message = '현재 이 상품에 투자할 수 없습니다.';
      if (product.status === '펀딩성공_지급대기' || product.status === '펀딩성공_지급완료') message = '이미 목표 금액을 달성한 상품입니다.';
      else if (product.status === '펀딩실패_환불진행중' || product.status === '펀딩실패_환불완료') message = '펀딩에 실패하여 마감된 상품입니다.';
      else if (product.status === '펀딩취소' || product.status === '취소됨_환불진행중' || product.status === '취소됨_환불완료') message = '취소된 상품입니다.';
      console.log(`[INVEST API /invest] 상품 ID [${product_id}]는 현재 투자 가능한 상태('펀딩중')가 아님 (상태: ${product.status}).`);
      return res.status(400).json({ success: false, message });
    }

    if (new Date() > new Date(product.target_date)) {
      await connection.rollback();
      console.log(`[INVEST API /invest] 상품 ID [${product_id}]는 투자 기간이 종료된 상품임.`);
      await connection.execute("UPDATE products SET status = '펀딩실패_환불진행중' WHERE product_id = ? AND status = '펀딩중'", [product_id]);
      return res.status(400).json({ success: false, message: '투자 기간이 종료된 상품입니다.' });
    }

    // 3. ETH 트랜잭션 (사용자 -> 시스템 마스터 계정)
    console.log(`[INVEST API /invest] ETH 트랜잭션 전송 시도: From [${userAddress}] To [${SYSTEM_MASTER_ACCOUNT_ADDRESS}] Value [${investmentAmountETH} ETH]`);
    const txReceipt = await sendEth(userAddress, SYSTEM_MASTER_ACCOUNT_ADDRESS, investmentAmountETH.toString());
    console.log('[INVEST API /invest] ETH 트랜잭션 성공! TX Hash:', txReceipt.transactionHash);

    // 4. DB 업데이트: investments 테이블에 투자 기록, products 테이블에 현재 모금액 업데이트
    console.log('[INVEST API /invest] investments 테이블에 투자 기록 저장 시도.');
    const [investmentResult] = await connection.execute(
      `INSERT INTO investments (user_id, product_id, amount_krw, amount_eth, tx_hash, invested_at, status)
       VALUES (?, ?, ?, ?, ?, NOW(), '투자완료')`,
      [user_id, product_id, investmentAmountKRW, investmentAmountETH, txReceipt.transactionHash]
    );
    console.log('[INVEST API /invest] investments 테이블 저장 성공. Insert ID:', investmentResult.insertId);

    const newCurrentAmountKRW = parseFloat(product.current_amount) + investmentAmountKRW;
    let newProductStatus = product.status;
    let payoutTxHash = product.payout_tx_hash; // 기존 값 유지

    // 5. 목표 금액 달성 여부 확인 및 처리
    if (newCurrentAmountKRW >= parseFloat(product.target_amount) && product.status === '펀딩중') { // 펀딩중에만 목표달성 로직 실행
      newProductStatus = '펀딩성공_지급대기';
      console.log(`[INVEST API /invest] 상품 ID [${product_id}] 목표 금액 달성! 상태를 '${newProductStatus}'로 변경 준비.`);

      const [sellerUserRows] = await connection.execute(
        'SELECT eth_address FROM user_balances WHERE user_id = ?',
        [product.seller_id]
      );
      const sellerAddress = sellerUserRows[0]?.eth_address;

      if (!sellerAddress) {
        console.error(`[INVEST API /invest] 판매자 [${product.seller_id}]의 ETH 주소를 찾을 수 없어 자동 지급 불가. 상태는 '${newProductStatus}'로 유지.`);
      } else {
        const totalAmountToPayoutETH = newCurrentAmountKRW / ETH_TO_KRW_EXCHANGE_RATE;
        console.log(`[INVEST API /invest] 판매자 [${product.seller_id}]에게 ETH 지급 시도. 주소: [${sellerAddress}], 금액: ${totalAmountToPayoutETH} ETH`);
        try {
          const payoutReceipt = await sendEth(SYSTEM_MASTER_ACCOUNT_ADDRESS, sellerAddress, totalAmountToPayoutETH.toString());
          payoutTxHash = payoutReceipt.transactionHash;
          newProductStatus = '펀딩성공_지급완료';
          console.log(`[INVEST API /invest] 판매자에게 성공적으로 ETH 지급 완료. TX Hash: ${payoutTxHash}. 상품 상태를 '${newProductStatus}'로 변경.`);
        } catch (payoutError) {
          console.error(`[INVEST API /invest] 판매자 ETH 지급 중 오류 발생: ${payoutError.message}. 상품 상태는 '${newProductStatus}'(지급대기)로 유지.`);
        }
      }
    }

    console.log(`[INVEST API /invest] products 테이블 업데이트 정보: newCurrentAmountKRW=${newCurrentAmountKRW}, newStatus=${newProductStatus}, payoutTxHash=${payoutTxHash}`);
    await connection.execute(
      'UPDATE products SET current_amount = ?, status = ?, payout_tx_hash = IFNULL(?, payout_tx_hash) WHERE product_id = ?', // payoutTxHash는 성공 시에만 업데이트
      [newCurrentAmountKRW, newProductStatus, payoutTxHash, product_id]
    );
    console.log('[INVEST API /invest] products 테이블 업데이트 성공.');

    await connection.commit();
    console.log('[INVEST API /invest] DB 트랜잭션 커밋됨.');

    const [updatedProductRows] = await db.execute('SELECT * FROM products WHERE product_id = ?', [product_id]);
    const responsePayload = {
      success: true,
      message: '투자 성공! 트랜잭션이 블록체인에 기록되었습니다.',
      txHash: txReceipt.transactionHash,
      updatedProduct: updatedProductRows[0]
    };
    console.log('[INVEST API /invest] 최종 성공 응답 전송:', responsePayload);
    res.json(responsePayload);

  } catch (error) {
    console.error('------------------------------------------------------');
    console.error('[INVEST API /invest] !!! 투자 처리 중 심각한 오류 발생 !!!', new Date().toISOString());
    console.error('[INVEST API /invest] 오류 객체:', error);
    console.error('------------------------------------------------------');

    if (connection) {
      console.log('[INVEST API /invest] 오류 발생으로 DB 롤백 시도.');
      try {
        await connection.rollback();
        console.log('[INVEST API /invest] DB 롤백 성공.');
      } catch (rollbackError) {
        console.error('[INVEST API /invest] DB 롤백 중 오류 발생:', rollbackError);
      }
    }

    let errMsg = '서버 오류로 인해 투자에 실패했습니다.';
    if (error.message && (error.message.includes("Geth") || error.message.includes("ETH") || error.message.includes("논스") || error.message.includes("주소"))) {
        errMsg = error.message;
    }
    console.log(`[INVEST API /invest] 오류 응답 전송: ${errMsg}, 상세 오류: ${error.message}`);
    return res.status(500).json({ success: false, message: errMsg, errorDetail: error.message });
  } finally {
    if (connection) {
      console.log('[INVEST API /invest] DB 커넥션 반환.');
      connection.release();
    }
    console.log('[INVEST API /invest] 요청 처리 종료:', new Date().toISOString());
    console.log('------------------------------------------------------');
  }
});

// POST /api/invest/cancel/:investmentId - 구매자 투자 취소 기능은 제거됨

module.exports = router;