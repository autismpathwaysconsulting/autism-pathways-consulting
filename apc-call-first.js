// Home page behaviour. Everything here is an enhancement: without it the page reads top to bottom,
// the headline stays on one word, the review cards still swipe and the phone bar stays in place.
(function () {
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Headline word and photo captions are CSS loops; the script only starts them and runs Pause.
  var hero = document.querySelector(".cf-hero"), pause = hero.querySelector(".cf-pause");
  hero.classList.add("cf-loop");
  pause.addEventListener("click", function () {
    var paused = hero.classList.toggle("cf-paused"), word = paused ? "Play" : "Pause";
    pause.lastChild.textContent = word;
    pause.setAttribute("aria-label", word + " the moving headline and photo captions");
  });

  // Phone bar: appears once the hero has scrolled off the top of the screen.
  var bar = document.querySelector(".cf-bar");
  new IntersectionObserver(function (entries) {
    bar.classList.toggle("cf-show", entries[0].boundingClientRect.bottom < 0);
  }).observe(hero);

  // Programme: one step lit at a time, only while the section is on screen, so the dimmed steps
  // are never what a reader lands on. Reduced motion keeps the fade but drops the movement.
  var list = document.querySelector(".cf-steps"), steps = [].slice.call(list.children);
  var current = 0, holdUntil = 0, onScreen = false, frame = 0;
  var show = function (n) {
    current = n;
    steps.forEach(function (step, i) { step.classList.toggle("cf-on", i === n); });
  };
  var choose = function (n) { holdUntil = Date.now() + 6000; show(n); };
  list.classList.toggle("cf-calm", reduce);
  show(0);
  steps.forEach(function (step, n) {
    step.tabIndex = 0;
    ["mouseenter", "focus", "click"].forEach(function (type) {
      step.addEventListener(type, function () { choose(n); });
    });
  });
  new IntersectionObserver(function (entries) {
    onScreen = entries[0].isIntersecting;
    list.classList.toggle("cf-live", onScreen);
  }, { threshold: 0.25 }).observe(list);
  setInterval(function () {
    if (onScreen && Date.now() >= holdUntil) show((current + 1) % steps.length);
  }, 2800);
  // Phones: the step nearest the middle of the screen lights up while scrolling.
  var phone = matchMedia("(max-width: 820px)");
  addEventListener("scroll", function () {
    if (!phone.matches || !onScreen || frame) return;
    frame = requestAnimationFrame(function () {
      frame = 0;
      var middle = innerHeight / 2, best = current, bestGap = Infinity;
      steps.forEach(function (step, i) {
        var box = step.getBoundingClientRect(), gap = Math.abs(box.top + box.height / 2 - middle);
        if (gap < bestGap) { bestGap = gap; best = i; }
      });
      choose(best);
    });
  }, { passive: true });

  // Reviews: one card at a time. Swipe is native scroll snap; arrows and dots move it. No auto-advance.
  var track = document.querySelector(".cf-track"), cards = [].slice.call(track.children);
  var dots = [].slice.call(document.querySelectorAll(".cf-rdots button")), shown = 0, settle = 0;
  var mark = function (n) {
    shown = n;
    dots.forEach(function (dot, i) {
      dot.classList.toggle("cf-on", i === n);
      if (i === n) dot.setAttribute("aria-current", "true"); else dot.removeAttribute("aria-current");
    });
  };
  var go = function (n) {
    n = (n + cards.length) % cards.length;
    track.scrollTo({ left: cards[n].offsetLeft, behavior: reduce ? "auto" : "smooth" });
    mark(n);
  };
  dots.forEach(function (dot, n) { dot.addEventListener("click", function () { go(n); }); });
  document.querySelector(".cf-prev").addEventListener("click", function () { go(shown - 1); });
  document.querySelector(".cf-next").addEventListener("click", function () { go(shown + 1); });
  track.addEventListener("scroll", function () {
    clearTimeout(settle);
    settle = setTimeout(function () { mark(Math.round(track.scrollLeft / track.clientWidth)); }, 80);
  }, { passive: true });
  track.addEventListener("keydown", function (event) {
    if (event.key === "ArrowRight") { event.preventDefault(); go(shown + 1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); go(shown - 1); }
  });
})();
