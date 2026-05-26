import json
import subprocess
import sys
from pathlib import Path


CHEATSHEET_JS = r"""
var ht=[{id:`help`,title:`/help`,syntax:`/help`,description:`Show help for all interactive slash commands inside a Copilot CLI session.`,analogy:`Like the index of a cookbook — scan it to know what is possible.`,examples:[`/help  # list all slash commands`],category:`getting-started`},{id:`mcp-show`,title:`/mcp show`,syntax:`/mcp show [SERVER]`,description:`Show configured MCP servers and connection status.`,analogy:`Like checking which tools are plugged into your workbench.`,examples:[`/mcp show  # list configured MCP servers`],category:`mcp`},{id:`review`,title:`/review`,syntax:`/review [target]`,description:`Ask Copilot to review code and call out issues.`,examples:[`/review  # review current changes`],category:`development-workflows`},{id:`delegate`,title:`/delegate`,syntax:`/delegate [PROMPT]`,description:`Delegate a task to Copilot coding agent.`,examples:[`/delegate add input validation`],category:`agents`}];
"""

DOCS_MARKDOWN = r"""
---
title: GitHub Copilot CLI command reference
---

## Slash commands in the interactive interface

| Command | Purpose |
|---------|---------|
| `/help` | Show the help for interactive commands from the official docs. |
| `/mcp [show\|add\|edit\|delete] [SERVER-NAME]` | Manage the MCP server configuration. See [AUTOTITLE](/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers#managing-mcp-servers). |
| `/delegate [PROMPT]` | Delegate changes to a remote repository with an AI-generated pull request. See [AUTOTITLE](/copilot/how-tos/copilot-cli/use-copilot-cli/delegate-tasks-to-cca). |
| `/review [PROMPT]` | Run the code review agent to analyze changes. See [AUTOTITLE](/copilot/how-tos/copilot-cli/use-copilot-cli/agentic-code-review). |
| `/update`, `/upgrade` | Update the CLI to the latest version. |
| `/cwd`, `/cd [PATH]` | Change the working directory or display the current directory. |
| `/exit`, `/quit` | Exit the CLI. |

## Command-line options
"""


def write_fixture(tmp_path: Path, name: str, content: str) -> Path:
    fixture = tmp_path / name
    fixture.write_text(content, encoding="utf-8")
    return fixture


def run_ingest(tmp_path: Path, *, cheatsheet_js: Path | None = None, docs_md: Path | None = None, check: bool = True):
    out = tmp_path / "topics.json"
    script = Path(__file__).resolve().parents[1] / "scripts" / "ingest_course.py"
    args = [sys.executable, str(script), "--json", str(out)]
    if cheatsheet_js is not None:
        args.extend(["--cheatsheet-js", str(cheatsheet_js)])
    if docs_md is not None:
        args.extend(["--docs-md", str(docs_md)])
    result = subprocess.run(args, check=check, text=True, capture_output=True)
    return out, result


def run_fixture_ingest(tmp_path: Path):
    cheatsheet = write_fixture(tmp_path, "cheatsheet.js", CHEATSHEET_JS)
    docs = write_fixture(tmp_path, "docs.md", DOCS_MARKDOWN)
    return run_ingest(tmp_path, cheatsheet_js=cheatsheet, docs_md=docs)


def read_topics(out: Path):
    return json.loads(out.read_text(encoding="utf-8"))


def topic_by_title(topics, title: str):
    return next(topic for topic in topics if topic["title"] == title)


def test_ingest_writes_json_directly_without_sqlite_output(tmp_path):
    out, result = run_fixture_ingest(tmp_path)

    assert out.exists()
    assert not (tmp_path / "topics.db").exists()
    assert "SQLite" not in result.stdout

    data = read_topics(out)
    assert data["topicCount"] == 7
    assert data["types"] == ["command"]
    assert data["sourceUrl"].endswith("cheatsheet.js")
    assert data["sourceUrls"]["primary"].endswith("cheatsheet.js")
    assert data["sourceUrls"]["officialDocs"].endswith("docs.md")
    assert data["topics"][0]["type"] == "command"


