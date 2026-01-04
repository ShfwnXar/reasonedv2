let currentChapterId = null;
let currentSubject = "MATEMATIKA";

function toast(title, msg){
  const t = document.getElementById("toast");
  if(!t){ alert(title + "\n" + msg); return; }
  document.getElementById("toastTitle").textContent = title;
  document.getElementById("toastMsg").textContent = msg;
  t.classList.add("show");
  clearTimeout(window.__t);
  window.__t = setTimeout(()=>t.classList.remove("show"), 2400);
}

async function safeJson(res){
  const text = await res.text();
  if(!text) return {};
  try { return JSON.parse(text); } catch { return { _raw: text }; }
}

function addBubble(role, text){
  const log = document.getElementById("chatLog");
  if(!log) return;
  const b = document.createElement("div");
  b.className = role === "user" ? "bubble user" : "bubble bot";
  b.textContent = text;
  log.appendChild(b);
  log.scrollTop = log.scrollHeight;
}

async function loadChapters(){
  const subjSel = document.getElementById("subject");
  if(!subjSel){ toast("Error","materi.html belum punya <select id='subject'>"); return; }

  currentSubject = subjSel.value;
  const chapters = document.getElementById("chapters");
  const detail = document.getElementById("detail");
  const chatPanel = document.getElementById("chatPanel");

  if(chapters) chapters.innerHTML = "Loading...";
  if(detail) detail.style.display = "none";
  if(chatPanel) chatPanel.style.display = "none";
  currentChapterId = null;

  try{
    const res = await authFetch(`/api/materials?subject=${encodeURIComponent(currentSubject)}`);
    const data = await safeJson(res);

    if(!res.ok){
      if(res.status === 401){
        toast("Login dibutuhkan","Token kamu hilang/expired. Login ulang.");
        location.href = "login.html";
        return;
      }
      throw new Error(data.detail || `HTTP ${res.status}`);
    }

    if(!chapters) return;

    chapters.innerHTML = `<b>Daftar Bab (${currentSubject})</b>`;

    if(!data.length){
      chapters.innerHTML += `<div style="margin-top:10px;color:var(--muted);font-weight:900;">
        Belum ada materi di database. Jalankan <code>python seed_materials.py</code> (lokal) / seed di server.
      </div>`;
      toast("Info","Materi masih kosong.");
      return;
    }

    data.forEach(item=>{
      const btn = document.createElement("button");
      btn.className = "btn-secondary";
      btn.style.margin = "10px 10px 0 0";
      btn.textContent = item.chapter;
      btn.onclick = ()=>openChapter(item.id);
      chapters.appendChild(btn);
    });

    toast("OK","Bab berhasil dimuat.");

  }catch(e){
    if(chapters) chapters.innerHTML = "";
    toast("Error","Gagal load materi (backend / token).");
  }
}

async function openChapter(id){
  currentChapterId = id;
  const box = document.getElementById("detail");
  const chatPanel = document.getElementById("chatPanel");
  if(box){ box.style.display="block"; box.innerHTML="Loading..."; }

  try{
    const res = await authFetch(`/api/material/${id}`);
    const m = await safeJson(res);
    if(!res.ok) throw new Error(m.detail || `HTTP ${res.status}`);

    if(box){
      box.innerHTML = `
        <b style="font-size:16px;">${m.subject} — ${m.chapter}</b>
        <div style="margin-top:10px;"><span class="pill">Ringkasan</span>
          <pre style="margin-top:8px;white-space:pre-wrap;font-weight:800;">${m.summary || "-"}</pre>
        </div>
        <div style="margin-top:10px;"><span class="pill">Rumus / Konsep</span>
          <pre style="margin-top:8px;white-space:pre-wrap;font-weight:800;">${m.formulas || "-"}</pre>
        </div>
        <div style="margin-top:10px;"><span class="pill">Contoh</span>
          <pre style="margin-top:8px;white-space:pre-wrap;font-weight:800;">${m.examples || "-"}</pre>
        </div>
      `;
    }

    if(chatPanel){
      chatPanel.style.display="block";
      const log = document.getElementById("chatLog");
      if(log) log.innerHTML = "";
      addBubble("bot","Silakan tanya bab ini. Contoh: 'konsep', 'rumus', 'contoh', 'langkah'.");
    }

  }catch(e){
    if(box) box.innerHTML = "";
    toast("Error","Gagal membuka bab.");
  }
}

async function sendChat(){
  const input = document.getElementById("chatInput");
  const q = (input?.value || "").trim();
  if(!q) return;
  if(!currentChapterId){
    toast("Chat","Pilih bab dulu.");
    return;
  }

  addBubble("user", q);
  input.value = "";

  try{
    const res = await authFetch("/api/tutor_chat", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        mode:"by_chapter",
        chapter_id: currentChapterId,
        subject: currentSubject,
        question: q
      })
    });

    const data = await safeJson(res);
    if(!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    addBubble("bot", data.answer || "(Tidak ada jawaban)");

  }catch(e){
    addBubble("bot","Tutor gagal. Pastikan backend jalan & token valid.");
  }
}

window.addEventListener("DOMContentLoaded", ()=>{
  document.getElementById("btnLoad")?.addEventListener("click", loadChapters);
  document.getElementById("chatSend")?.addEventListener("click", sendChat);
  document.getElementById("chatInput")?.addEventListener("keydown", (e)=>{ if(e.key==="Enter") sendChat(); });

  // auto load pertama kali
  loadChapters();
});
