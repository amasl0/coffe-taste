/**
 * Лендинг MVP: квиз + A/B заголовка + трекинг + отправка в Google Sheets (Apps Script Web App).
 *
 * Что нужно заменить:
 * 1) GA4 ID в index.html (G-XXXXXXXXXX)
 * 2) Yandex Metrika COUNTER_ID в index.html
 * 3) SHEETS_WEBAPP_URL ниже (URL деплоя Apps Script Web App)
 */

const CONFIG = {
  SHEETS_WEBAPP_URL: "https://script.google.com/macros/s/PASTE_YOUR_WEB_APP_URL/exec",
  AB: {
    key: "ab_variant_v1",
    variants: {
      A: {
        title: "Подберём кофе, который вам точно понравится — с первого раза",
        badge: "A/B: variant A (ценность: уверенность)",
      },
      B: {
        title: "Не ошибитесь с кофе: подберём вкус, который точно зайдёт",
        badge: "A/B: variant B (ценность: экономия/без ошибки)",
      }
    }
  }
};

// --------- Utils: tracking ----------
function track(event, params = {}) {
  // GA4 (gtag)
  if (typeof window.gtag === "function") {
    window.gtag("event", event, params);
  }
  // Yandex Metrika
  if (typeof window.ym === "function") {
    try {
      // если COUNTER_ID не заменили, вызов упадёт — это ок, ловим
      window.ym(COUNTER_ID, "reachGoal", event, params);
    } catch (e) {}
  }

  // Debug to console (можешь убрать)
  // console.log("[track]", event, params);
}

function getOrAssignAbVariant() {
  const stored = localStorage.getItem(CONFIG.AB.key);
  if (stored === "A" || stored === "B") return stored;

  // 50/50
  const v = Math.random() < 0.5 ? "A" : "B";
  localStorage.setItem(CONFIG.AB.key, v);
  return v;
}

function applyAbVariant() {
  const v = getOrAssignAbVariant();
  const heroTitle = document.getElementById("hero-title");
  const abBadge = document.getElementById("ab-badge");

  heroTitle.textContent = CONFIG.AB.variants[v].title;
  abBadge.textContent = CONFIG.AB.variants[v].badge;

  track("ab_assigned", { variant: v });
  return v;
}

// --------- Smooth scroll + CTR metrics ----------
function setupScrollButtons() {
  document.querySelectorAll("[data-scrollto]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const target = btn.getAttribute("data-scrollto");
      const el = document.querySelector(target);
      if (!el) return;

      const ev = btn.getAttribute("data-track");
      if (ev) track(ev, { ab: localStorage.getItem(CONFIG.AB.key) || "" });

      el.scrollIntoView({ behavior: "smooth", block: "start" });
      // CTR to quiz as primary metric
      if (target === "#quiz") track("ctr_to_quiz", { source: ev || "unknown" });
    });
  });
}

// --------- Scroll depth tracking ----------
function setupScrollDepth() {
  const thresholds = [25, 50, 75, 90];
  const fired = new Set();

  function onScroll() {
    const doc = document.documentElement;
    const scrollTop = doc.scrollTop || document.body.scrollTop;
    const scrollHeight = doc.scrollHeight - doc.clientHeight;
    if (scrollHeight <= 0) return;
    const pct = Math.round((scrollTop / scrollHeight) * 100);

    thresholds.forEach(t => {
      if (pct >= t && !fired.has(t)) {
        fired.add(t);
        track("scroll_depth", { percent: t });
      }
    });
  }

  window.addEventListener("scroll", throttle(onScroll, 400), { passive: true });
}

function throttle(fn, wait) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= wait) {
      last = now;
      fn(...args);
    }
  };
}

