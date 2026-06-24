(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var boardSlug = script.dataset.board;
  if (!boardSlug) return;

  var token = script.dataset.token || "";
  var origin = new URL(script.src).origin;

  var boardSlugEncoded = encodeURIComponent(boardSlug);
  var embedSrc;
  if (token) {
    embedSrc =
      origin +
      "/api/embed-auth?token=" +
      encodeURIComponent(token) +
      "&next=" +
      encodeURIComponent("/embed/" + boardSlugEncoded);
  } else {
    embedSrc = origin + "/embed/" + boardSlugEncoded;
  }

  // Inject styles
  var style = document.createElement("style");
  style.textContent = [
    "#opencan-btn{",
    "position:fixed;bottom:24px;right:24px;z-index:2147483647;",
    "width:56px;height:56px;border-radius:28px;border:none;cursor:pointer;",
    "background:#2563eb;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.25);",
    "display:flex;align-items:center;justify-content:center;",
    "transition:transform .15s ease;",
    "}",
    "#opencan-btn:hover{transform:scale(1.08);}",
    "#opencan-btn:focus-visible{outline:3px solid #93c5fd;outline-offset:3px;}",
    "#opencan-panel{",
    "position:fixed;bottom:96px;right:24px;z-index:2147483646;",
    "width:420px;height:min(600px,90vh);border:none;border-radius:12px;",
    "box-shadow:0 8px 32px rgba(0,0,0,.18);overflow:hidden;",
    "display:none;",
    "}",
  ].join("");
  document.head.appendChild(style);

  // Create floating button
  var btn = document.createElement("button");
  btn.id = "opencan-btn";
  btn.setAttribute("aria-label", "Open feedback");
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  document.body.appendChild(btn);

  // Create iframe panel (lazy: created on first open)
  var iframe = null;
  var panelOpen = false;

  function openPanel() {
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.id = "opencan-panel";
      iframe.src = embedSrc;
      iframe.setAttribute(
        "sandbox",
        "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox",
      );
      iframe.setAttribute("title", "Feedback");
      document.body.appendChild(iframe);
    }
    iframe.style.display = "block";
    panelOpen = true;
    btn.setAttribute("aria-label", "Close feedback");
    btn.setAttribute("aria-expanded", "true");
    btn.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  }

  function closePanel() {
    if (iframe) iframe.style.display = "none";
    panelOpen = false;
    btn.setAttribute("aria-label", "Open feedback");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  }

  btn.addEventListener("click", function () {
    if (panelOpen) {
      closePanel();
    } else {
      openPanel();
    }
  });

  // Listen for close message from inside the iframe.
  // Validate origin to prevent other frames from closing the panel.
  window.addEventListener("message", function (event) {
    if (event.origin !== origin) return;
    if (event.data && event.data.type === "opencan:close") {
      closePanel();
    }
  });
})();
