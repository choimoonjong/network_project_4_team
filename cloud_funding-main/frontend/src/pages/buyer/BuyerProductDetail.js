// BuyerProductDetail.js
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom';
import '../../styles/BuyerProductDetail.css';

const BuyerProductDetail = ({ users, fetchProducts: globalFetchProducts }) => {
  const { productId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { userId } = location.state || {};

  const [currentProduct, setCurrentProduct] = useState(null);
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [showBalance, setShowBalance] = useState(false);
  const [balance, setBalance] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProductDetail = useCallback(async () => {
    if (!productId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`http://localhost:5000/api/products/${productId}`);
      const data = await res.json();
      if (data.success && data.product) {
        setCurrentProduct({
          ...data.product,
          productId: String(data.product.product_id),
          targetAmount: parseFloat(data.product.target_amount),
          currentAmount: parseFloat(data.product.current_amount || 0),
        });
      } else {
        setMessage(data.message || '상품 정보를 불러오는 데 실패했습니다.');
        setMessageType('error');
        setCurrentProduct(null);
      }
    } catch (e) {
      setMessage('상품 정보 로딩 중 네트워크 오류가 발생했습니다.');
      setMessageType('error');
      setCurrentProduct(null);
    } finally {
      setIsLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    if (!userId) {
      navigate('/', { replace: true });
      return;
    }
    fetchProductDetail();
  }, [userId, navigate, fetchProductDetail]);

  const checkBalance = async () => {
    if (!userId) return;
    try {
      const getBalanceRes = await fetch(`http://localhost:5000/api/get-balance/${userId}`);
       if (getBalanceRes.ok) {
          const data = await getBalanceRes.json();
          setBalance(data.balance);
          setShowBalance(true);
      } else { console.warn("DB 잔액 조회 실패, 업데이트 시도");}

      const updateRes = await fetch(`http://localhost:5000/api/update-balance/${userId}`, { method: 'POST' });
      const updateData = await updateRes.json();
      if (updateData.success) {
        setBalance(updateData.balance);
        setShowBalance(true);
      } else {
        alert(`잔액 업데이트 실패: ${updateData.message}`);
      }
    } catch (error) {
      console.error('잔액 조회/업데이트 오류:', error);
      alert('잔액 처리 중 오류가 발생했습니다.');
    }
  };

  const getRemainingTime = () => {
    if (!currentProduct || !currentProduct.target_date) return { days: 0, hours: 0, minutes: 0, seconds: 0, ended: true };
    const target = new Date(currentProduct.target_date).getTime();
    const now = new Date().getTime();
    const difference = target - now;

    if (difference <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, ended: true };

    const days = Math.floor(difference / (1000 * 60 * 60 * 24));
    const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((difference % (1000 * 60)) / 1000);
    return { days, hours, minutes, seconds, ended: false };
  };

  const [timeLeft, setTimeLeft] = useState(getRemainingTime());

  useEffect(() => {
    if (currentProduct && currentProduct.target_date) {
        const timer = setInterval(() => {
            const newTimeLeft = getRemainingTime();
            setTimeLeft(newTimeLeft);
            if (newTimeLeft.ended && currentProduct.status === '펀딩중') {
                console.log("펀딩 시간 만료됨, 상품 정보 갱신 필요.");
                fetchProductDetail();
                if (globalFetchProducts) globalFetchProducts();
            }
        }, 1000);
        return () => clearInterval(timer);
    }
  }, [currentProduct, fetchProductDetail, globalFetchProducts, getRemainingTime]);


  const handleInvest = async () => {
    const investmentAmountKRW = parseFloat(amount);
    if (!investmentAmountKRW || investmentAmountKRW <= 0) {
      setMessage('유효한 투자 금액(원)을 입력해주세요.');
      setMessageType('error');
      return;
    }
    if (!currentProduct) {
        setMessage('상품 정보가 유효하지 않습니다.');
        setMessageType('error');
        return;
    }

    setMessage('투자를 처리 중입니다...');
    setMessageType('info');

    try {
      const response = await fetch('http://localhost:5000/api/invest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          product_id: parseInt(currentProduct.productId),
          amount_krw: investmentAmountKRW,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setMessage(`✅ 투자 성공! 트랜잭션 해시: ${data.txHash}`);
        setMessageType('success');
        setAmount('');
        fetchProductDetail();
        if (globalFetchProducts) globalFetchProducts();
        checkBalance();
      } else {
        setMessage(`❌ 투자 실패: ${data.message || '알 수 없는 오류가 발생했습니다.'}`);
        setMessageType('error');
      }
    } catch (error) {
      console.error('투자 API 호출 오류:', error);
      setMessage(`클라이언트 오류: ${error.message || '투자를 처리하는 중 네트워크 문제가 발생했습니다.'}`);
      setMessageType('error');
    }
  };

  const formatDateTime = (dateTimeString) => {
    if (!dateTimeString) return '정보 없음';
    const date = new Date(dateTimeString);
    return date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  };

  if (isLoading) {
    return <div className="product-detail-container"><p>상품 정보를 불러오는 중...</p></div>;
  }

  if (!currentProduct) {
    return (
      <div className="product-detail-container error-page">
        <h2>{message || "상품을 찾을 수 없습니다."}</h2>
        <button onClick={() => navigate('/buyer', { state: { userId } })}>
          상품 목록으로 돌아가기
        </button>
      </div>
    );
  }

  const isInvestable = currentProduct.status === '펀딩중' && !timeLeft.ended;

  return (
    <div className="product-detail-container">
      <header className="product-detail-header">
        <button onClick={() => navigate('/buyer', { state: { userId } })}>&larr; 상품 목록으로</button>
        <h1>상품 상세 정보</h1>
        <div className="user-info">
          <span>ID: {userId}</span>
          <button onClick={checkBalance} className="balance-button">잔액 확인</button>
          {/* ETH 잔액 표시 시 소수점 제거 */}
          {showBalance && balance !== null && <span className="balance-display">{Math.floor(parseFloat(balance))} ETH</span>}
        </div>
      </header>

      <div className="product-detail-content">
        <div className="product-image-container">
            <img src={currentProduct.image_url || `https://via.placeholder.com/600x400?text=${encodeURIComponent(currentProduct.product_name)}`} alt={currentProduct.product_name} className="product-image-large"/>
        </div>
        <div className="product-detail-info">
          <h2>{currentProduct.product_name}</h2>
          <p className="product-description-detail">{currentProduct.description}</p>
          <div className="product-stats">
            <p><strong>판매자:</strong> {currentProduct.seller_id}</p>
            <p><strong>목표 금액:</strong> {currentProduct.targetAmount.toLocaleString()}원</p>
            <p><strong>현재 모집액:</strong> {currentProduct.currentAmount.toLocaleString()}원</p>
            <p><strong>달성률:</strong> {currentProduct.targetAmount > 0 ? Math.round((currentProduct.currentAmount / currentProduct.targetAmount) * 100) : 0}%</p>
            <p><strong>상품 상태:</strong> <span className={`status-${currentProduct.status}`}>{currentProduct.status}</span></p>
            <p><strong>마감일:</strong> {formatDateTime(currentProduct.target_date)}</p>
            {!timeLeft.ended ? (
              <p className="time-remaining"><strong>남은 시간:</strong> {timeLeft.days}일 {timeLeft.hours}시간 {timeLeft.minutes}분 {timeLeft.seconds}초</p>
            ) : (
              <p className="time-remaining"><strong>펀딩 기간 종료</strong></p>
            )}
             {currentProduct.payout_tx_hash && (
                <p><strong>판매자 지급 TX:</strong> <a href={`https://etherscan.io/tx/${currentProduct.payout_tx_hash}`} target="_blank" rel="noopener noreferrer" title={currentProduct.payout_tx_hash}>확인</a></p>
            )}
          </div>

          {isInvestable && (
            <div className="investment-form">
              <h3>투자하기 (원화)</h3>
              {message && <div className={`message ${messageType}`}>{message}</div>}
              <div className="input-group">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="투자 금액 입력 (원)"
                  min="1000"
                />
                <button onClick={handleInvest} disabled={!isInvestable || messageType === 'info'}>
                  {messageType === 'info' ? '처리중...' : '투자 신청'}
                </button>
              </div>
              <p className="investment-note">* 최소 투자 금액은 1,000원입니다. (예시)</p>
            </div>
          )}

          {!isInvestable && currentProduct.status !== '펀딩중' && (
            <div className="investment-closed">
              <p>이 상품은 현재 투자할 수 없습니다. (상태: {currentProduct.status})</p>
            </div>
          )}
           {!isInvestable && currentProduct.status === '펀딩중' && timeLeft.ended && (
             <div className="investment-closed"><p>이 상품의 펀딩 기간이 종료되었습니다.</p></div>
           )}
        </div>
      </div>

      <div className="investors-section">
        <h3>투자자 목록 ({currentProduct.investors ? currentProduct.investors.length : 0}명)</h3>
        {currentProduct.investors && currentProduct.investors.length > 0 ? (
          <ul className="investors-list">
            {currentProduct.investors.map((investor, index) => (
              <li key={investor.investment_id || index} className="investor-item">
                <span>투자자: {investor.user_id === userId ? `${investor.user_id} (나)` : investor.user_id}</span>
                {/* 투자 ETH 금액 표시 시 소수점 제거 */}
                <span>금액: {parseFloat(investor.amount_krw).toLocaleString()}원 ({Math.floor(parseFloat(investor.amount_eth))} ETH)</span>
                <span>일시: {formatDateTime(investor.invested_at)}</span>
                <span>상태: {investor.investment_status}</span>
                {investor.tx_hash && <a href={`https://etherscan.io/tx/${investor.tx_hash}`} target="_blank" rel="noopener noreferrer" title={investor.tx_hash}>투자TX</a>}
                {investor.refund_tx_hash && <a href={`https://etherscan.io/tx/${investor.refund_tx_hash}`} target="_blank" rel="noopener noreferrer" title={investor.refund_tx_hash} style={{color:'green', marginLeft:'5px'}}>환불TX</a>}
              </li>
            ))}
          </ul>
        ) : (
          <p>아직 투자자가 없습니다.</p>
        )}
      </div>
      <footer className="product-detail-footer"><p>&copy; 2025 투자 플랫폼</p></footer>
    </div>
  );
};

export default BuyerProductDetail;