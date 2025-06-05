import React from 'react';
import { useLocation, Navigate, useNavigate } from 'react-router-dom';
import '../styles/NavigationPage.css';

const NavigationPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { userId } = location.state || {};
  
  // userId가 없으면 로그인 페이지로 리다이렉트
  if (!userId) {
    return <Navigate to="/" />;
  }

  const handleBuyerClick = () => {
    console.log(`${userId} 사용자가 구매자 사이트로 이동`);
    navigate('/buyer', { state: { userId } });
  };

  const handleSellerClick = () => {
    console.log(`${userId} 사용자가 판매자 사이트로 이동`);
    navigate('/seller', { state: { userId } });
  };

  return (
    <div className="navigation-container">
      <h2 className="navigation-title">이동할 사이트를 선택하세요</h2>
      
      <div className="button-container">
        <button
          onClick={handleBuyerClick}
          className="navigation-button buyer-button"
        >
          구매자 사이트
        </button>
        
        <button
          onClick={handleSellerClick}
          className="navigation-button seller-button"
        >
          판매자 사이트
        </button>
      </div>
      
      <p className="navigation-message">
        {userId} 계정으로 로그인에 성공했습니다. 이용하실 서비스를 선택해 주세요.
      </p>
    </div>
  );
};

export default NavigationPage;