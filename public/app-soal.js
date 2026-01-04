function toast(title, msg) {
  const t = document.getElementById("toast");
  if (!t) { alert(`${title}\n${msg}`); return; }
  document.getElementById("toastTitle").textContent = title;
  document.getElementById("toastMsg").textContent = msg;
  t.classList.add("show");
  clearTimeout(window.__t);
  window.__t = setTimeout(() => t.classList.remove("show"), 2600);
}

async function safeJson(res) {
  const text = await res.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { _raw: text }; }
}

function el(id) { return document.getElementById(id); }

// ---- state ----
let META = null;
let LAST_SET = null;
let ACTIVE_Q = null; // soal aktif untuk tutor

// ---- ensure UI elements exist (btnSubmit & resultBox) ----
function ensureSubmitUI() {
  // tombol submit
  if (!el("btnSubmit")) {
    const btn = document.createElement("button");
    btn.id = "btnSubmit";
    btn.type = "button";
    btn.className = "btn-secondary";
    btn.textContent = "Kumpul Jawaban";
    btn.style.display = "none";

    // taruh setelah tombol generate
    const gen = el("btnGen");
    if (gen && gen.parentElement) {
      gen.parentElement.appendChild(btn);
    }
  }

  // result box
  if (!el("resultBox")) {
    const rb = document.createElement("div");
    rb.id = "resultBox";
    rb.className = "card";
    rb.style.marginTop = "14px";
    rb.style.display = "none";

    // taruh setelah quiz
    const q = el("quiz");
    if (q && q.parentElement) {
      q.parentElement.insertBefore(rb, el("chatPanel") || null);
    }
  }
}

function addBubble(role, text) {
  const log = el("chatLog");
  if (!log) return;

  const b = document.createElement("div");
  b.style.maxWidth = "85%";
  b.style.padding = "10px 12px";
  b.style.borderRadius = "14px";
  b.style.whiteSpace = "pre-wrap";
  b.style.fontWeight = "800";

  if (role === "user") {
    b.style.marginLeft = "auto";
    b.style.background = "rgba(124,106,237,.12)";
    b.style.border = "1px solid rgba(124,106,237,.25)";
  } else {
    b.style.marginRight = "auto";
    b.style.background = "#fff";
    b.style.border = "1px solid var(--line)";
  }

  b.textContent = text;
  log.appendChild(b);
  log.scrollTop = log.scrollHeight;
}

// -------------------------
// SUBJECT META
// -------------------------
function setSubjectOptions() {
  const exam = (el("exam")?.value || "UTBK").toUpperCase();
  const track = (el("track")?.value || "SAINTEK").toUpperCase();
  const subjSel = el("subject");
  if (!subjSel) return;

  subjSel.innerHTML = "";

  // MIX selalu ada
  const optMix = document.createElement("option");
  optMix.value = "MIX";
  optMix.textContent = "MIX (Campuran)";
  subjSel.appendChild(optMix);

  if (!META) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(Meta belum dimuat)";
    subjSel.appendChild(opt);
    subjSel.value = "MIX";
    return;
  }

  let subjects = [];
  if (exam === "UTBK") {
    subjects = META.UTBK || [];
  } else {
    const tka = META.TKA || {};
    subjects = (tka[track] || []);
  }

  if (!subjects.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(Tidak ada subject)";
    subjSel.appendChild(opt);
    subjSel.value = "MIX";
    return;
  }

  subjects.forEach(s => {
    const o = document.createElement("option");
    o.value = s;
    o.textContent = s;
    subjSel.appendChild(o);
  });

  subjSel.value = "MIX";
}

async function loadMeta() {
  try {
    const res = await authFetch("/api/meta");
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    META = data;
    setSubjectOptions();
  } catch (e) {
    META = null;
    setSubjectOptions();
    toast("Error", "Gagal memuat subject. Pastikan backend jalan di http://127.0.0.1:8000");
  }
}

