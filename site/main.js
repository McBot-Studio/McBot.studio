/*
 * McBot Studio's website: the burger's eyes, the bots (foods.js, the same code the app draws them
 * with), the moving brand rows, and the small live views: the app's chat, the model switch, the
 * harness compiling, a task that runs until done, a question, training, an approval, ⌘K. Each one plays only while it is on screen; with reduced
 * motion each one shows its final state. Downloads come from the latest GitHub release.
 */
document.documentElement.classList.add("js");

(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const F = window.McBotFoods;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let uid = 0;
  // The app seeds an agent's bot with "agent:<name>", so the same name is the same bot here.
  const face = (name, size, expression = "idle") => (F ? F.foodSvg({ seed: `agent:${name}`, size, expression, uid: `f${uid++}`, title: "" }) : "");

  /* ---------- the bots, and brand tiles wherever a slot names one ---------- */
  $$("[data-agent]").forEach((el) => { el.innerHTML = face(el.dataset.agent, Number(el.dataset.size || 32)); });
  const logo = (key) => $(`.mq li[data-key="${key}"] .lg`)?.cloneNode(true) ?? null;
  $$("[data-logo]").forEach((el) => { const l = logo(el.dataset.logo); if (l) el.replaceChildren(l); });

  /* ---------- brand rows: repeated until a set is wider than the screen, then that set twice, so
     the -50% loop never shows a seam; every row moves at the same pace, whatever its length ---------- */
  const echo = (ul, items) => { for (const li of items) { const c = li.cloneNode(true); c.setAttribute("aria-hidden", "true"); ul.appendChild(c); } };
  $$("[data-marquee] .mq").forEach((ul, row) => {
    const base = [...ul.children];
    if (!base.length) return;
    while (ul.scrollWidth < Math.max(innerWidth, 1200) * 1.1) echo(ul, base);
    echo(ul, [...ul.children]);
    const pace = row === 1 ? 26 : 32; // px a second
    ul.style.animationDuration = `${Math.round(ul.scrollWidth / 2 / pace)}s`;
  });

  /* ---------- coming into view ---------- */
  const seen = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); seen.unobserve(e.target); }
  }, { threshold: 0.18, rootMargin: "0px 0px -6% 0px" });
  $$("[data-in]").forEach((el) => seen.observe(el));
  // The hero is on screen at once: it arrives with the page.
  requestAnimationFrame(() => $$(".hero [data-in]").forEach((el) => el.classList.add("in")));

  /* ---------- nav ---------- */
  const nav = $("[data-nav]");
  const onScroll = () => nav?.classList.toggle("scrolled", scrollY > 24);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- the cursor (touch has none, so the bots idle there) ---------- */
  const pointer = { x: 0, y: 0, at: -1e9 };
  addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.at = performance.now();
  }, { passive: true });
  const live = () => performance.now() - pointer.at < 5000;

  /** Runs `tick` every frame while `el` is on screen. */
  function everyFrame(el, tick) {
    let raf = 0;
    const loop = (t) => { tick(t); raf = requestAnimationFrame(loop); };
    new IntersectionObserver(([e]) => {
      cancelAnimationFrame(raf);
      if (e.isIntersecting) raf = requestAnimationFrame(loop);
    }).observe(el);
  }

  /**
   * A small scene that plays, and loops, only while `el` is on screen: `sleep` waits, and holds
   * while the scene is scrolled away. Reduced motion: `still` draws the final state once.
   */
  function scene(el, play, still) {
    if (!el) return;
    if (reduce) { still?.(); return; }
    let visible = false;
    let running = false;
    const sleep = async (ms) => {
      await wait(ms);
      while (!visible) await wait(200);
    };
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !running) {
        running = true;
        (async () => { for (;;) await play(sleep); })();
      }
    }, { threshold: 0.3 }).observe(el);
  }

  /* ---------- the glass burger: eyes follow the cursor, it blinks, a poke makes it happy ---------- */
  const bot = $("[data-bot]");
  if (bot) {
    const s = { ex: 0, ey: 0, blinkAt: 1.4, blinkStart: -9, last: performance.now() };
    const set = (k, v) => bot.style.setProperty(k, v);
    everyFrame(bot, (now) => {
      const dt = Math.min(0.05, (now - s.last) / 1000);
      s.last = now;
      const t = now / 1000;
      const r = bot.getBoundingClientRect();
      let dx;
      let dy;
      if (live()) {
        dx = clamp((pointer.x - (r.left + r.width / 2)) / (innerWidth * 0.45), -1, 1);
        dy = clamp((pointer.y - (r.top + r.height * 0.45)) / (innerHeight * 0.45), -1, 1);
      } else {
        const k = reduce ? 0 : t;
        dx = Math.sin(k * 0.45) * 0.6;
        dy = Math.sin(k * 0.31 + 1) * 0.35;
      }
      const ease = 1 - Math.exp(-dt * 10);
      s.ex += (dx - s.ex) * ease;
      s.ey += (dy - s.ey) * ease;
      set("--ex", s.ex.toFixed(3));
      set("--ey", s.ey.toFixed(3));
      if (!reduce && t > s.blinkAt) { s.blinkStart = t; s.blinkAt = t + 2.4 + Math.random() * 3; }
      const b = (t - s.blinkStart) / 0.16;
      set("--blink", b >= 0 && b < 1 ? (Math.abs(b - 0.5) * 2).toFixed(2) : "1");
      const tilt = bot.querySelector(".bot-tilt");
      if (tilt && !reduce) tilt.style.transform = `translateY(${(Math.sin(t * 1.3) * 4).toFixed(2)}px) rotate(${(s.ex * 3).toFixed(2)}deg)`;
    });
    let timer = 0;
    const poke = () => {
      bot.classList.add("happy");
      clearTimeout(timer);
      timer = setTimeout(() => bot.classList.remove("happy"), 1200);
    };
    bot.addEventListener("pointerdown", poke);
    bot.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); poke(); } });
  }

  /* ---------- the app's chat: asks, uses a tool, answers, asks before acting ---------- */
  const hero = $("[data-hero]");
  scene(hero, async (sleep) => {
    const thread = $("[data-thread]", hero);
    const input = $("[data-input]", hero);
    const send = $(".w-send", hero);
    const notch = $("[data-notch]", hero);
    const preview = $("[data-preview]", hero);
    const setNotch = (html, cls = "") => { notch.className = `notch ${cls}`; notch.innerHTML = `<span class="nt">${html}</span>`; };
    const add = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); const el = t.content.firstElementChild; thread.appendChild(el); return el; };
    thread.classList.remove("fade");
    thread.textContent = "";
    setNotch("Ready");
    preview.textContent = "Finds answers in your docs";
    await sleep(500);

    const q = "Which tickets need me today?";
    input.classList.add("typed");
    input.textContent = "";
    for (const ch of q) { input.textContent += ch; await sleep(26); }
    send.classList.add("on");
    await sleep(240);
    input.classList.remove("typed");
    input.textContent = "Message Researcher";
    send.classList.remove("on");
    add(`<div class="m-me">${q}</div>`);

    let secs = 0;
    setNotch(`Researcher <span class="tm">0:00</span>`, "work");
    const clock = setInterval(() => { secs++; const tm = $(".tm", notch); if (tm) tm.textContent = `0:0${Math.min(9, secs)}`; }, 1000);
    preview.textContent = "Working…";
    await sleep(350);
    const ai = add(`<div class="m-ai"><div class="who">${face("researcher", 18, "thinking")}Researcher</div><div class="m-tool"><i></i>Tickets: search</div></div>`);
    await sleep(900);
    $(".m-tool", ai).classList.add("done");
    const p = document.createElement("p");
    ai.appendChild(p);
    for (const w of "Three need you today:".split(" ")) { p.textContent += (p.textContent ? " " : "") + w; await sleep(45); }
    const ol = document.createElement("ol");
    ai.appendChild(ol);
    for (const line of ["A refund over $200, waiting on your OK", "A login loop on Safari, marked urgent", "A data export request, due Friday"]) {
      const li = document.createElement("li");
      ol.appendChild(li);
      for (const w of line.split(" ")) { li.textContent += (li.textContent ? " " : "") + w; await sleep(32); }
    }
    await sleep(450);
    const ask = add(`<div class="m-ask"><div class="h">Researcher asks before acting</div><code>gh issue create --title "Login loop on Safari"</code><div class="row"><span class="b a">Allow once</span><span class="b">Deny</span></div></div>`);
    clearInterval(clock);
    setNotch("Asks you: open an issue", "ask");
    preview.textContent = "Asks before acting";
    await sleep(1400);
    $(".b.a", ask).classList.add("press");
    await sleep(170);
    ask.classList.add("done");
    $(".h", ask).textContent = "Allowed once";
    $(".row", ask).remove();
    await sleep(500);
    add(`<div class="m-ai"><p>Done: issue #482 is open and linked to the ticket.</p></div>`);
    setNotch("Done · issue #482", "ok");
    preview.textContent = "Done: issue #482 is open";
    await sleep(3400);
    thread.classList.add("fade");
    await sleep(380);
  }, () => {
    const thread = $("[data-thread]", hero);
    thread.innerHTML = `<div class="m-me">Which tickets need me today?</div><div class="m-ai"><div class="who">${face("researcher", 18, "happy")}Researcher</div><div class="m-tool done"><i></i>Tickets: search</div><p>Three need you today:</p><ol><li>A refund over $200, waiting on your OK</li><li>A login loop on Safari, marked urgent</li><li>A data export request, due Friday</li></ol></div>`;
  });

  /* ---------- switch models, not apps ---------- */
  const sw = $("[data-switcher]");
  if (sw) {
    const MODELS = [
      { key: "claude", name: "Claude", where: "Anthropic · cloud" },
      { key: "gemini", name: "Gemini", where: "Google · cloud" },
      { key: "meta", name: "Llama 3.3", where: "On this computer · Ollama" },
      { key: "qwen", name: "Qwen3", where: "On this computer · LM Studio" },
      { key: "deepseek", name: "DeepSeek", where: "DeepSeek · cloud" },
      { key: "mistral", name: "Mistral", where: "Mistral · cloud" },
    ].filter((m) => logo(m.key));
    const box = $(".sw-model", sw);
    const list = $("[data-sw-list]", sw);
    const keeps = $(".sw-keeps", sw);
    let at = 0;
    const show = (i, animate) => {
      at = i;
      const m = MODELS[i];
      $("[data-sw-logo]", sw).replaceChildren(logo(m.key));
      $("[data-sw-name]", sw).textContent = m.name;
      $("[data-sw-where]", sw).textContent = m.where;
      $$("span", list).forEach((s, n) => s.classList.toggle("on", n === i));
      if (animate) {
        box.classList.remove("swap");
        keeps.classList.remove("flash");
        void box.offsetWidth;
        box.classList.add("swap");
        keeps.classList.add("flash");
      }
    };
    MODELS.forEach((m, i) => {
      const s = document.createElement("span");
      s.appendChild(logo(m.key));
      s.title = m.name;
      s.addEventListener("click", () => show(i, true));
      list.appendChild(s);
    });
    show(0, false);
    scene(sw, async (sleep) => {
      await sleep(1900);
      show((at + 1) % MODELS.length, true);
    });
  }

  /* ---------- the harness: blocks arrive, wires draw, Compile writes the files ---------- */
  const board = $("[data-board]");
  if (board) {
    const stage = $("[data-stage]", board);
    const svg = $("[data-wires]", board);
    const files = $("[data-files]", board);
    const compile = $("[data-compile]", board);
    const node = (n) => $(`[data-n="${n}"]`, stage);
    const WIRES = [["m1", "a", "thinks with"], ["m2", "a", "falls back to"], ["a", "t1", "uses"], ["a", "t2", "uses"], ["a", "t3", "answers on"]];
    const labels = WIRES.map(([, , text]) => { const l = document.createElement("span"); l.className = "wl"; l.textContent = text; stage.appendChild(l); return l; });
    let paths = [];
    const layout = () => {
      const box = stage.getBoundingClientRect();
      svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
      const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height }; };
      svg.innerHTML = WIRES.map(([a, b], i) => {
        const A = node(a);
        const B = node(b);
        if (!A || !B || getComputedStyle(B).display === "none" || getComputedStyle(A).display === "none") return `<path data-i="${i}" d=""/>`;
        const ra = rect(A);
        const rb = rect(B);
        const side = rb.x > ra.x + ra.w * 0.5;
        let x1, y1, x2, y2, d;
        if (side) {
          x1 = ra.x + ra.w; y1 = ra.y + ra.h / 2; x2 = rb.x; y2 = rb.y + rb.h / 2;
          const c = Math.max(30, (x2 - x1) / 2);
          d = `M${x1} ${y1} C${x1 + c} ${y1} ${x2 - c} ${y2} ${x2} ${y2}`;
        } else {
          // Stacked (narrow screens): bottom of one into the top of the other.
          const down = rb.y > ra.y;
          x1 = ra.x + ra.w / 2; y1 = down ? ra.y + ra.h : ra.y; x2 = rb.x + rb.w / 2; y2 = down ? rb.y : rb.y + rb.h;
          const c = Math.max(24, Math.abs(y2 - y1) / 2);
          d = `M${x1} ${y1} C${x1} ${y1 + (down ? c : -c)} ${x2} ${y2 - (down ? c : -c)} ${x2} ${y2}`;
        }
        labels[i].style.left = `${(x1 + x2) / 2}px`;
        labels[i].style.top = `${(y1 + y2) / 2}px`;
        return `<path data-i="${i}" d="${d}"/>`;
      }).join("");
      paths = $$("path", svg);
      for (const p of paths) {
        const len = p.getTotalLength ? Math.ceil(p.getTotalLength()) : 400;
        p.style.strokeDasharray = `${len}`;
        p.style.strokeDashoffset = p.dataset.on ? "0" : `${len}`;
      }
    };
    const wire = (i, on) => {
      const p = paths[i];
      if (!p) return;
      p.dataset.on = on ? "1" : "";
      p.style.strokeDashoffset = on ? "0" : p.style.strokeDasharray;
      labels[i].classList.toggle("on", on && !!p.getAttribute("d"));
    };
    addEventListener("resize", () => { layout(); paths.forEach((p, i) => wire(i, !!p.dataset.on)); });
    const order = ["a", "m1", "m2", "t1", "t2", "t3"];
    const reset = () => {
      $$(".bn", stage).forEach((n) => n.classList.remove("on", "hot"));
      files.classList.remove("on");
      layout();
      WIRES.forEach((_, i) => wire(i, false));
    };
    scene(board, async (sleep) => {
      reset();
      await sleep(300);
      for (const n of order) { node(n).classList.add("on"); await sleep(170); }
      await sleep(250);
      layout();
      for (let i = 0; i < WIRES.length; i++) { wire(i, true); await sleep(260); }
      await sleep(500);
      node("a").classList.add("hot");
      paths.forEach((p) => p.classList.add("hot"));
      await sleep(600);
      compile.classList.add("press");
      await sleep(160);
      compile.classList.remove("press");
      files.classList.add("on");
      await sleep(3600);
      paths.forEach((p) => p.classList.remove("hot"));
      files.classList.remove("on");
      await sleep(500);
    }, () => {
      $$(".bn", stage).forEach((n) => n.classList.add("on"));
      layout();
      WIRES.forEach((_, i) => wire(i, true));
    });
  }

  /* ---------- asks before it acts ---------- */
  const approve = $("[data-approve]");
  scene(approve, async (sleep) => {
    approve.classList.remove("done");
    await sleep(1800);
    const allow = $("[data-allow]", approve);
    allow.classList.add("press");
    await sleep(170);
    allow.classList.remove("press");
    approve.classList.add("done");
    await sleep(2600);
  }, () => approve.classList.add("done"));

  /* ---------- until done: each round is checked, the last one passes ---------- */
  const goal = $("[data-goal]");
  scene(goal, async (sleep) => {
    const rounds = $$(".gl-round", goal);
    const state = $("[data-gl-state]", goal);
    goal.classList.toggle("done", false);
    rounds.forEach((r) => { r.classList.toggle("on", false); r.classList.toggle("judged", false); });
    state.textContent = "Working";
    await sleep(600);
    for (const r of rounds) {
      r.classList.add("on");
      state.textContent = "Working";
      await sleep(1000);
      state.textContent = "Checking";
      await sleep(700);
      r.classList.add("judged");
      await sleep(500);
    }
    goal.classList.add("done");
    state.textContent = "Ready for review";
    await sleep(3200);
  }, () => {
    $$(".gl-round", goal).forEach((r) => r.classList.add("on", "judged"));
    goal.classList.add("done");
    $("[data-gl-state]", goal).textContent = "Ready for review";
  });

  /* ---------- asks before it guesses ---------- */
  const ask = $("[data-ask]");
  scene(ask, async (sleep) => {
    ask.classList.toggle("done", false);
    await sleep(2000);
    const pick = $("[data-pick]", ask);
    pick.classList.add("press");
    await sleep(170);
    pick.classList.toggle("press", false);
    ask.classList.add("done");
    await sleep(2800);
  }, () => ask.classList.add("done"));

  /* ---------- a model of your own: the good work, training, ready ---------- */
  const train = $("[data-train]");
  scene(train, async (sleep) => {
    train.classList.toggle("trained", false);
    train.classList.toggle("ready", false);
    await sleep(1000);
    train.classList.add("trained");
    await sleep(1900);
    train.classList.add("ready");
    await sleep(3200);
  }, () => train.classList.add("trained", "ready"));

  /* ---------- ⌘K ---------- */
  const palette = $("[data-palette]");
  scene(palette, async (sleep) => {
    const q = $("[data-pl-q]", palette);
    const rows = $$(".pl-row", palette);
    for (const word of ["ask res", "ask wri", "new"]) {
      q.textContent = "";
      for (const ch of word) { q.textContent += ch; await sleep(70); }
      const pick = word.startsWith("ask r") ? 0 : word.startsWith("ask w") ? 1 : 2;
      rows.forEach((r, i) => r.classList.toggle("on", i === pick));
      await sleep(1300);
    }
  }, () => { $("[data-pl-q]", palette).textContent = "ask res"; });

  /* ---------- the terminal: the same setup, without McBot ---------- */
  const term = $("[data-term]");
  scene(term, async (sleep) => {
    const out = $("[data-typed]", term);
    for (const line of ["What did we decide about refunds?", "Summarise this week's tickets"]) {
      out.textContent = "";
      for (const ch of line) { out.textContent += ch; await sleep(34); }
      await sleep(1600);
    }
  }, () => { $("[data-typed]", term).textContent = "What did we decide about refunds?"; });

  /* ---------- skills: count up once ---------- */
  const count = $("[data-count]");
  if (count && !reduce) {
    const to = Number(count.dataset.count);
    new IntersectionObserver(([e], o) => {
      if (!e.isIntersecting) return;
      o.disconnect();
      const t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / 900);
        count.textContent = String(Math.round(to * (1 - (1 - k) ** 3)));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, { threshold: 0.5 }).observe(count);
  }

  /* ---------- the crew along the footer's edge: big, cut off by its line; touched, they rise and smile ---------- */
  const crew = $("[data-crew]");
  if (crew && F) {
    const CAST = [["fries", 6], ["cup", 2], ["cone", 9], ["burger", 8], ["pizza", 7], ["donut", 3], ["onigiri", 4], ["cookie", 1]];
    const size = matchMedia("(max-width: 700px)").matches ? 118 : 196;
    CAST.forEach(([food, tone], i) => {
      const el = document.createElement("span");
      el.style.setProperty("--delay", `${(-i * 0.4).toFixed(2)}s`);
      const render = (exp) => { el.innerHTML = F.foodSvg({ seed: food, food, tone, size, expression: exp, uid: `crew${i}`, title: "" }); };
      render("idle");
      let timer = 0;
      el.addEventListener("pointerenter", () => { render("happy"); clearTimeout(timer); });
      el.addEventListener("pointerleave", () => { timer = setTimeout(() => render("idle"), 700); });
      crew.appendChild(el);
    });
  }

  /* ---------- the menu bar: menus open on hover (a mouse) or a click (touch, keyboard); the burger on phones ---------- */
  const navEl = $("[data-nav]");
  const drops = $$("[data-drop]");
  const setOpen = (d, on) => { d.classList.toggle("open", on); $("button", d)?.setAttribute("aria-expanded", String(on)); };
  const closeDrops = (except) => drops.forEach((d) => { if (d !== except) setOpen(d, false); });
  const fine = matchMedia("(hover: hover) and (min-width: 1001px)");
  drops.forEach((d) => {
    const btn = $("button", d);
    let t = 0;
    btn.addEventListener("click", (e) => { e.stopPropagation(); const on = !d.classList.contains("open"); closeDrops(d); setOpen(d, on); });
    d.addEventListener("pointerenter", () => { if (!fine.matches) return; clearTimeout(t); closeDrops(d); setOpen(d, true); });
    d.addEventListener("pointerleave", () => { if (!fine.matches) return; t = setTimeout(() => setOpen(d, false), 160); });
    $$("a", d).forEach((a) => a.addEventListener("click", () => { setOpen(d, false); navEl?.classList.toggle("open", false); }));
  });
  document.addEventListener("click", (e) => { if (!e.target.closest?.("[data-drop]")) closeDrops(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeDrops(); navEl?.classList.toggle("open", false); } });
  const burger = $("[data-burger]");
  burger?.addEventListener("click", () => { const on = !navEl.classList.contains("open"); navEl.classList.toggle("open", on); burger.setAttribute("aria-expanded", String(on)); });
  $$(".nav-menu > a").forEach((a) => a.addEventListener("click", () => navEl?.classList.toggle("open", false)));

  /* ---------- liquid metal: the light follows the pointer, and brightens as it comes near ---------- */
  const metals = $$("[data-metal]");
  if (metals.length && !reduce) {
    addEventListener("pointermove", (e) => {
      for (const m of metals) {
        const r = m.getBoundingClientRect();
        m.style.setProperty("--mx", `${e.clientX - r.left}px`);
        m.style.setProperty("--my", `${e.clientY - r.top}px`);
        const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right), dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
        m.classList.toggle("near", Math.hypot(dx, dy) < 90);
      }
    }, { passive: true });
    // Under the pointer the light runs faster from where it is (a new duration would make it jump).
    const flow = (m) => (m.getAnimations ? m.getAnimations({ subtree: true }) : []).filter((a) => a.animationName === "metal-spin");
    for (const m of metals) {
      m.addEventListener("pointerenter", () => flow(m).forEach((a) => a.updatePlaybackRate?.(2.8)));
      m.addEventListener("pointerleave", () => flow(m).forEach((a) => a.updatePlaybackRate?.(1)));
    }
  }

  /* ---------- the split download button ---------- */
  const split = $("[data-split]");
  if (split) {
    const more = $(".split-more", split);
    const menu = $(".split-menu", split);
    const set = (open) => { menu.hidden = !open; more.setAttribute("aria-expanded", String(open)); };
    more.addEventListener("click", (e) => { e.stopPropagation(); set(menu.hidden); });
    document.addEventListener("click", (e) => { if (!split.contains(e.target)) set(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") set(false); });
    $$("a", menu).forEach((a) => a.addEventListener("click", () => set(false)));
  }

  /* ---------- copy the install command ---------- */
  $$("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
    const text = b.parentElement?.querySelector("code")?.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text);
      b.textContent = "Copied";
      setTimeout(() => { b.textContent = "Copy"; }, 1500);
    } catch {
      /* select it by hand */
    }
  }));

  /* ---------- downloads: the newest release's installers, your computer first ---------- */
  const REPO = "McBot-Studio/mcbot.studio";
  const ua = navigator.userAgent;
  const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
  const mobile = /iPhone|iPad|iPod|Android/i.test(ua) || (/Mac/.test(platform) && navigator.maxTouchPoints > 1);
  const os = mobile ? "mobile" : /Win/i.test(platform) ? "windows" : /Mac/i.test(platform) ? "mac" : /Linux/i.test(platform) ? "linux" : "mac";
  const NAMES = { mac: "macOS", windows: "Windows", linux: "Linux" };
  // Tauri's default bundle names.
  const KINDS = {
    mac: [[/_aarch64\.dmg$/i, "Apple silicon", ".dmg"], [/_x64\.dmg$/i, "Intel", ".dmg"], [/_universal\.dmg$/i, "Universal", ".dmg"]],
    windows: [[/_x64-setup\.exe$/i, "Installer", ".exe"], [/_x64_[a-z-]+\.msi$/i, "Installer", ".msi"]],
    linux: [[/\.AppImage$/i, "AppImage", "x86_64"], [/_amd64\.deb$/i, "Debian, Ubuntu", ".deb"]],
  };
  const card = (k) => $(`.os[data-os="${k}"]`);
  card(os)?.classList.add("current");
  const render = (release) => {
    const assets = release ? release.assets || [] : [];
    const found = {};
    for (const k of Object.keys(KINDS)) {
      const box = card(k)?.querySelector("[data-links]");
      if (!box) continue;
      box.textContent = "";
      found[k] = [];
      for (const [re, label, kind] of KINDS[k]) {
        const a = assets.find((x) => re.test(x.name));
        if (!a) continue;
        found[k].push(a.browser_download_url);
        const b = document.createElement("a");
        b.className = `btn${k === os && found[k].length === 1 ? " primary" : ""}`;
        b.href = a.browser_download_url;
        b.innerHTML = `${label} <span>${kind}</span>`;
        box.appendChild(b);
      }
      if (!found[k].length) { const s = document.createElement("span"); s.className = "soon"; s.textContent = "Coming soon"; box.appendChild(s); }
    }
    const label = $("[data-dl-label]");
    const primary = $("[data-dl-primary]");
    if (label) label.textContent = os === "mobile" ? "Download for desktop" : `Download for ${NAMES[os]}`;
    if (primary && os !== "mobile" && found[os] && found[os].length) primary.href = found[os][0];
  };
  render(null);
  fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } })
    .then((r) => (r.ok ? r.json() : null))
    .then((rel) => { if (rel && rel.assets) render(rel); })
    .catch(() => { /* offline or blocked: the cards keep "Coming soon" */ });
})();

