// public/auth.js
(function () {
  function apiBase() {
    const host = location.hostname;
    if (host === "127.0.0.1" || host === "localhost") return "http://127.0.0.1:8000";
    return ""; // vercel = same origin (https://reasonedv2.vercel.app)
  }
  window.apiBase = apiBase;

  window.authFetch = function (path, options = {}) {
    const token = localStorage.getItem("auth_token");
    options.headers = options.headers || {};
    if (token) options.headers["Authorization"] = "Bearer " + token;
    return fetch(apiBase() + path, options);
  };

  window.requireAuth = function () {
    const token = localStorage.getItem("auth_token");
    if (!token) location.href = "login.html";
  };

  window.logout = function () {
    localStorage.clear();
    location.href = "login.html";
  };
})();