def test_ingest_keeps_cheatsheet_primary_but_does_not_copy_cheatsheet_wording(tmp_path):
    out, _result = run_fixture_ingest(tmp_path)
    topics = read_topics(out)["topics"]

    assert len(topics) == 7
    help_topic = topic_by_title(topics, "/help")
    assert help_topic["syntax"] == "/help"
    assert help_topic["synopsis"] != "Show help for all interactive slash commands inside a Copilot CLI session."
    assert "Show help for all interactive slash commands inside a Copilot CLI session." not in help_topic["details"]
    assert "Like the index of a cookbook" not in help_topic["details"]
    assert "Official docs:" not in help_topic["details"]
    assert "Show the help for interactive commands from the official docs." in help_topic["details"]
    assert help_topic["category"] == "getting-started"
    assert help_topic["source_kind"] == "cheatsheet+official-docs"
    assert "cheatsheet" in help_topic["sources"]
    assert "official-docs" in help_topic["sources"]
    assert {"id", "slug", "type", "title", "displayText", "synopsis", "details", "examples", "syntax", "category"} <= set(help_topic)


def test_merged_official_docs_copy_reads_like_user_facing_guidance(tmp_path):
    out, _result = run_fixture_ingest(tmp_path)
    delegate_topic = topic_by_title(read_topics(out)["topics"], "/delegate")

    assert "available in the details" not in delegate_topic["synopsis"]
    assert "available in the details" not in delegate_topic["details"]
    assert delegate_topic["synopsis"] == "Use /delegate to delegate work to Copilot coding agent and create an AI-generated pull request."
    assert "Delegate changes to a remote repository with an AI-generated pull request." in delegate_topic["details"]
    assert "Official docs:" not in delegate_topic["details"]
    assert delegate_topic["docs_url"].endswith("/copilot/how-tos/copilot-cli/use-copilot-cli/delegate-tasks-to-cca")


def test_ingest_keeps_examples_out_of_details_when_examples_are_separate(tmp_path):
    out, _result = run_fixture_ingest(tmp_path)
    delegate_topic = topic_by_title(read_topics(out)["topics"], "/delegate")

    assert delegate_topic["examples"] == ["/delegate add input validation"]
    assert "Try it:" not in delegate_topic["details"]
    assert "/delegate add input validation" not in delegate_topic["details"]
    assert "Syntax: /delegate [PROMPT]" in delegate_topic["details"]
    assert "Delegate changes to a remote repository with an AI-generated pull request." in delegate_topic["details"]
    assert "Official docs:" not in delegate_topic["details"]


def test_ingest_adds_official_docs_commands_missing_from_cheatsheet(tmp_path):
    out, _result = run_fixture_ingest(tmp_path)
    topics = read_topics(out)["topics"]

    update_topic = topic_by_title(topics, "/update")
    assert update_topic["displayText"] == "/update"
    assert update_topic["syntax"] == "/update, /upgrade"
    assert update_topic["synopsis"] == "Use /update to update Copilot CLI to the latest version."
    assert update_topic["details"].endswith("Update the CLI to the latest version.")
    assert "Official docs:" not in update_topic["details"]
    assert update_topic["source_kind"] == "official-docs"
    assert update_topic["category"] == "official-docs"

    review_topic = topic_by_title(topics, "/review")
    assert review_topic["synopsis"] == "Use /review to run the code review agent to analyze changes."
    assert "See /copilot" not in review_topic["details"]
    assert review_topic["docs_url"].endswith("/copilot/how-tos/copilot-cli/use-copilot-cli/agentic-code-review")