// -------------------------
// QUIZ RENDER
// -------------------------
function renderQuiz(payload) {
  const wrap = el("quiz");
  if (!wrap) return;

  wrap.innerHTML = "";
  LAST_SET = payload;
  ACTIVE_Q = null;

  // reset result
  if (el("resultBox")) {
    el("resultBox").style.display = "none";
    el("resultBox").innerHTML = "";
  }

  if (!payload || !payload.questions || !payload.questions.length) {
    wrap.innerHTML = `<div style="font-weight:900;color:var(--muted)">Tidak ada soal.</div>`;
    el("btnSubmit").style.display = "none";
    return;
  }

  payload.questions.forEach((q, idx) => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.marginTop = "12px";
    card.dataset.token = q.token;

    const opsiHtml = q.opsi.map((opt, i) => `
      <label style="display:flex;gap:10px;margin:8px 0;cursor:pointer;font-weight:800;">
        <input type="radio" name="q_${idx}" value="${i}">
        <span>${["A", "B", "C", "D"][i]}. ${opt}</span>
      </label>
    `).join("");

    card.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <div style="font-weight:1000;">
          ${idx + 1}. <span class="pill">${q.kategori}</span>
        </div>
        <button class="btn-secondary" data-openchat="${idx}" type="button">Tanya Tutor</button>
      </div>

      <pre style="white-space:pre-wrap;font-weight:900;margin:8px 0 0;">${q.teks}</pre>
      <div style="margin-top:10px;">${opsiHtml}</div>

      <div class="muted" style="margin-top:8px;font-weight:900;">
        Subject: ${q.subject}
      </div>
    `;

    wrap.appendChild(card);
  });

  // event tombol tanya tutor per soal
  [...wrap.querySelectorAll("[data-openchat]")].forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-openchat"), 10);
      const q = payload.questions[idx];
      ACTIVE_Q = q;

      el("chatPanel").style.display = "block";
      el("chatLog").innerHTML = "";

      addBubble("bot",
        `Kamu sedang tanya soal ini:\n${q.kategori} (${q.subject})\n\n` +
        `Ketik pertanyaan seperti:\n- konsep\n- rumus\n- langkah\n- kunci`
      );

      toast("Tutor siap", "Silakan ketik pertanyaan.");
    });
  });

  // tampilkan tombol kumpul
  el("btnSubmit").style.display = "inline-flex";

  // cache
  localStorage.setItem("last_set", JSON.stringify(payload));

  toast("✅ OK", "Soal berhasil digenerate.");
}

// -------------------------
// GENERATE SET
// -------------------------
async function onGenerate(e) {
  if (e) e.preventDefault();

  const btn = el("btnGen");
  btn.disabled = true;
  btn.textContent = "Generating...";

  try {
    const exam = el("exam").value;
    const track = el("track").value;
    const subject = (el("subject").value || "MIX");
    const n = parseInt(el("n").value || "10", 10);

    const res = await authFetch("/api/generate_set", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exam,
        track,
        subject,
        level: 1.5, // bisa kamu buat input sendiri kalau mau
        n
      })
    });

    const data = await safeJson(res);

    if (!res.ok) {
      if (res.status === 401) {
        toast("Login dibutuhkan", data.detail || "Token tidak ada/expired. Login ulang.");
        return;
      }
      if (res.status === 402) {
        toast("Limit habis", data.detail || "Limit free habis.");
        return;
      }
      throw new Error(data.detail || `HTTP ${res.status}`);
    }

    renderQuiz(data);

  } catch (err) {
    toast("Error", err.message || "Gagal generate");
  } finally {
    btn.disabled = false;
    btn.textContent = "Generate";
  }
}

// -------------------------
// SUBMIT / CHECK SET
// -------------------------
function collectAnswers() {
  const wrap = el("quiz");
  const cards = [...wrap.querySelectorAll(".card")];
  const answers = [];

  cards.forEach((card, idx) => {
    const token = card.dataset.token;
    const chosen = card.querySelector(`input[name="q_${idx}"]:checked`);
    answers.push({
      token,
      answer: chosen ? parseInt(chosen.value, 10) : 0
    });
  });

  return answers;
}

async function onSubmit(e){
  if(e) e.preventDefault();

  if(!LAST_SET || !LAST_SET.questions || !LAST_SET.questions.length){
    toast("Error", "Belum ada soal untuk dikumpulkan.");
    return;
  }

  const btn = el("btnSubmit");
  const box = el("resultBox");
  if(!box){
    toast("Error", "resultBox tidak ditemukan. Pastikan ada <div id='resultBox'> di soal.html");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Mengumpulkan...";

  try{
    const answers = collectAnswers();

    const res = await authFetch("/api/check_set", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ answers })
    });

    const data = await safeJson(res);

    if(!res.ok){
      toast("Gagal", (data.detail || data._raw || `HTTP ${res.status}`));
      return;
    }

    // TAMPILKAN SKOR + DETAIL
    box.style.display = "block";
    box.innerHTML = `
      <h3 style="margin:0 0 8px;">📊 Hasil</h3>
      <div style="font-weight:900;">Skor: ${data.score} / ${data.total}</div>
      <div style="margin-top:8px;font-weight:900;color:var(--muted)">Benar/Salah + Pembahasan:</div>
    `;
    // SIMPAN SKOR TERAKHIR UNTUK DASHBOARD
    localStorage.setItem("last_score", `${data.score}/${data.total}`);
    localStorage.setItem("last_score_time", new Date().toISOString());


    (data.results || []).forEach((r, i)=>{
      const div = document.createElement("div");
      div.style.marginTop = "10px";
      div.style.padding = "10px";
      div.style.border = "1px solid var(--line)";
      div.style.borderRadius = "12px";
      div.style.fontWeight = "900";
      div.innerHTML = `
        <div><b>${i+1}. ${r.correct ? "✅ BENAR" : "❌ SALAH"}</b> — Jawaban benar: ${["A","B","C","D"][r.correct_index]}</div>
        <div style="margin-top:6px; white-space:pre-wrap;">${r.pembahasan || "-"}</div>
        <div style="margin-top:6px; color:var(--muted);">Konsep: ${(r.konsep || []).join(", ")}</div>
      `;
      box.appendChild(div);
    });

    // biar kelihatan otomatis
    box.scrollIntoView({ behavior: "smooth", block: "start" });

    toast("Sukses", "Skor & pembahasan tampil.");

  }catch(err){
    toast("Error", err.message || "Gagal kumpul jawaban");
  }finally{
    btn.disabled = false;
    btn.textContent = "Kumpul Jawaban";
  }
}


// -------------------------
// TUTOR CHAT (/api/explain)
// -------------------------
async function onSendChat(e) {
  if (e) e.preventDefault();

  const input = el("chatInput");
  const q = (input.value || "").trim();
  if (!q) return;

  if (!ACTIVE_Q || !ACTIVE_Q.token) {
    toast("Tutor", "Klik 'Tanya Tutor' pada salah satu soal dulu.");
    return;
  }

  addBubble("user", q);
  input.value = "";

  try {
    const res = await authFetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: ACTIVE_Q.token,
        question: q
      })
    });

    const data = await safeJson(res);

    if (!res.ok) {
      if (res.status === 401) {
        addBubble("bot", "Token login kamu habis. Silakan login ulang.");
        return;
      }
      throw new Error(data.detail || `HTTP ${res.status}`);
    }

    addBubble("bot", data.answer || "(Tidak ada jawaban)");
  } catch (err) {
    addBubble("bot", "Tutor gagal. Pastikan backend jalan dan token valid.");
  }
}

// -------------------------
// INIT
// -------------------------
window.addEventListener("DOMContentLoaded", async () => {
  // anti reload kalau ada form (meski soal.html kamu tidak pakai form)
  const form = document.querySelector("form");
  if (form) form.addEventListener("submit", (e) => e.preventDefault());

  ensureSubmitUI();

  // listeners
  el("btnGen")?.addEventListener("click", onGenerate);
  el("btnSubmit")?.addEventListener("click", onSubmit);

  el("exam")?.addEventListener("change", setSubjectOptions);
  el("track")?.addEventListener("change", setSubjectOptions);

  el("chatSend")?.addEventListener("click", onSendChat);
  el("chatInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") onSendChat(e);
  });

  // load meta + set dropdown subject
  await loadMeta();

  // recover cached last_set
  const cached = localStorage.getItem("last_set");
  if (cached) {
    try {
      const payload = JSON.parse(cached);
      renderQuiz(payload);
    } catch { /* ignore */ }
  }
});
