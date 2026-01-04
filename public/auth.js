function apiBase(){
  // Lokal (uvicorn)
  if (location.hostname === "127.0.0.1" || location.hostname === "localhost") {
    return "http://127.0.0.1:8000";
  }
  // Vercel: same origin
  return "";
}

function authFetch(path, options = {}){
  const token = localStorage.getItem("auth_token");
  options.headers = options.headers || {};
  if (token) options.headers["Authorization"] = "Bearer " + token;
  return fetch(apiBase() + path, options);
}

function requireAuth(){
  const token = localStorage.getItem("auth_token");
  if (!token) location.href = "login.html";
}

function logout(){
  localStorage.removeItem("auth_token");
  localStorage.removeItem("user");
  localStorage.removeItem("role");
  localStorage.removeItem("is_paid");
  localStorage.removeItem("last_set");
  location.href = "login.html";
}