// --------- Quiz logic ----------
const QUIZ = [
  {
    id: "taste_profile",
    title: "Какой вкус вам ближе?",
    hint: "Выберите то, что звучит вкуснее всего.",
    type: "single",
    options: [
      { value: "chocolate_nut", title: "Шоколад / орех", desc: "Плотно, сладко, «кофейно»" },
      { value: "caramel",       title: "Карамель / печенье", desc: "Мягко, сладко, без резкости" },
      { value: "fruity",        title: "Фрукты / ягоды", desc: "Ярко, с кислотностью" },
      { value: "balanced",      title: "Сбалансированный", desc: "Ни кислый, ни горький" },
    ]
  },
  {
    id: "milk",
    title: "Пьёте кофе с молоком?",
    hint: "Это влияет на выбор обжарки и плотности вкуса.",
    type: "single",
    options: [
      { value: "often", title: "Да, часто", desc: "Капучино/латте — мой выбор" },
      { value: "sometimes", title: "Иногда", desc: "Зависит от настроения" },
      { value: "never", title: "Нет", desc: "Пью чёрный" },
      { value: "both", title: "И так, и так", desc: "Хочу универсальный вариант" },
    ]
  },
  {
    id: "brew_method",
    title: "Как вы готовите кофе дома?",
    hint: "Подберём помол/профиль под способ приготовления.",
    type: "single",
    options: [
      { value: "turka", title: "Турка", desc: "Классика, плотный вкус" },
      { value: "espresso", title: "Эспрессо / кофемашина", desc: "Интенсивно, крема, бодрит" },
      { value: "filter", title: "Фильтр / V60 / капельная", desc: "Чище вкус, мягче тело" },
      { value: "moka", title: "Гейзер (Moka)", desc: "Похоже на эспрессо, но мягче" },
    ]
  },
  {
    id: "avoid",
    title: "Что точно НЕ хотите?",
    hint: "Так мы уберём риск ошибки.",
    type: "single",
    options: [
      { value: "too_acidic", title: "Слишком кислый", desc: "Боюсь «лимона» во вкусе" },
      { value: "too_bitter", title: "Слишком горький", desc: "Не хочу жжёный привкус" },
      { value: "watery", title: "Слишком водянистый", desc: "Хочу плотнее и насыщеннее" },
      { value: "no_preference", title: "Нет такого", desc: "Главное — чтобы понравилось" },
    ]
  },
  {
    id: "boost",
    title: "Нужен ли яркий бодрящий эффект?",
    hint: "Подберём более интенсивный профиль или более мягкий.",
    type: "single",
    options: [
      { value: "strong", title: "Да, хочу бодрее", desc: "Утро/работа/фокус" },
      { value: "normal", title: "Обычный", desc: "Без крайностей" },
      { value: "soft", title: "Скорее мягко", desc: "Чтобы не «накрывало»" },
      { value: "evening", title: "Пью вечером", desc: "Хочу максимально мягко" },
    ]
  },
  // Lead form step (6th step)
  {
    id: "lead",
    title: "Куда отправить вашу рекомендацию?",
    hint: "Оставьте телефон или Telegram — и мы пришлём подбор.",
    type: "lead"
  }
];

let state = {
  step: 0,
  answers: {},
  startedAt: null,
  ab: null,
  sessionId: null
};

function uid() {
  return "s_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
}

