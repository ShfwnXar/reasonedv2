function toast(title, msg){
  const t = document.getElementById("toast");
  if(!t) return;
  document.getElementById("toastTitle").textContent = title;
  document.getElementById("toastMsg").textContent = msg;
  t.classList.add("show");
  clearTimeout(window.__t);
  window.__t = setTimeout(()=>t.classList.remove("show"), 2500);
}

(async ()=>{
  try{
    const res = await authFetch("/api/me");
    const data = await res.json();

    if(!res.ok){
      throw new Error(data.detail || "Gagal load profil");
    }

    // ====== NAMA USER ======
    document.getElementById("hello").textContent =
      `Halo, ${data.user} 👋`;

    // ====== QUOTA ======
    const used = Number(data.attempts_used ?? 0);
    const limit = Number(data.free_limit ?? 0);

    document.getElementById("quota").textContent =
      `Sisa: ${Math.max(limit - used, 0)}/${limit}`;

    // ====== SKOR TERAKHIR ======
    const lastScore = localStorage.getItem("last_score");
    document.getElementById("lastScore").textContent =
      lastScore ? lastScore : "-";

  }catch(e){
    toast("Error", e.message);
  }
})();