/* ---------- AI cursors: three of the team at work on the hero, as on the app's shared board. Each
   walks to a real element, selects, hovers, clicks or leaves a note, then moves on. Desktop only,
   only while the hero is on screen; reduced motion shows none. ---------- */
(() => {
  const layer = document.querySelector("[data-ai]");
  const F = window.McBotFoods;
  if (!layer || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const stage = layer.parentElement;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const arrow = (c) => `<svg class="arrow" width="20" height="22" viewBox="0 0 20 22"><path d="M2 1.5 17.5 11l-7 1.4-3.6 6.6z" fill="${c}" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  const TEAM = [
    { name: "Researcher", c: "#7c5cff" },
    { name: "Writer", c: "#ff7a45" },
    { name: "Designer", c: "#1fb57a" },
  ];
  const q = (s) => stage.querySelector(s);
  // What each one does, over and over: [target, action, words]
  const PLANS = [
    [[".hero-title", "select", "Reading the headline"], [".hero-win .w-thread", "note", "Found 3 sources"], ["[data-demo]", "hover", "Trying the demo"], [".hero-meta", "note", "Checked: free, MIT"]],
    [[".hero-lede", "select", "Drafting a reply…"], [".hero-win .w-compose", "click", "Typing in chat"], [".hero-title", "note", "Shorter? Keeping it."]],
    [["[data-dl-primary]", "hover", "Polishing the button"], ["[data-dl-primary]", "click", ""], [".bot", "note", "Logo looks great"], [".hero-win .win-bar", "select", "Aligning the window"]],
  ];
  const cursors = TEAM.map((m, i) => {
    const el = document.createElement("div");
    el.className = "aic";
    el.style.setProperty("--c", m.c);
    const face = F ? F.foodSvg({ seed: `agent:${m.name}`, size: 18, expression: "happy", uid: `aic${i}`, title: "" }) : "";
    el.innerHTML = `${arrow(m.c)}<span class="ping"></span><span class="tag">${face}${m.name}</span><span class="say"></span>`;
    layer.appendChild(el);
    return { el, plan: PLANS[i], x: 0, y: 0 };
  });
  let live = false;
  // Phones and narrow windows get no cursors (the layer is hidden there too).
  const narrow = matchMedia("(max-width: 900px)");
  new IntersectionObserver(([e]) => { live = e.isIntersecting; }, { threshold: 0.15 }).observe(stage);

  const at = (sel) => {
    const t = q(sel);
    if (!t) return null;
    const r = t.getBoundingClientRect(), s = stage.getBoundingClientRect();
    if (!r.width) return null;
    return { t, x: r.left - s.left + r.width * (0.3 + Math.random() * 0.4), y: r.top - s.top + Math.min(r.height * (0.35 + Math.random() * 0.3), 140) };
  };
  const move = (c, x, y) => {
    const d = Math.hypot(x - c.x, y - c.y);
    const t = Math.min(1.6, 0.5 + d / 900);
    c.el.style.setProperty("--t", `${t}s`);
    c.el.style.setProperty("--x", `${x}px`);
    c.el.style.setProperty("--y", `${y}px`);
    c.x = x; c.y = y;
    return sleep(t * 1000 + 120);
  };
  const say = async (c, text, ms) => {
    if (!text) { await sleep(500); return; }
    c.el.querySelector(".say").textContent = text;
    c.el.classList.toggle("saying", true);
    await sleep(ms);
    c.el.classList.toggle("saying", false);
  };
  async function run(c, i) {
    const s = stage.getBoundingClientRect();
    c.x = i % 2 ? s.width + 40 : -40;
    c.y = 200 + i * 120;
    c.el.style.setProperty("--t", "0s");
    c.el.style.setProperty("--x", `${c.x}px`);
    c.el.style.setProperty("--y", `${c.y}px`);
    await sleep(900 + i * 1300);
    for (let n = 0; ; n++) {
      if (!live || document.hidden || narrow.matches) { await sleep(800); continue; }
      const [sel, act, text] = c.plan[n % c.plan.length];
      const p = at(sel);
      if (!p) { await sleep(600); continue; }
      await move(c, p.x, p.y);
      p.t.style.setProperty("--c", TEAM[i].c);
      if (act === "select" || act === "hover") {
        const cls = act === "select" ? "ai-sel" : "ai-hover";
        p.t.classList.toggle(cls, true);
        await say(c, text, act === "select" ? 1700 : 1200);
        p.t.classList.toggle(cls, false);
      } else if (act === "click") {
        c.el.classList.toggle("click", false);
        void c.el.offsetWidth;
        c.el.classList.toggle("click", true);
        await say(c, text, 1100);
      } else await say(c, text, 1700);
      await sleep(500 + Math.random() * 900);
    }
  }
  cursors.forEach((c, i) => void run(c, i));
})();

/* ---------- You and McBot: a ring shows the page sees your cursor, and McBot's own cursor follows a
   beat behind, says hello now and then and, once a visit, flies to GitHub and brings you a star to
   give. Desktop with a mouse only; elsewhere, and with reduced motion, the star is a quiet note. The
   star count shows beside GitHub once there are enough stars to show. ---------- */
(() => {
  const REPO = "McBot-Studio/mcbot.studio";
  const REPO_URL = `https://github.com/${REPO}`;
  const KEY = "mcbot.star";
  const DAY = 864e5;
  const $ = (s, r = document) => r.querySelector(s);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const STAR = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9z"/></svg>';

  /* what this visitor said before: "done" (starred), or "later:<time>" (ask again after it) */
  const store = {
    get() { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } },
    set(v) { try { localStorage.setItem(KEY, v); } catch { /* a private window: ask once per visit */ } },
  };
  const askable = () => {
    const v = store.get();
    if (v === "done") return false;
    return !v.startsWith("later:") || Date.now() > Number(v.slice(6));
  };
  const later = (days) => { if (store.get() !== "done") store.set(`later:${Date.now() + days * DAY}`); };
  // Whoever opens the repository has seen its star button: no reminder for a week.
  document.addEventListener("click", (e) => {
    const a = e.target.closest?.("a[href]");
    if (a && a.href.startsWith(REPO_URL) && !a.hasAttribute("data-star-go") && !a.href.includes("/releases/download/")) later(7);
  });

  /* the star count beside "GitHub" */
  const SHOW_FROM = 50;
  const showStars = (n) => {
    if (!(n >= SHOW_FROM)) return;
    const t = n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}k` : String(n);
    document.querySelectorAll("[data-stars]").forEach((el) => { const b = el.querySelector("b"); if (b) b.textContent = t; el.hidden = false; });
  };
  let cached = null;
  try { cached = JSON.parse(sessionStorage.getItem("mcbot.stars") || "null"); } catch { cached = null; }
  if (cached && Date.now() - cached.at < 36e5) showStars(cached.n);
  else {
    fetch(`https://api.github.com/repos/${REPO}`, { headers: { Accept: "application/vnd.github+json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || typeof d.stargazers_count !== "number") return;
        showStars(d.stargazers_count);
        try { sessionStorage.setItem("mcbot.stars", JSON.stringify({ n: d.stargazers_count, at: Date.now() })); } catch { /* fine */ }
      })
      .catch(() => { /* offline: no count */ });
  }

  /* the star card: brought by McBot on a desktop, a quiet note at the bottom elsewhere */
  const card = document.createElement("aside");
  card.className = "star-card";
  card.setAttribute("aria-label", "Star McBot Studio on GitHub");
  card.hidden = true;
  card.innerHTML = `<span class="st-star">${STAR}</span><span class="st-t"><b>Enjoying McBot Studio?</b><small>A star on GitHub helps other people find it.</small></span><span class="st-btns"><a class="btn sm light" href="${REPO_URL}" target="_blank" rel="noopener" data-star-go>${STAR}Star on GitHub</a><button class="btn sm ghost" type="button" data-star-later>Not now</button></span>`;
  document.body.appendChild(card);
  let onAnswer = () => {};
  const hideCard = () => {
    card.classList.toggle("on", false);
    setTimeout(() => { if (!card.classList.contains("on")) card.hidden = true; }, 260);
  };
  const showCard = () => {
    card.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.toggle("on", true)));
  };
  $("[data-star-go]", card).addEventListener("click", () => { store.set("done"); hideCard(); onAnswer("thanks"); });
  $("[data-star-later]", card).addEventListener("click", () => { later(7); hideCard(); onAnswer("later"); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !card.hidden) { later(7); hideCard(); onAnswer("later"); } });

  // When is someone ready to be asked? A while on the page and a good look around.
  const born = performance.now();
  let seenTo = 0;
  const measure = () => { seenTo = Math.max(seenTo, (scrollY + innerHeight) / Math.max(1, document.documentElement.scrollHeight)); };
  addEventListener("scroll", measure, { passive: true });
  measure();
  const lookedAround = (ms, share) => performance.now() - born > ms && seenTo > share && !document.hidden;

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mouse = matchMedia("(hover: hover) and (pointer: fine) and (min-width: 900px)").matches;
  if (reduce || !mouse) {
    const iv = setInterval(() => {
      if (!askable()) { clearInterval(iv); return; }
      if (!lookedAround(40000, 0.45)) return;
      clearInterval(iv);
      card.classList.toggle("toast", true);
      showCard();
    }, 2000);
    return;
  }

  /* ----- the ring and McBot's cursor ----- */
  const layer = document.createElement("div");
  layer.className = "buddy-layer";
  layer.setAttribute("aria-hidden", "true");
  layer.innerHTML = `<div class="you-ring"></div><div class="buddy"><div class="buddy-in"><svg class="arrow" width="20" height="22" viewBox="0 0 20 22"><path d="M2 1.5 17.5 11l-7 1.4-3.6 6.6z" fill="#f5f5f7" stroke="#0b0b0c" stroke-width="1.6" stroke-linejoin="round"/></svg><span class="ping"></span><span class="carry">${STAR}</span><span class="tag"><img src="assets/logo.svg" width="17" height="17" alt="">McBot</span><span class="say"></span></div></div>`;
  document.body.appendChild(layer);
  const ring = $(".you-ring", layer);
  const buddy = $(".buddy", layer);
  const bubble = $(".say", layer);

  const S = { px: 0, py: 0, has: false, movedAt: -1e9, rx: 0, ry: 0, bx: 0, by: 0, vx: 0, tilt: 0, mode: "follow", fly: null };
  let raf = 0;
  let last = 0;
  const frame = (t) => {
    const dt = clamp((t - last) / 1000, 0.001, 0.05);
    last = t;
    // The ring hugs the cursor; McBot follows a beat behind, a little below and to the right.
    const kr = 1 - Math.exp(-dt * 28);
    S.rx += (S.px - S.rx) * kr;
    S.ry += (S.py - S.ry) * kr;
    let busy = Math.abs(S.px - S.rx) + Math.abs(S.py - S.ry) > 0.2;
    const ox = S.bx;
    if (S.fly) { S.fly(t); busy = true; }
    else if (S.mode === "follow") {
      const kb = 1 - Math.exp(-dt * 3.2);
      const tx = S.px + 26, ty = S.py + 24;
      S.bx += (tx - S.bx) * kb;
      S.by += (ty - S.by) * kb;
      busy ||= Math.abs(tx - S.bx) + Math.abs(ty - S.by) > 0.3;
    }
    S.vx = (S.bx - ox) / dt;
    // It leans into the way it moves.
    const lean = clamp(S.vx * 0.012, -12, 12);
    S.tilt += (lean - S.tilt) * (1 - Math.exp(-dt * 9));
    busy ||= Math.abs(S.tilt) > 0.05;
    ring.style.transform = `translate3d(${S.rx.toFixed(1)}px, ${S.ry.toFixed(1)}px, 0)`;
    buddy.style.transform = `translate3d(${S.bx.toFixed(1)}px, ${S.by.toFixed(1)}px, 0) rotate(${S.tilt.toFixed(2)}deg)`;
    raf = busy ? requestAnimationFrame(frame) : 0;
  };
  const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };

  /** Flies McBot to a target (a function, so it can follow something that moves) along a curve. */
  const fly = (to, ms) => new Promise((done) => {
    const from = { x: S.bx, y: S.by };
    const end = to();
    const c = { x: (from.x + end.x) / 2 + (end.y - from.y) * 0.28, y: (from.y + end.y) / 2 - (end.x - from.x) * 0.28 };
    const t0 = performance.now();
    S.fly = (t) => {
      const k = clamp((t - t0) / ms, 0, 1);
      const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      const T = to();
      S.bx = (1 - e) * (1 - e) * from.x + 2 * (1 - e) * e * c.x + e * e * T.x;
      S.by = (1 - e) * (1 - e) * from.y + 2 * (1 - e) * e * c.y + e * e * T.y;
      if (k >= 1) { S.fly = null; done(); }
    };
    kick();
  });

  /* what McBot says: each line once, never two close together */
  const said = new Set();
  let quietUntil = 0;
  let sayTimer = 0;
  const say = (key, text, ms = 2400, force = false) => {
    const now = performance.now();
    if (!force && (said.has(key) || now < quietUntil || S.mode !== "follow")) return;
    said.add(key);
    quietUntil = now + ms + 5000;
    bubble.textContent = text;
    buddy.classList.toggle("saying", true);
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => buddy.classList.toggle("saying", false), ms);
  };
  const LINES = [
    ["[data-bot]", "bot", "That's me, in glass."],
    ["[data-dl-primary], .os .btn, .closing a[href='#download']", "dl", "Good choice."],
    ["[data-demo]", "demo", "Try me right here."],
    ["[data-gh]", "gh", "A star helps a lot."],
    ["[data-crew]", "crew", "My friends."],
  ];

  addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    S.px = e.clientX;
    S.py = e.clientY;
    S.movedAt = performance.now();
    if (!S.has) {
      S.has = true;
      S.rx = S.px; S.ry = S.py;
      // McBot drops in from the top of the window to meet you.
      S.bx = clamp(S.px + 160, 40, innerWidth - 40);
      S.by = -40;
      layer.classList.toggle("on", true);
      setTimeout(() => say("hi", "Hi, I'm McBot. I'll tag along.", 2800), 900);
    }
    layer.classList.toggle("away", false);
    kick();
  }, { passive: true });
  document.addEventListener("mouseout", (e) => { if (!e.relatedTarget) layer.classList.toggle("away", true); });
  addEventListener("blur", () => layer.classList.toggle("away", true));
  addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") ring.classList.toggle("down", true); });
  addEventListener("pointerup", () => ring.classList.toggle("down", false));
  document.addEventListener("pointerover", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    ring.classList.toggle("over", !!t.closest("a, button, summary, [role='button'], [data-bot], .star-card"));
    // Over a menu McBot steps back, so it never covers what you are choosing.
    buddy.classList.toggle("shy", !!t.closest(".drop, .split-menu, .nav-menu, .star-card"));
    for (const [sel, key, text] of LINES) if (t.closest(sel)) { say(key, text); break; }
  });

  /* ----- the star: McBot flies to the GitHub button, takes a star and brings it to you ----- */
  const gh = $(".nav-end [data-gh]");
  const ghSpot = () => { const r = gh.getBoundingClientRect(); return { x: r.left + r.width * 0.55, y: r.top + r.height * 0.6 }; };
  const ghShown = () => !!gh && gh.getBoundingClientRect().width > 0;
  const press = () => { buddy.classList.toggle("click", false); void buddy.offsetWidth; buddy.classList.toggle("click", true); };
  let idle = 0;
  // Close to you, with room for the card below McBot.
  const nearYou = () => {
    const w = card.offsetWidth || 340, h = card.offsetHeight || 130;
    return { x: clamp(S.px + 30, 16, innerWidth - w - 16), y: clamp(S.py + 26, 80, innerHeight - h - 76) };
  };
  const placeCard = () => {
    const w = card.offsetWidth, h = card.offsetHeight;
    card.style.left = `${clamp(S.bx + 2, 16, innerWidth - w - 16)}px`;
    card.style.top = `${clamp(S.by + 54, 16, innerHeight - h - 16)}px`;
  };
  const putBack = async () => {
    if (card.hidden || S.mode !== "park") return;
    later(2);
    hideCard();
    S.mode = "busy";
    buddy.classList.toggle("parked", false);
    if (ghShown()) {
      await fly(ghSpot, 900);
      press();
      buddy.classList.toggle("carrying", false);
      gh.classList.toggle("starred", true);
      await wait(350);
    } else buddy.classList.toggle("carrying", false);
    S.mode = "follow";
    kick();
  };
  onAnswer = (kind) => {
    clearTimeout(idle);
    buddy.classList.toggle("parked", false);
    buddy.classList.toggle("carrying", false);
    if (kind === "thanks") gh?.classList.toggle("starred", true);
    S.mode = "follow";
    kick();
    say(kind, kind === "thanks" ? "Thank you! That means a lot." : "No worries.", 2400, true);
  };
  card.addEventListener("pointerenter", () => clearTimeout(idle));
  card.addEventListener("pointerleave", () => { clearTimeout(idle); idle = setTimeout(putBack, 9000); });

  const deliver = async () => {
    S.mode = "busy";
    if (ghShown()) {
      say("fetch", "Wait, I've got something for you.", 1500, true);
      await wait(1100);
      await fly(ghSpot, 950);
      gh.classList.toggle("gh-pick", true);
      press();
      await wait(320);
      buddy.classList.toggle("carrying", true);
      await wait(480);
      gh.classList.toggle("gh-pick", false);
    } else {
      buddy.classList.toggle("carrying", true);
    }
    await fly(nearYou, 1000);
    S.mode = "park";
    buddy.classList.toggle("parked", true);
    card.hidden = false;
    placeCard();
    showCard();
    idle = setTimeout(putBack, 16000);
  };
  const iv = setInterval(() => {
    if (!askable()) { clearInterval(iv); return; }
    const ready = lookedAround(35000, 0.4) && S.has && S.mode === "follow" && !S.fly
      && performance.now() - S.movedAt < 4000 && !layer.classList.contains("away")
      && !document.querySelector(".nav-item.open, .nav.open, .split-menu:not([hidden])");
    if (!ready) return;
    clearInterval(iv);
    void deliver();
  }, 1500);
})();
