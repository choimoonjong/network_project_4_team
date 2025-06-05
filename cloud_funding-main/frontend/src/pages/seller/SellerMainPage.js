// SellerMainPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../../styles/SellerMainPage.css';

const SellerMainPage = ({ users, fetchProductsHook }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { userId } = location.state || {};

  const [sellerProducts, setSellerProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showBalance, setShowBalance] = useState(false);
  const [balance, setBalance] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState({ text: '', type: '' });


  const fetchSellerProducts = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const response = await fetch(`http://localhost:5000/api/seller/products/${userId}`);
      const data = await response.json();
      if (data.success) {
        const formatted = data.products.map(p => ({
          ...p,
          productId: String(p.product_id),
          targetAmount: parseFloat(p.target_amount),
          currentAmount: parseFloat(p.current_amount || 0),
          investors: p.investors || [],
        }));
        setSellerProducts(formatted);
      } else {
        console.error("판매자 상품 목록 로드 실패:", data.message);
        setSellerProducts([]);
      }
    } catch (error) {
      console.error("판매자 상품 목록 API 호출 오류:", error);
      setSellerProducts([]);
    } finally {
        setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      navigate('/', { replace: true });
    } else {
      fetchSellerProducts();
    }
  }, [userId, navigate, fetchSellerProducts]);

  useEffect(() => {
    if(fetchProductsHook && sellerProducts.length > 0) {
        // fetchProductsHook();
    }
  }, [fetchProductsHook, sellerProducts]);


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

  const handleProductClick = (product) => {
    setSelectedProduct(product);
    setActionMessage({ text: '', type: '' });
  };

  const handleRegistrationClick = () => navigate('/seller/registration', { state: { userId } });

  const getDaysHoursMinutesRemaining = (targetDateStr) => {
    const target = new Date(targetDateStr).getTime();
    const now = new Date().getTime();
    const diff = target - now;

    if (diff <= 0) return { text: "모집 기간 종료", ended: true };

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    return { text: `${days}일 ${hours}시간 ${minutes}분 남음`, ended: false };
  };
  
  const formatDateTime = (dateTimeString) => {
    if (!dateTimeString) return '정보 없음';
    const date = new Date(dateTimeString);
    return date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  };

  const handleCancelFundingBySeller = async (productIdToCancel) => {
    if (!window.confirm("정말로 이 상품의 펀딩을 취소하시겠습니까? 모든 투자자에게 투자금이 환불됩니다. 이 작업은 되돌릴 수 없습니다.")) {
        return;
    }
    setActionMessage({ text: '펀딩 취소 처리 중...', type: 'info' });
    try {
        const response = await fetch(`http://localhost:5000/api/products/${productIdToCancel}/cancel-by-seller`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sellerUserId: userId })
        });
        const data = await response.json();
        if (data.success) {
            setActionMessage({ text: data.message || '상품 펀딩이 성공적으로 취소되었습니다.', type: 'success' });
            fetchSellerProducts();
            if (fetchProductsHook) fetchProductsHook();
            if (selectedProduct && selectedProduct.productId === productIdToCancel) {
                setSelectedProduct(null);
            }
        } else {
            setActionMessage({ text: data.message || '펀딩 취소에 실패했습니다.', type: 'error' });
        }
    } catch (error) {
        console.error('펀딩 취소 API 호출 오류:', error);
        setActionMessage({ text: '펀딩 취소 중 오류가 발생했습니다.', type: 'error' });
    }
  };


  return (
    <div className="seller-main-container">
      <header className="seller-header">
        <h1>판매자 포털</h1>
        <div className="user-info">
          <p>로그인 ID: {userId}</p>
          <div className="balance-section">
            <button onClick={checkBalance} className="balance-button">ETH 잔액 확인/갱신</button>
            {/* ETH 잔액 표시 시 소수점 제거 */}
            {showBalance && balance !== null &&<span className="balance-display">{Math.floor(parseFloat(balance))} ETH</span>}
          </div>
        </div>
        <div className="header-buttons">
          <button onClick={handleRegistrationClick} className="register-product-button">새 상품 등록하기</button>
          <button onClick={() => navigate('/')} className="logout-button">로그아웃</button>
        </div>
      </header>

      {actionMessage.text && (
          <div className={`action-message-bar ${actionMessage.type}`}>
              {actionMessage.text}
          </div>
      )}

      <div className="seller-content">
        <div className="product-list-section">
          <h2>내 상품 목록 {isLoading && <small>(로딩중...)</small>}</h2>
          {sellerProducts.length > 0 ? (
            <div className="product-list">
              {sellerProducts.map(product => {
                const remaining = getDaysHoursMinutesRemaining(product.target_date);
                const achievementRate = product.targetAmount > 0 ? Math.round((product.currentAmount / product.targetAmount) * 100) : 0;
                return (
                  <div
                    key={product.productId}
                    className={`product-item ${selectedProduct && selectedProduct.productId === product.productId ? 'selected' : ''}`}
                    onClick={() => handleProductClick(product)}
                  >
                    <div className="product-info">
                      <h3>{product.product_name}</h3>
                      <p className="product-status">상태: <span className={`status-${product.status}`}>{product.status}</span></p>
                      <div className="product-stats">
                        <p>목표 금액: {product.targetAmount.toLocaleString()}원</p>
                        <p>현재 모집액: {product.currentAmount.toLocaleString()}원 ({achievementRate}%)</p>
                        <p>마감일: {formatDateTime(product.target_date)}</p>
                        <p className={remaining.ended ? 'ended' : 'remaining'}>{remaining.text}</p>
                         {product.payout_tx_hash && (
                            <p style={{fontSize:'0.9em', color:'green'}}>판매대금 지급 TX: <a href={`https://etherscan.io/tx/${product.payout_tx_hash}`} target="_blank" rel="noopener noreferrer" title={product.payout_tx_hash}>확인</a></p>
                        )}
                      </div>
                      {product.status === '펀딩중' && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleCancelFundingBySeller(product.productId);}} 
                            className="cancel-funding-button">
                            펀딩 취소하기
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            !isLoading && <p className="no-products">등록한 상품이 없습니다.</p>
          )}
        </div>

        {selectedProduct && (
          <div className="investor-details-section">
            <h2>"{selectedProduct.product_name}" 투자자 상세 정보</h2>
             <div className="product-summary">
                <p><strong>상품 상태:</strong> {selectedProduct.status}</p>
                <p><strong>총 모집액:</strong> {selectedProduct.currentAmount.toLocaleString()}원 / {selectedProduct.targetAmount.toLocaleString()}원 ({ (selectedProduct.targetAmount > 0 ? Math.round((selectedProduct.currentAmount / selectedProduct.targetAmount) * 100) : 0) }%)</p>
                <p><strong>마감일:</strong> {formatDateTime(selectedProduct.target_date)}</p>
            </div>
            <div className="investors-list">
              <h3>투자자 목록 ({selectedProduct.investors ? selectedProduct.investors.length : 0}명)</h3>
              {selectedProduct.investors && selectedProduct.investors.length > 0 ? (
                <table className="investors-table">
                  <thead>
                    <tr><th>투자자 ID</th><th>투자금(KRW)</th><th>투자금(ETH)</th><th>투자일시</th><th>투자상태</th><th>투자TX</th><th>환불TX</th></tr>
                  </thead>
                  <tbody>
                    {selectedProduct.investors.map((investor, index) => (
                      <tr key={investor.investment_id || index}>
                        <td>{investor.user_id}</td>
                        <td>{parseFloat(investor.amount_krw).toLocaleString()}원</td>
                        {/* 투자 ETH 금액 표시 시 소수점 제거 */}
                        <td>{Math.floor(parseFloat(investor.amount_eth))} ETH</td>
                        <td>{formatDateTime(investor.invested_at)}</td>
                        <td>{investor.investment_status}</td>
                        <td>
                          {investor.tx_hash ? 
                            <a href={`https://etherscan.io/tx/${investor.tx_hash}`} target="_blank" rel="noopener noreferrer" title={investor.tx_hash}>보기</a> : '-'}
                        </td>
                         <td>
                          {investor.refund_tx_hash ? 
                            <a href={`https://etherscan.io/tx/${investor.refund_tx_hash}`} target="_blank" rel="noopener noreferrer" title={investor.refund_tx_hash} style={{color:'green'}}>보기</a> : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (<p>아직 투자자가 없습니다.</p>)}
            </div>
          </div>
        )}
      </div>
      <footer className="seller-footer"><p>&copy; 2025 투자 플랫폼</p></footer>
    </div>
  );
};
export default SellerMainPage;