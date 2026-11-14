const fs = require("fs");
const http = require("http");
const path = require("path");

const BASE = "http://127.0.0.1:9333";
const APP_URL = "file:///C:/Users/DELL/Desktop/ACP%E6%A8%A1%E6%8B%9F/index.html";
const ROOT = "C:/Users/DELL/Desktop/ACP模拟";
const SHOTS = path.join(ROOT, "_build", "shots");
const BANK = JSON.parse(fs.readFileSync(path.join(ROOT, "questions.json"), "utf8"));
const BY_SOURCE = new Map(BANK.questions.map((q) => [q.source, q]));

fs.mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let activeClient = null;

function httpJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: options.method || "GET" }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (error) { reject(new Error("Invalid JSON from " + url + ": " + data.slice(0, 200))); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 0;
    this.pending = new Map();
    this.waiters = new Map();
    this.errors = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => this.onMessage(event));
  }

  onMessage(event) {
    const message = JSON.parse(event.data);
    if (message.id) {
      const item = this.pending.get(message.id);
      if (!item) return;
      this.pending.delete(message.id);
      if (message.error) item.reject(new Error(message.error.message + " (" + (message.error.code || "") + ")"));
      else item.resolve(message.result);
      return;
    }
    const method = message.method;
    if (method === "Runtime.exceptionThrown") {
      const details = message.params.exceptionDetails || {};
      const exception = details.exception || {};
      this.errors.push("JS exception: " + (exception.description || details.text || "unknown"));
    }
    if (method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      this.errors.push("console.error: " + message.params.args.map((arg) => arg.value || arg.description || "").join(" "));
    }
    if (method === "Log.entryAdded" && message.params.entry.level === "error") {
      this.errors.push("log.error: " + message.params.entry.text);
    }
    const waiters = this.waiters.get(method);
    if (waiters && waiters.length) {
      const waiter = waiters.shift();
      clearTimeout(waiter.timer);
      waiter.resolve(message.params);
    }
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  waitEvent(method, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const list = this.waiters.get(method) || [];
      const timer = setTimeout(() => {
        const index = list.indexOf(waiter);
        if (index !== -1) list.splice(index, 1);
        reject(new Error("Timed out waiting for " + method));
      }, timeout);
      const waiter = { resolve, reject, timer };
      list.push(waiter);
      this.waiters.set(method, list);
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    });
    if (result.exceptionDetails) {
      const details = result.exceptionDetails;
      throw new Error("Evaluation failed: " + ((details.exception && details.exception.description) || details.text));
    }
    return result.result.value;
  }

  async screenshot(name) {
    const result = await this.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false
    });
    const file = path.join(SHOTS, name);
    fs.writeFileSync(file, Buffer.from(result.data, "base64"));
    console.log("SHOT", file);
    return file;
  }
}

function check(condition, message, detail) {
  if (!condition) {
    throw new Error("ASSERT FAILED: " + message + (detail === undefined ? "" : "\n" + JSON.stringify(detail, null, 2)));
  }
  console.log("OK", message);
}

function finish(code) {
  try {
    if (activeClient) activeClient.ws.close();
  } catch (error) {
    // The page may already be gone; exiting still needs to happen.
  }
  setTimeout(() => process.exit(code), 120);
}

