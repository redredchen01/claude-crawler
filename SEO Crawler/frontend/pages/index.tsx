import { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { createJob } from "../src/utils/api";

export default function CreateJobPage() {
  const router = useRouter();
  const [seed, setSeed] = useState("");
  const [sources, setSources] = useState({ google: true, bing: false });
  const [competitorUrls, setCompetitorUrls] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSourceChange = (source: "google" | "bing") => {
    setSources((prev) => ({
      ...prev,
      [source]: !prev[source],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validation
    const selectedSources = Object.keys(sources).filter(
      (s) => sources[s as "google" | "bing"],
    );

    if (!seed.trim()) {
      setError("请输入种子关键词");
      return;
    }

    if (selectedSources.length === 0) {
      setError("请至少选择一个数据来源");
      return;
    }

    setLoading(true);
    try {
      // Parse competitor URLs
      const urls = competitorUrls
        .split("\n")
        .map((u) => u.trim())
        .filter((u) => u.length > 0);

      // Create job
      const job = await createJob(
        seed,
        selectedSources,
        urls.length > 0 ? urls : undefined,
      );

      // Redirect to job detail page
      router.push(`/jobs/${job.id}`);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "创建任务失败，请重试";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>新建任务 - SEO Crawler</title>
        <meta name="description" content="创建新的SEO爬虫任务" />
      </Head>

      <div className="create-job-container">
        <h1>创建新任务</h1>
        <p className="description">
          输入种子关键词和数据来源，开始SEO关键词爬取任务
        </p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="create-job-form">
          {/* 种子关键词 */}
          <div className="form-group">
            <label htmlFor="seed">
              种子关键词 <span className="required">*</span>
            </label>
            <input
              id="seed"
              type="text"
              placeholder="例如: SEO优化, 数字营销, 网站推广"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              disabled={loading}
            />
            <small>输入一个或多个关键词，用逗号分隔</small>
          </div>

          {/* 数据来源 */}
          <div className="form-group">
            <label>
              数据来源 <span className="required">*</span>
            </label>
            <div className="checkbox-group">
              <div className="checkbox-item">
                <input
                  id="google"
                  type="checkbox"
                  checked={sources.google}
                  onChange={() => handleSourceChange("google")}
                  disabled={loading}
                />
                <label htmlFor="google" style={{ marginBottom: 0 }}>
                  Google
                </label>
              </div>
              <div className="checkbox-item">
                <input
                  id="bing"
                  type="checkbox"
                  checked={sources.bing}
                  onChange={() => handleSourceChange("bing")}
                  disabled={loading}
                />
                <label htmlFor="bing" style={{ marginBottom: 0 }}>
                  Bing
                </label>
              </div>
            </div>
            <small>至少选择一个来源</small>
          </div>

          {/* 竞争对手URLs */}
          <div className="form-group">
            <label htmlFor="competitor-urls">竞争对手URLs (可选)</label>
            <textarea
              id="competitor-urls"
              placeholder="每行输入一个URL&#10;例如:&#10;https://example1.com&#10;https://example2.com"
              value={competitorUrls}
              onChange={(e) => setCompetitorUrls(e.target.value)}
              disabled={loading}
            />
            <small>从竞争对手网站提取关键词，每行一个URL</small>
          </div>

          {/* 提交按钮 */}
          <div className="form-group">
            <button
              type="submit"
              className="button button-primary"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner"></span> 创建中...
                </>
              ) : (
                "创建任务"
              )}
            </button>
            <button
              type="reset"
              className="button button-secondary"
              disabled={loading}
            >
              清空
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        .create-job-container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #fff;
          padding: 2rem;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        h1 {
          font-size: 1.8rem;
          margin-bottom: 0.5rem;
          color: #333;
        }

        .description {
          color: #666;
          margin-bottom: 2rem;
        }

        .create-job-form {
          margin-top: 2rem;
        }

        .form-group {
          margin-bottom: 1.5rem;
        }

        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
          color: #333;
        }

        .required {
          color: #ff0000;
        }

        .form-group small {
          display: block;
          margin-top: 0.25rem;
          color: #999;
          font-size: 0.85rem;
        }

        .checkbox-group label {
          font-weight: normal;
          display: inline;
          margin-left: 0.5rem;
          margin-bottom: 0;
        }

        .spinner {
          margin-right: 0.5rem;
          vertical-align: middle;
        }

        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </>
  );
}
