#!/usr/bin/env python3
"""Validate flat paper JSON files and build the complete GitHub Pages artifact."""
from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path

SLUG_RE = re.compile(r"^[A-Za-z0-9_-]+$")
SECTION_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")


def split_units(markdown: object) -> list[str]:
    text = str(markdown or "").replace("\r\n", "\n").strip()
    return [unit for unit in re.split(r"\n\s*\n", text) if unit.strip()] if text else []


def validate_paper(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schemaVersion") != 2:
        raise ValueError(f"{path}: schemaVersion must be 2")
    metadata = data.get("metadata")
    if not isinstance(metadata, dict) or not metadata.get("title") or not metadata.get("targetLanguage"):
        raise ValueError(f"{path}: metadata.title and metadata.targetLanguage are required")
    sections = data.get("sections")
    if not isinstance(sections, list) or not sections:
        raise ValueError(f"{path}: sections must be a non-empty array")
    seen = set()
    for section in sections:
        sid = section.get("id")
        if not sid or not SECTION_ID_RE.fullmatch(sid) or sid in seen:
            raise ValueError(f"{path}: invalid or duplicate section id: {sid}")
        seen.add(sid)
        original = section.get("originalMarkdown")
        translation = section.get("translationMarkdown")
        if not isinstance(original, str) or not isinstance(translation, str):
            raise ValueError(f"{path}: section {sid} needs originalMarkdown and translationMarkdown")
        original_units = split_units(original)
        translated_units = split_units(translation)
        if len(original_units) != len(translated_units):
            raise ValueError(
                f"{path}: section {sid} unit count mismatch: "
                f"{len(original_units)}/{len(translated_units)}"
            )
    return metadata


def catalog_entry(slug: str, metadata: dict) -> dict:
    return {
        "slug": slug,
        "title": metadata["title"],
        "titleTranslation": metadata.get("titleTranslation", ""),
        "authors": metadata.get("authors", []),
        "year": metadata.get("year", ""),
        "venue": metadata.get("venue", ""),
        "path": f"papers/{slug}.json",
    }


def build(source: Path, output: Path) -> None:
    papers_dir = source / "papers"
    paper_paths = sorted(papers_dir.glob("*.json"))
    if not paper_paths:
        raise ValueError(f"no flat paper JSON files found in {papers_dir}")
    nested = sorted(papers_dir.glob("*/*.json"))
    if nested:
        raise ValueError("nested paper JSON files are not allowed: " + ", ".join(map(str, nested)))

    entries = []
    for path in paper_paths:
        slug = path.stem
        if not SLUG_RE.fullmatch(slug):
            raise ValueError(f"invalid paper filename/slug: {path.name}")
        entries.append(catalog_entry(slug, validate_paper(path)))
    entries.sort(key=lambda item: (str(item.get("year", "")), item.get("title", "")), reverse=True)

    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)
    shutil.copytree(source / "reader", output / "reader")
    (output / "papers").mkdir()
    for path in paper_paths:
        shutil.copy2(path, output / "papers" / path.name)
    for name in ("index.html", ".nojekyll"):
        shutil.copy2(source / name, output / name)
    (output / "library.json").write_text(
        json.dumps({"version": 1, "papers": entries}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"papers": len(entries), "output": str(output.resolve())}, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path("."))
    parser.add_argument("--output", type=Path, default=Path("_site"))
    args = parser.parse_args()
    build(args.source.resolve(), args.output.resolve())


if __name__ == "__main__":
    main()
