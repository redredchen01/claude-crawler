import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Navigation from "./components/Navigation";
import ResourceList from "./pages/ResourceList";
import ResourceDetail from "./pages/ResourceDetail";
import ReviewQueue from "./pages/ReviewQueue";
import RuleConfig from "./pages/RuleConfig";
import SiteTagConfig from "./pages/SiteTagConfig";
import "./styles/App.css";

const App: React.FC = () => {
  return (
    <Router>
      <div className="app">
        <Navigation />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<ResourceList />} />
            <Route path="/resource/:id" element={<ResourceDetail />} />
            <Route path="/review" element={<ReviewQueue />} />
            <Route path="/rules" element={<RuleConfig />} />
            <Route path="/site-config" element={<SiteTagConfig />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

export default App;
