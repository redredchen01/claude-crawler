"""api 子命令 — HTTP 請求構建與重試策略"""

import time
import json
from typing import Optional, Dict, Any, Union
import click
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry as UrllibRetry


class RetryStrategy:
    """HTTP 重試策略工廠"""

    def __init__(
        self,
        max_retries: int = 3,
        backoff_factor: float = 2.0,
        status_forcelist: Optional[tuple] = None,
        allowed_methods: Optional[tuple] = None,
    ):
        """
        初始化重試策略

        :param max_retries: 最大重試次數 (預設 3)
        :param backoff_factor: 指數退避基數 (預設 2.0) → 1s, 2s, 4s, 8s...
        :param status_forcelist: 需要重試的 HTTP 狀碼 (預設 429, 500-503)
        :param allowed_methods: 允許重試的 HTTP 方法 (預設 GET, POST, PUT, DELETE, HEAD)
        """
        self.max_retries = max_retries
        self.backoff_factor = backoff_factor
        self.status_forcelist = status_forcelist or (429, 500, 502, 503)
        self.allowed_methods = allowed_methods or ("GET", "POST", "PUT", "DELETE", "HEAD")

    def to_urllib3_retry(self) -> UrllibRetry:
        """轉換為 urllib3 Retry 物件"""
        return UrllibRetry(
            total=self.max_retries,
            backoff_factor=self.backoff_factor,
            status_forcelist=self.status_forcelist,
            allowed_methods=self.allowed_methods,
            raise_on_status=False,
        )

    def create_session(self) -> requests.Session:
        """建立配置重試策略的 requests Session"""
        session = requests.Session()
        retry = self.to_urllib3_retry()
        adapter = HTTPAdapter(max_retries=retry)
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        return session


class RequestBuilder:
    """HTTP 請求構建工廠"""

    def __init__(
        self,
        method: str = "GET",
        timeout: int = 10,
        headers: Optional[Dict[str, str]] = None,
        retry_strategy: Optional[RetryStrategy] = None,
    ):
        """
        初始化請求構建器

        :param method: HTTP 方法 (GET, POST, PUT, DELETE, PATCH)
        :param timeout: 請求逾時秒數 (預設 10)
        :param headers: 自訂 headers
        :param retry_strategy: 重試策略 (預設 3 次重試，指數退避)
        """
        self.method = method.upper()
        self.timeout = timeout
        self.headers = headers or {}
        self.retry_strategy = retry_strategy or RetryStrategy()
        self.url = None
        self.params = None
        self.data = None
        self.json_data = None

    def set_url(self, url: str) -> "RequestBuilder":
        """設定請求 URL"""
        self.url = url
        return self

    def set_params(self, params: Dict[str, Any]) -> "RequestBuilder":
        """設定 URL query parameters"""
        self.params = params
        return self

    def set_data(self, data: Union[str, Dict]) -> "RequestBuilder":
        """設定請求 body (form-encoded)"""
        if isinstance(data, dict):
            self.data = data
        else:
            self.data = data
        return self

    def set_json(self, json_data: Dict[str, Any]) -> "RequestBuilder":
        """設定請求 body (JSON)"""
        self.json_data = json_data
        return self

    def add_header(self, key: str, value: str) -> "RequestBuilder":
        """添加單個 header"""
        self.headers[key] = value
        return self

    def build(self) -> "PreparedRequest":
        """構建請求物件"""
        if not self.url:
            raise ValueError("URL is required")

        return PreparedRequest(
            method=self.method,
            url=self.url,
            params=self.params,
            data=self.data,
            json_data=self.json_data,
            headers=self.headers,
            timeout=self.timeout,
            retry_strategy=self.retry_strategy,
        )


class PreparedRequest:
    """準備好的 HTTP 請求"""

    def __init__(
        self,
        method: str,
        url: str,
        params: Optional[Dict] = None,
        data: Optional[Union[str, Dict]] = None,
        json_data: Optional[Dict] = None,
        headers: Optional[Dict[str, str]] = None,
        timeout: int = 10,
        retry_strategy: Optional[RetryStrategy] = None,
    ):
        self.method = method
        self.url = url
        self.params = params
        self.data = data
        self.json_data = json_data
        self.headers = headers or {}
        self.timeout = timeout
        self.retry_strategy = retry_strategy or RetryStrategy()

    def execute(self) -> requests.Response:
        """執行請求，使用重試策略"""
        session = self.retry_strategy.create_session()

        try:
            response = session.request(
                method=self.method,
                url=self.url,
                params=self.params,
                data=self.data,
                json=self.json_data,
                headers=self.headers,
                timeout=self.timeout,
            )
            response.raise_for_status()
            return response
        finally:
            session.close()

    def __repr__(self) -> str:
        return f"<PreparedRequest {self.method} {self.url}>"


