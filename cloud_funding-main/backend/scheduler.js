// scheduler.js
const cron = require('node-cron');
const db = require('./db');
const { sendEth, SYSTEM_MASTER_ACCOUNT_ADDRESS, web3 } = require('./services/ethereumService');

// ETH:KRW 환율 (invest.js와 동일하게 유지하거나 중앙 설정 파일에서 가져와야 함)
const ETH_TO_KRW_EXCHANGE_RATE = 10; // 1 ETH = 10 KRW (예시)

/**
 * 펀딩 마감된 상품들을 확인하고, 목표 미달성 시 투자자들에게 환불을 진행합니다.
 */
async function processExpiredProducts() {
  console.log('[Scheduler] 만료된 상품 처리 작업 시작:', new Date().toISOString());
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // 1. 마감일이 지났고, '펀딩중' 상태인 상품들을 조회
    const [expiredProducts] = await connection.execute(
      `SELECT * FROM products WHERE target_date < NOW() AND status = '펀딩중'`
    );

    if (expiredProducts.length === 0) {
      console.log('[Scheduler] 처리할 만료된 상품 없음.');
      await connection.commit(); // 아무 작업도 없었으므로 커밋
      return;
    }

    for (const product of expiredProducts) {
      console.log(`[Scheduler] 상품 ID [${product.product_id}] 처리 중: ${product.product_name}`);
      const productId = product.product_id;

      // 2. 목표 금액 달성 여부 확인
      if (parseFloat(product.current_amount) >= parseFloat(product.target_amount)) {
        // 목표 달성! -> '펀딩성공_지급대기' 상태로 변경
        console.log(`[Scheduler] 상품 ID [${productId}] 목표 달성. 상태를 '펀딩성공_지급대기'로 변경합니다.`);
        await connection.execute(
          "UPDATE products SET status = '펀딩성공_지급대기' WHERE product_id = ?",
          [productId]
        );
        // 판매자에게 자동 송금은 invest API의 100% 달성 시점에 이미 처리되었거나,
        // 별도의 관리자 승인 후 지급 프로세스를 탈 수 있습니다.
        // 여기서는 상태만 변경하고, 실제 지급은 100% 달성 시점 또는 관리자 액션으로 가정.
        // 만약, invest API에서 100% 달성시 바로 지급하지 않고 스케줄러에서 지급한다면 여기서 로직 추가.
        // 여기서는 100% 달성시 invest API에서 판매자에게 즉시 송금한다고 가정하고 진행합니다.
        // 따라서 스케줄러는 주로 '미달성' 건을 처리합니다.

      } else {
        // 목표 미달성 -> '펀딩실패_환불진행중'으로 상태 변경 후 환불 시작
        console.log(`[Scheduler] 상품 ID [${productId}] 목표 미달성. 상태를 '펀딩실패_환불진행중'으로 변경하고 환불을 시작합니다.`);
        await connection.execute(
          "UPDATE products SET status = '펀딩실패_환불진행중' WHERE product_id = ?",
          [productId]
        );

        const [investmentsToRefund] = await connection.execute(
          "SELECT * FROM investments WHERE product_id = ? AND status = '투자완료'",
          [productId]
        );

        if (investmentsToRefund.length === 0) {
          console.log(`[Scheduler] 상품 ID [${productId}]에 환불할 투자 내역 없음. 상태를 '펀딩실패_환불완료'로 변경.`);
           await connection.execute(
            "UPDATE products SET status = '펀딩실패_환불완료' WHERE product_id = ?",
            [productId]
          );
          continue; // 다음 상품으로
        }

        let allRefundsSuccessful = true;
        for (const investment of investmentsToRefund) {
          try {
            // 투자자 ETH 주소 가져오기
            const [userRows] = await connection.execute(
              'SELECT eth_address FROM user_balances WHERE user_id = ?',
              [investment.user_id]
            );
            const investorAddress = userRows[0]?.eth_address;

            if (!investorAddress) {
              console.error(`[Scheduler] 투자 ID [${investment.investment_id}]의 사용자 [${investment.user_id}] ETH 주소 없음. 환불 불가.`);
              // 해당 투자 건 상태를 '환불실패_주소없음' 등으로 업데이트 필요
              await connection.execute(
                "UPDATE investments SET status = '환불실패_주소없음', cancellation_reason = '투자자 ETH 주소 정보 없음' WHERE investment_id = ?",
                [investment.investment_id]
              );
              allRefundsSuccessful = false;
              continue; // 다음 투자 건으로
            }

            // 환불할 ETH 양 (투자 시 기록된 ETH)
            const refundAmountEth = parseFloat(investment.amount_eth);
            if (refundAmountEth <= 0) {
                 console.warn(`[Scheduler] 투자 ID [${investment.investment_id}] 환불 금액이 0 이하 (${refundAmountEth} ETH). 건너뜁니다.`);
                 await connection.execute(
                    "UPDATE investments SET status = '환불불필요_금액0', cancellation_reason = '환불 ETH 금액 0 이하' WHERE investment_id = ?",
                    [investment.investment_id]
                 );
                 continue;
            }

            console.log(`[Scheduler] 투자 ID [${investment.investment_id}] 환불 시도: 사용자 [${investment.user_id}] 주소 [${investorAddress}]로 ${refundAmountEth} ETH 환불.`);

            // 시스템 마스터 계정에서 투자자에게 ETH 환불
            const refundTxReceipt = await sendEth(SYSTEM_MASTER_ACCOUNT_ADDRESS, investorAddress, refundAmountEth.toString());

            // investments 테이블에 환불 정보 업데이트
            await connection.execute(
              "UPDATE investments SET status = '펀딩실패로인한환불완료', refund_tx_hash = ?, cancellation_reason = '상품 펀딩 목표 미달성으로 자동 환불' WHERE investment_id = ?",
              [refundTxReceipt.transactionHash, investment.investment_id]
            );
            console.log(`[Scheduler] 투자 ID [${investment.investment_id}] 환불 성공. TX Hash: ${refundTxReceipt.transactionHash}`);

          } catch (refundError) {
            console.error(`[Scheduler] 투자 ID [${investment.investment_id}] 환불 중 오류 발생:`, refundError.message);
            allRefundsSuccessful = false;
            await connection.execute(
              "UPDATE investments SET status = '환불실패_오류발생', cancellation_reason = ? WHERE investment_id = ?",
              [`환불 중 서버 오류: ${refundError.message}`, investment.investment_id]
            );
            // 전체 프로세스를 중단할지, 아니면 다음 투자 건으로 넘어갈지 결정
            // 여기서는 일단 다음 건으로 넘어갑니다.
          }
        } // end of for (investment of investmentsToRefund)

        if (allRefundsSuccessful) {
          await connection.execute(
            "UPDATE products SET status = '펀딩실패_환불완료' WHERE product_id = ?",
            [productId]
          );
          console.log(`[Scheduler] 상품 ID [${productId}] 모든 투자금 환불 완료.`);
        } else {
           console.warn(`[Scheduler] 상품 ID [${productId}] 일부 투자금 환불 실패. 상태는 '펀딩실패_환불진행중' 유지 또는 '펀딩실패_부분환불' 등 별도 상태 관리 필요.`);
           // 필요시 '펀딩실패_부분환불' 상태 추가
        }
      } // end of if (미달성)
    } // end of for (product of expiredProducts)

    await connection.commit();
    console.log('[Scheduler] 만료된 상품 처리 작업 완료.');

  } catch (error) {
    console.error('[Scheduler] !!! 만료된 상품 처리 중 심각한 오류 발생 !!!', error);
    if (connection) {
      try {
        await connection.rollback();
        console.log('[Scheduler] DB 롤백 성공.');
      } catch (rollbackError) {
        console.error('[Scheduler] DB 롤백 중 오류 발생:', rollbackError);
      }
    }
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * 스케줄러를 시작합니다. (예: 매 1분마다 실행)
 */
function startScheduler() {
  // 매 분마다 processExpiredProducts 함수 실행
  // cron.schedule('* * * * *', processExpiredProducts);
  // 테스트를 위해 짧은 주기로 설정 (예: 매 30초)
  cron.schedule('*/5 * * * * *', processExpiredProducts);

  // 운영 환경에서는 적절한 주기로 설정 (예: 매 시간 정각)
  // cron.schedule('0 * * * *', processExpiredProducts);

  // 일단은 수동 실행을 위해 스케줄링은 주석 처리. 필요시 주석 해제.
  console.log('[Scheduler] 스케줄러가 준비되었습니다. (현재는 자동 실행 안 함. 필요시 server.js에서 주기적으로 호출 또는 cron 활성화)');

  // 서버 시작 시 한번 실행 (테스트용)
  // processExpiredProducts();
}

module.exports = {
  startScheduler,
  processExpiredProducts // 외부에서 수동 실행 가능하도록 export
};