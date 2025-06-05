// BuyerMainPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import '../../styles/BuyerMainPage.css';

const BuyerMainPage = ({ products: initialProducts, users, fetchProducts }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { userId } = location.state || {};
  const [showBalance, setShowBalance] = useState(false);
  const [balance, setBalance] = useState(null);
  const [myInvestedProductsData, setMyInvestedProductsData] = useState([]);
  const [products, setProducts] = useState(initialProducts);

  useEffect(() => {
    if (fetchProducts) fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    setProducts(initialProducts);
  }, [initialProducts]);

  const checkBalance = async () => {
    if (!userId) return;
    try {
      const getBalanceRes = await fetch(`http://localhost:5000/api/get-balance/${userId}`);
      if (getBalanceRes.ok) {
          const data = await getBalanceRes.json();
          setBalance(data.balance);
          setShowBalance(true);
      } else {
          console.warn("DB 잔액 조회 실패, 업데이트 시도");
      }
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

  const fetchMyInvestments = useCallback(async () => {
    if (!userId || products.length === 0) {
      setMyInvestedProductsData([]);
      return;
    }
    const invested = [];
    for (const product of products) {
      try {
        const res = await fetch(`http://localhost:5000/api/products/${product.productId}`);
        const data = await res.json();
        if (data.success && data.product && data.product.investors) {
          const myInvestmentsInThisProduct = data.product.investors.filter(
            (inv) => inv.user_id === userId
          );
          if (myInvestmentsInThisProduct.length > 0) {
            const totalInvestedByMe = myInvestmentsInThisProduct.reduce(
              (sum, inv) => sum + parseFloat(inv.amount_krw),0
            );
            invested.push({
              ...data.product,
              myTotalInvestment: totalInvestedByMe,
              myIndividualInvestments: myInvestmentsInThisProduct,
            });
          }
        }
      } catch (e) {
        console.error(`Error fetching product details (ID: ${product.productId}) for my investments`,e);
      }
    }
    setMyInvestedProductsData(invested);
  }, [userId, products]);

  useEffect(() => {
    if (!userId) {
      navigate('/', { replace: true });
    } else {
      fetchMyInvestments();
    }
  }, [userId, navigate, fetchMyInvestments]);

  const formatDateTime = (dateTimeString) => {
    if (!dateTimeString) return '정보 없음';
    const date = new Date(dateTimeString);
    return date.toLocaleString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="buyer-main-container">
      <header className="buyer-header">
        <h1>구매자 포털</h1>
        <div className="user-info">
          <span>로그인 ID: {userId}</span>
          <div className="balance-section">
            <button onClick={checkBalance} className="balance-button">ETH 잔액 확인/갱신</button>
            {/* ETH 잔액 표시 시 소수점 제거 */}
            {showBalance && balance !== null && <span className="balance-display">{Math.floor(parseFloat(balance))} ETH</span>}
            {showBalance && balance === null && <span className="balance-display">잔액 정보 없음</span>}
          </div>
          <button onClick={() => navigate('/')} className="logout-button">로그아웃</button>
        </div>
      </header>

      <section className="my-investments-section">
        <h2>내가 투자한 상품</h2>
        <div className="my-investments-container">
          {myInvestedProductsData.length > 0 ? (
            myInvestedProductsData.map(product => (
              <div key={`my-${product.productId}`} className="investment-card">
                <h3>{product.product_name}</h3>
                <p>상품 상태: {product.status}</p>
                <p>총 투자 금액 (나): {product.myTotalInvestment.toLocaleString()}원</p>
                <p>달성률: {product.targetAmount > 0 ? Math.round((parseFloat(product.current_amount) / parseFloat(product.target_amount)) * 100) : 0}%</p>
                {product.myIndividualInvestments && product.myIndividualInvestments.map(inv => (
                    <div key={inv.tx_hash || inv.investment_id} className="individual-investment-info">
                        <p style={{fontSize: '0.9em', color: '#555'}}>
                            {/* 투자 ETH 금액 표시 시 소수점 제거 */}
                            - 투자일: {formatDateTime(inv.invested_at)}, 금액: {parseFloat(inv.amount_krw).toLocaleString()}원 ({Math.floor(parseFloat(inv.amount_eth))} ETH)
                            <br/>
                            - 투자 상태: {inv.investment_status}
                        </p>
                         {inv.refund_tx_hash && <p style={{fontSize: '0.8em', color: 'green'}}>환불 TX: <a href={`https://etherscan.io/tx/${inv.refund_tx_hash}`} target="_blank" rel="noopener noreferrer" title={inv.refund_tx_hash}>확인</a></p>}
                    </div>
                ))}
                <Link
                  to={`/buyer/product/${product.productId}`}
                  state={{ userId }}
                  className="view-detail-button"
                >
                  상품 상세 보기
                </Link>
              </div>
            ))
          ) : (
            <p className="no-investments">투자한 상품이 없습니다.</p>
          )}
        </div>
      </section>

      <section className="available-products-section">
        <h2>투자 가능한 상품</h2>
        <div className="products-grid">
          {products.filter(product =>
            product.status === '펀딩중' && new Date(product.target_date) > new Date()
          ).map(product => (
            <div key={product.productId} className="product-card">
              <h3>{product.product_name}</h3>
              <p className="product-description">{product.description?.substring(0,100)}...</p>
              <div className="product-details">
                <p>판매자: {product.seller_id}</p>
                <p>목표 금액: {parseFloat(product.target_amount).toLocaleString()}원</p>
                <p>현재 금액: {parseFloat(product.current_amount).toLocaleString()}원</p>
                <p>달성률: {product.targetAmount > 0 ? Math.round((parseFloat(product.current_amount) / parseFloat(product.target_amount)) * 100) : 0}%</p>
                <p>마감일: {formatDateTime(product.target_date)}</p>
                <p>상태: {product.status}</p>
              </div>
              <Link
                to={`/buyer/product/${product.productId}`}
                state={{ userId }}
                className="invest-button"
              >
                상세 보기 및 투자하기
              </Link>
            </div>
          ))}
           {products.filter(product =>
            product.status === '펀딩중' && new Date(product.target_date) > new Date()
          ).length === 0 && <p>현재 투자 가능한 상품이 없습니다.</p>}
        </div>
      </section>
      <footer className="buyer-footer"><p>&copy; 2025 투자 플랫폼</p></footer>
    </div>
  );
};
export default BuyerMainPage;