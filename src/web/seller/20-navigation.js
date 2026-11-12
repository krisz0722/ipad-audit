/* ---------- lépéskezelés ---------- */

// Minden tényleges navigáció növeli. A Vissza tartalék időzítője ebből tudja, hogy közben történt-e más lépés.
var navCount = 0;

function render() {
  if (state.sent) state.step = "done";
  var screen = SCREENS[state.step] || SCREENS.welcome;
  screen();
}
function go(name) {
  navCount++;
  state.path = state.path.slice(0, state.idx + 1);
  state.path.push(name);
  state.idx = state.path.length - 1;
  state.step = name;
  try {
    history.pushState({ idx: state.idx }, "");
  } catch (e) {
    /* nem baj, a gomb enélkül is visszalép */
  }
  render();
}
function replace(name) {
  navCount++;
  state.path[state.idx] = name;
  state.step = name;
  try {
    history.replaceState({ idx: state.idx }, "");
  } catch (e) {
    /* nem baj */
  }
  render();
}
function goBack() {
  if (state.idx <= 0) return;
  var before = state.idx,
    mark = navCount;
  try {
    history.back();
  } catch (e) {
    /* lent a tartalék */
  }
  // Ha a böngésző nem jelezte a visszalépést, mi lépünk vissza. Ha közben már más navigáció történt (például gyorsan
  // továbbléptek ugyanarra a lépésszámra), a tartalék nem lép vissza még egyszer.
  setTimeout(function () {
    if (navCount === mark && state.idx === before) {
      navCount++;
      state.idx = before - 1;
      state.step = state.path[state.idx];
      render();
    }
  }, 250);
}
function onPop(event) {
  var idx =
    event.state && typeof event.state.idx === "number" ? event.state.idx : null;
  if (idx === null || idx < 0 || idx >= state.path.length) return;
  navCount++;
  state.idx = idx;
  state.step = state.path[idx];
  render();
}
