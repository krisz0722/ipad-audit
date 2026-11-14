/* fizikai gombok: bekapcsoló (lock), kezdőképernyő (home) és hangerőgombok */
SCREENS.hw_buttons = function () {
  if (
    hwScreen(
      "buttons",
      "Ellenőrizzük az eszköz fizikai gombjait (bekapcsoló/lock, home és hangerő fel/le gombok).",
      "",
      true,
      ""
    )
  ) {
    on("hw-start", startButtons);
  }
};

function startButtons() {
  var lockSeen = false;
  var wasHidden = false;

  function updateBadge() {
    var badge = $("btn-lock-badge");
    if (badge) {
      badge.textContent = "✅ Bekapcsoló / Home gomb érzékelve!";
      badge.className = "success";
    }
  }

  function onVisChange() {
    if (document.visibilityState === "hidden") {
      wasHidden = true;
    } else if (document.visibilityState === "visible" && wasHidden) {
      lockSeen = true;
      updateBadge();
    }
  }

  function onPageHide() {
    wasHidden = true;
  }

  function onPageShow() {
    if (wasHidden) {
      lockSeen = true;
      updateBadge();
    }
  }

  function cleanup() {
    if (document.removeEventListener) {
      document.removeEventListener("visibilitychange", onVisChange, false);
      window.removeEventListener("pagehide", onPageHide, false);
      window.removeEventListener("pageshow", onPageShow, false);
    }
  }

  if (document.addEventListener) {
    document.addEventListener("visibilitychange", onVisChange, false);
    window.addEventListener("pagehide", onPageHide, false);
    window.addEventListener("pageshow", onPageShow, false);
  }

  var html =
    '<div class="card" style="margin: 1.5em 0; padding: 1em; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">' +
    '<div id="btn-lock-group" style="margin-bottom: 1.2em;">' +
    "<strong>1. Bekapcsoló (Lock) vagy Home gomb</strong>" +
    '<p style="margin: 0.5em 0;">Zárold a képernyőt a bekapcsoló gombbal vagy nyomd meg a Home gombot, majd ébreszd fel az eszközt és térj vissza ide a Safariba!</p>' +
    '<div id="btn-lock-badge" class="note" style="margin-top: 0.5em;">⏳ Várakozás a képernyőzárra és visszatérésre...</div>' +
    "</div>" +
    '<hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 1em 0;">' +
    '<div id="btn-vol-group">' +
    "<strong>2. Hangerő fel (+) és Hangerő le (-) gombok</strong>" +
    '<p style="margin: 0.5em 0;">Nyomd meg az eszköz oldalán a hangerőgombokat! Látod a képernyőn megjelenni és elmozdulni a hangerőjelzőt?</p>' +
    '<div style="margin-top: 0.8em;">' +
    '<button type="button" class="btn" id="vol-ok">Működnek a hangerőgombok</button>' +
    '<button type="button" class="btn secondary" id="vol-bad" style="margin-left: 0.5em;">Nem működnek / beragadtak</button>' +
    "</div>" +
    "</div>" +
    "</div>";

  message("result", html);

  on("vol-bad", function () {
    cleanup();
    hwDone("buttons", "bad", "a hangerőgombok nem működnek vagy beragadtak");
    hwResult("buttons");
  });

  on("vol-ok", function () {
    if (lockSeen) {
      cleanup();
      hwDone("buttons", "ok", "bekapcsoló/Home és hangerőgombok működnek");
      hwResult("buttons");
      return;
    }
    message(
      "result",
      "<p>A hangerőgombok rendben. A bekapcsoló (Lock) vagy Home gomb is rendben működik az eszközön?</p>" +
        '<button type="button" class="btn" id="lock-manual-ok">Igen, működik</button>' +
        '<button type="button" class="btn secondary" id="lock-manual-bad" style="margin-left: 0.5em;">Nem működik / hibás</button>'
    );
    on("lock-manual-ok", function () {
      cleanup();
      hwDone("buttons", "ok", "bekapcsoló/Home és hangerőgombok működnek");
      hwResult("buttons");
    });
    on("lock-manual-bad", function () {
      cleanup();
      hwDone("buttons", "bad", "a bekapcsoló vagy Home gomb hibás");
      hwResult("buttons");
    });
  });
}