async function main() {
  const targets = await httpJson(BASE + "/json/list");
  const target = targets.find((item) => item.type === "page");
  if (!target) throw new Error("No page target found");

  const client = new CDP(target.webSocketDebuggerUrl);
  activeClient = client;
  await client.ready;
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Log.enable");
  await client.send("Network.enable");

  async function setViewport(width, height, mobile = false) {
    await client.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: mobile ? 2 : 1,
      mobile,
      screenWidth: width,
      screenHeight: height
    });
    await sleep(250);
  }

  async function navigate(url) {
    const loaded = client.waitEvent("Page.loadEventFired");
    await client.send("Page.navigate", { url });
    await loaded;
    await sleep(500);
  }

  async function state() {
    return client.evaluate(`(() => {
      const active = document.querySelector('.screen.is-active');
      const feedback = document.getElementById('feedback');
      const inputs = Array.from(document.querySelectorAll('.option-input'));
      const chips = Array.from(document.querySelectorAll('.feedback-answers .answer-chip'));
      return {
        screen: active ? active.id : null,
        bodyScreen: document.body.dataset.screen,
        currentNo: Number(document.getElementById('currentNo').textContent),
        totalNo: Number(document.getElementById('totalNo').textContent),
        score: Number(document.getElementById('liveScore').textContent),
        answered: document.getElementById('liveAnswered').textContent.trim(),
        type: document.getElementById('questionType').textContent.trim(),
        points: document.getElementById('questionPoints').textContent.trim(),
        questionText: document.getElementById('questionText').textContent.trim(),
        source: document.getElementById('questionSource').textContent.replace(/^来源 · /, '').trim(),
        optionValues: inputs.map((input) => input.value),
        optionTexts: inputs.map((input) => input.closest('.option').querySelector('.option-text').textContent.trim()),
        checked: inputs.filter((input) => input.checked).map((input) => input.value),
        disabledCount: inputs.filter((input) => input.disabled).length,
        submitted: Boolean(feedback && !feedback.hidden),
        feedbackClass: feedback ? feedback.className : '',
        feedbackTitle: feedback && !feedback.hidden ? feedback.querySelector('.feedback-title').textContent.trim() : '',
        yourAnswer: chips.length ? chips[0].textContent.trim() : '',
        correctAnswer: feedback && !feedback.hidden && feedback.querySelector('.answer-chip.is-right')
          ? feedback.querySelector('.answer-chip.is-right').textContent.trim() : '',
        correctLetters: Array.from(document.querySelectorAll('.option.is-correct .option-input')).map((input) => input.value),
        explanation: feedback ? (feedback.querySelector('.explanation p') || {}).textContent || '' : '',
        noExplanation: Boolean(feedback && feedback.querySelector('.no-explanation')),
        nextLabel: document.getElementById('nextBtn').textContent.replace(/\\s+/g, ' ').trim(),
        prevDisabled: document.getElementById('prevBtn').disabled,
        progressPct: document.getElementById('progressPct').textContent.trim(),
        paletteCount: document.getElementById('paletteCount').textContent.trim(),
        timer: document.getElementById('liveTimer').textContent.trim(),
        overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        footer: (() => {
          const node = document.querySelector('.quiz-footer');
          if (!node) return null;
          const rect = node.getBoundingClientRect();
          return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), height: Math.round(rect.height), viewport: window.innerHeight };
        })()
      };
    })()`);
  }

  async function goTo(index) {
    await client.evaluate(`(() => {
      document.getElementById('paletteBtn').click();
      const cell = document.querySelector('.palette-cell[data-index="${index}"]');
      if (!cell) throw new Error('missing palette cell ${index}');
      cell.click();
      return true;
    })()`);
    await sleep(180);
  }

  async function click(selector) {
    await client.evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) throw new Error('missing ${selector}'); node.click(); return true; })()`);
    await sleep(180);
  }

  async function clickOption(letter) {
    await client.evaluate(`(() => { const node = document.querySelector('.option-input[value="${letter}"]'); if (!node) throw new Error('missing option ${letter}'); node.click(); return true; })()`);
    await sleep(180);
  }

  async function paletteState() {
    return client.evaluate(`(() => {
      const cells = Array.from(document.querySelectorAll('#paletteGrid .palette-cell'));
      return {
        count: cells.length,
        done: cells.filter((cell) => cell.classList.contains('done')).length,
        draft: cells.filter((cell) => cell.classList.contains('draft')).length,
        current: cells.filter((cell) => cell.classList.contains('current')).length,
        answered: document.getElementById('paletteAnswered').textContent.trim(),
        unanswered: document.getElementById('paletteUnanswered').textContent.trim()
      };
    })()`);
  }

  // ---------- home (desktop) ----------
  await setViewport(1440, 1100, false);
  await navigate(APP_URL);
  await sleep(700);

  let s = await state();
  check(s.screen === "screen-home", "home screen is active", s.screen);
  check(s.overflow === 0, "desktop home has no horizontal overflow", s.overflow);
  const home = await client.evaluate(`(() => ({
    navCount: document.getElementById('navBankCount').textContent.trim(),
    heroCount: document.getElementById('heroBankCount').textContent.trim(),
    poolSingle: document.getElementById('poolSingleCount').textContent.trim(),
    poolMultiple: document.getElementById('poolMultipleCount').textContent.trim(),
    explained: document.getElementById('footerExplainedCount').textContent.trim(),
    startDisabled: document.getElementById('startBtn').disabled,
    activeScreens: document.querySelectorAll('.screen.is-active').length,
    duplicateIds: (() => { const ids = Array.from(document.querySelectorAll('[id]')).map((n) => n.id); return ids.filter((id, i) => ids.indexOf(id) !== i); })()
  }))()`);
  check(home.navCount === "951" && home.heroCount === "951", "home shows 951 bank count", home);
  check(home.poolSingle === "644" && home.poolMultiple === "307", "home shows 644 single / 307 multiple", home);
  check(home.explained === "299", "home shows 299 explained", home.explained);
  check(home.startDisabled === false, "start button enabled", home.startDisabled);
  check(home.activeScreens === 1, "exactly one active screen", home.activeScreens);
  check(home.duplicateIds.length === 0, "no duplicate element ids", home.duplicateIds);
  await client.screenshot("01-home-desktop.png");

  // ---------- home (mobile) ----------
  await setViewport(390, 844, true);
  await navigate(APP_URL);
  await sleep(500);
  s = await state();
  const mobileHome = await client.evaluate(`(() => ({
    overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    startVisible: (() => { const r = document.getElementById('startBtn').getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; })(),
    htmlWidth: document.documentElement.scrollWidth,
    viewport: window.innerWidth
  }))()`);
  check(s.screen === "screen-home", "mobile home is active", s.screen);
  check(mobileHome.overflow === 0, "mobile home has no horizontal overflow", mobileHome);
  await client.screenshot("02-home-mobile.png");

  await setViewport(320, 700, true);
  await sleep(300);
  const narrowHome = await client.evaluate(`(() => ({
    overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    startWidth: Math.round(document.getElementById('startBtn').getBoundingClientRect().width),
    viewport: window.innerWidth
  }))()`);
  check(narrowHome.overflow === 0, "320px home has no horizontal overflow", narrowHome);
  check(narrowHome.startWidth > 100, "320px start button remains usable", narrowHome);
  await client.screenshot("02b-home-mobile-320.png");
  await setViewport(390, 844, true);

  // ---------- start exam ----------
  await setViewport(1440, 1100, false);
  await navigate(APP_URL);
  await sleep(400);
  await click("#startBtn");
  await sleep(500);
  s = await state();
  check(s.screen === "screen-quiz", "exam screen is active", s.screen);
  check(s.currentNo === 1 && s.totalNo === 75, "exam starts at 1 / 75", s);
  check(s.score === 0 && s.answered === "0/75", "exam starts at 0 score / 0 answered", s);

  const beforeNav = s.questionText;
  await click("#nextBtn");
  s = await state();
  check(s.currentNo === 2, "next button moves to question 2", s.currentNo);
  check(s.questionText !== beforeNav, "question 2 has different text", s.questionText);
  await click("#prevBtn");
  s = await state();
  check(s.currentNo === 1, "prev button returns to question 1", s.currentNo);

  // ---------- collect all 75 question types without answering ----------
  const examInfo = await client.evaluate(`(() => {
    const types = [];
    const sources = [];
    const texts = [];
    for (let i = 0; i < 75; i += 1) {
      types.push(document.getElementById('questionType').textContent.trim());
      sources.push(document.getElementById('questionSource').textContent.replace(/^来源 · /, '').trim());
      texts.push(document.getElementById('questionText').textContent.trim());
      if (i < 74) document.getElementById('nextBtn').click();
    }
    const atEnd = Number(document.getElementById('currentNo').textContent);
    document.getElementById('paletteBtn').click();
    const cellCount = document.querySelectorAll('#paletteGrid .palette-cell').length;
    document.querySelector('.palette-cell[data-index="0"]').click();
    return { types, sources, texts, atEnd, cellCount, backAt: Number(document.getElementById('currentNo').textContent) };
  })()`);
  const singleCount = examInfo.types.filter((type) => type === "单选题").length;
  const multipleCount = examInfo.types.filter((type) => type === "多选题").length;
  check(singleCount === 50, "random exam has 50 single-choice questions", singleCount);
  check(multipleCount === 25, "random exam has 25 multiple-choice questions", multipleCount);
  check(examInfo.atEnd === 75 && examInfo.backAt === 1, "palette can jump to last and back to first", { atEnd: examInfo.atEnd, backAt: examInfo.backAt });
  check(examInfo.cellCount === 75, "palette has 75 cells", examInfo.cellCount);
  check(new Set(examInfo.sources).size === 75, "75 questions are unique by source", new Set(examInfo.sources).size);
  check(new Set(examInfo.texts).size === 75, "75 question texts are unique in this exam", new Set(examInfo.texts).size);

  const firstSingleIndex = examInfo.types.indexOf("单选题");
  const firstMultipleIndex = examInfo.types.indexOf("多选题");
  const secondMultipleIndex = examInfo.types.indexOf("多选题", firstMultipleIndex + 1);
  const secondSingleIndex = examInfo.types.indexOf("单选题", firstSingleIndex + 1);
  check(firstSingleIndex >= 0 && firstMultipleIndex >= 0 && secondMultipleIndex >= 0, "exam contains enough question types for tests");

  // ---------- single correct ----------
  await goTo(firstSingleIndex);
  s = await state();
  const singleQ = BY_SOURCE.get(s.source);
  check(singleQ && singleQ.type === "single", "single question source resolves to bank", s.source);
  check(s.optionValues.length === singleQ.options.length, "single options rendered", { dom: s.optionValues.length, bank: singleQ.options.length });
  await clickOption(singleQ.answer[0]);
  await sleep(300);
  s = await state();
  check(s.submitted === true && s.feedbackClass.includes("is-correct"), "single choice submits immediately and is correct", s);
  check(s.feedbackTitle === "回答正确", "single correct feedback title", s.feedbackTitle);
  check(s.score === 1 && s.answered === "1/75", "single correct adds 1 point", { score: s.score, answered: s.answered });
  check(s.disabledCount === s.optionValues.length, "single options lock after submission", s);
  check(s.correctLetters.join("") === singleQ.answer.join(""), "feedback highlights correct option", { dom: s.correctLetters, bank: singleQ.answer });
  check(Boolean(s.explanation) || s.noExplanation, "single feedback shows explanation or explicit fallback", { explanation: s.explanation, noExplanation: s.noExplanation });
  const lockedPicked = s.checked.join("");
  const wrongSingleLetter = s.optionValues.find((letter) => !singleQ.answer.includes(letter));
  await clickOption(wrongSingleLetter);
  s = await state();
  check(s.checked.join("") === lockedPicked, "single choice stays locked after second click", { before: lockedPicked, after: s.checked.join("") });
  check(s.score === 1, "locked single choice cannot change score", s.score);

  // ---------- navigation keeps submitted state ----------
  const nextIndex = firstSingleIndex === 74 ? 73 : firstSingleIndex + 1;
  await goTo(nextIndex);
  s = await state();
  check(s.currentNo === nextIndex + 1 && s.submitted === false, "unanswered question shows no feedback", s);
  await goTo(firstSingleIndex);
  s = await state();
  check(s.submitted === true && s.score === 1 && s.checked.join("") === lockedPicked, "returning to question preserves answer and feedback", s);

  // ---------- multiple incomplete = wrong ----------
  await goTo(firstMultipleIndex);
  s = await state();
  const multiQ = BY_SOURCE.get(s.source);
  check(multiQ && multiQ.type === "multiple", "multiple question source resolves to bank", s.source);
  check(multiQ.answer.length > 1, "bank multiple answer has more than one letter", multiQ.answer);
  await clickOption(multiQ.answer[0]);
  s = await state();
  check(s.checked.join("") === multiQ.answer[0], "multiple checkbox selects an option", s.checked);
  check(await client.evaluate("document.getElementById('submitAnswerBtn').disabled") === false, "multiple submit enables after selecting");
  await click("#submitAnswerBtn");
  await sleep(300);
  s = await state();
  check(s.submitted === true && s.feedbackClass.includes("is-wrong"), "incomplete multiple is marked wrong", s);
  check(s.feedbackTitle === "回答错误", "multiple wrong feedback title", s.feedbackTitle);
  check(s.score === 1, "incomplete multiple adds no points", s.score);
  check(s.correctLetters.sort().join("") === multiQ.answer.slice().sort().join(""), "multiple feedback highlights all correct options", { dom: s.correctLetters, bank: multiQ.answer });
  check(Boolean(s.explanation) || s.noExplanation, "multiple feedback shows explanation or explicit fallback", { noExplanation: s.noExplanation });

  // ---------- multiple correct ----------
  await goTo(secondMultipleIndex);
  s = await state();
  const multiQ2 = BY_SOURCE.get(s.source);
  check(multiQ2 && multiQ2.type === "multiple" && multiQ2.answer.length > 1, "second multiple resolves", s.source);
  for (const letter of multiQ2.answer) await clickOption(letter);
  s = await state();
  check(s.checked.length === multiQ2.answer.length, "multiple records all selected options", { dom: s.checked, bank: multiQ2.answer });
  check(s.score === 1, "multiple selection does not score before submit", s.score);
  await click("#submitAnswerBtn");
  await sleep(400);
  s = await state();
  check(s.submitted === true && s.feedbackClass.includes("is-correct"), "fully correct multiple is marked correct", s);
  check(s.score === 3, "correct multiple adds 2 points", s.score);
  check(s.answered === "3/75", "three answered questions counted", s.answered);
  await client.evaluate("window.scrollTo(0, 0)");
  await sleep(400);
  await client.screenshot("03-quiz-desktop.png");

  // ---------- multiple mobile layout ----------
  await setViewport(390, 844, true);
  await sleep(400);
  const mobileQuiz = await client.evaluate(`(() => {
    const f = document.querySelector('.quiz-footer').getBoundingClientRect();
    return {
      overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      footerTop: Math.round(f.top),
      footerBottom: Math.round(f.bottom),
      footerHeight: Math.round(f.height),
      viewport: window.innerHeight,
      headerVisible: (() => { const h = document.querySelector('.quiz-header').getBoundingClientRect(); return h.top >= 0 && h.height > 0; })(),
      optionWidth: Math.round(document.querySelector('.option').getBoundingClientRect().width)
    };
  })()`);
  check(mobileQuiz.overflow === 0, "mobile quiz has no horizontal overflow", mobileQuiz);
  check(Math.abs(mobileQuiz.footerBottom - mobileQuiz.viewport) <= 2, "mobile quiz footer is fixed at viewport bottom", mobileQuiz);
  check(mobileQuiz.headerVisible, "mobile quiz header is visible", mobileQuiz);
  await client.evaluate("window.scrollTo(0, 0)");
  await sleep(300);
  await client.screenshot("04-quiz-mobile.png");

  await setViewport(320, 700, true);
  await sleep(300);
  const narrowQuiz = await client.evaluate(`(() => {
    const f = document.querySelector('.quiz-footer').getBoundingClientRect();
    return {
      overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      footerBottom: Math.round(f.bottom),
      viewport: window.innerHeight
    };
  })()`);
  check(narrowQuiz.overflow === 0, "320px quiz has no horizontal overflow", narrowQuiz);
  check(Math.abs(narrowQuiz.footerBottom - narrowQuiz.viewport) <= 2, "320px quiz footer is fixed at bottom", narrowQuiz);
  await client.screenshot("04b-quiz-mobile-320.png");
  await setViewport(1440, 1100, false);
  await sleep(300);

  // ---------- single wrong ----------
  await goTo(secondSingleIndex);
  s = await state();
  const singleQ2 = BY_SOURCE.get(s.source);
  const wrongLetter = s.optionValues.find((letter) => !singleQ2.answer.includes(letter));
  await clickOption(wrongLetter);
  await sleep(250);
  s = await state();
  check(s.submitted === true && s.feedbackClass.includes("is-wrong"), "wrong single is marked wrong", s);
  check(s.score === 3, "wrong single adds no points", s.score);
  check(s.answered === "4/75", "four answered questions counted", s.answered);

  // ---------- palette ----------
  await client.evaluate("document.getElementById('paletteBtn').click()");
  await sleep(300);
  const palette = await paletteState();
  check(palette.count === 75, "palette shows 75 cells", palette);
  check(palette.done === 4, "palette marks 4 submitted questions", palette);
  check(palette.answered === "4" && palette.unanswered === "71", "palette counts answered / unanswered", palette);
  check(palette.current === 1, "palette marks current cell", palette);
  await client.screenshot("05-palette-desktop.png");
  await client.evaluate("document.querySelector('#paletteModal [data-close=\"palette\"]').click()");
  await sleep(200);

  // ---------- last question -> confirm ----------
  await goTo(74);
  s = await state();
  check(s.currentNo === 75 && s.nextLabel.includes("交卷"), "last question shows submit action", s);
  check(s.progressPct === "100%", "last question progress is 100%", s.progressPct);
  await click("#nextBtn");
  await sleep(250);
  let confirm = await client.evaluate(`(() => ({
    open: document.getElementById('confirmModal').classList.contains('is-open'),
    title: document.getElementById('confirmTitle').textContent.trim(),
    sub: document.getElementById('confirmSub').textContent.trim(),
    summary: document.getElementById('confirmSummary').textContent.replace(/\\s+/g, ' ').trim()
  }))()`);
  check(confirm.open === true, "next on last question opens confirm dialog", confirm);
  check(confirm.title.includes("71") && confirm.summary.includes("71"), "confirm dialog shows 71 unanswered", confirm);
  await client.evaluate("document.querySelector('#confirmModal [data-close=\"confirm\"]').click()");
  await sleep(200);
  confirm = await client.evaluate("document.getElementById('confirmModal').classList.contains('is-open')");
  check(confirm === false, "confirm dialog can be cancelled");

  // ---------- submit exam ----------
  await click("#submitExamBtn");
  await sleep(200);
  await click("#confirmSubmitBtn");
  await sleep(800);
  s = await state();
  check(s.screen === "screen-result", "exam finishes on result screen", s.screen);
  const result = await client.evaluate(`(() => {
    const cards = Array.from(document.querySelectorAll('.review-card'));
    const stats = Array.from(document.querySelectorAll('.result-stat')).map((node) => node.textContent.replace(/\\s+/g, ' ').trim());
    const ring = document.getElementById('scoreRing');
    return {
      score: document.getElementById('resultScore').textContent.trim(),
      title: document.getElementById('resultTitle').textContent.trim(),
      desc: document.getElementById('resultDesc').textContent.trim(),
      stats,
      reviewCount: document.getElementById('reviewCount').textContent.replace(/\\s+/g, ' ').trim(),
      cards: cards.length,
      openCards: cards.filter((card) => card.open).length,
      firstOpen: cards.length ? cards[0].open : false,
      hasUnanswered: cards.some((card) => card.textContent.includes('未作答')),
      ringOffset: ring.style.strokeDashoffset,
      toneBad: document.getElementById('scoreVisual').classList.contains('tone-bad'),
      best: (() => { try { return JSON.parse(localStorage.getItem('acp-mock-best-v1')); } catch (e) { return null; } })(),
      overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
    };
  })()`);
  check(result.score === "3", "result score is 3", result.score);
  check(result.stats.some((text) => text.includes("2 / 75")), "result shows 2 correct questions", result.stats);
  check(result.stats.some((text) => text.includes("2.7%")), "result accuracy is 2.7%", result.stats);
  check(result.stats.some((text) => text.includes("1 / 50")) && result.stats.some((text) => text.includes("1 / 25")), "result shows single / multiple breakdown", result.stats);
  check(result.reviewCount.includes("73") && result.cards === 73, "result lists 73 wrong questions", { reviewCount: result.reviewCount, cards: result.cards });
  check(result.firstOpen === true && result.openCards === 1, "first wrong question is expanded", { firstOpen: result.firstOpen, openCards: result.openCards });
  check(result.hasUnanswered === true, "wrong review includes unanswered questions", result.hasUnanswered);
  check(result.ringOffset !== "" && Number(result.ringOffset) > 0, "score ring reflects score", result.ringOffset);
  check(result.toneBad === true, "low score uses bad tone", result.toneBad);
  check(result.best && result.best.score === 3, "local storage best score is saved", result.best);
  check(result.overflow === 0, "result has no horizontal overflow", result.overflow);
  await client.evaluate("window.scrollTo(0, 0)");
  await sleep(600);
  await client.screenshot("06-result-desktop.png");

  // ---------- result responsive ----------
  await setViewport(390, 844, true);
  await client.evaluate("window.scrollTo(0, 0)");
  await sleep(300);
  const mobileResult = await client.evaluate(`(() => ({
    overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    scoreVisible: document.getElementById('resultScore').getBoundingClientRect().width > 0,
    cards: document.querySelectorAll('.review-card').length
  }))()`);
  check(mobileResult.overflow === 0, "mobile result has no horizontal overflow", mobileResult);
  check(mobileResult.scoreVisible && mobileResult.cards === 73, "mobile result keeps score and review", mobileResult);
  await client.screenshot("06b-result-mobile.png");
  await setViewport(320, 700, true);
  await client.evaluate("window.scrollTo(0, 0)");
  await sleep(300);
  const narrowResult = await client.evaluate("Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)");
  check(narrowResult === 0, "320px result has no horizontal overflow", narrowResult);
  await client.screenshot("06c-result-mobile-320.png");
  await setViewport(1440, 1100, false);
  await sleep(300);

  // ---------- expand all ----------
  await client.evaluate("document.getElementById('expandAllBtn').click()");
  await sleep(250);
  const expanded = await client.evaluate(`(() => ({
    open: Array.from(document.querySelectorAll('.review-card')).filter((card) => card.open).length,
    label: document.getElementById('expandAllBtn').textContent.trim()
  }))()`);
  check(expanded.open === 73, "expand all opens every review card", expanded);
  check(expanded.label.includes("收起全部解析"), "expand all label toggles", expanded.label);

  // ---------- retry ----------
  await client.evaluate("window.scrollTo(0, 0)");
  await click("#retryBtn");
  await sleep(400);
  s = await state();
  check(s.screen === "screen-quiz" && s.currentNo === 1, "retry starts a new exam", s);
  check(s.score === 0 && s.answered === "0/75" && s.submitted === false, "retry resets score and answers", s);
  check(s.timer === "00:00", "retry resets timer", s.timer);
  check(s.paletteCount === "0/75", "retry resets palette count", s.paletteCount);

  // ---------- mobile quiz on fresh exam ----------
  await setViewport(390, 844, true);
  await sleep(400);
  const mobileQuiz2 = await client.evaluate(`(() => {
    const f = document.querySelector('.quiz-footer').getBoundingClientRect();
    return {
      overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      footerBottom: Math.round(f.bottom),
      viewport: window.innerHeight
    };
  })()`);
  check(mobileQuiz2.overflow === 0, "fresh mobile quiz has no horizontal overflow", mobileQuiz2);
  check(Math.abs(mobileQuiz2.footerBottom - mobileQuiz2.viewport) <= 2, "fresh mobile footer is at bottom", mobileQuiz2);
  await client.evaluate("window.scrollTo(0, 0)");
  await sleep(300);
  await client.screenshot("07-quiz-mobile-fresh.png");

  // ---------- back to mobile home ----------
  await client.evaluate("document.getElementById('submitExamBtn').click()");
  await sleep(200);
  await client.evaluate("document.getElementById('confirmSubmitBtn').click()");
  await sleep(600);
  await client.evaluate("document.getElementById('resultHomeBtn2').click()");
  await sleep(500);
  s = await state();
  check(s.screen === "screen-home", "result returns to home", s.screen);
  const mobileHome2 = await client.evaluate(`(() => ({
    overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    bestVisible: !document.getElementById('bestRecord').hidden,
    best: document.getElementById('bestScore').textContent.trim()
  }))()`);
  check(mobileHome2.overflow === 0, "mobile home after exam has no overflow", mobileHome2);
  check(mobileHome2.bestVisible && mobileHome2.best === "3", "home shows best score 3", mobileHome2);
  await client.screenshot("08-home-mobile-after.png");

  // ---------- console errors ----------
  check(client.errors.length === 0, "no console errors or uncaught exceptions", client.errors);

  console.log("\nALL CHECKS PASSED");
  console.log("Screenshots:", SHOTS);
  finish(0);
}

main().catch((error) => {
  console.error("\n" + error.stack);
  finish(1);
});
