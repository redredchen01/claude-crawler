import React from "react";
import { Link } from "react-router-dom";
import "../styles/Navigation.css";

const Navigation: React.FC = () => {
  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-brand">
          Auto-Tagging Admin
        </Link>
        <ul className="navbar-nav">
          <li className="nav-item">
            <Link to="/" className="nav-link">
              Resources
            </Link>
          </li>
          <li className="nav-item">
            <Link to="/review" className="nav-link">
              Review Queue
            </Link>
          </li>
          <li className="nav-item">
            <Link to="/rules" className="nav-link">
              Rules
            </Link>
          </li>
          <li className="nav-item">
            <Link to="/site-config" className="nav-link">
              Site Config
            </Link>
          </li>
        </ul>
      </div>
    </nav>
  );
};

export default Navigation;
