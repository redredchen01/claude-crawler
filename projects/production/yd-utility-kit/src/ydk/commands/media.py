"""media 子命令 — 影片/圖片工具"""

import click


@click.group()
def cli():
    """影片/圖片工具"""
    pass


@cli.command()
@click.argument("file", type=click.Path(exists=True))
def info(file):
    """顯示媒體檔案資訊 (ffprobe)"""
    import subprocess
    import json

    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "quiet",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                file,
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            click.echo(f"❌ ffprobe 失敗：{result.stderr}")
            return

        data = json.loads(result.stdout)
        fmt = data.get("format", {})
        streams = data.get("streams", [])

        click.echo(f"📄 {file}\n")
        click.echo(f"   格式：{fmt.get('format_long_name', '?')}")
        click.echo(f"   時長：{float(fmt.get('duration', 0)):.1f}s")
        click.echo(f"   大小：{int(fmt.get('size', 0)) / 1024 / 1024:.1f} MB")
        click.echo(f"   比特率：{int(fmt.get('bit_rate', 0)) / 1000:.0f} kbps")

        for s in streams:
            codec = s.get("codec_type", "?")
            click.echo(f"\n   [{codec}]")
            if codec == "video":
                click.echo(f"     編碼：{s.get('codec_name', '?')}")
                click.echo(f"     解析度：{s.get('width', '?')}x{s.get('height', '?')}")
                click.echo(f"     幀率：{s.get('r_frame_rate', '?')}")
            elif codec == "audio":
                click.echo(f"     編碼：{s.get('codec_name', '?')}")
                click.echo(f"     取樣率：{s.get('sample_rate', '?')} Hz")
                click.echo(f"     聲道：{s.get('channels', '?')}")

    except FileNotFoundError:
        click.echo("❌ 需要安裝 ffmpeg (ffprobe)")


@cli.command()
@click.argument("file", type=click.Path(exists=True))
@click.option("--count", "-n", default=4, help="截圖數量")
@click.option("--output", "-o", default=".", help="輸出目錄")
def thumbs(file, count, output):
    """均勻截取影片縮圖"""
    import subprocess
    from pathlib import Path

    try:
        # 取得時長
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "quiet",
                "-show_entries",
                "format=duration",
                "-of",
                "csv=p=0",
                file,
            ],
            capture_output=True,
            text=True,
        )
        duration = float(result.stdout.strip())

        out_dir = Path(output)
        out_dir.mkdir(parents=True, exist_ok=True)

        interval = duration / (count + 1)
        for i in range(1, count + 1):
            ts = interval * i
            out_file = out_dir / f"thumb_{i:02d}.jpg"
            subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-ss",
                    str(ts),
                    "-i",
                    file,
                    "-frames:v",
                    "1",
                    "-q:v",
                    "2",
                    str(out_file),
                ],
                capture_output=True,
            )
            click.echo(f"   {out_file.name} @ {ts:.1f}s")

        click.echo(f"\n✅ {count} 張縮圖已儲存至 {out_dir}")

    except FileNotFoundError:
        click.echo("❌ 需要安裝 ffmpeg")
    except Exception as e:
        click.echo(f"❌ 錯誤：{e}")


@cli.command()
@click.argument("files", nargs=-1, type=click.Path(exists=True))
def compare(files):
    """並排比較多個媒體檔案的資訊"""
    import subprocess
    import json

    if len(files) < 2:
        click.echo("需要至少 2 個檔案進行比較")
        return

    click.echo(f"{'檔案':<30} {'時長':>8} {'大小':>10} {'解析度':>12} {'幀率':>8}")
    click.echo("-" * 72)

    for f in files:
        try:
            result = subprocess.run(
                [
                    "ffprobe",
                    "-v",
                    "quiet",
                    "-print_format",
                    "json",
                    "-show_format",
                    "-show_streams",
                    f,
                ],
                capture_output=True,
                text=True,
                timeout=10,
            )
            data = json.loads(result.stdout)
            fmt = data.get("format", {})
            vs = next(
                (s for s in data.get("streams", []) if s.get("codec_type") == "video"),
                {},
            )

            name = f[-28:] if len(f) > 28 else f
            dur = f"{float(fmt.get('duration', 0)):.1f}s"
            size = f"{int(fmt.get('size', 0)) / 1024 / 1024:.1f}MB"
            res = f"{vs.get('width', '?')}x{vs.get('height', '?')}"
            fps = vs.get("r_frame_rate", "?")

            click.echo(f"{name:<30} {dur:>8} {size:>10} {res:>12} {fps:>8}")
        except Exception:
            click.echo(f"{f:<30} {'error':>8}")
