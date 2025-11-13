async function callApi() {
  const methodEl = document.getElementById("method");
  const paramsEl = document.getElementById("params");
  const reqidEl = document.getElementById("reqid");
  const requestPreviewEl = document.getElementById("requestPreview");
  const responseBoxEl = document.getElementById("responseBox");

  if (!methodEl || !paramsEl || !reqidEl || !requestPreviewEl || !responseBoxEl) {
    // Page not loaded yet or we're on a different page
    return;
  }

  // 1. Read user input
  const method = methodEl.value;
  const paramsText = paramsEl.value;
  const reqid = reqidEl.value.trim();

  // 2. Parse params JSON from textarea
  let paramsObj;
  try {
    paramsObj = paramsText ? JSON.parse(paramsText) : {};
  } catch (e) {
    responseBoxEl.textContent =
      "Params JSON parse error:\n" + e;
    return;
  }

  // 3. Build JSON-RPC request body
  const bodyObj = {
    jsonrpc: "2.0",
    method: method,
    params: paramsObj
  };

  if (reqid !== "") {
    bodyObj.id = reqid;
  }

  const bodyStr = JSON.stringify(bodyObj);

  // 4. Show outgoing request in the page
  requestPreviewEl.textContent = bodyStr;

  // 5. Send request
  try {
    const resp = await fetch("https://api.citronus.com/public/v1/jsonrpc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: bodyStr
    });

    const text = await resp.text();

    // Try to pretty-print JSON
    try {
      const json = JSON.parse(text);
      responseBoxEl.textContent = JSON.stringify(json, null, 2);
    } catch {
      responseBoxEl.textContent = text;
    }
  } catch (err) {
    responseBoxEl.textContent = "Request failed:\n" + err;
  }
}

// attach button handler when page is rendered
function attachPlaygroundHandlers() {
  const sendBtn = document.getElementById("sendBtn");
  if (!sendBtn) return;
  sendBtn.addEventListener("click", callApi);
}

// Material for MkDocs does client-side navigation (instant loading between pages)
// so we have to re-bind after each page load.
document.addEventListener("DOMContentLoaded", attachPlaygroundHandlers);
document.addEventListener("navigationend", attachPlaygroundHandlers);