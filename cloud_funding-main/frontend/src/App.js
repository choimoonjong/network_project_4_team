// App.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import NavigationPage from './pages/NavigationPage';
import BuyerMainPage from './pages/buyer/BuyerMainPage';
import BuyerProductDetail from './pages/buyer/BuyerProductDetail';
import SellerMainPage from './pages/seller/SellerMainPage';
import SellerRegistration from './pages/seller/SellerRegistration';

function App() {
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([ // 사용자 정보는 실제로는 로그인 통해 관리되어야 함
    { userId: '0000', password: '0000', ethAddress: '0x1f1504240453f8af0386a04ec0649a24a958c3e4' }, // 판매자
    { userId: '1234', password: '1234', ethAddress: '0xb87b7d23bd3500e26ab68342753c0d2a931e1e1d' }, // 구매자
    { userId: '5678', password: '5678', ethAddress: '0xd10e743a1657612c9db45f9902bfbcb762697811' }, // 시스템 마스터 (참고용)
  ]);

  const fetchProducts = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/products');
      const data = await response.json();
      if (data.success) {
        const formattedProducts = data.products.map(p => ({
          ...p,
          productId: String(p.product_id),
          targetAmount: parseFloat(p.target_amount),
          currentAmount: parseFloat(p.current_amount || 0),
          // target_date는 DATETIME 문자열로 올 것임 (예: "2025-12-31 23:59:00")
          // status도 백엔드에서 문자열로 올 것임 (예: "펀딩중", "펀딩성공_지급완료" 등)
        }));
        setProducts(formattedProducts);
      } else {
        console.error('상품 목록 로드 실패:', data.message);
      }
    } catch (error) {
      console.error('상품 목록 로드 API 호출 오류:', error);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const registerProduct = async (newProductData) => {
    try {
      const response = await fetch('http://localhost:5000/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProductData),
      });
      const data = await response.json();
      if (data.success && data.product) {
        fetchProducts(); // 새 상품 등록 후 목록 다시 로드
        return { success: true, product: data.product };
      } else {
        return { success: false, message: data.message || '상품 등록 실패' };
      }
    } catch (error) {
      console.error('상품 등록 API 호출 오류:', error);
      return { success: false, message: '서버 통신 오류로 상품 등록에 실패했습니다.' };
    }
  };

  // transferFundsToSeller 와 refundToInvestors 함수는
  // 백엔드의 자동 처리 로직(invest API, scheduler)으로 대체되었으므로 제거 또는 주석처리 합니다.
  /*
  const transferFundsToSeller = (productId) => { ... };
  const refundToInvestors = (productId) => { ... };
  */

  return (
    <Router>
      <Routes>
        <Route path="/" element={<LoginPage users={users} />} />
        <Route path="/navigation" element={<NavigationPage />} />
        <Route
          path="/buyer"
          element={<BuyerMainPage products={products} users={users} fetchProducts={fetchProducts}/>}
        />
        <Route
          path="/buyer/product/:productId"
          element={
            <BuyerProductDetail
              products={products} // 전체 products 목록 또는 빈 배열 (상세페이지에서 개별 fetch)
              users={users}
              fetchProducts={fetchProducts} // 투자/취소 후 상품 목록 및 상세 정보 갱신용
            />
          }
        />
        <Route
          path="/seller"
          element={<SellerMainPage users={users} fetchProductsHook={fetchProducts} />}
        />
        <Route
          path="/seller/registration"
          element={<SellerRegistration registerProduct={registerProduct} users={users} />}
        />
      </Routes>
    </Router>
  );
}
export default App;