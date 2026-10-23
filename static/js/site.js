/* Metro Teknik — progressive enhancement. The site is fully usable without this file. */
(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.remove("no-js");
  root.classList.add("js");

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var desktop = window.matchMedia("(min-width: 80em)");
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  var i18n = {};
  try { i18n = JSON.parse(document.getElementById("ui-strings").textContent); } catch (e) { /* defaults below */ }

  /* ---------- language persistence ----------
     The URL always decides the language. The cookie only remembers the last choice so that
     the bare domain ("/") can send returning visitors to their language. */
  function setLangCookie(code) {
    if (!code) return;
    document.cookie = "mt_lang=" + code + "; path=/; max-age=31536000; SameSite=Lax";
  }
  setLangCookie(root.getAttribute("lang"));
  document.addEventListener("click", function (e) {
    var a = e.target.closest("a[data-lang-switch]");
    if (a) setLangCookie(a.getAttribute("data-lang-switch"));
  });

  /* ---------- header shadow ---------- */
  var header = document.querySelector(".site-header");
  if (header) {
    var ticking = false;
    var onScroll = function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        header.classList.toggle("is-scrolled", window.scrollY > 8);
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- disclosure dropdowns (nav + language) ---------- */
  var openItem = null;
  var closeTimer = null;

  function setOpen(item, open, focusToggle) {
    var btn = item.querySelector("[data-dropdown-toggle]");
    item.classList.toggle("is-open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      if (openItem && openItem !== item) setOpen(openItem, false);
      openItem = item;
    } else {
      if (openItem === item) openItem = null;
      if (focusToggle) btn.focus();
    }
  }

  function menuLinks(item) {
    return Array.prototype.slice.call(item.querySelectorAll(".dropdown a"));
  }

  document.querySelectorAll("[data-dropdown]").forEach(function (item) {
    var btn = item.querySelector("[data-dropdown-toggle]");
    btn.addEventListener("click", function () {
      // a click on a menu that hover just opened pins it open instead of closing it again
      if (item.dataset.hoverOpened === "1") {
        item.dataset.hoverOpened = "";
        setOpen(item, true);
        return;
      }
      setOpen(item, btn.getAttribute("aria-expanded") !== "true");
    });
    btn.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(item, true);
        var links = menuLinks(item);
        if (links[0]) links[0].focus();
      }
    });
    item.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && item.classList.contains("is-open")) {
        e.stopPropagation();
        setOpen(item, false, true);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        var links = menuLinks(item);
        var idx = links.indexOf(document.activeElement);
        if (idx === -1) return;
        e.preventDefault();
        var next = e.key === "ArrowDown" ? Math.min(idx + 1, links.length - 1) : Math.max(idx - 1, 0);
        links[next].focus();
      }
    });
    item.addEventListener("focusout", function (e) {
      if (!item.contains(e.relatedTarget)) setOpen(item, false);
    });
    item.addEventListener("mouseenter", function () {
      if (!finePointer.matches) return;
      clearTimeout(closeTimer);
      if (!item.classList.contains("is-open")) item.dataset.hoverOpened = "1";
      setOpen(item, true);
    });
    item.addEventListener("mouseleave", function () {
      if (!finePointer.matches) return;
      closeTimer = setTimeout(function () { item.dataset.hoverOpened = ""; setOpen(item, false); }, 160);
    });
  });

  document.addEventListener("click", function (e) {
    if (openItem && !openItem.contains(e.target)) setOpen(openItem, false);
  });

  /* ---------- mobile menu ---------- */
  var toggle = document.querySelector("[data-menu-toggle]");
  var panel = document.getElementById("mobile-menu");
  var inertTargets = Array.prototype.slice.call(document.querySelectorAll("[data-inert-when-menu]"));

  function panelFocusables() {
    return Array.prototype.slice.call(panel.querySelectorAll("a[href], button:not([disabled])")).filter(function (el) {
      return el.offsetParent !== null;
    });
  }

  function setMenu(open) {
    if (!toggle || !panel) return;
    panel.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.querySelector("[data-menu-label]").textContent = open ? (i18n.close || "Close") : (i18n.menu || "Menu");
    root.classList.toggle("is-locked", open);
    inertTargets.forEach(function (el) {
      if (open) el.setAttribute("inert", ""); else el.removeAttribute("inert");
    });
    if (open) {
      var f = panelFocusables();
      if (f[0]) f[0].focus({ preventScroll: true });
    } else {
      toggle.focus({ preventScroll: true });
    }
  }

  if (toggle && panel) {
    toggle.setAttribute("role", "button");
    toggle.addEventListener("click", function (e) {
      e.preventDefault();
      setMenu(toggle.getAttribute("aria-expanded") !== "true");
    });
    toggle.addEventListener("keydown", function (e) {
      if (e.key === " ") { e.preventDefault(); toggle.click(); }
    });
    document.addEventListener("keydown", function (e) {
      if (toggle.getAttribute("aria-expanded") !== "true") return;
      if (e.key === "Escape") { setMenu(false); return; }
      if (e.key === "Tab") {
        var f = [toggle].concat(panelFocusables());
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    desktop.addEventListener("change", function (mq) {
      if (mq.matches && toggle.getAttribute("aria-expanded") === "true") setMenu(false);
    });
    panel.querySelectorAll("[data-mnav-toggle]").forEach(function (btn) {
      var sub = document.getElementById(btn.getAttribute("aria-controls"));
      btn.addEventListener("click", function () {
        var open = btn.getAttribute("aria-expanded") !== "true";
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        sub.classList.toggle("is-open", open);
        sub.toggleAttribute("inert", !open);
      });
      if (btn.getAttribute("aria-expanded") !== "true") sub.setAttribute("inert", "");
    });
  }

  /* ---------- reveal on scroll (once per element) ---------- */
  var revealEls = Array.prototype.slice.call(document.querySelectorAll("[data-reveal]"));
  if (revealEls.length && !reduceMotion.matches && "IntersectionObserver" in window) {
    var vh = window.innerHeight;
    revealEls.forEach(function (el) {
      // content already on screen is never hidden, so nothing flashes on load
      if (el.getBoundingClientRect().top < vh * 0.95) el.classList.add("is-visible");
    });
    revealEls.forEach(function (el) {
      var group = el.parentElement && el.parentElement.hasAttribute("data-reveal-group") ? el.parentElement : null;
      if (group) {
        var i = Array.prototype.indexOf.call(group.children, el);
        el.style.transitionDelay = Math.min(i % 6, 4) * 60 + "ms";
      }
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    root.classList.add("reveal-armed");
    revealEls.forEach(function (el) { if (!el.classList.contains("is-visible")) io.observe(el); });
  }

  /* ---------- lightbox ---------- */
  var links = Array.prototype.slice.call(document.querySelectorAll("a[data-lightbox]"));
  if (links.length && typeof HTMLDialogElement === "function") {
    var dlg, img, cap, pos, current = [], index = 0, opener = null;
    var icon = function (d) {
      return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>';
    };
    var build = function () {
      dlg = document.createElement("dialog");
      dlg.className = "lightbox";
      dlg.setAttribute("aria-label", i18n.dialog || "Photo viewer");
      dlg.innerHTML =
        '<div class="lightbox__inner">' +
        '<div class="lightbox__bar"><span class="lightbox__pos" aria-live="polite"></span>' +
        '<button type="button" class="lightbox__btn" data-lb="close" aria-label="' + (i18n.close_viewer || "Close") + '">' + icon("M6 6l12 12M18 6L6 18") + "</button></div>" +
        '<div class="lightbox__stage">' +
        '<button type="button" class="lightbox__btn lightbox__nav lightbox__nav--prev" data-lb="prev" aria-label="' + (i18n.prev || "Previous") + '">' + icon("M15 18l-6-6 6-6") + "</button>" +
        '<img class="lightbox__img" alt="">' +
        '<button type="button" class="lightbox__btn lightbox__nav lightbox__nav--next" data-lb="next" aria-label="' + (i18n.next || "Next") + '">' + icon("M9 6l6 6-6 6") + "</button>" +
        "</div>" +
        '<p class="lightbox__caption"></p></div>';
      document.body.appendChild(dlg);
      img = dlg.querySelector(".lightbox__img");
      cap = dlg.querySelector(".lightbox__caption");
      pos = dlg.querySelector(".lightbox__pos");
      img.addEventListener("load", function () { img.classList.remove("is-loading"); });
      dlg.addEventListener("click", function (e) {
        var act = e.target.closest("[data-lb]");
        if (act) {
          var a = act.getAttribute("data-lb");
          if (a === "close") dlg.close();
          if (a === "prev") show(index - 1);
          if (a === "next") show(index + 1);
        } else if (e.target === dlg || e.target.classList.contains("lightbox__stage")) {
          dlg.close();
        }
      });
      dlg.addEventListener("keydown", function (e) {
        if (e.key === "ArrowLeft") { e.preventDefault(); show(index - 1); }
        if (e.key === "ArrowRight") { e.preventDefault(); show(index + 1); }
      });
      dlg.addEventListener("close", function () {
        root.classList.remove("is-locked");
        if (opener) opener.focus({ preventScroll: true });
      });
      var startX = null;
      dlg.addEventListener("pointerdown", function (e) { startX = e.clientX; });
      dlg.addEventListener("pointerup", function (e) {
        if (startX === null) return;
        var dx = e.clientX - startX;
        startX = null;
        if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
      });
    };
    var show = function (i) {
      var n = current.length;
      index = (i + n) % n;
      var a = current[index];
      img.classList.add("is-loading");
      img.src = a.getAttribute("href");
      img.alt = a.getAttribute("data-caption") || "";
      cap.textContent = a.getAttribute("data-caption") || "";
      pos.textContent = (i18n.position || "{n} / {total}").replace("{n}", index + 1).replace("{total}", n);
      var single = n < 2;
      dlg.querySelectorAll(".lightbox__nav").forEach(function (b) { b.hidden = single; });
      [index + 1, index - 1].forEach(function (k) {
        var p = current[(k + n) % n];
        if (p) { var pre = new Image(); pre.src = p.getAttribute("href"); }
      });
    };
    links.forEach(function (a) {
      a.addEventListener("click", function (e) {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        if (!dlg) build();
        var group = a.getAttribute("data-lightbox");
        current = links.filter(function (l) { return l.getAttribute("data-lightbox") === group; });
        opener = a;
        show(current.indexOf(a));
        root.classList.add("is-locked");
        dlg.showModal();
      });
    });
  }
})();
