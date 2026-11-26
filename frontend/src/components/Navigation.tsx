import { Link, useLocation } from 'react-router-dom';
import TokenButton from './TokenButton';

const Navigation = () => {
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <nav className="top-nav">
      <div className="nav-container">
        <Link to="/" className="nav-logo">CJ PB</Link>
        <div className="nav-menu">
          <Link to="/">
            <button id="nav-sch" className={`nav-item ${currentPath === '/' ? 'active' : ''}`}>편성표</button>
          </Link>
          <Link to="/task" className="hide-on-mobile">
            <button id="nav-task" className={`nav-item ${currentPath === '/task' ? 'active' : ''}`}>작업수행서</button>
          </Link>
          <Link to="/inventory">
            <button id="nav-inv" className={`nav-item ${currentPath === '/inventory' ? 'active' : ''}`}>재고관리</button>
          </Link>
          <Link to="/register" className="hide-on-mobile">
            <button id="nav-reg" className={`nav-item ${currentPath === '/register' ? 'active' : ''}`}>상품등록</button>
          </Link>
          <Link to="/rental" className="hide-on-mobile">
            <button id="nav-rental" className={`nav-item ${currentPath === '/rental' ? 'active' : ''}`}>대여현황</button>
          </Link>
          <TokenButton />
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
