// public/auth.js

function apiBase(){
  const host = window.location.hostname;
  if(host === "127.0.0.1" || host === "localhost"){
    return "http://127.0.0.1:8000";
  }
  return window.location.origin;
}

function getToken(){
  return localStorage.getItem("auth_token");
}

function setToken(token){
  localStorage.setItem("auth_token", token);
}

function clearToken(){
  localStorage.removeItem("auth_token");
}

async function apiFetch(path, options = {}){
  const headers = options.headers ? { ...options.headers } : {};
  const token = getToken();

  if(token){
    headers["Authorization"] = "Bearer " + token;
  }

  if(!headers["Content-Type"] && options.body !== undefined){
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(apiBase() + path, {
    ...options,
    headers
  });

  let data = null;
  const ct = res.headers.get("content-type") || "";
  if(ct.includes("application/json")){
    data = await res.json().catch(() => null);
  }else{
    const text = await res.text().catch(() => "");
    data = text ? { detail: text } : null;
  }

  if(!res.ok){
    throw new Error((data && (data.detail || data.message)) || "Request failed");
  }

  return data;
}

async function login(username, password){
  const data = await apiFetch("/api/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
  if(data && data.token) setToken(data.token);
  return data;
}

async function register(username, password){
  const data = await apiFetch("/api/register", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
  if(data && data.token) setToken(data.token);
  return data;
}

async function me(){
  return apiFetch("/api/me", { method: "GET" });
}

function requireAuth(){
  if(!getToken()){
    window.location.href = "login.html";
  }
}

function logout(){
  clearToken();
  window.location.href = "login.html";
}
