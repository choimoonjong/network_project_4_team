const express = require('express');
const cors = require('cors');
const balanceRoutes = require('./routes/balance');
const investRoutes = require('./routes/invest');
const productRoutes = require('./routes/products');
const db = require('./db');
const { startScheduler, processExpiredProducts } = require('./scheduler'); // 스케줄러 모듈 가져오기

const app = express();

app.use(cors());
app.use(express.json());

// API 라우트 설정
app.use('/api', investRoutes);
app.use('/api', balanceRoutes);
app.use('/api', productRoutes);

// 스케줄러 수동 실행 엔드포인트 (테스트 및 관리용)
app.post('/api/admin/trigger-scheduler', async (req, res) => {
    console.log('[Admin API] 스케줄러 수동 실행 요청');
    try {
        await processExpiredProducts(); // 스케줄러 함수 직접 호출
        res.json({ success: true, message: '스케줄러 작업이 수동으로 실행되었습니다.' });
    } catch (error) {
        console.error('[Admin API] 스케줄러 수동 실행 중 오류:', error);
        res.status(500).json({ success: false, message: '스케줄러 실행 중 오류 발생' });
    }
});


const PORT = process.env.PORT || 5000; // 환경 변수 PORT 사용 또는 기본값 5000
console.log('🔥 서버 시작 중...');

app.listen(PORT, () => {
  console.log(`✅ 서버 실행됨: http://localhost:${PORT}`);
});

// DB 연결 확인 및 스케줄러 시작
(async () => {
  try {
    const conn = await db.getConnection();
    await conn.ping();
    conn.release();
    console.log('✅ DB 연결 성공!');

    // 스케줄러 시작 (주석 해제하여 자동 실행 또는 필요에 따라 관리)
    startScheduler(); // scheduler.js 내에서 cron.schedule 활성화 필요
    console.log('✅ 스케줄러 초기화 완료 (자동 실행 여부는 scheduler.js 설정 따름)');

  } catch (err) {
    console.error('❌ DB 연결 또는 스케줄러 초기화 실패:', err);
  }
})();