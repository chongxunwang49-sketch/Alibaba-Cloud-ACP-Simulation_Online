from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "_build" / "index.template.html"
BANK = ROOT / "questions.json"
OUTPUT = ROOT / "index.html"


def main() -> None:
    data = json.loads(BANK.read_text(encoding="utf-8"))
    bank_text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    bank_text = bank_text.replace("</", "<\\/")

    template = TEMPLATE.read_text(encoding="utf-8")
    if template.count("__BANK_JSON__") != 1:
        raise SystemExit("template must contain exactly one __BANK_JSON__ marker")

    output = template.replace("__BANK_JSON__", bank_text, 1)
    OUTPUT.write_text(output, encoding="utf-8")

    print(f"questions: {len(data['questions'])}")
    print(f"bank json chars: {len(bank_text)}")
    print(f"index.html chars: {len(output)}")
    print(f"index.html bytes: {OUTPUT.stat().st_size}")
    print(f"closed script leak: {'</script' in bank_text}")


if __name__ == "__main__":
    main()
