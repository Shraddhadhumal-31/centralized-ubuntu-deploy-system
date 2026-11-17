import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>Ubuntu Deploy</h2>
          <span className="sidebar-subtitle">Lab Management</span>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/" end className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>Dashboard</NavLink>
          <NavLink to="/computers" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>Computers</NavLink>
          <NavLink to="/images" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>Images</NavLink>
          <NavLink to="/deploy" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>Deploy</NavLink>
          <NavLink to="/history" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>History</NavLink>
        </nav>
        <div className="sidebar-footer">
          <span className="user-info">{user?.username}</span>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