function initQuiz() {
  state.sessionId = uid();
  state.ab = applyAbVariant();

  // time on page (simple)
  state.startedAt = Date.now();

  // fire page_view-ish custom
  track("page_loaded", { ab: state.ab, session_id: state.sessionId });

  const quizCard = document.getElementById("quizCard");
  const btnBack = document.getElementById("btnBack");
  const btnNext = document.getElementById("btnNext");

  renderStep();

  btnBack.addEventListener("click", () => {
    if (state.step <= 0) return;
    state.step -= 1;
    renderStep();
    track("quiz_back", { step: state.step + 1 });
  });

  btnNext.addEventListener("click", async () => {
    const current = QUIZ[state.step];

    // validation
    if (current.type === "single") {
      if (!state.answers[current.id]) {
        shake(quizCard);
        track("quiz_validation_error", { step: state.step + 1, q: current.id });
        return;
      }
      state.step += 1;
      renderStep();
      track("quiz_next", { step: state.step + 1 });
      return;
    }

    if (current.type === "lead") {
      const phone = document.getElementById("leadPhone").value.trim();
      const tg = document.getElementById("leadTg").value.trim();
      const city = document.getElementById("leadCity").value.trim();

      if (!phone && !tg) {
        shake(quizCard);
        track("lead_validation_error", { reason: "no_contact" });
        return;
      }

      const payload = buildLeadPayload({ phone, tg, city });

      track("lead_submit", { has_phone: !!phone, has_tg: !!tg, city: city || "" });

      btnNext.disabled = true;
      btnNext.textContent = "Отправляем…";

      try {
        await submitLead(payload);
        const ms = Date.now() - state.startedAt;
        track("quiz_complete", { duration_ms: ms });

        renderSuccess(payload.recommendation);
      } catch (e) {
        renderError(e);
      } finally {
        btnNext.disabled = false;
        btnNext.textContent = "Получить рекомендацию";
      }
    }
  });

  // start metric: when quiz first becomes visible
  setupQuizViewTracking();
  setupScrollButtons();
  setupScrollDepth();
}

function setupQuizViewTracking() {
  const quiz = document.getElementById("quiz");
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        track("quiz_view", { ab: state.ab });
        obs.disconnect();
      }
    });
  }, { threshold: 0.25 });
  obs.observe(quiz);
}

function renderStep() {
  const stepText = document.getElementById("stepText");
  const progressBar = document.getElementById("progressBar");
  const btnBack = document.getElementById("btnBack");
  const btnNext = document.getElementById("btnNext");

  const totalSteps = QUIZ.length;
  const humanStep = state.step + 1;

  stepText.textContent = `Шаг ${humanStep} из ${totalSteps}`;
  progressBar.style.width = `${Math.round((state.step / (totalSteps - 1)) * 100)}%`;

  btnBack.disabled = state.step === 0;

  const current = QUIZ[state.step];
  if (current.type === "lead") btnNext.textContent = "Получить рекомендацию";
  else btnNext.textContent = "Дальше";

  const quizCard = document.getElementById("quizCard");
  quizCard.innerHTML = "";

  if (current.type === "single") {
    quizCard.appendChild(renderSingle(current));
  } else if (current.type === "lead") {
    quizCard.appendChild(renderLead());
  }
}

function renderSingle(q) {
  const wrap = document.createElement("div");
  wrap.className = "q";

  const title = document.createElement("div");
  title.className = "q__title";
  title.textContent = q.title;

  const hint = document.createElement("div");
  hint.className = "q__hint";
  hint.textContent = q.hint;

  const options = document.createElement("div");
  options.className = "options";

  q.options.forEach(opt => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "opt";
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", state.answers[q.id] === opt.value ? "true" : "false");

    const left = document.createElement("div");
    left.className = "opt__main";

    const t = document.createElement("div");
    t.className = "opt__title";
    t.textContent = opt.title;

    const d = document.createElement("div");
    d.className = "opt__desc";
    d.textContent = opt.desc;

    left.appendChild(t);
    left.appendChild(d);

    const mark = document.createElement("div");
    mark.className = "opt__mark";
    mark.textContent = state.answers[q.id] === opt.value ? "✓" : "";

    btn.appendChild(left);
    btn.appendChild(mark);

    btn.addEventListener("click", () => {
      state.answers[q.id] = opt.value;
      track("quiz_answer", { q: q.id, a: opt.value, step: state.step + 1, ab: state.ab });
      renderStep();
    });

    options.appendChild(btn);
  });

  wrap.appendChild(title);
  wrap.appendChild(hint);
  wrap.appendChild(options);
  return wrap;
}

