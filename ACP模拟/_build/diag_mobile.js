const http = require("http");
const fs = require("fs");
const path = require("path");

const BASE = "http://127.0.0.1:9333";
const APP_URL = "file:///C:/Users/DELL/Desktop/ACP%E6%A8%A1%E6%8B%9F/index.html";

const httpJson = (url) => new Promise((resolve, reject) => {
  http.get(url, (res) => {
    let body = "";
    res.on("data", (chunk) => { body += chunk; });
    res.on("end", () => resolve(JSON.parse(body)));
  }).on("error", reject);
});

(async () => {
  const targets = await httpJson(BASE + "/json/list");
  const target = targets.find((t) => t.type === "page");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (!msg.id) return;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error.message));
    else p.resolve(msg.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + " " + (result.exceptionDetails.exception || {}).description);
    return result.result.value;
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844
  });
  await send("Page.navigate", { url: APP_URL });
  await sleep(1500);

  const info = await evaluate(`(() => {
    const measure = () => ({ innerWidth: window.innerWidth, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth });
    const cases = [
      ['hide all pseudo', '*::before,*::after{display:none!important}'],
      ['hide ticket-stage pseudo', '.ticket-stage::before,.ticket-stage::after{display:none!important}'],
      ['hide ticket-stage before', '.ticket-stage::before{display:none!important}'],
      ['hide ticket-stage after', '.ticket-stage::after{display:none!important}'],
      ['hide ticket-note', '.ticket-note{display:none!important}'],
      ['clip html x', 'html{overflow-x:clip!important}'],
      ['clip body x', 'body{overflow-x:clip!important}']
    ].map(([name, css]) => {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
      const value = measure();
      style.remove();
      return { name, ...value };
    });
    const stage = document.querySelector('.ticket-stage');
    const stageRect = stage.getBoundingClientRect();
    const pseudos = ['::before', '::after'].map((pseudo) => {
      const cs = getComputedStyle(stage, pseudo);
      return {
        pseudo,
        content: cs.content,
        position: cs.position,
        left: cs.left,
        right: cs.right,
        top: cs.top,
        bottom: cs.bottom,
        width: cs.width,
        height: cs.height,
        transform: cs.transform
      };
    });
    const vw = document.documentElement.clientWidth;
    const all = Array.from(document.querySelectorAll('body *'));
    const bad = all.map((node) => {
      const r = node.getBoundingClientRect();
      return {
        tag: node.tagName.toLowerCase(),
        cls: typeof node.className === 'string' ? node.className : '',
        id: node.id,
        left: Math.round(r.left * 10) / 10,
        right: Math.round(r.right * 10) / 10,
        width: Math.round(r.width * 10) / 10,
        pos: getComputedStyle(node).position
      };
    }).filter((item) => item.right > vw + 0.5 || item.left < -0.5).sort((a, b) => b.right - a.right).slice(0, 30);
    return {
      innerWidth: window.innerWidth,
      clientWidth: vw,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      visual: visualViewport ? { width: visualViewport.width, scale: visualViewport.scale } : null,
      screen: { width: screen.width, height: screen.height },
      dpr: devicePixelRatio,
      meta: document.querySelector('meta[name=viewport]') ? document.querySelector('meta[name=viewport]').content : null,
      active: document.querySelector('.screen.is-active') ? document.querySelector('.screen.is-active').id : null,
      stageRect: { left: stageRect.left, right: stageRect.right, width: stageRect.width },
      pseudos,
      cases,
      bad
    };
  })()`);
  console.log(JSON.stringify(info, null, 2));
  const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
  fs.mkdirSync(path.join("C:/Users/DELL/Desktop/ACP模拟/_build/shots"), { recursive: true });
  fs.writeFileSync("C:/Users/DELL/Desktop/ACP模拟/_build/shots/diag-mobile.png", Buffer.from(shot.data, "base64"));
  ws.close();
  process.exit(0);
})().catch((error) => {
  console.error(error.stack);
  process.exit(1);
});
