function safeTrim(id){
  return (document.getElementById(id).value || "").trim();
}

async function safeJson(res){
  const t = await res.text();
  if(!t) return {};
  try { return JSON.parse(t); } catch { return { _raw: t }; }
}

async function doRegister(){
  const u = safeTrim("username").toLowerCase();
  const p = safeTrim("password");
  const err = document.getElementById("err");
  err.textContent = "";

  if(u.length < 3){ err.textContent = "Username minimal 3 karakter."; return; }
  if(p.length < 6){ err.textContent = "Password minimal 6 karakter."; return; }

  try{
    const res = await fetch(apiBase() + "/api/register", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ username:u, password:p })
    });
    const data = await safeJson(res);
    if(!res.ok) throw new Error(data.detail || "Register gagal");

    localStorage.setItem("auth_token", data.token);
    localStorage.setItem("user", data.user);
    localStorage.setItem("role", data.role);
    localStorage.setItem("is_paid", String(data.is_paid));

    location.href = "dashboard.html";
  }catch(e){
    err.textContent = e.message || "Register gagal";
  }
}

window.addEventListener("DOMContentLoaded", ()=>{
  document.getElementById("btnRegister").addEventListener("click", doRegister);
  document.addEventListener("keydown", (e)=>{
    if(e.key === "Enter") document.getElementById("btnRegister")?.click();
  });
});
