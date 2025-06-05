// backend/routes/products.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendEth, SYSTEM_MASTER_ACCOUNT_ADDRESS } = require('../services/ethereumService'); // sendEth와 시스템 주소 가져오기

// POST /api/products - 새 상품 등록 (기존과 동일)
router.post('/products', async (req, res) => {
  // targetDate는 'YYYY-MM-DDTHH:mm' 형식으로 올 것으로 예상
  const { productName, description, targetAmount, targetDate, sellerId, image } = req.body;
  if (!productName || !description || !targetAmount || !targetDate || !sellerId) {
    return res.status(400).json({ success: false, message: '모든 필수 필드를 입력해주세요.' });
  }

  if (isNaN(new Date(targetDate).getTime())) {
    return res.status(400).json({ success: false, message: '유효한 목표 마감일 형식이 아닙니다. (예: YYYY-MM-DDTHH:mm)' });
  }
  if (new Date(targetDate) < new Date()) {
    return res.status(400).json({ success: false, message: '목표 마감일은 현재 시간 이후여야 합니다.' });
  }

  try {
    const [result] = await db.execute(
      'INSERT INTO products (product_name, description, target_amount, target_date, seller_id, image_url, registration_date, current_amount, status) VALUES (?, ?, ?, ?, ?, ?, NOW(), 0, \'펀딩중\')',
      [productName, description, parseFloat(targetAmount), targetDate, sellerId, image]
    );
    const newProductId = result.insertId;
    const [rows] = await db.execute('SELECT * FROM products WHERE product_id = ?', [newProductId]);
    res.status(201).json({ success: true, message: '상품 등록 성공', product: rows[0] });
  } catch (error) {
    console.error('상품 등록 실패:', error);
    res.status(500).json({ success: false, message: '서버 오류로 상품 등록에 실패했습니다.' });
  }
});

