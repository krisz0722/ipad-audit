  /* ---------- indítás ---------- */

  var detected = DEVICE;
  var restored = DEMO_ID ? false : restore();
  if (!restored) {
    if (!DEMO && CODE && !localUsbBlock && (!ON_COMPUTER || LINK_SID)) {
      state.kind = 'ios';
      state.path = ['web_intro'];
      state.idx = 0;
      state.step = 'web_intro';
    } else {
      state.path = ['welcome'];
      state.idx = 0;
      state.step = 'welcome';
    }
  }
  if (detected) state.detectedOs = detected.version;
  if (!state.osFamily) state.osFamily = detected ? familyOf(detected.major) : 'latest';
  if (detected && !state.vals.os) state.vals.os = detected.version;
  try { history.replaceState({ idx: state.idx }, ''); } catch (e) { /* nem baj */ }
  window.addEventListener('popstate', onPop);
  if (DEMO && DEMO_ID && jumpDemo(DEMO_ID)) { /* a mélylink a kért képernyőre vitt */ } else { render(); }
})();
