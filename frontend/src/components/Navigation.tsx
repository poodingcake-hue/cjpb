import { Link, useLocation } from 'react-router-dom';

const Navigation = () => {
  const { pathname } = useLocation();
  const isInv = pathname.startsWith('/inventory') || pathname.startsWith('/detail');
  return (
    <nav className="top-nav">
      <div className="nav-container">
        <Link to="/" className="nav-logo">CJ PB</Link>
        <div className="nav-menu">
          <Link to="/">
            <button className={`nav-item ${pathname === '/' ? 'active' : ''}`}>편성표</button>
          </Link>
          <Link to="/inventory">
            <button className={`nav-item ${isInv ? 'active' : ''}`}>재고관리</button>
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
