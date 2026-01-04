function apiBase(){
  return window.location.origin;
}

function getToken(){
  return localStorage.getItem("token");
}

function setToken(token){
  localStorage.setItem("token", token);
}

function clearToken(){
  localStorage.removeItem("token");
}

async function apiFetch(path, options = {}){
  const headers = options.headers || {};
  const token = getToken();
  if(token){
    headers["Authorization"] = "Bearer " + token;
  }
  headers["Content-Type"] = "application/json";
  const res = await fetch(apiBase() + path, {
    ...options,
    headers
  });
  if(!res.ok){
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Request failed");
  }
  return res.json();
}

async function login(username, password){
  const data = await apiFetch("/api/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
  setToken(data.token);
  return data;
}

async function register(username, password){
  const data = await apiFetch("/api/register", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
  setToken(data.token);
  return data;
}

async function me(){
  return apiFetch("/api/me");
}

function logout(){
  clearToken();
  window.location.href = "/";
}