def test_ingest_falls_back_to_official_docs_when_cheatsheet_unavailable(tmp_path):
    missing_cheatsheet = tmp_path / "missing-cheatsheet.js"
    docs = write_fixture(tmp_path, "docs.md", DOCS_MARKDOWN)

    out, result = run_ingest(tmp_path, cheatsheet_js=missing_cheatsheet, docs_md=docs)
    data = read_topics(out)
    titles = {topic["title"] for topic in data["topics"]}

    assert result.returncode == 0
    assert data["topicCount"] == 7
    assert data["sourceUrl"].endswith("docs.md")
    assert data["sourceUrls"]["primary"] is None
    assert data["sourceUrls"]["officialDocs"].endswith("docs.md")
    assert {"/help", "/mcp", "/delegate", "/review", "/update"} <= titles
    assert all(topic["source_kind"] == "official-docs" for topic in data["topics"])


def test_details_do_not_expose_provenance_labels_to_users(tmp_path):
    out, _result = run_fixture_ingest(tmp_path)
    topics = read_topics(out)["topics"]

    assert all("Official docs:" not in topic["details"] for topic in topics)
    assert all("Official syntax:" not in topic["details"] for topic in topics)
    assert any(topic.get("official_purpose") for topic in topics)


def test_ingest_does_not_include_old_course_context_or_terms(tmp_path):
    out, _result = run_fixture_ingest(tmp_path)
    topics = read_topics(out)["topics"]

    titles = {topic["title"] for topic in topics}
    types = {topic["type"] for topic in topics}

    assert types == {"command"}
    assert "@samples/book-app-project/utils.py" not in titles
    assert "Interactive Mode" not in titles
    assert "Slash Command" not in titles


def test_cheatsheet_parser_keeps_multiword_slash_commands(tmp_path):
    out, _result = run_fixture_ingest(tmp_path)
    commands = [topic["title"] for topic in read_topics(out)["topics"]]

    assert "/mcp show" in commands
    assert "/review" in commands
    assert commands.count("/help") == 1


def test_docs_parser_indexes_alias_slash_commands(tmp_path):
    docs = write_fixture(tmp_path, "docs.md", DOCS_MARKDOWN)
    cheatsheet = write_fixture(tmp_path, "cheatsheet.js", CHEATSHEET_JS + "var more=[{id:`cd`,title:`/cd`,syntax:`/cd [PATH]`,description:`Change directories.`,examples:[`/cd ..`],category:`configuration`},{id:`quit`,title:`/quit`,syntax:`/quit`,description:`Quit.`,examples:[`/quit`],category:`troubleshooting`}];")

    out, _result = run_ingest(tmp_path, cheatsheet_js=cheatsheet, docs_md=docs)
    topics = read_topics(out)["topics"]

    cd_topic = topic_by_title(topics, "/cd")
    assert cd_topic["source_kind"] == "cheatsheet+official-docs"
    assert cd_topic["official_purpose"] == "Change the working directory or display the current directory."
    assert cd_topic["synopsis"] == "Use /cd to change the working directory or show where you are."
    assert "Official syntax:" not in cd_topic["details"]
    assert "Syntax: /cwd, /cd [PATH]" in cd_topic["details"]

    quit_topic = topic_by_title(topics, "/quit")
    assert quit_topic["source_kind"] == "cheatsheet+official-docs"
    assert quit_topic["official_purpose"] == "Exit the CLI."
    assert quit_topic["synopsis"] == "Use /quit to exit Copilot CLI."


def test_official_docs_drive_user_facing_synopsis_for_every_matched_command(tmp_path):
    out, _result = run_fixture_ingest(tmp_path)
    topics = read_topics(out)["topics"]

    matched = [topic for topic in topics if "official-docs" in topic["sources"]]
    assert matched
    assert all(topic["official_purpose"] for topic in matched)
    assert all("workflow" not in topic["synopsis"].lower() for topic in matched)

    help_topic = topic_by_title(topics, "/help")
    assert help_topic["synopsis"] == "Use /help to show help for interactive commands."
    update_topic = topic_by_title(topics, "/update")
    assert update_topic["synopsis"] == "Use /update to update Copilot CLI to the latest version."
