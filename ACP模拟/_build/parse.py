# -*- coding: utf-8 -*-
"""Parse the markdown question banks into a normalized JSON file."""
import html
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "_source"
OUT = ROOT / "_build"
REPO_BLOB = "https://github.com/yi-cheng0824/aliyun-acp/blob/main/real"

HEADING_RE = re.compile(r"^##\s*题目\s*(\d+)\s*（\s*(单选题|多选题)\s*）\s*$", re.M)
ANSWER_RE = re.compile(r"\*\*答案\s*[:：]?\s*([^*\n]+?)\s*\*\*")
BULLET_RE = re.compile(r"^\s*[-*+](?:\s+|$)(.*)$")
LETTER_PREFIX_RE = re.compile(r"^([A-F])(?:\s*[.、:：)）]\s*|\s+)")
MULTI_SPACE_RE = re.compile(r"[ \t]+")


def clean_inline(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = MULTI_SPACE_RE.sub(" ", text)
    return text.strip()


def decode_entities(value: str) -> str:
    """The source has a few HTML-escaped option strings (e.g. &lt;&lt;)."""
    previous = None
    for _ in range(3):
        if value == previous:
            break
        previous = value
        value = html.unescape(value)
    return value


def parse_block(raw: str, source: dict):
    stem_match = re.search(
        r"\*\*题目\*\*\s*[:：]\s*(.*?)(?=\n\s*\*\*选项\*\*|\n\s*<details>)",
        raw,
        re.S,
    )
    if not stem_match:
        return None, "missing stem"
    stem = decode_entities(clean_inline(stem_match.group(1)))
    if not stem:
        return None, "empty stem"

    opt_match = re.search(
        r"\*\*选项\*\*\s*[:：]\s*\n(.*?)(?=\n\s*<details>)", raw, re.S
    )
    if not opt_match:
        return None, "missing options"

    # Do not call rstrip before checking for a bullet: an empty "- " option must
    # be caught so that the ambiguous question is rejected instead of shifting
    # every option letter.
    options = []
    current = None
    for line in opt_match.group(1).split("\n"):
        bullet = BULLET_RE.match(line)
        if bullet:
            if current is not None:
                options.append(clean_inline(current))
            current = bullet.group(1)
        elif line.strip() and current is not None:
            current += " " + line.strip()
        elif line.strip() and current is None:
            return None, f"unexpected text before options: {line[:60]!r}"
    if current is not None:
        options.append(clean_inline(current))
    if any(not option for option in options):
        return None, "empty option"
    options = [decode_entities(option) for option in options]
    if not (2 <= len(options) <= 6):
        return None, f"invalid option count ({len(options)})"

    # Some files prefix every option with "A." / "B " etc. Strip the letter
    # only when the whole option list follows the expected A, B, C... pattern.
    prefix_matches = [LETTER_PREFIX_RE.match(option) for option in options]
    if all(
        match and match.group(1) == chr(ord("A") + i)
        for i, match in enumerate(prefix_matches)
    ):
        options = [
            option[match.end():].strip()
            for option, match in zip(options, prefix_matches)
        ]

    # Duplicate options make a single-choice question ambiguous, and are a sign
    # of a corrupted source block.
    normalized_options = [re.sub(r"\s+", "", option).lower() for option in options]
    if len(set(normalized_options)) != len(options):
        return None, "duplicate options"

    ans_match = ANSWER_RE.search(raw)
    if not ans_match:
        return None, "missing answer"
    raw_answer = ans_match.group(1).strip()
    letters = re.findall(
        r"[A-F]", raw_answer.upper().replace("，", ",").replace("、", ",")
    )
    indexes = sorted({ord(c) - ord("A") for c in letters if ord(c) - ord("A") < len(options)})

    # A couple of old entries used the literal option text as the answer
    # (e.g. "3" for an option whose text is "3"). Recover those safely.
    if not indexes and re.fullmatch(r"[1-6]", raw_answer):
        for i, option in enumerate(options):
            if option.strip().rstrip("。.") == raw_answer:
                indexes = [i]
                break
    if not indexes:
        return None, f"invalid answer ({raw_answer!r})"
    answer = [chr(ord("A") + i) for i in indexes]

    explanation = ""
    after_answer = raw[ans_match.end():]
    close = after_answer.find("</details>")
    if close != -1:
        after_answer = after_answer[:close]
    after_answer = after_answer.strip()
    after_answer = re.sub(r"^\s*[-*_]{3,}\s*$", "", after_answer, flags=re.M).strip()
    expl_match = re.search(
        r"(?:^|\n)\s*(?:\*\*)?解析(?:\*\*)?\s*[:：]\s*(.*)", after_answer, re.S
    )
    if expl_match:
        explanation = decode_entities(clean_inline(expl_match.group(1)))

    if source["type"] == "单选题" and len(answer) != 1:
        return None, f"single-choice question has {len(answer)} answers"
    if source["type"] == "多选题" and len(answer) < 2:
        return None, f"multiple-choice question has {len(answer)} answer"

    return {
        "source": source,
        "source_no": source["no"],
        "type": source["type"],
        "stem": stem,
        "options": options,
        "answer": answer,
        "explanation": explanation,
    }, None


def dedupe(records):
    groups = {}
    for q in records:
        key = re.sub(r"\s+", "", q["stem"]).lower()
        groups.setdefault(key, []).append(q)

    selected = []
    answer_conflicts = []
    for group in groups.values():
        if len({tuple(g["answer"]) for g in group}) > 1:
            answer_conflicts.append(group)
        # Prefer a version that has an explanation, then the richest options,
        # then the version whose original options were lettered by the source.
        chosen = max(
            group,
            key=lambda g: (
                bool(g["explanation"]),
                len(g["explanation"]),
                len(g["options"]),
            ),
        )
        selected.append(chosen)
    return selected, answer_conflicts


def main():
    records = []
    problems = []
    overall = Counter()
    for bank in (2, 3):
        folder = SRC / f"mock_exam_{bank}"
        for path in sorted(folder.glob("*.md")):
            text = path.read_text(encoding="utf-8")
            matches = list(HEADING_RE.finditer(text))
            for i, match in enumerate(matches):
                end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
                block = text[match.end():end]
                qno = int(match.group(1))
                qtype = match.group(2)
                source = {
                    "bank": f"mock_exam_{bank}",
                    "file": path.name,
                    "no": qno,
                    "type": qtype,
                }
                record, error = parse_block(block, source)
                if error:
                    problems.append(
                        {
                            "file": f"mock_exam_{bank}/{path.name}",
                            "question": qno,
                            "type": qtype,
                            "error": error,
                            "raw": block.strip()[:300],
                        }
                    )
                    continue
                overall[(bank, qtype)] += 1
                records.append(record)

    deduped, answer_conflicts = dedupe(records)
    deduped.sort(
        key=lambda q: (q["source"]["bank"], q["source"]["file"], q["source"]["no"])
    )

    numbered = []
    for idx, q in enumerate(deduped, 1):
        relative = f'{q["source"]["bank"]}/{q["source"]["file"]}'
        numbered.append(
            {
                "id": f"q{idx:03d}",
                "type": "single" if q["type"] == "单选题" else "multiple",
                "question": q["stem"],
                "options": q["options"],
                "answer": q["answer"],
                "explanation": q["explanation"],
                "source": f'{relative} 题目{q["source_no"]}',
                "sourceUrl": f'{REPO_BLOB}/{relative}',
            }
        )

    single = [q for q in numbered if q["type"] == "single"]
    multiple = [q for q in numbered if q["type"] == "multiple"]
    explained = sum(1 for q in numbered if q["explanation"])

    print(f"parsed={len(records)} rejected={len(problems)} unique={len(numbered)}")
    print(f"single={len(single)} multiple={len(multiple)} explained={explained}")
    print("raw counts by bank/type:", dict(overall))
    print(f"duplicate groups merged={len(records) - len(numbered)}")
    print("single with !=1 answers:", sum(1 for q in single if len(q["answer"]) != 1))
    print("multiple with <2 answers:", sum(1 for q in multiple if len(q["answer"]) < 2))
    print(f"no explanation: {len(numbered) - explained}")
    for p in problems:
        print("REJECTED", p["file"], p["question"], p["error"], repr(p["raw"][:120]))
    print(f"answer conflicts among duplicate groups: {len(answer_conflicts)}")

    OUT.mkdir(exist_ok=True)
    payload = {
        "meta": {
            "title": "阿里云大模型 ACP 模拟题库",
            "description": "从 yi-cheng0824/aliyun-acp 仓库 real/ 目录的 mock_exam_2 与 mock_exam_3 整理，已去重并做格式校验。",
            "source": "https://github.com/yi-cheng0824/aliyun-acp/tree/main/real",
            "sourceName": "yi-cheng0824/aliyun-acp",
            "total": len(numbered),
            "single": len(single),
            "multiple": len(multiple),
            "explained": explained,
            "generatedAt": "2026-11-10",
        },
        "questions": numbered,
    }
    (ROOT / "questions.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (OUT / "parse_report.json").write_text(
        json.dumps(
            {
                "problems": problems,
                "answer_conflicts": [
                    [
                        {
                            "source": g["source"],
                            "answer": g["answer"],
                            "options": g["options"],
                        }
                        for g in group
                    ]
                    for group in answer_conflicts
                ],
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
