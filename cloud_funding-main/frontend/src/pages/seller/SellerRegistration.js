// SellerRegistration.js
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../../styles/SellerRegistration.css';

const SellerRegistration = ({ registerProduct, users }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { userId } = location.state || {};

  const [productName, setProductName] = useState('');
  const [description, setDescription] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState(''); // 'YYYY-MM-DDTHH:mm' 형식으로 저장
  const [image, setImage] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  useEffect(() => {
    if (!userId) {
      navigate('/', { replace: true });
    }
  }, [userId, navigate]);

  const getMinDateTime = () => {
    const now = new Date();
    // 현재 시간에 현지 시간대 오프셋을 적용하여 ISO 문자열 변환 시 정확한 로컬 시간 반영
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); 
    
    // --- 요청 사항 반영: 최소 마감 시간을 현재로부터 1분 뒤로 설정 ---
    now.setMinutes(now.getMinutes() + 1); 
    // -----------------------------------------------------------

    now.setSeconds(0); // 초는 0으로 설정
    now.setMilliseconds(0); // 밀리초도 0으로 설정
    
    return now.toISOString().slice(0, 16); // 'YYYY-MM-DDTHH:mm' 형식으로 반환
  };


  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!productName || !description || !targetAmount || !targetDate) {
      setMessage('모든 필수 필드를 입력해주세요.');
      setMessageType('error');
      return;
    }
    // targetDate가 getMinDateTime에서 설정한 최소 시간보다 이전인지 다시 한번 확인
    if (new Date(targetDate) < new Date(getMinDateTime())) {
        setMessage('목표 마감일은 현재 시간으로부터 최소 1분 이후여야 합니다.');
        setMessageType('error');
        return;
    }

    const newProductData = {
      productName,
      description,
      targetAmount: parseFloat(targetAmount),
      targetDate,
      sellerId: userId,
      image: image || `https://via.placeholder.com/400x300?text=${encodeURIComponent(productName)}`
    };

    setMessage('상품을 등록 중입니다...');
    setMessageType('info');

    const result = await registerProduct(newProductData);

    if (result.success) {
      setMessage('상품이 성공적으로 등록되었습니다.');
      setMessageType('success');
      setProductName(''); setDescription(''); setTargetAmount(''); setTargetDate(''); setImage('');
      setTimeout(() => {
        navigate('/seller', { state: { userId } });
      }, 2000);
    } else {
      setMessage(result.message || '상품 등록에 실패했습니다. 다시 시도해주세요.');
      setMessageType('error');
    }
  };

  return (
    <div className="seller-registration-container">
      <header className="registration-header">
        <button onClick={() => navigate('/seller', { state: { userId } })}>&larr; 판매자 페이지로</button>
        <h1>상품 등록</h1>
        <p>판매자 ID: {userId}</p>
      </header>
      <div className="registration-content">
        {message && <div className={`message ${messageType}`}>{message}</div>}
        <form className="registration-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="productName">상품명</label>
            <input type="text" id="productName" value={productName} onChange={(e) => setProductName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label htmlFor="description">상품 설명</label>
            <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows="5" required />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="targetAmount">목표 금액 (원)</label>
              <input type="number" id="targetAmount" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} min="1000" step="100" required />
            </div>
            <div className="form-group">
              <label htmlFor="targetDate">목표 마감일 및 시간</label>
              <input
                type="datetime-local"
                id="targetDate"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                min={getMinDateTime()} // 최소 시간 설정
                required
              />
            </div>
          </div>
           <div className="form-group">
            <label htmlFor="image">상품 이미지 URL (선택 사항)</label>
            <input type="url" id="image" value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://example.com/image.jpg" />
          </div>
          <div className="form-actions">
            <button type="submit" className="register-button">상품 등록</button>
            <button type="button" className="cancel-button" onClick={() => navigate('/seller', { state: { userId } })}>취소</button>
          </div>
        </form>
      </div>
      <footer className="registration-footer"><p>&copy; 2025 투자 플랫폼</p></footer>
    </div>
  );
};
export default SellerRegistration;