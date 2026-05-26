#!/usr/bin/env python3
"""Ingest GitHub Copilot CLI command topics from cheatsheet + official docs.

The cheatsheet stays the primary source for the public spinner because it has
teaching-oriented command coverage, categories, examples, and syntax. GitHub
Docs is merged in as the canonical reference layer. If the cheatsheet is down or
unavailable, the official docs table is enough to generate a usable static JSON
payload.

Do not copy cheatsheet prose into the output. Treat the cheatsheet as structured
signal, then generate concise app copy from command metadata and official docs.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

DEFAULT_CHEATSHEET_URL = "https://prasadhonrao.github.io/ghcp-cli-cheatsheet/"
DEFAULT_ASSET_BASE = "https://prasadhonrao.github.io"
DEFAULT_DOCS_URL = "https://raw.githubusercontent.com/github/docs/main/content/copilot/reference/copilot-cli-reference/cli-command-reference.md"
COMMAND_OBJECT_RE = re.compile(r"\{id:`[^`]+`,title:`/")
FIELD_RE_TEMPLATE = r"{field}:`((?:\\.|[^`])*)`"
EXAMPLES_RE = re.compile(r"examples:\[((?:`(?:\\.|[^`])*`,?)*)\]")
BACKTICK_STRING_RE = re.compile(r"`((?:\\.|[^`])*)`")
MARKDOWN_LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
MARKDOWN_TOKEN_RE = re.compile(r"\{%[^%]+%\}")
VARIABLE_TOKEN_RE = re.compile(r"\{%\s*data\s+([^%]+?)\s*%\}")
VARIABLE_REPLACEMENTS = {
    "variables.product.prodname_copilot_short": "Copilot",
    "variables.copilot.copilot_cli_short": "Copilot CLI",
    "variables.copilot.copilot_custom_agent_short": "Copilot custom agent",
    "variables.product.github": "GitHub",
    "reusables.copilot.experimental": "",
}


@dataclass(frozen=True)
class Topic:
    id: str
    slug: str
    type: str
    title: str
    displayText: str
    synopsis: str
    details: str
    source_path: str
    source_heading: str
    chapter: str
    examples: list[str]
    keywords: list[str]
    syntax: str
    category: str
    note: str
    source_kind: str
    sources: list[str]
    official_purpose: str
    official_aliases: list[str]
    docs_url: str

@dataclass(frozen=True)
class SourceCommand:
    title: str
    syntax: str
    description: str
    category: str
    source_path: str
    source_heading: str
    examples: list[str]
    aliases: tuple[str, ...] = ()
    note: str = ""
    analogy: str = ""
    docs_url: str = ""



def decode_js_template(value: str) -> str:
    value = value.replace(r"\`", "`").replace(r"\\", "\\")
    value = value.replace(r"\n", "\n").replace(r"\t", "\t")
    return value.strip()


def slugify(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return re.sub(r"-+", "-", value).strip("-") or "topic"


def topic_id(*parts: str) -> str:
    digest = hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:12]
    return f"topic_{digest}"


def normalize_space(value: str) -> str:
    value = re.sub(r"\s+", " ", value or "")
    return value.strip()


def fetch_text(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "copilot-cli-topic-generator/1.0"})
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read().decode("utf-8", "replace")


def resolve_cheatsheet_js(page_url: str) -> tuple[str, str]:
    html_text = fetch_text(page_url)
    match = re.search(r'<script[^>]+type="module"[^>]+src="([^"]+\.js)"', html_text)
    if not match:
        raise RuntimeError(f"Could not find cheatsheet JavaScript asset in {page_url}")
    src = match.group(1)
    if src.startswith("http"):
        js_url = src
    elif src.startswith("/"):
        js_url = DEFAULT_ASSET_BASE + src
    else:
        js_url = page_url.rstrip("/") + "/" + src
    return js_url, fetch_text(js_url)


def read_cheatsheet_source(cheatsheet_url: str, cheatsheet_js: str | None) -> tuple[str, str] | tuple[None, None]:
    try:
        if cheatsheet_js:
            path = Path(cheatsheet_js)
            return path.as_posix(), path.read_text(encoding="utf-8", errors="replace")
        return resolve_cheatsheet_js(cheatsheet_url)
    except Exception as exc:
        print(f"Warning: cheatsheet unavailable, falling back to official docs: {exc}")
        return None, None


def read_docs_source(docs_url: str, docs_md: str | None) -> tuple[str, str]:
    if docs_md:
        path = Path(docs_md)
        return path.as_posix(), path.read_text(encoding="utf-8", errors="replace")
    return docs_url, fetch_text(docs_url)


def extract_balanced_object(text: str, start: int) -> str:
    depth = 0
    in_tick = False
    escaped = False
    for i, char in enumerate(text[start:], start):
        if in_tick:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == "`":
                in_tick = False
            continue
        if char == "`":
            in_tick = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    raise ValueError("Unbalanced command object in cheatsheet JavaScript")


def field(obj: str, name: str) -> str:
    match = re.search(FIELD_RE_TEMPLATE.format(field=re.escape(name)), obj)
    return decode_js_template(match.group(1)) if match else ""


def examples(obj: str) -> list[str]:
    match = EXAMPLES_RE.search(obj)
    if not match:
        return []
    return [decode_js_template(item) for item in BACKTICK_STRING_RE.findall(match.group(1))]


def parse_cheatsheet_commands(js_text: str, source_path: str) -> list[SourceCommand]:
    commands: dict[str, SourceCommand] = {}
    for match in COMMAND_OBJECT_RE.finditer(js_text):
        obj = extract_balanced_object(js_text, match.start())
        title = field(obj, "title")
        syntax = field(obj, "syntax") or title
        description = field(obj, "description")
        if not title.startswith("/") or not description:
            continue
        category = field(obj, "category") or "commands"
        key = command_key(title)
        commands[key] = SourceCommand(
            title=title,
            syntax=syntax,
            description=normalize_space(description),
            category=category,
            source_path=source_path,
            source_heading=category,
            examples=examples(obj)[:4],
            aliases=(key,),
            note=field(obj, "note"),
            analogy=field(obj, "analogy"),
        )
    return sorted(commands.values(), key=lambda item: (item.category, item.title))


def markdown_table_cells(line: str) -> list[str]:
    stripped = line.strip()
    if not stripped.startswith("|") or not stripped.endswith("|"):
        return []
    cells: list[str] = []
    current = ""
    in_code = False
    escaped = False
    for char in stripped[1:-1]:
        if escaped:
            current += char
            escaped = False
            continue
        if char == "\\":
            current += char
            escaped = True
            continue
        if char == "`":
            in_code = not in_code
            current += char
            continue
        if char == "|" and not in_code:
            cells.append(current.strip())
            current = ""
        else:
            current += char
    cells.append(current.strip())
    return cells


def extract_section(markdown: str, heading: str) -> str:
    start = markdown.find(heading)
    if start < 0:
        return ""
    next_heading = re.search(r"\n## ", markdown[start + len(heading) :])
    if not next_heading:
        return markdown[start:]
    return markdown[start : start + len(heading) + next_heading.start()]


def markdown_to_text(value: str) -> str:
    value = MARKDOWN_LINK_RE.sub(lambda match: f"{match.group(1)} ({match.group(2)})" if match.group(1) != "AUTOTITLE" else match.group(2), value)
    value = VARIABLE_TOKEN_RE.sub(lambda match: VARIABLE_REPLACEMENTS.get(match.group(1).strip(), ""), value)
    value = MARKDOWN_TOKEN_RE.sub("", value)
    value = value.replace("\\|", "|")
    value = re.sub(r"`([^`]+)`", r"\1", value)
    value = html.unescape(value)
    return normalize_space(value)


def first_code_span(value: str) -> str:
    match = re.search(r"`([^`]+)`", value)
    return match.group(1).replace("\\|", "|").strip() if match else ""


def all_code_spans(value: str) -> list[str]:
    return [item.replace("\\|", "|").strip() for item in re.findall(r"`([^`]+)`", value)]


def command_key(title_or_syntax: str) -> str:
    spans = all_code_spans(title_or_syntax)
    value = spans[0] if spans else title_or_syntax
    match = re.search(r"/[A-Za-z][A-Za-z0-9-]*", value)
    if match:
        return match.group(0).lower()
    return normalize_space(value).split()[0].lower()


def docs_link(value: str) -> str:
    match = MARKDOWN_LINK_RE.search(value)
    if not match:
        return ""
    href = match.group(2)
    if href.startswith("http") or href.startswith("#"):
        return href
    return "https://docs.github.com/en" + href if href.startswith("/") else href


def parse_docs_slash_commands(markdown: str, source_path: str) -> list[SourceCommand]:
    section = extract_section(markdown, "## Slash commands in the interactive interface")
    commands: dict[str, SourceCommand] = {}
    for line in section.splitlines():
        cells = markdown_table_cells(line)
        if len(cells) < 2 or not cells[0].startswith("`") or cells[0].startswith("`---"):
            continue
        code_spans = all_code_spans(cells[0])
        aliases = tuple(dict.fromkeys(
            match.group(0).lower()
            for span in code_spans
            for match in re.finditer(r"/[A-Za-z][A-Za-z0-9-]*", span)
        ))
        if not code_spans or not aliases:
            continue
        title = aliases[0]
        syntax = ", ".join(code_spans)
        purpose = markdown_to_text(cells[1])
        command = SourceCommand(
            title=title,
            syntax=syntax,
            description=purpose,
            category="official-docs",
            source_path=source_path,
            source_heading="Slash commands in the interactive interface",
            examples=[],
            aliases=aliases,
            docs_url=docs_link(cells[1]),
        )
        for alias in aliases:
            commands[alias] = command
    unique_commands = {command.title: command for command in commands.values()}
    return sorted(unique_commands.values(), key=lambda item: item.title)


def command_phrase(title: str) -> str:
    phrase = title.lstrip("/").replace("-", " ")
    return phrase or "command"


def cleaned_official_purpose(description: str) -> str:
    purpose = normalize_space(re.sub(r"\s*See\s+\S+\.?$", "", description))
    purpose = normalize_space(re.sub(r"\s*\([^)]*\)$", "", purpose)) if "See " in description else purpose
    return purpose.rstrip(".") + "." if purpose else ""


def synopsis_from_official(title: str, purpose: str) -> str:
    phrase = command_phrase(title)
    cleaned = normalize_space(purpose).rstrip(".")
    cleaned = cleaned.replace(" from the official docs", "")
    cleaned = cleaned.replace("Show the help", "Show help")
    cleaned = cleaned.replace("the CLI", "Copilot CLI")
    lower = cleaned.lower()
    if not cleaned:
        return f"Use {title} in Copilot CLI."
    lower = cleaned.lower()
    if "working directory" in lower and ("display" in lower or "current directory" in lower):
        return f"Use {title} to change the working directory or show where you are."
    if "delegate" in lower and "pull request" in lower:
        return f"Use {title} to delegate work to Copilot coding agent and create an AI-generated pull request."
    if lower.startswith(("show ", "display ", "view ", "copy ", "add ", "manage ", "enable ", "toggle ", "select ", "connect ", "initialize ", "start ", "run ", "create ", "review ", "reset ", "rename ", "switch ", "share ", "prevent ", "provide ", "ask ", "summarize ", "configure ", "change ", "download ", "browse ", "preview ", "update ", "exit ", "log ")):
        action = cleaned[0].lower() + cleaned[1:]
        if title == "/delegate":
            action = action.replace("Delegate changes", "delegate work")
        return f"Use {title} to {action}."
    return f"Use {title} for {cleaned[0].lower() + cleaned[1:]} .".replace(" .", ".")


def generated_synopsis(command: SourceCommand, official: SourceCommand | None = None) -> str:
    if official and official.description:
        return synopsis_from_official(command.title, cleaned_official_purpose(official.description))
    if command.category and command.category != "official-docs":
        category = command.category.replace("-", " ")
        phrase = command_phrase(command.title)
        return f"Use {command.title} when you need the {phrase} command from the {category} area of Copilot CLI."
    return f"Use {command.title} in Copilot CLI."


def generated_docs_synopsis(command: SourceCommand) -> str:
    return synopsis_from_official(command.title, cleaned_official_purpose(command.description))


def keywords_for(*parts: str) -> list[str]:
    text = " ".join(parts).lower()
    return sorted(set(re.findall(r"[a-z][a-z0-9+/#.-]{2,}", text)))[:18]


def build_cheatsheet_topic(command: SourceCommand, official: SourceCommand | None) -> Topic:
    stable_id = topic_id("command", command.title)
    source_kind = "cheatsheet+official-docs" if official else "cheatsheet"
    sources = ["cheatsheet"] + (["official-docs"] if official else [])
    official_purpose = cleaned_official_purpose(official.description) if official else ""
    official_aliases = list(official.aliases) if official else []
    syntax = official.syntax if official else command.syntax
    detail_parts = []
    if syntax and syntax != command.title:
        detail_parts.append(f"Syntax: {syntax}")
    if official_purpose:
        detail_parts.append(official_purpose)
    if official and official.syntax and official.syntax != syntax:
        detail_parts.append(f"Syntax: {official.syntax}")
    details = normalize_space(" ".join(detail_parts))
    return Topic(
        id=stable_id,
        slug=f"command-{slugify(command.title)}-{stable_id[-6:]}",
        type="command",
        title=command.title,
        displayText=command.title,
        synopsis=generated_synopsis(command, official),
        details=details,
        source_path=command.source_path,
        source_heading=command.source_heading,
        chapter=command.category,
        examples=command.examples,
        keywords=keywords_for(command.title, syntax, command.category, official_purpose),
        syntax=syntax,
        category=command.category,
        note="",
        source_kind=source_kind,
        sources=sources,
        official_purpose=official_purpose,
        official_aliases=official_aliases,
        docs_url=official.docs_url if official else "",
    )


def build_docs_topic(command: SourceCommand) -> Topic:
    stable_id = topic_id("command", command.title)
    synopsis = generated_docs_synopsis(command)
    detail_parts = [synopsis]
    if command.syntax and command.syntax != command.title:
        detail_parts.append(f"Syntax: {command.syntax}")
    if command.description:
        detail_parts.append(cleaned_official_purpose(command.description))
    return Topic(
        id=stable_id,
        slug=f"command-{slugify(command.title)}-{stable_id[-6:]}",
        type="command",
        title=command.title,
        displayText=command.title,
        synopsis=synopsis,
        details=normalize_space(" ".join(detail_parts)),
        source_path=command.source_path,
        source_heading=command.source_heading,
        chapter=command.category,
        examples=[],
        keywords=keywords_for(command.title, command.syntax, command.description, command.category),
        syntax=command.syntax,
        category=command.category,
        note="",
        source_kind="official-docs",
        sources=["official-docs"],
        official_purpose=cleaned_official_purpose(command.description),
        official_aliases=list(command.aliases),
        docs_url=command.docs_url,
    )


def merge_commands(cheatsheet_commands: list[SourceCommand], docs_commands: list[SourceCommand]) -> list[Topic]:
    docs_by_key = {
        alias: item
        for item in docs_commands
        for alias in (item.aliases or (command_key(item.title),))
    }
    docs_by_primary_key = {command_key(item.title): item for item in docs_commands}
    topics: dict[str, Topic] = {}
    used_docs: set[str] = set()

    for command in cheatsheet_commands:
        key = command_key(command.title)
        official = docs_by_key.get(key)
        if official:
            used_docs.add(command_key(official.title))
        topic = build_cheatsheet_topic(command, official)
        topics[topic.id] = topic

    for key, command in docs_by_primary_key.items():
        if key in used_docs:
            continue
        topic = build_docs_topic(command)
        topics[topic.id] = topic

    return sorted(topics.values(), key=lambda t: (t.category, t.title))


def write_json(
    json_path: Path,
    topics: list[Topic],
    *,
    primary_source: str | None,
    docs_source: str,
) -> None:
    json_path.parent.mkdir(parents=True, exist_ok=True)
    source_url = primary_source or docs_source
    payload = {
        "generatedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "sourceUrl": source_url,
        "sourceUrls": {
            "primary": primary_source,
            "officialDocs": docs_source,
        },
        "topicCount": len(topics),
        "types": sorted({t.type for t in topics}),
        "topics": [asdict(t) for t in topics],
    }
    json_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest GitHub Copilot CLI commands into static JSON")
    parser.add_argument("--cheatsheet-url", default=DEFAULT_CHEATSHEET_URL, help="Published cheatsheet URL")
    parser.add_argument("--cheatsheet-js", default=None, help="Optional local cheatsheet JavaScript asset for tests/offline ingest")
    parser.add_argument("--docs-url", default=DEFAULT_DOCS_URL, help="Official GitHub Docs markdown URL")
    parser.add_argument("--docs-md", default=None, help="Optional local official docs markdown for tests/offline ingest")
    parser.add_argument("--json", default="public/data/topics.json", help="Frontend JSON output path")
    args = parser.parse_args()

    docs_source, docs_markdown = read_docs_source(args.docs_url, args.docs_md)
    docs_commands = parse_docs_slash_commands(docs_markdown, docs_source)

    cheatsheet_source, js_text = read_cheatsheet_source(args.cheatsheet_url, args.cheatsheet_js)
    cheatsheet_commands = parse_cheatsheet_commands(js_text, cheatsheet_source) if js_text and cheatsheet_source else []

    topics = merge_commands(cheatsheet_commands, docs_commands)
    if not topics:
        raise SystemExit("No commands found in cheatsheet or official docs sources")
    write_json(Path(args.json).resolve(), topics, primary_source=cheatsheet_source, docs_source=docs_source)
    if cheatsheet_commands:
        print(f"Ingested {len(topics)} commands from cheatsheet + official docs")
        print(f"Primary: {cheatsheet_source}")
    else:
        print(f"Ingested {len(topics)} commands from official docs fallback")
    print(f"Official docs: {docs_source}")
    print(f"JSON: {Path(args.json).resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
