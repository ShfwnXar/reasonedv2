function pickEl(ids){
  for(const id of ids){
    const e = document.getElementById(id);
    if(e) return e;
  }
  return null;
}

window.addEventListener("DOMContentLoaded", async () => {
  const hello = pickEl(["helloName","hello","userName"]);
  const quota = pickEl(["statQuota","quotaText","quotaValue"]);
  const last  = pickEl(["statLast","lastScoreText","lastScore"]);

  // skor dari localStorage (sesuai soal.js kamu)
  const lastScore = localStorage.getItem("last_score");
  if(last) last.textContent = lastScore ? lastScore : "-";

  // nama dari localStorage dulu
  const u = localStorage.getItem("user") || "User";
  if(hello) hello.textContent = `Halo, ${u} 👋`;

  // tombol mulai latihan
  const btnStart = pickEl(["btnStart","btnMulai","startBtn"]);
  if(btnStart){
    btnStart.disabled = false;
    btnStart.addEventListener("click", ()=> location.href = "soal.html");
  }

  // load quota dari backend
  try{
    const res = await authFetch("/api/me");
    const data = await res.json();

    if(!res.ok){
      if(quota) quota.textContent = data.detail || "-";
      return;
    }

    const remaining = Math.max(0, data.free_limit - data.attempts_used);
    if(quota) quota.textContent = `Sisa: ${remaining}/${data.free_limit}`;
    if(hello) hello.textContent = `Halo, ${data.user} 👋`;

    if(btnStart && remaining === 0 && data.role !== "admin" && data.is_paid !== true){
      btnStart.disabled = true;
      btnStart.style.opacity = "0.6";
      btnStart.title = "Kuota habis";
    }
  }catch{
    if(quota) quota.textContent = "-";
  }
});
