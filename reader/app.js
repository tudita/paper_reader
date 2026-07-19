(() => {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const SETTINGS_VERSION = 9;
  const defaults = { mode: "paragraph", theme: "paper", contentWidth: 820, originalFont: "serif", translationFont: "cjk-serif", originalSize: 18, translationSize: 18, lineHeight: 1.75, paragraphGap: 24, termsWidth: 340, customColors: false, originalColor: "#20231f", translationColor: "#202820" };
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem("paper-reader-settings") || "{}"); } catch { stored = {}; }
  if (stored.settingsVersion !== SETTINGS_VERSION) stored = { ...stored, originalFont: defaults.originalFont, translationFont: defaults.translationFont, translationSize: defaults.translationSize, lineHeight: defaults.lineHeight, paragraphGap: defaults.paragraphGap, customColors: false, originalColor: defaults.originalColor, translationColor: defaults.translationColor, settingsVersion: SETTINGS_VERSION };
  const state = { ...defaults, ...stored, data: null, currentSection: null, termsOpen: false, libraryPapers: [] };
  const fontStacks = {
    serif: '"Times New Roman",Times,serif', sans: 'Inter,"Segoe UI",Arial,sans-serif', mono: '"Cascadia Mono",Consolas,monospace',
    "cjk-serif": '"PaperReader LXGW WenKai GB Screen","LXGW WenKai GB Screen","霞鹜文楷 GB 屏幕阅读版","LXGW WenKai Screen",KaiTi,cursive',
    "cjk-sans": '"Noto Sans CJK SC","Source Han Sans SC","Microsoft YaHei",sans-serif', system: 'system-ui,-apple-system,"Segoe UI",sans-serif'
  };

  function toast(message) { const node = $("#toast"); node.textContent = message; node.classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove("show"), 2600); }
  function validatePaper(data) {
    if (!data || data.schemaVersion !== 2 || !data.metadata?.title || !Array.isArray(data.sections) || !data.sections.length) throw new Error("这不是兼容的 paper.json（需要 schemaVersion 2、标题和 sections）。");
    data.sections.forEach(section => { if (!section.id || typeof section.originalMarkdown !== "string" || typeof section.translationMarkdown !== "string") throw new Error("论文 JSON 中存在无效 section Markdown。"); });
    return data;
  }
  function inlineMarkdown(text) { return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>"); }
  function splitMarkdownUnits(markdown) { const text = String(markdown || "").replace(/\r\n/g, "\n").trim(); return text ? text.split(/\n\s*\n/).filter(unit => unit.trim()) : []; }
  function plainMarkdownText(text) { return String(text || "").replace(/`([^`]+)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[\\#>]/g, "").replace(/\s+/g, " ").trim(); }
  function extractMarkdownHeadings(markdown) {
    const headings = []; let code = false;
    String(markdown || "").replace(/\r\n/g, "\n").split("\n").forEach(line => {
      if (/^```/.test(line)) { code = !code; return; }
      if (code) return;
      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) headings.push({ level: heading[1].length, title: plainMarkdownText(heading[2]) || heading[2].trim() });
    });
    return headings;
  }
  function tocTitle(section) { return state.mode === "original" ? section.title : (section.titleTranslation || section.title); }
  function tocMarkdown(section) { return state.mode === "original" ? section.originalMarkdown : (section.translationMarkdown || section.originalMarkdown); }
  function tocHeadingId(section, index) { return section.id + "-subheading-" + String(index + 1).padStart(2, "0"); }
  function buildTocEntries() {
    const entries = [];
    state.data.sections.forEach(section => {
      const baseLevel = Math.min(6, Math.max(1, Number(section.level || 1)));
      entries.push({ id: section.id, level: baseLevel, title: tocTitle(section) });
      extractMarkdownHeadings(tocMarkdown(section)).forEach((heading, index) => {
        entries.push({ id: tocHeadingId(section, index), level: Math.min(6, baseLevel + Math.max(1, heading.level - 2)), title: heading.title });
      });
    });
    return entries;
  }
  function decorateHeadingAnchors(paper) {
    state.data.sections.forEach(section => {
      const sectionNode = document.getElementById(section.id);
      if (!sectionNode) return;
      const headings = extractMarkdownHeadings(tocMarkdown(section));
      const preferred = state.mode === "original" ? ".markdown.original .markdown-heading" : ".markdown.translation .markdown-heading";
      let nodes = Array.from(sectionNode.querySelectorAll(preferred));
      if (!nodes.length && state.mode !== "original") nodes = Array.from(sectionNode.querySelectorAll(".markdown.original .markdown-heading"));
      nodes.slice(0, headings.length).forEach((node, index) => { node.id = tocHeadingId(section, index); });
    });
  }
  function renderMath(root) {
    if (!window.renderMathInElement) return;
    try {
      window.renderMathInElement(root, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "\\[", right: "\\]", display: true },
          { left: "\\(", right: "\\)", display: false },
          { left: "$", right: "$", display: false }
        ],
        ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"],
        throwOnError: false
      });
    } catch (error) {
      console.warn("Formula rendering failed", error);
    }
  }
  function renderMarkdown(markdown, className, lang) {
    const root = make("div", "markdown " + className); if (lang) root.lang = lang;
    const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n"); let paragraph = [], list = null, code = false, codeLines = [];
    const flushParagraph = () => { if (!paragraph.length) return; const node = make("p"); node.innerHTML = inlineMarkdown(paragraph.join(" ")); root.append(node); paragraph = []; };
    const flushList = () => { if (list) { root.append(list); list = null; } };
    const flushCode = () => { if (!codeLines.length) return; const pre = make("pre"), codeNode = make("code", "", codeLines.join("\n")); pre.append(codeNode); root.append(pre); codeLines = []; };
    lines.forEach(line => { if (/^```/.test(line)) { flushParagraph(); flushList(); if (code) flushCode(); code = !code; return; } if (code) { codeLines.push(line); return; } const heading = line.match(/^(#{1,6})\s+(.+)$/); if (heading) { flushParagraph(); flushList(); const level = heading[1].length; const node = make("h" + Math.min(6, level + 2), "markdown-heading markdown-heading-level-" + level); node.innerHTML = inlineMarkdown(heading[2]); root.append(node); return; } const item = line.match(/^\s*[-*+]\s+(.+)$/); if (item) { flushParagraph(); if (!list) list = make("ul"); const li = make("li"); li.innerHTML = inlineMarkdown(item[1]); list.append(li); return; } if (!line.trim()) { flushParagraph(); flushList(); return; } paragraph.push(line.trim()); });
    flushParagraph(); flushList(); if (code) flushCode(); return root;
  }

  function unitKind(unit) {
    const text = String(unit || "").trim();
    if (/^#{1,6}\s+/m.test(text)) return "heading";
    if (/^```/.test(text) || /^\$\$/.test(text) || /^\\\[/.test(text)) return "display";
    if (/^\s*[-*+]\s+/m.test(text)) return "list";
    return "paragraph";
  }
  function appendMarkdownUnits(sectionNode, section) {
    const originalUnits = splitMarkdownUnits(section.originalMarkdown), translationUnits = splitMarkdownUnits(section.translationMarkdown);
    if (originalUnits.length !== translationUnits.length) throw new Error(`章节 ${section.title} 的中英 unit 数量不一致（${originalUnits.length}/${translationUnits.length}）。`);
    const appendSingle = (unit, className, lang) => { const wrapper = make("div", "unit-content unit-" + unitKind(unit)); wrapper.append(renderMarkdown(unit, className, lang)); sectionNode.append(wrapper); };
    if (state.mode === "original") originalUnits.forEach(unit => appendSingle(unit, "original", state.data.metadata.language));
    else if (state.mode === "translation") translationUnits.forEach(unit => appendSingle(unit, "translation", state.data.metadata.targetLanguage));
    else originalUnits.forEach((unit, index) => {
      const wrapper = make("div", "unit-content unit-" + unitKind(unit)), pair = make("div", "paragraph-pair");
      pair.append(renderMarkdown(unit, "original", state.data.metadata.language), renderMarkdown(translationUnits[index], "translation", state.data.metadata.targetLanguage));
      wrapper.append(pair); sectionNode.append(wrapper);
    });
  }

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
    syncControls(); persistSettings(); if (render && state.data) { renderHeader(); renderToc(); renderSections(); }
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
  function renderSections() {
    const paper = $("#paper"); paper.querySelectorAll(".paper-section").forEach(node => node.remove());
    state.data.sections.forEach((section, index) => { const sectionNode = make("section", "paper-section"); sectionNode.id = section.id; const level = Math.min(3, Math.max(1, Number(section.level || 1))); const heading = make("h" + (level + 1), "section-heading section-heading-level-" + level + (state.mode === "translation" ? " section-heading-translation-only" : "")); heading.append(make("span", "section-number", String(index + 1).padStart(2, "0"))); const titles = make("span", "section-titles"); if (state.mode === "translation") titles.append(make("span", "section-translation section-translation-primary", section.titleTranslation || section.title)); else { titles.append(make("span", "section-original", section.title)); if (state.mode !== "original" && section.titleTranslation) titles.append(make("span", "section-translation", section.titleTranslation)); } heading.append(titles); sectionNode.append(heading); appendMarkdownUnits(sectionNode, section); paper.append(sectionNode); });
    decorateHeadingAnchors(paper);
    renderMath(paper);
    observeSections();
  }
  function renderToc() { const toc = $("#toc"); toc.replaceChildren(); buildTocEntries().forEach(entry => { const link = make("a", "toc-link level-" + entry.level, entry.title); link.href = "#" + entry.id; link.onclick = closeMobilePanels; toc.append(link); }); }
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
  function normalizeLibraryTitle(title) { return String(title || "").normalize("NFKD").toLocaleLowerCase("en"); }
  function renderLibrary() {
    const status = $("#libraryStatus"), grid = $("#libraryGrid"), query = $("#librarySearch").value.trim();
    const needle = normalizeLibraryTitle(query);
    const papers = state.libraryPapers.filter(item => normalizeLibraryTitle(item.title).includes(needle));
    grid.replaceChildren();
    status.textContent = query ? papers.length + " / " + state.libraryPapers.length + " 篇论文" : state.libraryPapers.length + " 篇论文";
    if (!papers.length && query) { grid.append(make("div", "library-empty", "没有匹配该英文标题的论文")); return; }
    papers.forEach(item => { const card = make("button", "library-card"); card.append(make("span", "library-year", item.year || "PAPER"), make("strong", "", item.titleTranslation || item.title), make("span", "library-original", item.title)); card.onclick = () => { const path = "../" + item.path; history.pushState({ paper: path }, "", "?paper=" + encodeURIComponent(path)); loadUrl(path); }; grid.append(card); });
  }
  async function loadLibrary() {
    const status = $("#libraryStatus"), grid = $("#libraryGrid"); grid.replaceChildren();
    if (location.protocol === "file:") { status.textContent = "本地文件模式：请打开或拖入 JSON"; return; }
    try { const response = await fetch("../library.json", { cache: "no-store" }); if (!response.ok) throw new Error(); const library = await response.json(); state.libraryPapers = library.papers || []; renderLibrary(); } catch { state.libraryPapers = []; status.textContent = "论文库尚未建立"; }
  }

  document.querySelectorAll("[data-mode]").forEach(button => button.onclick = () => { state.mode = button.dataset.mode; applySettings(true); });
  $("#libraryButton").onclick = () => showLibrary(true); $("#brandHome").onclick = event => { event.preventDefault(); showLibrary(true); };
  $("#librarySearch").oninput = renderLibrary;
  $("#openFileButton").onclick = $("#welcomeOpen").onclick = () => $("#fileInput").click(); $("#fileInput").onchange = event => readFile(event.target.files[0]);
  $("#dropZone").onclick = () => $("#fileInput").click(); $("#dropZone").onkeydown = event => { if (event.key === "Enter" || event.key === " ") $("#fileInput").click(); };
  document.addEventListener("dragover", event => { event.preventDefault(); $("#dropZone").classList.add("dragging"); }); document.addEventListener("dragleave", () => $("#dropZone").classList.remove("dragging")); document.addEventListener("drop", event => { event.preventDefault(); $("#dropZone").classList.remove("dragging"); readFile(event.dataTransfer.files[0]); });
  $("#termsToggle").onclick = () => setTerms(!state.termsOpen); $("#termsClose").onclick = () => setTerms(false); $("#termSearch").oninput = renderTerms; $("#currentTermsOnly").onchange = renderTerms;
  $("#tocToggle").onclick = () => { $("#tocPanel").classList.add("open"); updateMobileScrim(); }; $("#mobileScrim").onclick = closeMobilePanels;
  $("#settingsToggle").onclick = () => setSettings(!$("#settingsPanel").classList.contains("open")); $("#settingsClose").onclick = () => setSettings(false);
  ["contentWidth", "originalFont", "translationFont", "originalSize", "translationSize", "lineHeight", "paragraphGap", "termsWidth", "theme"].forEach(key => {
    const input = $("#" + key);
    const update = event => { state[key] = ["originalFont", "translationFont", "theme"].includes(key) ? event.target.value : Number(event.target.value); applySettings(false); };
    input.oninput = update;
    input.onchange = update;
  });
  $("#customColors").onchange = event => { state.customColors = event.target.checked; applySettings(false); };
  ["originalColor", "translationColor"].forEach(key => { $("#" + key).oninput = event => { state[key] = event.target.value; applySettings(false); }; });
  $("#resetSettings").onclick = () => { Object.assign(state, defaults); applySettings(true); toast("已恢复默认阅读设置"); };
  document.addEventListener("keydown", event => { if (event.key === "Escape") { closeMobilePanels(); setSettings(false); } });

  window.addEventListener("popstate", () => { const paper = new URLSearchParams(location.search).get("paper"); if (paper) loadUrl(paper); else showLibrary(false); });
  applySettings(false); loadLibrary(); const requested = new URLSearchParams(location.search).get("paper"); if (requested) loadUrl(requested);
})();
