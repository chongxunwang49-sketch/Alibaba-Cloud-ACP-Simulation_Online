import json

data = json.load(open("questions.json", encoding="utf-8"))
text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
print(len(text))
print("script close:", "</script" in text.lower())
print("backtick:", "`" in text)
print("template marker:", "${" in text)
