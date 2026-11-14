
(() => {
  "use strict";

  const LETTERS = ["A", "B", "C", "D", "E", "F"];
  const SINGLE_TARGET = 50;
  const MULTIPLE_TARGET = 25;
  const SINGLE_POINTS = 1;
  const MULTIPLE_POINTS = 2;
  const TOTAL_TARGET = SINGLE_TARGET + MULTIPLE_TARGET;
  const MAX_SCORE = SINGLE_TARGET * SINGLE_POINTS + MULTIPLE_TARGET * MULTIPLE_POINTS;
  const BEST_KEY = "acp-mock-best-v1";
  const CIRCUMFERENCE = 2 * Math.PI * 86;

  const $ = (id) => document.getElementById(id);
  const el = {
    home: $("screen-home"),
    quiz: $("screen-quiz"),
    result: $("screen-result"),
    navBankCount: $("navBankCount"),
    heroBankCount: $("heroBankCount"),
    footerBankCount: $("footerBankCount"),
    footerExplainedCount: $("footerExplainedCount"),
    poolSingleCount: $("poolSingleCount"),
    poolMultipleCount: $("poolMultipleCount"),
    startBtn: $("startBtn"),
    bestRecord: $("bestRecord"),
    bestScore: $("bestScore"),
    currentNo: $("currentNo"),
    totalNo: $("totalNo"),
    progressBar: $("progressBar"),
    progressPct: $("progressPct"),
    progressTrack: $("progressTrack"),
    liveScore: $("liveScore"),
    liveAnswered: $("liveAnswered"),
    liveTimer: $("liveTimer"),
    submitExamBtn: $("submitExamBtn"),
    questionCard: $("questionCard"),
    questionType: $("questionType"),
    questionPoints: $("questionPoints"),
    questionSource: $("questionSource"),
    questionText: $("questionText"),
    hintText: $("hintText"),
    options: $("options"),
    multiBar: $("multiBar"),
    selectedCount: $("selectedCount"),
    submitAnswerBtn: $("submitAnswerBtn"),
    feedback: $("feedback"),
    prevBtn: $("prevBtn"),
    nextBtn: $("nextBtn"),
    paletteBtn: $("paletteBtn"),
    paletteCount: $("paletteCount"),
    paletteModal: $("paletteModal"),
    paletteGrid: $("paletteGrid"),
    paletteAnswered: $("paletteAnswered"),
    paletteTotal: $("paletteTotal"),
    paletteUnanswered: $("paletteUnanswered"),
    paletteSubmitBtn: $("paletteSubmitBtn"),
    confirmModal: $("confirmModal"),
    confirmTitle: $("confirmTitle"),
    confirmSub: $("confirmSub"),
    confirmSummary: $("confirmSummary"),
    confirmText: $("confirmText"),
    confirmSubmitBtn: $("confirmSubmitBtn"),
    resultScore: $("resultScore"),
    resultTitle: $("resultTitle"),
    resultDesc: $("resultDesc"),
    resultStats: $("resultStats"),
    scoreVisual: $("scoreVisual"),
    scoreRing: $("scoreRing"),
    reviewCount: $("reviewCount"),
    reviewList: $("reviewList"),
    expandAllBtn: $("expandAllBtn"),
    retryBtn: $("retryBtn"),
    resultHomeBtn: $("resultHomeBtn"),
    resultHomeBtn2: $("resultHomeBtn2"),
    toast: $("toast")
  };

  let bank = { meta: {}, questions: [] };
  let pools = { single: [], multiple: [] };
  let exam = null;
  let activeModal = null;
  let lastFocused = null;
  let toastTimer = 0;
  let timerId = 0;
  let reviewExpanded = false;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
  }

  function renderRich(value) {
    let text = String(value ?? "");
    const codes = [];
    text = text.replace(/`([^`]+)`/g, (_, code) => {
      codes.push(escapeHtml(code));
      return "\u0000C" + (codes.length - 1) + "\u0000";
    });
    let html = escapeHtml(text);
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\u0000C(\d+)\u0000/g, (_, index) => "<code>" + codes[Number(index)] + "</code>");
    return html.replace(/\n/g, "<br>");
  }

  function formatAnswer(letters) {
    return (letters || []).join("、");
  }

  function formatClock(totalSeconds) {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const pad = (v) => String(v).padStart(2, "0");
    return h > 0 ? h + ":" + pad(m) + ":" + pad(s) : pad(m) + ":" + pad(s);
  }

  function pointsOf(question) {
    return question.type === "multiple" ? MULTIPLE_POINTS : SINGLE_POINTS;
  }

  function typeName(question) {
    return question.type === "multiple" ? "多选题" : "单选题";
  }

  function sourceText(question) {
    return String(question.source || "社区题库").replace(/\s+/g, " ").trim();
  }

  function safeHref(url) {
    return /^https?:\/\//i.test(String(url || "")) ? escapeHtml(url) : "";
  }

  function shuffle(items) {
    const arr = items.slice();
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = arr[i];
      arr[i] = arr[j];
      arr[j] = temp;
    }
    return arr;
  }

  function pickRandom(items, count) {
    return shuffle(items).slice(0, count);
  }

  function showScreen(name) {
    const target = name === "home" ? el.home : name === "quiz" ? el.quiz : el.result;
    [el.home, el.quiz, el.result].forEach((screen) => {
      screen.classList.toggle("is-active", screen === target);
    });
    document.body.dataset.screen = name;
    window.scrollTo(0, 0);
  }

  function showToast(message, isError) {
    window.clearTimeout(toastTimer);
    el.toast.textContent = message;
    el.toast.classList.toggle("is-error", Boolean(isError));
    el.toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => el.toast.classList.remove("is-visible"), 2400);
  }

  function readBest() {
    try {
      const raw = window.localStorage.getItem(BEST_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Number.isFinite(parsed.score) ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function renderBest() {
    const best = readBest();
    if (!best) {
      el.bestRecord.hidden = true;
      return;
    }
    el.bestScore.textContent = String(best.score);
    el.bestRecord.hidden = false;
  }

  function saveBest(score) {
    try {
      const previous = readBest();
      if (!previous || score > previous.score) {
        window.localStorage.setItem(BEST_KEY, JSON.stringify({
          score,
          date: new Date().toISOString().slice(0, 10)
        }));
      }
    } catch (error) {
      /* localStorage may be unavailable on file:// or in private mode. */
    }
  }

  function initBank() {
    const dataNode = $("bankData");
    bank = JSON.parse(dataNode.textContent);
    const questions = Array.isArray(bank.questions) ? bank.questions : [];
    const isValid = (question) => {
      if (!question || typeof question.question !== "string" || !question.question.trim()) return false;
      if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > LETTERS.length) return false;
      if (!question.options.every((option) => typeof option === "string" && option.trim())) return false;
      if (!Array.isArray(question.answer) || !question.answer.length) return false;
      if (new Set(question.answer).size !== question.answer.length) return false;
      return question.answer.every((letter) => typeof letter === "string" && LETTERS.indexOf(letter) < question.options.length);
    };
    pools = {
      single: questions.filter((q) => q && q.type === "single" && isValid(q) && q.answer.length === 1),
      multiple: questions.filter((q) => q && q.type === "multiple" && isValid(q) && q.answer.length > 1)
    };
    if (pools.single.length < SINGLE_TARGET || pools.multiple.length < MULTIPLE_TARGET) {
      throw new Error("题库数量不足：需要至少 " + SINGLE_TARGET + " 道单选题和 " + MULTIPLE_TARGET + " 道多选题。");
    }
    const total = questions.length.toLocaleString("zh-CN");
    [el.navBankCount, el.heroBankCount, el.footerBankCount].forEach((node) => { node.textContent = total; });
    el.poolSingleCount.textContent = pools.single.length.toLocaleString("zh-CN");
    el.poolMultipleCount.textContent = pools.multiple.length.toLocaleString("zh-CN");
    const explained = Number(bank.meta && bank.meta.explained) || questions.filter((q) => q.explanation).length;
    el.footerExplainedCount.textContent = explained.toLocaleString("zh-CN");
    el.totalNo.textContent = String(TOTAL_TARGET);
    el.paletteCount.textContent = "0/" + TOTAL_TARGET;
    el.paletteTotal.textContent = String(TOTAL_TARGET);
    el.paletteUnanswered.textContent = String(TOTAL_TARGET);
  }

  function buildExam() {
    const singles = pickRandom(pools.single, SINGLE_TARGET);
    const multiples = pickRandom(pools.multiple, MULTIPLE_TARGET);
    const questions = shuffle(singles.concat(multiples));
    exam = {
      questions,
      answers: questions.map(() => ({ picked: [], submitted: false, correct: false })),
      index: 0,
      startedAt: Date.now(),
      finishedAt: null,
      finished: false
    };
  }

  function updateMetrics() {
    if (!exam) return;
    let score = 0;
    let answered = 0;
    exam.answers.forEach((answer, index) => {
      if (!answer.submitted) return;
      answered += 1;
      if (answer.correct) score += pointsOf(exam.questions[index]);
    });
    el.liveScore.textContent = String(score);
    el.liveAnswered.textContent = answered + "/" + TOTAL_TARGET;
    el.paletteCount.textContent = answered + "/" + TOTAL_TARGET;
    el.paletteAnswered.textContent = String(answered);
    el.paletteUnanswered.textContent = String(TOTAL_TARGET - answered);
  }

  function updateProgress() {
    if (!exam) return;
    const current = exam.index + 1;
    const percent = Math.round((current / TOTAL_TARGET) * 100);
    el.currentNo.textContent = String(current);
    el.progressBar.style.width = percent + "%";
    el.progressPct.textContent = percent + "%";
    el.progressTrack.setAttribute("aria-valuenow", String(percent));
    el.progressTrack.setAttribute("aria-valuetext", "第 " + current + " / " + TOTAL_TARGET + " 题");
    el.prevBtn.disabled = exam.index === 0;
    const isLast = exam.index === TOTAL_TARGET - 1;
    el.nextBtn.classList.toggle("is-finish", isLast);
    el.nextBtn.innerHTML = isLast
      ? '交卷 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7"/></svg>'
      : '下一题 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
  }

  function updateTimer() {
    if (!exam) {
      el.liveTimer.textContent = "00:00";
      return;
    }
    const end = exam.finishedAt || Date.now();
    el.liveTimer.textContent = formatClock(Math.floor((end - exam.startedAt) / 1000));
  }

  function startTimer() {
    window.clearInterval(timerId);
    updateTimer();
    timerId = window.setInterval(updateTimer, 1000);
  }

  function renderOptions(question, answer) {
    const locked = answer.submitted;
    el.options.classList.toggle("is-locked", locked);
    el.options.setAttribute("role", question.type === "multiple" ? "group" : "radiogroup");
    const inputType = question.type === "multiple" ? "checkbox" : "radio";
    el.options.innerHTML = question.options.map((option, index) => {
      const letter = LETTERS[index];
      const selected = answer.picked.indexOf(letter) !== -1;
      const isCorrect = question.answer.indexOf(letter) !== -1;
      const classes = ["option"];
      if (selected) classes.push("is-selected");
      if (locked && isCorrect) classes.push("is-correct");
      if (locked && selected && !isCorrect) classes.push("is-wrong");
      const stateLabel = locked
        ? (isCorrect ? "，正确答案" : (selected ? "，你的选择，错误" : ""))
        : "";
      return '<label class="' + classes.join(" ") + '">' +
        '<input class="option-input" type="' + inputType + '" name="question-option" value="' + letter + '"' +
          (selected ? " checked" : "") + (locked ? " disabled" : "") + '>' +
        '<span class="option-letter" aria-hidden="true">' + letter + '</span>' +
        '<span class="option-text">' + renderRich(option) + '</span>' +
        '<span class="option-state" aria-hidden="true"></span>' +
        '<span class="sr-only">' + stateLabel + '</span>' +
        '</label>';
    }).join("");
  }

  function getPickedFromInputs() {
    return Array.from(el.options.querySelectorAll(".option-input:checked"))
      .map((input) => input.value)
      .sort((a, b) => LETTERS.indexOf(a) - LETTERS.indexOf(b));
  }

  function syncSelectionUI() {
    el.options.querySelectorAll(".option").forEach((label) => {
      const input = label.querySelector(".option-input");
      label.classList.toggle("is-selected", Boolean(input && input.checked));
    });
    updateMultiControls();
  }

  function updateMultiControls() {
    if (!exam) return;
    const answer = exam.answers[exam.index];
    const count = answer.picked.length;
    el.selectedCount.textContent = String(count);
    el.submitAnswerBtn.disabled = answer.submitted || count === 0;
  }

  function renderFeedback(question, answer) {
    if (!answer.submitted) {
      el.feedback.hidden = true;
      el.feedback.innerHTML = "";
      el.feedback.className = "feedback";
      return;
    }
    const correct = answer.correct;
    const points = pointsOf(question);
    const pickedText = formatAnswer(answer.picked);
    const correctText = formatAnswer(question.answer);
    const missing = answer.picked.length === 0;
    const explanation = question.explanation
      ? renderRich(question.explanation)
      : '<span class="no-explanation">原题库未提供本题解析。</span><span class="no-exp-hint">无解析</span>';
    el.feedback.className = "feedback " + (correct ? "is-correct" : "is-wrong");
    el.feedback.innerHTML =
      '<div class="feedback-head">' +
        '<span class="feedback-icon" aria-hidden="true">' + (correct ? "✓" : "×") + '</span>' +
        '<div>' +
          '<h2 class="feedback-title">' + (correct ? "回答正确" : "回答错误") + '</h2>' +
          '<p class="feedback-sub">' + (correct
            ? "本题 +" + points + " 分" + (question.type === "multiple" ? "，多选题全部选对" : "")
            : (question.type === "multiple" ? "多选题需全部选对才得分，本题未得分" : "本题未得分，正确答案已标出")) +
          '</p>' +
        '</div>' +
      '</div>' +
      '<div class="feedback-answers">' +
        '<span class="answer-label">你的答案</span>' +
        '<span class="answer-chip' + (missing ? " is-missing" : "") + '">' + (missing ? "未作答" : pickedText) + '</span>' +
        '<span class="answer-divider" aria-hidden="true"></span>' +
        '<span class="answer-label">正确答案</span>' +
        '<span class="answer-chip is-right">' + correctText + '</span>' +
      '</div>' +
      '<div class="explanation">' +
        '<div class="explanation-label">解析</div>' +
        '<p>' + explanation + '</p>' +
      '</div>';
    el.feedback.hidden = false;
  }

  function renderQuestion(focusQuestion) {
    if (!exam) return;
    const question = exam.questions[exam.index];
    const answer = exam.answers[exam.index];
    const isMultiple = question.type === "multiple";
    el.questionType.className = "type-badge" + (isMultiple ? " multiple" : "");
    el.questionType.innerHTML = '<span class="badge-dot" aria-hidden="true"></span>' + typeName(question);
    el.questionPoints.textContent = pointsOf(question) + " 分";
    el.questionSource.textContent = "来源 · " + sourceText(question);
    el.questionSource.title = sourceText(question);
    el.questionText.innerHTML = renderRich(question.question);
    el.hintText.textContent = isMultiple
      ? "勾选所有正确选项后点击「提交答案」，多选须全部选对才得分"
      : "点击选项即可提交作答，提交后不可修改";
    renderOptions(question, answer);
    el.multiBar.hidden = !isMultiple || answer.submitted;
    updateMultiControls();
    renderFeedback(question, answer);
    updateProgress();
    updateMetrics();
    updateTimer();
    if (focusQuestion) {
      requestAnimationFrame(() => {
        el.questionText.focus({ preventScroll: true });
      });
    }
  }

  function gradeCurrent() {
    const question = exam.questions[exam.index];
    const answer = exam.answers[exam.index];
    if (answer.submitted) return;
    if (!answer.picked.length) return;
    const picked = answer.picked.slice().sort().join("");
    const expected = question.answer.slice().sort().join("");
    answer.correct = picked === expected;
    answer.submitted = true;
    if (question.type === "multiple") {
      answer.picked = answer.picked.slice().sort((a, b) => LETTERS.indexOf(a) - LETTERS.indexOf(b));
    }
  }

  function focusFeedback() {
    requestAnimationFrame(() => {
      el.feedback.focus({ preventScroll: true });
      el.feedback.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  function submitCurrentSingle() {
    if (!exam) return;
    const answer = exam.answers[exam.index];
    if (answer.submitted) return;
    gradeCurrent();
    renderQuestion(false);
    updateMetrics();
    focusFeedback();
  }

  function submitCurrentMultiple() {
    if (!exam) return;
    const answer = exam.answers[exam.index];
    if (answer.submitted) return;
    if (!answer.picked.length) {
      showToast("请至少选择一个选项", true);
      return;
    }
    gradeCurrent();
    renderQuestion(false);
    updateMetrics();
    focusFeedback();
  }

  function goTo(index, focusQuestion) {
    if (!exam) return;
    if (index < 0 || index >= TOTAL_TARGET) return;
    exam.index = index;
    renderQuestion(Boolean(focusQuestion));
    window.scrollTo(0, 0);
  }

  function renderPalette() {
    if (!exam) return;
    el.paletteGrid.innerHTML = exam.answers.map((answer, index) => {
      const status = answer.submitted ? "done" : (answer.picked.length ? "draft" : "");
      const current = index === exam.index ? " current" : "";
      const label = "第 " + (index + 1) + " 题，" + (answer.submitted ? "已答" : answer.picked.length ? "已选择未提交" : "未答") + (current ? "，当前题" : "");
      return '<button class="palette-cell ' + status + current + '" type="button" data-index="' + index + '" aria-label="' + escapeHtml(label) + '"' + (current ? ' aria-current="true"' : "") + '>' + (index + 1) + '</button>';
    }).join("");
    updateMetrics();
  }

  function openModal(modal) {
    if (!modal) return;
    if (activeModal && activeModal !== modal) closeModal(false);
    lastFocused = document.activeElement;
    activeModal = modal;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => {
      const first = modal.querySelector("[data-autofocus]") || modal.querySelector(".modal-close") || modal.querySelector("button");
      if (first) first.focus({ preventScroll: true });
    });
  }

  function closeModal(restoreFocus = true) {
    if (!activeModal) return;
    const modal = activeModal;
    activeModal = null;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (restoreFocus && lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus({ preventScroll: true });
    }
    lastFocused = null;
  }

  function openPalette() {
    if (!exam || exam.finished) return;
    renderPalette();
    openModal(el.paletteModal);
  }

  function askSubmit() {
    if (!exam || exam.finished) return;
    if (activeModal) closeModal(false);
    const answered = exam.answers.filter((a) => a.submitted).length;
    const unanswered = TOTAL_TARGET - answered;
    el.confirmTitle.textContent = unanswered > 0 ? "还有 " + unanswered + " 题未作答" : "确认交卷？";
    el.confirmSub.textContent = unanswered > 0 ? "未作答的题目将按错误计分" : "所有题目均已作答，交卷后将无法修改";
    el.confirmSummary.innerHTML =
      '<div class="confirm-stat"><b>' + answered + '</b><span>已作答</span></div>' +
      '<div class="confirm-stat' + (unanswered > 0 ? " is-warn" : "") + '"><b>' + unanswered + '</b><span>未作答</span></div>' +
      '<div class="confirm-stat"><b>' + formatClock(currentElapsed()) + '</b><span>当前用时</span></div>';
    el.confirmText.innerHTML = unanswered > 0
      ? "确定现在交卷吗？<strong>" + unanswered + " 道未作答</strong>，将按错误计分。"
      : "确定提交本次模拟测试吗？交卷后立即生成成绩与错题回顾。";
    openModal(el.confirmModal);
    lastFocused = el.submitExamBtn;
  }

  function currentElapsed() {
    if (!exam) return 0;
    return Math.floor(((exam.finishedAt || Date.now()) - exam.startedAt) / 1000);
  }

  function finishExam() {
    if (!exam || exam.finished) return;
    exam.finished = true;
    exam.finishedAt = Date.now();
    window.clearInterval(timerId);
    closeModal(false);
    const stats = getStats();
    saveBest(stats.score);
    renderResult(stats);
    showScreen("result");
    document.title = "测试结果 · 阿里云大模型 ACP 模拟测试";
    requestAnimationFrame(() => {
      const offset = CIRCUMFERENCE * (1 - stats.score / MAX_SCORE);
      el.scoreRing.style.strokeDashoffset = String(offset);
    });
  }

  function getStats() {
    let score = 0;
    let correct = 0;
    let answered = 0;
    let singleCorrect = 0;
    let multipleCorrect = 0;
    exam.answers.forEach((answer, index) => {
      const question = exam.questions[index];
      if (answer.submitted) answered += 1;
      if (answer.submitted && answer.correct) {
        correct += 1;
        score += pointsOf(question);
        if (question.type === "multiple") multipleCorrect += 1;
        else singleCorrect += 1;
      }
    });
    const total = exam.questions.length;
    return {
      score,
      correct,
      answered,
      total,
      singleCorrect,
      multipleCorrect,
      accuracy: total ? (correct / total) * 100 : 0,
      elapsed: currentElapsed()
    };
  }

  function resultCopy(stats) {
    if (stats.score >= 90) {
      return { title: "表现出色，状态很好", desc: "本次模拟得分达到 " + stats.score + " 分。继续保持审题节奏，重点确认多选题是否漏选。" };
    }
    if (stats.score >= 75) {
      return { title: "基础扎实，再冲一冲", desc: "本次模拟得分 " + stats.score + " 分。整体掌握不错，建议把错题涉及的考点再串联复习一遍。" };
    }
    if (stats.score >= 60) {
      return { title: "仍有提升空间", desc: "本次模拟得分 " + stats.score + " 分。建议先复盘错题，再针对薄弱模块做专项练习。" };
    }
    return { title: "从错题开始补强", desc: "本次模拟得分 " + stats.score + " 分。不必急着刷下一套，先把错题和解析逐条吃透会更有效。" };
  }

  function renderReview(stats) {
    const wrong = [];
    exam.answers.forEach((answer, index) => {
      if (!answer.correct) wrong.push({ question: exam.questions[index], answer, index });
    });
    if (!wrong.length) {
      el.reviewCount.innerHTML = "全部答对";
      el.expandAllBtn.hidden = true;
      el.reviewList.innerHTML =
        '<div class="review-empty">' +
          '<span class="review-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.5 4.5L19 7"/></svg></span>' +
          '<h3>全部答对，漂亮！</h3>' +
          '<p>本套试卷没有错题，可以再测一次换一套随机卷。</p>' +
        '</div>';
      return;
    }
    el.expandAllBtn.hidden = false;
    el.reviewCount.innerHTML = '共 <strong>' + wrong.length + '</strong> 题需要复盘';
    el.reviewList.innerHTML = wrong.map((item, order) => {
      const q = item.question;
      const a = item.answer;
      const picked = formatAnswer(a.picked) || "未作答";
      const correct = formatAnswer(q.answer);
      const optionsHtml = q.options.map((option, optionIndex) => {
        const letter = LETTERS[optionIndex];
        const isCorrect = q.answer.indexOf(letter) !== -1;
        const isPicked = a.picked.indexOf(letter) !== -1;
        const classes = ["review-option"];
        let flag = "";
        if (isCorrect) {
          classes.push("is-correct");
          flag = isPicked ? "你的选择 · 正确" : "正确答案";
        } else if (isPicked) {
          classes.push("is-wrong");
          flag = "你的选择";
        }
        return '<div class="' + classes.join(" ") + '">' +
          '<span class="review-letter" aria-hidden="true">' + letter + '</span>' +
          '<span class="review-option-text">' + renderRich(option) + '</span>' +
          (flag ? '<span class="review-flag">' + flag + '</span>' : "") +
          '</div>';
      }).join("");
      const explanation = q.explanation
        ? renderRich(q.explanation)
        : '<span class="no-explanation">原题库未提供本题解析。</span>';
      const href = safeHref(q.sourceUrl);
      const source = href
        ? '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(sourceText(q)) + '</a>'
        : escapeHtml(sourceText(q));
      return '<details class="review-card"' + (order === 0 ? " open" : "") + '>' +
        '<summary>' +
          '<span class="review-no">' + String(item.index + 1).padStart(2, "0") + '</span>' +
          '<span class="review-summary-main">' +
            '<span class="review-meta">' +
              '<span class="mini-type' + (q.type === "multiple" ? " multiple" : "") + '">' + typeName(q) + '</span>' +
              '<span>第 ' + (item.index + 1) + ' / ' + stats.total + ' 题</span>' +
              '<span>·</span><span>' + pointsOf(q) + ' 分</span>' +
            '</span>' +
            '<span class="review-question">' + renderRich(q.question) + '</span>' +
            '<span class="review-answer-summary">' +
              '<span>你的答案 <b class="wrong-answer">' + escapeHtml(picked) + '</b></span>' +
              '<span>·</span>' +
              '<span>正确答案 <b class="right-answer">' + escapeHtml(correct) + '</b></span>' +
            '</span>' +
          '</span>' +
          '<svg class="review-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>' +
        '</summary>' +
        '<div class="review-body">' +
          '<p class="review-full-question">' + renderRich(q.question) + '</p>' +
          '<div class="review-options">' + optionsHtml + '</div>' +
          '<div class="review-explanation"><span class="review-exp-label">解析</span><p>' + explanation + '</p></div>' +
          '<div class="review-source">来源 · ' + source + '</div>' +
        '</div>' +
      '</details>';
    }).join("");
  }

  function renderResult(stats) {
    const copy = resultCopy(stats);
    el.resultScore.textContent = String(stats.score);
    el.resultTitle.textContent = copy.title;
    el.resultDesc.textContent = copy.desc + " 答对 " + stats.correct + " 道，答错 " + (stats.total - stats.correct) + " 道。";
    const accuracy = Number(stats.accuracy.toFixed(1));
    el.resultStats.innerHTML =
      '<div class="result-stat"><span class="result-stat-label">正确题数</span><span class="result-stat-value">' + stats.correct + ' <small>/ ' + stats.total + '</small></span></div>' +
      '<div class="result-stat"><span class="result-stat-label">正确率</span><span class="result-stat-value"><em>' + accuracy + '%</em></span></div>' +
      '<div class="result-stat"><span class="result-stat-label">用时</span><span class="result-stat-value">' + formatClock(stats.elapsed) + '</span></div>' +
      '<div class="result-stat"><span class="result-stat-label">单选答对</span><span class="result-stat-value">' + stats.singleCorrect + ' <small>/ ' + SINGLE_TARGET + '</small></span></div>' +
      '<div class="result-stat"><span class="result-stat-label">多选答对</span><span class="result-stat-value">' + stats.multipleCorrect + ' <small>/ ' + MULTIPLE_TARGET + '</small></span></div>';
    el.scoreVisual.classList.toggle("tone-good", stats.score >= 85);
    el.scoreVisual.classList.toggle("tone-bad", stats.score < 60);
    el.scoreRing.style.strokeDashoffset = String(CIRCUMFERENCE);
    renderReview(stats);
    reviewExpanded = false;
    el.expandAllBtn.textContent = "展开全部解析";
  }

  function beginExam() {
    closeModal(false);
    buildExam();
    reviewExpanded = false;
    showScreen("quiz");
    document.title = "答题中 · 阿里云大模型 ACP 模拟测试";
    el.nextBtn.classList.remove("is-finish");
    renderQuestion(true);
    startTimer();
    updateMetrics();
  }

  function goNext() {
    if (!exam) return;
    if (exam.index >= TOTAL_TARGET - 1) {
      askSubmit();
      return;
    }
    goTo(exam.index + 1, true);
  }

  function goPrev() {
    if (!exam || exam.index <= 0) return;
    goTo(exam.index - 1, true);
  }

  function handleOptionInput(event) {
    const input = event.target.closest(".option-input");
    if (!input || !exam) return;
    const answer = exam.answers[exam.index];
    const question = exam.questions[exam.index];
    if (answer.submitted) return;
    if (question.type === "single") {
      answer.picked = [input.value];
      submitCurrentSingle();
    } else {
      answer.picked = getPickedFromInputs();
      syncSelectionUI();
      updateMetrics();
    }
  }

  function initEvents() {
    el.startBtn.addEventListener("click", beginExam);
    el.retryBtn.addEventListener("click", beginExam);
    [el.resultHomeBtn, el.resultHomeBtn2].forEach((button) => {
      button.addEventListener("click", () => {
        closeModal(false);
        showScreen("home");
        document.title = "阿里云大模型 ACP 模拟测试";
        renderBest();
      });
    });
    el.options.addEventListener("change", handleOptionInput);
    el.options.addEventListener("keydown", (event) => {
      const input = event.target.closest(".option-input");
      if (!input || !exam) return;
      const question = exam.questions[exam.index];
      if (question.type !== "single") return;
      const directions = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
      if (!(event.key in directions)) return;
      event.preventDefault();
      const inputs = Array.from(el.options.querySelectorAll(".option-input")).filter((item) => !item.disabled);
      const currentIndex = inputs.indexOf(input);
      if (currentIndex === -1) return;
      const nextIndex = (currentIndex + directions[event.key] + inputs.length) % inputs.length;
      inputs[nextIndex].focus();
    });
    el.submitAnswerBtn.addEventListener("click", submitCurrentMultiple);
    el.prevBtn.addEventListener("click", goPrev);
    el.nextBtn.addEventListener("click", goNext);
    el.paletteBtn.addEventListener("click", openPalette);
    el.submitExamBtn.addEventListener("click", askSubmit);
    el.paletteSubmitBtn.addEventListener("click", askSubmit);
    el.confirmSubmitBtn.addEventListener("click", finishExam);
    el.expandAllBtn.addEventListener("click", () => {
      reviewExpanded = !reviewExpanded;
      el.reviewList.querySelectorAll("details").forEach((details) => {
        details.open = reviewExpanded;
      });
      el.expandAllBtn.textContent = reviewExpanded ? "收起全部解析" : "展开全部解析";
    });
    el.paletteGrid.addEventListener("click", (event) => {
      const button = event.target.closest(".palette-cell");
      if (!button || !exam) return;
      const index = Number(button.dataset.index);
      if (!Number.isInteger(index)) return;
      closeModal(false);
      goTo(index, true);
    });
    document.querySelectorAll("[data-close]").forEach((node) => {
      node.addEventListener("click", () => closeModal());
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && activeModal) {
        event.preventDefault();
        closeModal();
        return;
      }
      if (activeModal) {
        if (event.key === "Tab") {
          const focusable = Array.from(activeModal.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])'))
            .filter((node) => node.offsetParent !== null);
          if (!focusable.length) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
        return;
      }
      if (!el.quiz.classList.contains("is-active") || !exam || exam.finished) return;
      const tag = (event.target && event.target.tagName) || "";
      const isOptionInput = event.target && event.target.classList && event.target.classList.contains("option-input");
      if ((tag === "INPUT" && !isOptionInput) || tag === "TEXTAREA" || tag === "SELECT" || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = String(event.key || "").toUpperCase();
      if (LETTERS.indexOf(key) !== -1) {
        const optionIndex = LETTERS.indexOf(key);
        const question = exam.questions[exam.index];
        if (optionIndex >= question.options.length) return;
        const input = el.options.querySelector('.option-input[value="' + key + '"]');
        if (input && !input.disabled) {
          event.preventDefault();
          input.click();
        }
      }
    });
    window.addEventListener("beforeunload", (event) => {
      if (exam && !exam.finished) {
        event.preventDefault();
        event.returnValue = "";
        return "";
      }
      return undefined;
    });
    window.addEventListener("pagehide", () => {
      window.clearInterval(timerId);
    });
    window.addEventListener("pageshow", () => {
      if (exam && !exam.finished && el.quiz.classList.contains("is-active")) startTimer();
    });
  }

  function init() {
    renderBest();
    try {
      initBank();
    } catch (error) {
      console.error(error);
      el.startBtn.disabled = true;
      showToast("题库加载失败：" + error.message, true);
      return;
    }
    initEvents();
  }

  init();
})();