// GET /api/products - 전체 상품 목록 조회 (기존과 동일)
router.get('/products', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT p.*, ub.eth_address as seller_eth_address
       FROM products p
       LEFT JOIN user_balances ub ON p.seller_id = ub.user_id
       ORDER BY p.registration_date DESC`
    );
    res.json({ success: true, products: rows });
  } catch (error) {
    console.error('상품 목록 조회 실패:', error);
    res.status(500).json({ success: false, message: '서버 오류로 상품 목록 조회에 실패했습니다.' });
  }
});

// GET /api/products/:productId - 특정 상품 상세 조회 (기존과 동일)
router.get('/products/:productId', async (req, res) => {
  const { productId } = req.params;
  try {
    const [productRows] = await db.execute(
        `SELECT p.*, ub.eth_address as seller_eth_address
         FROM products p
         LEFT JOIN user_balances ub ON p.seller_id = ub.user_id
         WHERE p.product_id = ?`, [productId]
    );
    if (productRows.length === 0) {
      return res.status(404).json({ success: false, message: '상품을 찾을 수 없습니다.' });
    }
    const product = productRows[0];

    const [investmentRows] = await db.execute(
      'SELECT i.investment_id, i.user_id, i.amount_krw, i.amount_eth, i.tx_hash, i.invested_at, i.status as investment_status, i.refund_tx_hash, ub.eth_address as investor_eth_address FROM investments i JOIN user_balances ub ON i.user_id = ub.user_id WHERE i.product_id = ? ORDER BY i.invested_at DESC',
      [productId]
    );
    product.investors = investmentRows;
    res.json({ success: true, product });
  } catch (error) {
    console.error('상품 상세 조회 실패:', error);
    res.status(500).json({ success: false, message: '서버 오류로 상품 상세 조회에 실패했습니다.' });
  }
});

// GET /api/seller/products/:sellerId - 특정 판매자의 상품 목록 조회 (기존과 동일)
router.get('/seller/products/:sellerId', async (req, res) => {
    const { sellerId } = req.params;
    try {
        const [products] = await db.execute(
            'SELECT * FROM products WHERE seller_id = ? ORDER BY registration_date DESC',
            [sellerId]
        );
        for (let product of products) {
            const [investors] = await db.execute(
                'SELECT i.investment_id, i.user_id, i.amount_krw, i.amount_eth, i.tx_hash, i.status as investment_status, i.invested_at, i.refund_tx_hash FROM investments i WHERE i.product_id = ?',
                [product.product_id]
            );
            product.investors = investors;
        }
        res.json({ success: true, products: products });
    } catch (error) {
        console.error('판매자 상품 목록 조회 실패:', error);
        res.status(500).json({ success: false, message: '서버 오류로 판매자 상품 목록 조회에 실패했습니다.' });
    }
});


// POST /api/products/:productId/cancel-by-seller - 판매자에 의한 상품 펀딩 취소 및 환불
router.post('/products/:productId/cancel-by-seller', async (req, res) => {
  const { productId } = req.params;
  const { sellerUserId } = req.body; // 요청 본문에서 판매자 ID를 받음 (인증된 사용자여야 함)

  console.log(`[ProductAPI /cancel-by-seller] 상품 ID [${productId}] 판매자 [${sellerUserId}] 의한 취소 요청`);

  if (!sellerUserId) {
    return res.status(400).json({ success: false, message: '판매자 정보가 필요합니다.' });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // 1. 상품 정보 확인 및 판매자 본인 확인
    const [productRows] = await connection.execute('SELECT * FROM products WHERE product_id = ? FOR UPDATE', [productId]);
    if (productRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: '취소할 상품을 찾을 수 없습니다.' });
    }
    const product = productRows[0];

    if (product.seller_id !== sellerUserId) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: '본인이 등록한 상품만 취소할 수 있습니다.' });
    }

    // 2. 상품 상태 확인 ('펀딩중' 상태일 때만 취소 가능)
    if (product.status !== '펀딩중') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: `상품이 '펀딩중' 상태일 때만 취소할 수 있습니다. (현재 상태: ${product.status})` });
    }
    
    // 마감일이 지난 상품은 스케줄러가 처리하므로, 여기서는 굳이 취소할 필요는 없을 수 있지만, 정책에 따라 허용 가능
    // if (new Date() > new Date(product.target_date)) {
    //   await connection.rollback();
    //   return res.status(400).json({ success: false, message: '펀딩 마감일이 지난 상품은 취소할 수 없습니다. 자동 처리됩니다.' });
    // }

    // 3. 상품 상태를 '펀딩취소' 또는 '취소됨_환불진행중'으로 변경
    await connection.execute(
      "UPDATE products SET status = '취소됨_환불진행중', current_amount = 0 WHERE product_id = ?", // 모금액도 0으로 초기화
      [productId]
    );
    console.log(`[ProductAPI /cancel-by-seller] 상품 ID [${productId}] 상태 '취소됨_환불진행중'으로 변경, 모금액 0으로 초기화.`);

    // 4. 해당 상품의 모든 '투자완료' 상태인 투자 내역 조회
    const [investmentsToRefund] = await connection.execute(
      "SELECT * FROM investments WHERE product_id = ? AND status = '투자완료'",
      [productId]
    );

    if (investmentsToRefund.length === 0) {
      console.log(`[ProductAPI /cancel-by-seller] 상품 ID [${productId}] 환불할 투자 내역 없음. 상품 상태 '펀딩취소'로 최종 변경.`);
      await connection.execute("UPDATE products SET status = '펀딩취소' WHERE product_id = ?", [productId]);
      await connection.commit();
      return res.json({ success: true, message: '상품 펀딩이 취소되었으며, 환불할 투자 내역이 없습니다.' });
    }

    console.log(`[ProductAPI /cancel-by-seller] 상품 ID [${productId}] 총 ${investmentsToRefund.length}건 환불 처리 시작.`);
    let allRefundsSuccessful = true;
    const cancellationReason = `판매자(${sellerUserId}) 요청으로 펀딩 취소 및 환불`;

    for (const investment of investmentsToRefund) {
      try {
        const [userRows] = await connection.execute('SELECT eth_address FROM user_balances WHERE user_id = ?', [investment.user_id]);
        const investorAddress = userRows[0]?.eth_address;

        if (!investorAddress) {
          console.error(`[ProductAPI /cancel-by-seller] 투자 ID [${investment.investment_id}] 투자자 [${investment.user_id}] ETH 주소 없음. 환불 불가.`);
          await connection.execute(
            "UPDATE investments SET status = '환불실패_주소없음', cancellation_reason = ? WHERE investment_id = ?",
            [`판매자 취소 환불 실패: 투자자 ETH 주소 없음`, investment.investment_id]
          );
          allRefundsSuccessful = false;
          continue;
        }

        const refundAmountEth = parseFloat(investment.amount_eth);
        if (refundAmountEth <= 0) {
            console.warn(`[ProductAPI /cancel-by-seller] 투자 ID [${investment.investment_id}] 환불 ETH 금액 0 이하. 건너뜁니다.`);
            await connection.execute(
                "UPDATE investments SET status = '환불불필요_금액0', cancellation_reason = ? WHERE investment_id = ?",
                [cancellationReason + " (환불 ETH 0)", investment.investment_id]
             );
            continue;
        }

        console.log(`[ProductAPI /cancel-by-seller] 투자 ID [${investment.investment_id}] 환불 시도: 사용자 [${investment.user_id}] 주소 [${investorAddress}]로 ${refundAmountEth} ETH`);
        const refundTxReceipt = await sendEth(SYSTEM_MASTER_ACCOUNT_ADDRESS, investorAddress, refundAmountEth.toString());

        await connection.execute(
          "UPDATE investments SET status = '투자취소_판매자환불', refund_tx_hash = ?, cancellation_reason = ? WHERE investment_id = ?",
          [refundTxReceipt.transactionHash, cancellationReason, investment.investment_id]
        );
        console.log(`[ProductAPI /cancel-by-seller] 투자 ID [${investment.investment_id}] 환불 성공. TX Hash: ${refundTxReceipt.transactionHash}`);

      } catch (refundError) {
        console.error(`[ProductAPI /cancel-by-seller] 투자 ID [${investment.investment_id}] 환불 중 오류:`, refundError.message);
        allRefundsSuccessful = false;
        await connection.execute(
          "UPDATE investments SET status = '환불실패_오류발생', cancellation_reason = ? WHERE investment_id = ?",
          [`판매자 취소 환불 중 서버 오류: ${refundError.message}`, investment.investment_id]
        );
      }
    }

    // 5. 최종 상품 상태 업데이트
    const finalProductStatus = allRefundsSuccessful ? '펀딩취소' : '취소됨_부분환불실패'; // 또는 '취소됨_환불오류'
    await connection.execute(
      "UPDATE products SET status = ? WHERE product_id = ?",
      [finalProductStatus, productId]
    );
    console.log(`[ProductAPI /cancel-by-seller] 상품 ID [${productId}] 최종 상태 '${finalProductStatus}'로 업데이트.`);

    await connection.commit();
    res.json({ success: true, message: `상품 펀딩이 취소되었습니다. ${allRefundsSuccessful ? '모든 투자금 환불이 시작되었습니다.' : '일부 투자금 환불에 실패했습니다. 관리자 확인이 필요합니다.'}` });

  } catch (error) {
    console.error(`[ProductAPI /cancel-by-seller] 상품 ID [${productId}] 판매자 취소 처리 중 심각한 오류:`, error);
    if (connection) await connection.rollback();
    const errMsg = error.message.includes("Geth") || error.message.includes("ETH") ? error.message : '서버 오류로 상품 취소 및 환불 처리에 실패했습니다.';
    res.status(500).json({ success: false, message: errMsg, errorDetail: error.message });
  } finally {
    if (connection) connection.release();
  }
});


module.exports = router;