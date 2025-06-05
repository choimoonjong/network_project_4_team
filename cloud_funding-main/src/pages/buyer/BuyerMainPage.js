import React, { useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import '../../styles/BuyerMainPage.css';
import { getEtherBalance } from '../../utils/web3';

const BuyerMainPage = ({ products, investments, users }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { userId } = location.state || {};
  const [showBalance, setShowBalance] = useState(false);
  const [balance, setBalance] = useState(null);

  if (!userId) {
    return navigate('/', { replace: true });
  }

  const myInvestments = investments.filter(inv => inv.userId === userId);
  const myInvestedProductIds = [...new Set(myInvestments.map(inv => inv.productId))];
  const myInvestedProducts = products.filter(product => 
    myInvestedProductIds.includes(product.productId)
  );

  const getInvestmentTotal = (productId) => {
    return myInvestments
      .filter(inv => inv.productId === productId)
      .reduce((sum, inv) => sum + inv.amount, 0);
  };

  const checkBalance = async () => {
  try {
    const response = await fetch(`http://localhost:5000/api/get-balance/${userId}`);
    if (!response.ok) throw new Error('서버 응답 실패');

    const data = await response.json();
    setBalance(data.balance); // DB에서 가져온 잔액
    setShowBalance(true);
  } catch (error) {
    console.error('잔액 조회 오류:', error);
    alert('잔액 조회 중 오류가 발생했습니다.');
  }
};

  return (
    <div className="buyer-main-container">
      <header className="buyer-header">
        <h1>구매자 포털</h1>
        <div className="user-info">
          <p>로그인 ID: {userId}</p>
          <div className="balance-section">
            <button onClick={checkBalance} className="balance-button">
              ETH 잔액 조회
            </button>
            {showBalance && (
              <span className="balance-display">{balance} ETH</span>
            )}
          </div>
        </div>
        <button onClick={() => navigate('/')}>로그아웃</button>
      </header>

      <section className="my-investments-section">
        <h2>내가 투자한 상품</h2>
        <div className="my-investments-container">
          {myInvestedProducts.length > 0 ? (
            myInvestedProducts.map(product => (
              <div key={product.productId} className="investment-card">
                <h3>{product.productName}</h3>
                <p>투자 금액: {getInvestmentTotal(product.productId).toLocaleString()}원</p>
                <p>달성률: {Math.round((product.currentAmount / product.targetAmount) * 100)}%</p>
                <Link 
                  to={`/buyer/product/${product.productId}`} 
                  state={{ userId }}
                  className="view-detail-button"
                >
                  상세 보기
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
            !product.isCompleted && new Date(product.targetDate) > new Date()
          ).map(product => (
            <div key={product.productId} className="product-card">
              <h3>{product.productName}</h3>
              <p className="product-description">{product.description}</p>
              <div className="product-details">
                <p>목표 금액: {product.targetAmount.toLocaleString()}원</p>
                <p>현재 금액: {product.currentAmount.toLocaleString()}원</p>
                <p>달성률: {Math.round((product.currentAmount / product.targetAmount) * 100)}%</p>
                <p>마감일: {new Date(product.targetDate).toLocaleDateString()}</p>
              </div>
              <Link
                to={`/buyer/product/${product.productId}`}
                state={{ userId }}
                className="invest-button"
              >
                투자하기
              </Link>
            </div>
          ))}
        </div>
      </section>

      <footer className="buyer-footer">
        <p>&copy; 2025 투자 플랫폼</p>
      </footer>
    </div>
  );
};

export default BuyerMainPage;
