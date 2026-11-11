  /* ---------- lépéskezelés ---------- */

  function render() {
    if (state.sent) state.step = 'done';
    var screen = SCREENS[state.step] || SCREENS.welcome;
    screen();
  }
  function go(name) {
    state.path = state.path.slice(0, state.idx + 1);
    state.path.push(name);
    state.idx = state.path.length - 1;
    state.step = name;
    try { history.pushState({ idx: state.idx }, ''); } catch (e) { /* nem baj, a gomb enélkül is visszalép */ }
    render();
  }
  function replace(name) {
    state.path[state.idx] = name;
    state.step = name;
    try { history.replaceState({ idx: state.idx }, ''); } catch (e) { /* nem baj */ }
    render();
  }
  function goBack() {
    if (state.idx <= 0) return;
    var before = state.idx;
    try { history.back(); } catch (e) { /* lent a tartalék */ }
    // Ha a böngésző nem jelezte a visszalépést, mi lépünk vissza.
    setTimeout(function () {
      if (state.idx === before) {
        state.idx = before - 1;
        state.step = state.path[state.idx];
        render();
      }
    }, 250);
  }
  function onPop(event) {
    var idx = event.state && typeof event.state.idx === 'number' ? event.state.idx : null;
    if (idx === null || idx < 0 || idx >= state.path.length) return;
    state.idx = idx;
    state.step = state.path[idx];
    render();
  }

