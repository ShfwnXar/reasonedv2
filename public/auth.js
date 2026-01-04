// public/auth.js (FINAL, error-proof)
(function(){
  function _apiBase(){
    try{
      const host = location.hostname;
      if(host === "127.0.0.1" || host === "localhost"){
        return "http://127.0.0.1:8000";
      }
      return ""; // vercel: same-origin
    }catch{
      return "";
    }
  }

  window.apiBase = _apiBase;

  window.authFetch = function(path, options = {}){
    const base = _apiBase();
    const token = localStorage.getItem("auth_token");

    options.headers = options.headers || {};
    if(token){
      options.headers["Authorization"] = "Bearer " + token;
    }

    return fetch(base + path, options);
  };

  window.requireAuth = function(){
    const token = localStorage.getItem("auth_token");
    if(!token){
      location.href = "login.html";
    }
  };

  window.logout = function(){
    localStorage.removeItem("auth_token");
    localStorage.removeItem("user");
    localStorage.removeItem("role");
    localStorage.removeItem("is_paid");
    localStorage.removeItem("last_set");
    localStorage.removeItem("last_score");
    localStorage.removeItem("last_score_time");
    location.href = "login.html";
  };
})();