function renderLead() {
  const wrap = document.createElement("div");
  wrap.className = "q";

  const title = document.createElement("div");
  title.className = "q__title";
  title.textContent = "Куда отправить вашу рекомендацию?";

  const hint = document.createElement("div");
  hint.className = "q__hint";
  hint.textContent = "Оставьте телефон или Telegram — и мы пришлём подбор. Без спама.";

  const phone = labeledInput("Телефон (WhatsApp)", "leadPhone", "+7 7__ ___ __ __", "tel");
  const tg = labeledInput("Telegram (username)", "leadTg", "@username", "text");
  const city = labeledInput("Город (необязательно)", "leadCity", "Алматы / Астана", "text");

  const rec = document.createElement("div");
  rec.className = "note";
  rec.textContent = "Сразу после отправки покажем рекомендацию на экране. Мы можем уточнить пару деталей, если нужно.";

  wrap.appendChild(title);
  wrap.appendChild(hint);
  wrap.appendChild(phone);
  wrap.appendChild(tg);
  wrap.appendChild(city);
  wrap.appendChild(rec);

  return wrap;
}

function labeledInput(label, id, placeholder, type = "text") {
  const box = document.createElement("div");
  box.style.display = "flex";
  box.style.flexDirection = "column";
  box.style.gap = "6px";

  const l = document.createElement("div");
  l.className = "opt__desc";
  l.style.fontSize = "13px";
  l.textContent = label;

  const inp = document.createElement("input");
  inp.className = "input";
  inp.id = id;
  inp.type = type;
  inp.placeholder = placeholder;
  inp.autocomplete = "on";

  box.appendChild(l);
  box.appendChild(inp);
  return box;
}

// --------- Recommendation logic (simple rules MVP) ----------
function buildRecommendation(answers) {
  const taste = answers.taste_profile;
  const milk = answers.milk;
  const method = answers.brew_method;
  const avoid = answers.avoid;
  const boost = answers.boost;

  // Base profile
  let profile = "Сбалансированный";
  let roast = "Средняя";
  let notes = "Шоколад / орех / карамель";
  let forMilk = (milk === "often" || milk === "sometimes" || milk === "both") ? "Да" : "Нет";

  if (taste === "fruity") {
    profile = "Яркий, фруктовый";
    roast = "Светлая–средняя";
    notes = "Ягоды / фрукты";
  }
  if (taste === "caramel") {
    profile = "Мягкий, сладкий";
    roast = "Средняя";
    notes = "Карамель / печенье";
  }
  if (taste === "chocolate_nut") {
    profile = "Плотный, «кофейный»";
    roast = "Средняя–средне-тёмная";
    notes = "Шоколад / орех";
  }

  // Avoid adjustment
  if (avoid === "too_acidic") {
    profile = "Сбалансированный без лишней кислотности";
    roast = "Средняя–средне-тёмная";
    notes = "Шоколад / орех / карамель";
  }
  if (avoid === "too_bitter") {
    roast = "Средняя";
  }

  // Method adjustment
  let grindHint = "";
  if (method === "turka") grindHint = "Помол: очень мелкий (под турку).";
  if (method === "espresso") grindHint = "Помол: мелкий (под эспрессо).";
  if (method === "filter") grindHint = "Помол: средний (под фильтр/V60).";
  if (method === "moka") grindHint = "Помол: средне-мелкий (под гейзер).";

  // Boost
  let intensity = "Обычная";
  if (boost === "strong") intensity = "Выше среднего";
  if (boost === "soft" || boost === "evening") intensity = "Мягкая";

  // Milk compatibility
  let milkText = forMilk === "Да"
    ? "Подойдёт для молочных напитков (капучино/латте)."
    : "Лучше раскрывается в чёрном виде.";

  return {
    profile,
    roast,
    notes,
    method,
    intensity,
    grindHint,
    milkText
  };
}

function buildLeadPayload({ phone, tg, city }) {
  const recommendation = buildRecommendation(state.answers);
  return {
    ts: new Date().toISOString(),
    session_id: state.sessionId,
    ab_variant: state.ab,
    page_url: window.location.href,
    utm_source: getParam("utm_source"),
    utm_medium: getParam("utm_medium"),
    utm_campaign: getParam("utm_campaign"),
    utm_content: getParam("utm_content"),
    utm_term: getParam("utm_term"),

    // answers
    taste_profile: state.answers.taste_profile || "",
    milk: state.answers.milk || "",
    brew_method: state.answers.brew_method || "",
    avoid: state.answers.avoid || "",
    boost: state.answers.boost || "",

    // lead
    phone: phone || "",
    telegram: tg || "",
    city: city || "",

    // computed recommendation
    recommendation
  };
}

