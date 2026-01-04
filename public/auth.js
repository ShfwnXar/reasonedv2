// =====================
// REASONED - auth.js FINAL
// =====================

function apiBase(){
  // kalau ada override manual
  const saved = localStorage.getItem("api_base");
  if(saved) return saved;

  // kalau jalan di vercel, otomatis ambil origin domain yang sama
  return window.location.origin;
}


function getToken(){
  return localStorage.getItem("auth_token") || "";
}

function requireAuth(){
  if(!getToken()) location.href = "login.html";
}

function logout(){
  localStorage.clear();
  location.href = "login.html";
}

async function authFetch(path, options = {}){
  const url = apiBase() + path;
  const headers = options.headers ? { ...options.headers } : {};
  const token = getToken();
  if(token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(url, { ...options, headers });
}

// global logout handler (klik selalu jalan)
window.addEventListener("DOMContentLoaded", ()=>{
  const btn = document.getElementById("btnLogout");
  if(btn){
    btn.addEventListener("click", (e)=>{
      e.preventDefault();
      e.stopPropagation();
      logout();
    });
  }
});
