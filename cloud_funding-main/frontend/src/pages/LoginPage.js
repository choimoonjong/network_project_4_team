import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/LoginPage.css';

function LoginPage({ users, clearStorage }) {
  const [showDevTools, setShowDevTools] = useState(false);
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const toggleDevTools = () => {
    setShowDevTools(!showDevTools);
  };

  // 계정 정보 검증 및 로그인 처리
  const handleLogin = () => {
    // 계정 정보 검증
    const account = users.find(
      acc => acc.userId === id && acc.password === password
    );

    if (account) {
      // 로그인 성공 처리
      console.log('로그인 성공:', account.userId);
      setError('');
      // 로그인 성공 시 navigation 페이지로 이동하면서 userId 전달
      navigate('/navigation', { state: { userId: account.userId } });
    } else {
      // 로그인 실패 처리
      setError('아이디 또는 비밀번호가 올바르지 않습니다.');
    }
  };

  return (
    <div className="login-page-container">
      <div className="login-page-content">
        <div className="login-container">
          <h2 className="login-title">로그인</h2>
          
          <div className="login-form">
            {error && <p className="login-error">{error}</p>}
            
            <div className="form-group">
              <input
                type="text"
                value={id}
                onChange={(e) => setId(e.target.value)}
                className="form-input"
                placeholder="아이디"
              />
            </div>
            
            <div className="form-group">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
                placeholder="비밀번호"
              />
            </div>
            
            <div>
              <button
                onClick={handleLogin}
                className="login-button"
              >
                로그인
              </button>
            </div>
            
            <div className="login-help">
              <p>판매자 전용 계정: id=0000, pw=0000</p>
              <p>구매자 전용 계정: id=1234, pw=1234 또는 id=5678, pw=5678</p>
            </div>
          </div>
        </div>
        
        {/* 개발 도구 토글 (비밀 영역) */}
        <div className="dev-tools-area">
          <button 
            className="dev-tools-toggle"
            onClick={toggleDevTools}
          >
            {showDevTools ? "개발 도구 숨기기" : "개발 도구"}
          </button>
          
          {showDevTools && (
            <div className="dev-tools-panel">
              <h3>개발 도구</h3>
              <button 
                className="clear-storage-button"
                onClick={clearStorage}
              >
                localStorage 초기화
              </button>
              <p className="dev-tools-note">
                * 이 버튼은 모든 상품 및 투자 데이터를 초기화합니다.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LoginPage;