function getParam(name) {
  const u = new URL(window.location.href);
  return u.searchParams.get(name) || "";
}

// --------- Submit to Google Sheets (Apps Script Web App) ----------
async function submitLead(payload) {
  // If not configured, fallback to local success to not break MVP
  if (!CONFIG.SHEETS_WEBAPP_URL || CONFIG.SHEETS_WEBAPP_URL.includes("PASTE_YOUR_WEB_APP_URL")) {
    // emulate network
    await sleep(450);
    return { ok: true, mocked: true };
  }

  const res = await fetch(CONFIG.SHEETS_WEBAPP_URL, {
    method: "POST",
    mode: "cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json().catch(() => ({}));
  if (data && data.ok === false) throw new Error(data.error || "Unknown error");
  return data;
}

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

function renderSuccess(recommendation) {
  const quizCard = document.getElementById("quizCard");
  const btnBack = document.getElementById("btnBack");
  const btnNext = document.getElementById("btnNext");
  const progressBar = document.getElementById("progressBar");
  const stepText = document.getElementById("stepText");

  btnBack.disabled = true;
  btnNext.disabled = true;
  progressBar.style.width = "100%";
  stepText.textContent = "Готово ✅";

  quizCard.innerHTML = `
    <div class="q">
      <div class="q__title">Ваша рекомендация готова</div>
      <div class="note">
        <b>Профиль:</b> ${escapeHtml(recommendation.profile)}<br/>
        <b>Обжарка:</b> ${escapeHtml(recommendation.roast)}<br/>
        <b>Ноты:</b> ${escapeHtml(recommendation.notes)}<br/>
        <b>Интенсивность:</b> ${escapeHtml(recommendation.intensity)}<br/>
        <b>${escapeHtml(recommendation.grindHint)}</b><br/>
        ${escapeHtml(recommendation.milkText)}
      </div>

      <div class="callout" style="margin-top:12px;">
        <div>
          <div class="callout__title">Хотите сделать заказ по этой рекомендации?</div>
          <div class="callout__text">Ответьте на сообщение — мы предложим 1–2 варианта под ваш бюджет и формат (250/500 г).</div>
        </div>
        <button class="btn btn--primary" id="orderIntentBtn">Хочу заказать</button>
      </div>

      <div class="fine">Гарантия: если не понравится — поможем заменить бесплатно.</div>
    </div>
  `;

  document.getElementById("orderIntentBtn").addEventListener("click", () => {
    track("order_intent", { ab: state.ab });
    alert("Супер! В MVP этот шаг фиксируем как намерение заказа. Дальше можно вести в WhatsApp/Telegram/форму оплаты.");
  });
}

function renderError(err) {
  const quizCard = document.getElementById("quizCard");
  track("lead_submit_error", { message: String(err && err.message ? err.message : err) });

  quizCard.innerHTML = `
    <div class="q">
      <div class="q__title">Не получилось отправить</div>
      <div class="note">
        Похоже, связь подвела. Попробуйте ещё раз или напишите нам в Telegram/WhatsApp.<br/>
        <span style="opacity:.75;">Техническая ошибка: ${escapeHtml(String(err.message || err))}</span>
      </div>
    </div>
  `;
}

function shake(el){
  el.animate(
    [{ transform: "translateX(0px)" },
     { transform: "translateX(-8px)" },
     { transform: "translateX(8px)" },
     { transform: "translateX(-6px)" },
     { transform: "translateX(6px)" },
     { transform: "translateX(0px)" }],
    { duration: 280 }
  );
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// --------- Boot ----------
document.addEventListener("DOMContentLoaded", () => {
  initQuiz();
});
