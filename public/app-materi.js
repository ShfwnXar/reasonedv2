let currentChapterId = null;
let currentSubject = "MATEMATIKA";

function toast(title, msg){
  const t = document.getElementById("toast");
  document.getElementById("toastTitle").textContent = title;
  document.getElementById("toastMsg").textContent = msg;
  t.classList.add("show");
  clearTimeout(window.__t);
  window.__t = setTimeout(()=>t.classList.remove("show"), 2400);
}

function addBubble(role, text){
  const log = document.getElementById("chatLog");
  const b = document.createElement("div");
  b.style.maxWidth = "85%";
  b.style.padding = "10px 12px";
  b.style.borderRadius = "14px";
  b.style.whiteSpace = "pre-wrap";
  b.style.fontWeight = "800";
  if(role === "user"){
    b.style.marginLeft = "auto";
    b.style.background = "rgba(124,106,237,.12)";
    b.style.border = "1px solid rgba(124,106,237,.25)";
  }else{
    b.style.marginRight = "auto";
    b.style.background = "#fff";
    b.style.border = "1px solid var(--line)";
  }
  b.textContent = text;
  log.appendChild(b);
  log.scrollTop = log.scrollHeight;
}

async function loadChapters(){
  currentSubject = document.getElementById("subject").value;
  document.getElementById("chapters").innerHTML = "Loading...";
  document.getElementById("detail").style.display = "none";
  document.getElementById("chatPanel").style.display = "none";
  currentChapterId = null;

  try{
    const res = await authFetch(`/api/materials?subject=${encodeURIComponent(currentSubject)}`);
    const data = await res.json();
    if(!res.ok) throw new Error(data.detail || "Gagal load materi");

    const wrap = document.getElementById("chapters");
    wrap.innerHTML = `<b>Daftar Bab (${currentSubject})</b>`;

    if(!Array.isArray(data) || !data.length){
      wrap.innerHTML += `<div style="margin-top:10px;color:var(--muted);font-weight:900;">
        Belum ada materi di database. Jalankan <code>python seed_materials.py</code> dulu.
      </div>`;
      toast("Info", "DB materi masih kosong.");
      return;
    }

    data.forEach(item=>{
      const btn = document.createElement("button");
      btn.className = "btn-secondary";
      btn.style.margin = "10px 10px 0 0";
      btn.textContent = item.chapter;
      btn.onclick = ()=>openChapter(item.id);
      wrap.appendChild(btn);
    });

    toast("✅ OK", "Bab berhasil dimuat.");
  }catch(e){
    document.getElementById("chapters").innerHTML = "";
    toast("Error", e.message || "Gagal load materi. Pastikan backend jalan (8000).");
  }
}

async function openChapter(id){
  currentChapterId = id;
  const box = document.getElementById("detail");
  box.style.display = "block";
  box.innerHTML = "Loading...";

  try{
    const res = await authFetch(`/api/material/${id}`);
    const m = await res.json();
    if(!res.ok) throw new Error(m.detail || "Gagal ambil detail");

    box.innerHTML = `
      <b style="font-size:16px;">${m.subject} — ${m.chapter}</b>
      <div style="margin-top:10px;">
        <span class="pill">Ringkasan</span>
        <pre style="margin-top:8px;white-space:pre-wrap;font-weight:800;">${m.summary || "-"}</pre>
      </div>
      <div style="margin-top:10px;">
        <span class="pill">Rumus / Konsep</span>
        <pre style="margin-top:8px;white-space:pre-wrap;font-weight:800;">${m.formulas || "-"}</pre>
      </div>
      <div style="margin-top:10px;">
        <span class="pill">Contoh</span>
        <pre style="margin-top:8px;white-space:pre-wrap;font-weight:800;">${m.examples || "-"}</pre>
      </div>
    `;

    document.getElementById("chatPanel").style.display = "block";
    document.getElementById("chatLog").innerHTML = "";
    addBubble("bot","Silakan tanya materi bab ini. Contoh: 'ringkas', 'rumus', 'contoh soal'.");
    toast("📘 Bab dipilih", "Tutor siap.");

  }catch(e){
    box.innerHTML = "";
    toast("Error", e.message || "Gagal membuka bab.");
  }
}

async function sendChat(){
  const input = document.getElementById("chatInput");
  const q = (input.value||"").trim();
  if(!q) return;
  if(!currentChapterId){
    toast("Chat", "Pilih bab dulu.");
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
    const data = await res.json();
    if(!res.ok) throw new Error(data.detail || "tutor_chat gagal");
    addBubble("bot", data.answer);
  }catch(e){
    addBubble("bot","Tutor gagal. Pastikan backend hidup dan database sudah di-seed.");
  }
}

document.getElementById("btnLoad").addEventListener("click", loadChapters);
document.getElementById("chatSend").addEventListener("click", sendChat);
document.getElementById("chatInput").addEventListener("keydown",(e)=>{ if(e.key==="Enter") sendChat(); });

document.getElementById("btnLogout").addEventListener("click", logout);

loadChapters();
  