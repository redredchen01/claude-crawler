import type { AppProps } from "next/app";
import Link from "next/link";
import "../styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className="app-container">
      {/* 导航栏 */}
      <nav className="navbar">
        <div className="navbar-inner">
          <div className="navbar-brand">
            <h1 className="logo">SEO Crawler</h1>
          </div>
          <div className="navbar-links">
            <Link href="/" className="nav-link">
              新建任务
            </Link>
            <Link href="/jobs" className="nav-link">
              历史任务
            </Link>
          </div>
        </div>
      </nav>

      {/* 主内容区域 */}
      <main className="main-content">
        <div className="container">
          <Component {...pageProps} />
        </div>
      </main>

      {/* 底部 */}
      <footer className="footer">
        <p>&copy; 2026 SEO Crawler. All rights reserved.</p>
      </footer>
    </div>
  );
}
