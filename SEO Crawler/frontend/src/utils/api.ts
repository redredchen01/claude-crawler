import axios, { AxiosInstance, AxiosError } from "axios";

/**
 * TypeScript 接口定义
 */

export interface Job {
  id: string;
  seed: string;
  sources: string[];
  status: "waiting" | "running" | "completed" | "failed";
  createdAt: number;
  finishedAt?: number;
  errorMessage?: string;
  resultCount?: number;
}

export interface JobResult {
  id: string;
  source: string;
  rawKeyword: string;
  normalizedKeyword: string;
  intent:
    | "informational"
    | "commercial"
    | "transactional"
    | "navigational"
    | "other";
  score: number;
  createdAt: number;
}

export interface CreateJobPayload {
  seed: string;
  sources: string[];
  competitorUrls?: string[];
}

export interface JobListResponse {
  jobs: Job[];
  total: number;
  page: number;
  pageSize: number;
}

export interface JobResultsResponse {
  jobId: string;
  keywords: JobResult[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiError {
  error: string;
  message: string;
  status: number;
  details?: unknown;
}

/**
 * API 客户端类
 */
export class ApiClient {
  private axiosInstance: AxiosInstance;

  constructor(baseURL: string = "http://localhost:3001") {
    this.axiosInstance = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // 响应拦截：统一错误处理
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error: AxiosError<ApiError>) => {
        if (error.response?.data?.message) {
          const err = new Error(error.response.data.message) as Error & {
            status?: number;
          };
          err.status = error.response.data.status;
          return Promise.reject(err);
        }
        return Promise.reject(error);
      },
    );
  }

  /**
   * 创建新任务
   */
  async createJob(payload: CreateJobPayload): Promise<Job> {
    const { data } = await this.axiosInstance.post<Job>("/api/jobs", payload);
    return data;
  }

  /**
   * 获取任务列表（分页）
   */
  async listJobs(
    page: number = 1,
    pageSize: number = 10,
  ): Promise<JobListResponse> {
    const { data } = await this.axiosInstance.get<JobListResponse>(
      "/api/jobs",
      {
        params: { page, pageSize },
      },
    );
    return data;
  }

  /**
   * 获取单个任务详情
   */
  async getJob(jobId: string): Promise<Job> {
    const { data } = await this.axiosInstance.get<Job>(`/api/jobs/${jobId}`);
    return data;
  }

  /**
   * 获取任务的关键词结果（分页）
   */
  async getJobResults(
    jobId: string,
    page: number = 1,
    pageSize: number = 25,
  ): Promise<JobResultsResponse> {
    const { data } = await this.axiosInstance.get<JobResultsResponse>(
      `/api/jobs/${jobId}/results`,
      {
        params: { page, pageSize },
      },
    );
    return data;
  }

  /**
   * 获取 CSV 导出 URL
   */
  getExportUrl(jobId: string): string {
    return `${this.axiosInstance.defaults.baseURL}/api/jobs/${jobId}/export/csv`;
  }

  /**
   * 获取健康检查状态
   */
  async getHealth(): Promise<{ status: string; timestamp: string }> {
    const { data } = await this.axiosInstance.get("/health");
    return data;
  }
}

/**
 * 全局 API 客户端实例
 */
export const apiClient = new ApiClient(
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001",
);

/**
 * 便捷函数导出
 */
export const createJob = (
  seed: string,
  sources: string[],
  competitorUrls?: string[],
) => apiClient.createJob({ seed, sources, competitorUrls });

export const listJobs = (page?: number, pageSize?: number) =>
  apiClient.listJobs(page, pageSize);

export const getJob = (jobId: string) => apiClient.getJob(jobId);

export const getJobResults = (
  jobId: string,
  page?: number,
  pageSize?: number,
) => apiClient.getJobResults(jobId, page, pageSize);

export const getExportUrl = (jobId: string) => apiClient.getExportUrl(jobId);

export const getHealth = () => apiClient.getHealth();
