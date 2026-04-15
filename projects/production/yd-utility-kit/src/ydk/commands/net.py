"""net 子命令 — 網路工具"""

import socket
import subprocess
import time
import click


@click.group()
def cli():
    """網路工具"""
    pass


@cli.command()
@click.argument("host")
@click.option("--port", "-p", default=443, help="連接埠")
@click.option("--timeout", "-t", default=5, help="逾時秒數")
def check(host, port, timeout):
    """檢查主機連線"""
    click.echo(f"🔍 {host}:{port} ...")
    start = time.time()

    try:
        sock = socket.create_connection((host, port), timeout=timeout)
        elapsed = time.time() - start
        sock.close()
        click.echo(f"✅ 連線成功 ({elapsed * 1000:.0f}ms)")
    except socket.timeout:
        click.echo(f"❌ 逾時 (>{timeout}s)")
    except socket.gaierror:
        click.echo(f"❌ DNS 解析失敗: {host}")
    except ConnectionRefusedError:
        click.echo(f"❌ 連線被拒 ({host}:{port})")
    except Exception as e:
        click.echo(f"❌ 錯誤: {e}")


@cli.command()
@click.argument("url")
@click.option("--method", "-X", default="GET", help="HTTP 方法")
@click.option("--header", "-H", multiple=True, help="自訂 Header (Key: Value)")
@click.option("--timeout", "-t", default=10, help="逾時秒數")
@click.option("--body", "-d", default=None, help="Request body")
def http(url, method, header, timeout, body):
    """發送 HTTP 請求（curl wrapper）"""
    cmd = [
        "curl",
        "-s",
        "-w",
        "\n%{http_code} %{time_total}s %{size_download}B",
        "-X",
        method,
        "--max-time",
        str(timeout),
    ]

    for h in header:
        cmd.extend(["-H", h])

    if body:
        cmd.extend(["-d", body])

    cmd.append(url)

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout + 5
        )
        lines = result.stdout.strip().split("\n")
        meta = lines[-1] if lines else ""
        response_body = "\n".join(lines[:-1])

        # Parse meta: "200 0.123s 1234B"
        parts = meta.split()
        status = parts[0] if parts else "?"
        elapsed = parts[1] if len(parts) > 1 else "?"
        size = parts[2] if len(parts) > 2 else "?"

        color = (
            "✅" if status.startswith("2") else "⚠️" if status.startswith("3") else "❌"
        )
        click.echo(f"{color} {method} {url}")
        click.echo(f"   Status: {status} | Time: {elapsed} | Size: {size}")

        # Pretty print JSON response
        if response_body.strip().startswith("{") or response_body.strip().startswith(
            "["
        ):
            import json

            try:
                parsed = json.loads(response_body)
                click.echo(f"\n{json.dumps(parsed, indent=2, ensure_ascii=False)}")
            except json.JSONDecodeError:
                click.echo(f"\n{response_body[:500]}")
        elif response_body:
            click.echo(f"\n{response_body[:500]}")

    except FileNotFoundError:
        click.echo("❌ 需要安裝 curl")
    except subprocess.TimeoutExpired:
        click.echo(f"❌ 逾時 (>{timeout + 5}s)")


@cli.command()
@click.argument("domain")
def dns(domain):
    """查詢 DNS 記錄"""
    click.echo(f"🔍 DNS: {domain}\n")

    record_types = ["A", "AAAA", "MX", "NS", "TXT", "CNAME"]
    for rtype in record_types:
        try:
            result = subprocess.run(
                ["dig", "+short", domain, rtype],
                capture_output=True,
                text=True,
                timeout=10,
            )
            records = [
                r.strip() for r in result.stdout.strip().split("\n") if r.strip()
            ]
            if records:
                for r in records[:5]:
                    click.echo(f"  {rtype:<6} {r}")
        except (FileNotFoundError, subprocess.TimeoutExpired):
            # Fallback to socket
            if rtype == "A":
                try:
                    ip = socket.gethostbyname(domain)
                    click.echo(f"  A      {ip}")
                except socket.gaierror:
                    pass
            break


@cli.command()
@click.argument("host")
@click.option(
    "--ports", "-p", default="22,80,443,3306,5432,8080", help="逗號分隔的連接埠"
)
@click.option("--timeout", "-t", default=2, help="每個連接埠逾時秒數")
def scan(host, ports, timeout):
    """掃描主機開放連接埠"""
    port_list = [int(p.strip()) for p in ports.split(",")]
    click.echo(f"🔍 掃描 {host} ({len(port_list)} ports)...\n")

    open_ports = []
    for port in port_list:
        try:
            sock = socket.create_connection((host, port), timeout=timeout)
            sock.close()
            open_ports.append(port)
            click.echo(f"  ✅ {port:>5} open")
        except (socket.timeout, ConnectionRefusedError, OSError):
            click.echo(f"  ❌ {port:>5} closed")

    click.echo(f"\n結果: {len(open_ports)}/{len(port_list)} 開放")
    if open_ports:
        click.echo(f"開放: {', '.join(str(p) for p in open_ports)}")
