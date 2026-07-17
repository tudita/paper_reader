(() => {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const SETTINGS_VERSION = 5;
  const defaults = { mode: "paragraph", theme: "paper", contentWidth: 820, originalFont: "serif", translationFont: "cjk-serif", originalSize: 18, translationSize: 18, lineHeight: 1.75, paragraphGap: 24, termsWidth: 340, customColors: false, originalColor: "#20231f", translationColor: "#202820" };
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem("paper-reader-settings") || "{}"); } catch { stored = {}; }
  if (stored.settingsVersion !== SETTINGS_VERSION) stored = { ...stored, originalFont: defaults.originalFont, translationFont: defaults.translationFont, translationSize: defaults.translationSize, lineHeight: defaults.lineHeight, paragraphGap: defaults.paragraphGap, customColors: false, originalColor: defaults.originalColor, translationColor: defaults.translationColor, settingsVersion: SETTINGS_VERSION };
  const state = { ...defaults, ...stored, data: null, currentSection: null, termsOpen: false };
  const fontStacks = {
    serif: '"Times New Roman",Times,serif', sans: 'Inter,"Segoe UI",Arial,sans-serif', mono: '"Cascadia Mono",Consolas,monospace',
    "cjk-serif": '"LXGW WenKai GB Screen","霞鹜文楷 GB 屏幕阅读版","LXGW WenKai Screen",KaiTi,cursive',
    "cjk-sans": '"Noto Sans CJK SC","Source Han Sans SC","Microsoft YaHei",sans-serif', system: 'system-ui,-apple-system,"Segoe UI",sans-serif'
  };

  function toast(message) { const node = $("#toast"); node.textContent = message; node.classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove("show"), 2600); }
  function validatePaper(data) {
    if (!data || data.schemaVersion !== 1 || !data.metadata?.title || !Array.isArray(data.sections) || !data.sections.length) throw new Error("这不是兼容的 paper.json（需要 schemaVersion 1、标题和章节）。");
    data.sections.forEach(section => { if (!section.id || !Array.isArray(section.blocks)) throw new Error("论文 JSON 中存在无效章节。"); });
    return data;
  }
  function put(parent, className, text, lang) { const node = make("div", className, text); if (lang) node.lang = lang; parent.append(node); }

  function persistSettings() {
    const saved = {}; Object.keys(defaults).forEach(key => saved[key] = state[key]);
    saved.settingsVersion = SETTINGS_VERSION;
    localStorage.setItem("paper-reader-settings", JSON.stringify(saved));
  }
  function applySettings(render = false) {
    const root = document.documentElement;
    root.dataset.theme = state.theme;
    root.style.setProperty("--content-width", state.contentWidth + "px");
    root.style.setProperty("--original-font", fontStacks[state.originalFont]);
    root.style.setProperty("--translation-font", fontStacks[state.translationFont]);
    root.style.setProperty("--original-size", state.originalSize + "px");
    root.style.setProperty("--translation-size", state.translationSize + "px");
    root.style.setProperty("--reader-line", state.lineHeight);
    root.style.setProperty("--paragraph-gap", state.paragraphGap + "px");
    root.style.setProperty("--terms-width", state.termsWidth + "px");
    if (state.customColors) { root.style.setProperty("--reader-original", state.originalColor); root.style.setProperty("--reader-translation", state.translationColor); }
    else { root.style.removeProperty("--reader-original"); root.style.removeProperty("--reader-translation"); }
    document.querySelectorAll("[data-mode]").forEach(button => button.classList.toggle("active", button.dataset.mode === state.mode));
    syncControls(); persistSettings(); if (render && state.data) { renderHeader(); renderSections(); }
  }
  function syncControls() {
    ["contentWidth", "originalFont", "translationFont", "originalSize", "translationSize", "lineHeight", "paragraphGap", "termsWidth", "theme"].forEach(key => { const input = $("#" + key); if (input) input.value = state[key]; });
    $("#customColors").checked = state.customColors; $("#originalColor").value = state.originalColor; $("#translationColor").value = state.translationColor;
    $("#originalColor").disabled = $("#translationColor").disabled = !state.customColors; $("#colorControls").classList.toggle("disabled", !state.customColors);
    $("#contentWidthOut").textContent = state.contentWidth + "px"; $("#originalSizeOut").textContent = state.originalSize + "px"; $("#translationSizeOut").textContent = state.translationSize + "px";
    $("#lineHeightOut").textContent = Number(state.lineHeight).toFixed(2); $("#paragraphGapOut").textContent = state.paragraphGap + "px"; $("#termsWidthOut").textContent = state.termsWidth + "px";
  }

  function renderHeader() {
    const meta = state.data.metadata || {}, paper = $("#paper"), header = make("header", "paper-header");
    document.title = (meta.title || "Paper") + " · Paper Reader";
    header.append(make("div", "kicker", [meta.venue, meta.year].filter(Boolean).join(" · ") || "ACADEMIC PAPER"));
    if (state.mode === "translation" && meta.titleTranslation) header.append(make("h1", "paper-title paper-title-translation", meta.titleTranslation));
    else {
      header.append(make("h1", "paper-title", meta.title || "Untitled paper"));
      if (state.mode !== "original" && meta.titleTranslation) header.append(make("div", "title-translation", meta.titleTranslation));
    }
    if ((meta.authors || []).length) header.append(make("div", "authors", meta.authors.join("  ·  ")));
    const details = make("div", "meta"); if (meta.doi) details.append(make("span", "chip", "DOI " + meta.doi)); if (meta.source) details.append(make("span", "chip", meta.source)); header.append(details);
    if (meta.notes) header.append(make("div", "note", meta.notes)); paper.replaceChildren(header);
  }
  function renderBlock(block) {
    const wrapper = make("div", "content block-" + (block.type || "paragraph")); wrapper.dataset.blockId = block.id;
    if (state.mode === "original") put(wrapper, "text original", block.original, state.data.metadata.language);
    else if (state.mode === "translation") put(wrapper, "text translation", block.translation, state.data.metadata.targetLanguage);
    else if (state.mode === "paragraph") { const pair = make("div", "paragraph-pair"); put(pair, "text original", block.original, state.data.metadata.language); put(pair, "text translation", block.translation, state.data.metadata.targetLanguage); wrapper.append(pair); }
    else (block.sentences || []).forEach((sentence, index) => { const pair = make("div", "sentence-pair"); pair.dataset.n = String(index + 1); put(pair, "text original", sentence.original, state.data.metadata.language); put(pair, "text translation", sentence.translation, state.data.metadata.targetLanguage); wrapper.append(pair); });
    return wrapper;
  }
  function renderSections() {
    const paper = $("#paper"); paper.querySelectorAll(".paper-section").forEach(node => node.remove());
    state.data.sections.forEach((section, index) => { const sectionNode = make("section", "paper-section"); sectionNode.id = section.id; const heading = make("h" + Math.min(4, Math.max(2, Number(section.level || 1) + 1)), "section-heading"); heading.append(make("span", "section-number", String(index + 1).padStart(2, "0"))); const titles = make("span", "section-titles"); if (state.mode === "translation") titles.append(make("span", "section-translation section-translation-primary", section.titleTranslation || section.title)); else { titles.append(make("span", "section-original", section.title)); if (state.mode !== "original" && section.titleTranslation) titles.append(make("span", "section-translation", section.titleTranslation)); } heading.append(titles); sectionNode.append(heading); (section.blocks || []).forEach(block => sectionNode.append(renderBlock(block))); paper.append(sectionNode); });
    observeSections();
  }
  function renderToc() { const toc = $("#toc"); toc.replaceChildren(); state.data.sections.forEach(section => { const link = make("a", "toc-link level-" + (section.level || 1), section.titleTranslation || section.title); link.href = "#" + section.id; link.onclick = closeMobilePanels; toc.append(link); }); }
  function observeSections() { if (state.observer) state.observer.disconnect(); state.observer = new IntersectionObserver(entries => { const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (visible) { state.currentSection = visible.target.id; if ($("#currentTermsOnly").checked) renderTerms(); } }, { rootMargin: "-15% 0px -70% 0px" }); document.querySelectorAll(".paper-section").forEach(section => state.observer.observe(section)); }

  function renderTerms() {
    const list = $("#termsList"), needle = $("#termSearch").value.trim().toLocaleLowerCase(), currentOnly = $("#currentTermsOnly").checked;
    const terms = (state.data?.terms || []).filter(term => (!currentOnly || !(term.sectionIds || []).length || term.sectionIds.includes(state.currentSection)) && [term.term, term.translation, term.definition].join(" ").toLocaleLowerCase().includes(needle));
    list.replaceChildren(); if (!terms.length) { list.append(make("div", "empty", needle ? "没有匹配的术语" : "当前范围没有术语")); return; }
    terms.forEach(term => { const card = make("article", "term-card"); card.append(make("div", "term-name", term.term)); if (term.translation) card.append(make("div", "term-translation", term.translation)); card.append(make("p", "term-definition", term.definition)); const find = make("button", "term-find", "在正文中查找"); find.onclick = () => { if (window.find) window.find(term.term, false, false, true, false, true, false); else toast("当前浏览器不支持页内术语查找"); }; card.append(find); list.append(card); });
  }
  function setTerms(open) { state.termsOpen = open; document.body.classList.toggle("terms-open", open); $("#termsPanel").setAttribute("aria-hidden", String(!open)); if (open) renderTerms(); updateMobileScrim(); }
  function setSettings(open) { $("#settingsPanel").classList.toggle("open", open); $("#settingsPanel").setAttribute("aria-hidden", String(!open)); $("#settingsToggle").setAttribute("aria-expanded", String(open)); }
  function updateMobileScrim() { const mobile = matchMedia("(max-width:900px)").matches; $("#mobileScrim").classList.toggle("visible", mobile && (state.termsOpen || $("#tocPanel").classList.contains("open"))); }
  function closeMobilePanels() { $("#tocPanel").classList.remove("open"); if (matchMedia("(max-width:900px)").matches) setTerms(false); updateMobileScrim(); }

  function setPaper(candidate) {
    state.data = validatePaper(candidate); $("#welcome").hidden = true; $("#readerShell").hidden = false; $("#modeSwitcher").hidden = false; $("#tocToggle").hidden = false; $("#libraryButton").hidden = false; $("#openFileButton").hidden = true; $("#settingsToggle").hidden = false; $("#termsToggle").hidden = false; renderHeader(); renderToc(); renderSections(); renderTerms(); $("#paper").focus();
  }
  function showLibrary(updateHistory = true) {
    const hadPaper = Boolean(state.data || new URLSearchParams(location.search).get("paper"));
    state.data = null; state.currentSection = null; $("#welcome").hidden = false; $("#readerShell").hidden = true; $("#modeSwitcher").hidden = true; $("#tocToggle").hidden = true; $("#libraryButton").hidden = true; $("#openFileButton").hidden = false; $("#settingsToggle").hidden = true; $("#termsToggle").hidden = true;
    setTerms(false); closeMobilePanels(); setSettings(false); document.title = "Paper Reader";
    if (updateHistory && hadPaper && location.protocol !== "file:") { const url = new URL(location.href); url.searchParams.delete("paper"); url.hash = ""; history.pushState({ view: "library" }, "", url.pathname + url.search); }
    window.scrollTo({ top: 0, behavior: "smooth" }); loadLibrary();
  }
  async function loadUrl(url) { try { const response = await fetch(url); if (!response.ok) throw new Error("HTTP " + response.status); setPaper(await response.json()); } catch (error) { toast("无法加载论文 JSON：" + error.message); } }
  async function readFile(file) { if (!file) return; try { setPaper(JSON.parse(await file.text())); toast("已打开 " + file.name); } catch (error) { toast(error.message || "无法读取 JSON"); } }
  async function loadLibrary() {
    const status = $("#libraryStatus"), grid = $("#libraryGrid"); grid.replaceChildren();
    if (location.protocol === "file:") { status.textContent = "本地文件模式：请打开或拖入 JSON"; return; }
    try { const response = await fetch("../library.json", { cache: "no-store" }); if (!response.ok) throw new Error(); const library = await response.json(); const papers = library.papers || []; status.textContent = papers.length + " 篇论文"; papers.forEach(item => { const card = make("button", "library-card"); card.append(make("span", "library-year", item.year || "PAPER"), make("strong", "", item.titleTranslation || item.title), make("span", "library-original", item.title)); card.onclick = () => { const path = "../" + item.path; history.pushState({ paper: path }, "", "?paper=" + encodeURIComponent(path)); loadUrl(path); }; grid.append(card); }); } catch { status.textContent = "论文库尚未建立"; }
  }

  document.querySelectorAll("[data-mode]").forEach(button => button.onclick = () => { state.mode = button.dataset.mode; applySettings(true); });
  $("#libraryButton").onclick = () => showLibrary(true); $("#brandHome").onclick = event => { event.preventDefault(); showLibrary(true); };
  $("#openFileButton").onclick = $("#welcomeOpen").onclick = () => $("#fileInput").click(); $("#fileInput").onchange = event => readFile(event.target.files[0]);
  $("#dropZone").onclick = () => $("#fileInput").click(); $("#dropZone").onkeydown = event => { if (event.key === "Enter" || event.key === " ") $("#fileInput").click(); };
  document.addEventListener("dragover", event => { event.preventDefault(); $("#dropZone").classList.add("dragging"); }); document.addEventListener("dragleave", () => $("#dropZone").classList.remove("dragging")); document.addEventListener("drop", event => { event.preventDefault(); $("#dropZone").classList.remove("dragging"); readFile(event.dataTransfer.files[0]); });
  $("#termsToggle").onclick = () => setTerms(!state.termsOpen); $("#termsClose").onclick = () => setTerms(false); $("#termSearch").oninput = renderTerms; $("#currentTermsOnly").onchange = renderTerms;
  $("#tocToggle").onclick = () => { $("#tocPanel").classList.add("open"); updateMobileScrim(); }; $("#mobileScrim").onclick = closeMobilePanels;
  $("#settingsToggle").onclick = () => setSettings(!$("#settingsPanel").classList.contains("open")); $("#settingsClose").onclick = () => setSettings(false);
  ["contentWidth", "originalFont", "translationFont", "originalSize", "translationSize", "lineHeight", "paragraphGap", "termsWidth", "theme"].forEach(key => { $("#" + key).oninput = event => { state[key] = ["originalFont", "translationFont", "theme"].includes(key) ? event.target.value : Number(event.target.value); applySettings(false); }; });
  $("#customColors").onchange = event => { state.customColors = event.target.checked; applySettings(false); };
  ["originalColor", "translationColor"].forEach(key => { $("#" + key).oninput = event => { state[key] = event.target.value; applySettings(false); }; });
  $("#resetSettings").onclick = () => { Object.assign(state, defaults); applySettings(true); toast("已恢复默认阅读设置"); };
  document.addEventListener("keydown", event => { if (event.key === "Escape") { closeMobilePanels(); setSettings(false); } });

  window.addEventListener("popstate", () => { const paper = new URLSearchParams(location.search).get("paper"); if (paper) loadUrl(paper); else showLibrary(false); });
  applySettings(false); loadLibrary(); const requested = new URLSearchParams(location.search).get("paper"); if (requested) loadUrl(requested);
})();
