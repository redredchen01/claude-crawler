"""CLI 入口 — click 基礎"""

import click
from ydk import __version__


@click.group()
@click.version_option(version=__version__, prog_name="ydk")
def cli():
    """ydk — 工作空間通用工具集"""
    pass


from ydk.commands import (
    file,
    git,
    media,
    text,
    project,
    env,
    sys,
    json_cmd,
    net,
    hash,
    find,
    batch,
    watch,
    llm,
    api,
)

cli.add_command(file.cli, "file")
cli.add_command(git.cli, "git")
cli.add_command(media.cli, "media")
cli.add_command(text.cli, "text")
cli.add_command(project.cli, "project")
cli.add_command(env.cli, "env")
cli.add_command(sys.cli, "sys")
cli.add_command(json_cmd.cli, "json")
cli.add_command(net.cli, "net")
cli.add_command(hash.cli, "hash")
cli.add_command(find.cli, "find")
cli.add_command(batch.cli, "batch")
cli.add_command(watch.cli, "watch")
cli.add_command(llm.cli, "llm")
cli.add_command(api.cli, "api")