# ===== CLI Commands =====


@click.group()
def cli():
    """HTTP API 工具"""
    pass


@cli.command()
@click.argument("url")
@click.option("--method", "-X", default="GET", help="HTTP 方法 (GET, POST, PUT, DELETE)")
@click.option("--header", "-H", multiple=True, help="自訂 Header (Key: Value)")
@click.option("--data", "-d", default=None, help="Request body (form-encoded)")
@click.option("--json", "-j", "json_data", default=None, help="Request body (JSON 字串)")
@click.option("--params", "-p", default=None, help="Query parameters (JSON 字串)")
@click.option("--timeout", "-t", default=10, help="逾時秒數 (預設 10)")
@click.option("--retries", "-r", default=3, help="最大重試次數 (預設 3)")
@click.option("--backoff", "-b", default=2.0, help="退避基數 (預設 2.0)")
def request(url, method, header, data, json_data, params, timeout, retries, backoff):
    """發送 HTTP 請求"""
    try:
        # 解析 params 和 json
        parsed_params = None
        parsed_json = None

        if params:
            try:
                parsed_params = json.loads(params)
            except json.JSONDecodeError:
                click.echo(f"❌ 無法解析 params: {params}", err=True)
                return

        if json_data:
            try:
                parsed_json = json.loads(json_data)
            except json.JSONDecodeError:
                click.echo(f"❌ 無法解析 JSON: {json_data}", err=True)
                return

        # 構建 headers
        headers = {}
        for h in header:
            if ":" in h:
                key, val = h.split(":", 1)
                headers[key.strip()] = val.strip()
            else:
                click.echo(f"⚠️  忽略無效 header: {h}", err=True)

        # 構建請求
        retry_strategy = RetryStrategy(
            max_retries=retries,
            backoff_factor=backoff,
        )

        builder = RequestBuilder(
            method=method,
            timeout=timeout,
            headers=headers,
            retry_strategy=retry_strategy,
        )

        builder.set_url(url)
        if parsed_params:
            builder.set_params(parsed_params)
        if data:
            builder.set_data(data)
        if parsed_json:
            builder.set_json(parsed_json)

        # 執行
        prepared = builder.build()
        click.echo(f"📤 {method} {url}")

        start_time = time.time()
        response = prepared.execute()
        elapsed = time.time() - start_time

        # 輸出結果
        status_icon = "✅" if response.status_code < 400 else "❌"
        click.echo(
            f"{status_icon} {response.status_code} | {elapsed:.2f}s | {len(response.content)} bytes"
        )

        # 嘗試輸出 JSON 回應
        try:
            data_json = response.json()
            click.echo(f"\n{json.dumps(data_json, indent=2, ensure_ascii=False)}")
        except (json.JSONDecodeError, ValueError):
            # 輸出文本回應 (前 500 字符)
            if response.text:
                click.echo(f"\n{response.text[:500]}")

    except requests.exceptions.RequestException as e:
        click.echo(f"❌ 請求失敗: {e}", err=True)
    except Exception as e:
        click.echo(f"❌ 錯誤: {e}", err=True)


@cli.command()
@click.argument("url")
@click.option("--header", "-H", multiple=True, help="自訂 Header (Key: Value)")
@click.option("--timeout", "-t", default=5, help="逾時秒數 (預設 5)")
def head(url, header, timeout):
    """發送 HEAD 請求（檢查資源存在性）"""
    try:
        headers = {}
        for h in header:
            if ":" in h:
                key, val = h.split(":", 1)
                headers[key.strip()] = val.strip()

        start_time = time.time()
        response = requests.head(url, headers=headers, timeout=timeout)
        elapsed = time.time() - start_time

        status_icon = "✅" if response.status_code < 400 else "❌"
        click.echo(f"{status_icon} HEAD {url}")
        click.echo(f"   Status: {response.status_code} | Time: {elapsed:.2f}s")

        # 顯示重要 headers
        important_headers = [
            "Content-Type",
            "Content-Length",
            "Last-Modified",
            "Cache-Control",
        ]
        for h in important_headers:
            if h in response.headers:
                click.echo(f"   {h}: {response.headers[h]}")

    except requests.exceptions.RequestException as e:
        click.echo(f"❌ 請求失敗: {e}", err=True)
