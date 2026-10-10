const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const page = document.body.dataset.page;
const state = {
  chapters: [], searchIndex: null,
  completed: new Set(JSON.parse(localStorage.getItem("java-completed") || "[]")),
  lastChapter: localStorage.getItem("java-last-chapter") || "01",
};

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("java-theme", theme);
}
function initTheme() {
  const saved = localStorage.getItem("java-theme");
  const preferred = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  setTheme(saved || preferred);
  $$(".theme-toggle").forEach(button => button.addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark")));
}
async function getJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`无法读取 ${path}`);
  return response.json();
}
function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]);
}
function safePath(path) { return path.split("/").map(encodeURIComponent).join("/"); }
async function loadChapters() {
  if (!state.chapters.length) state.chapters = await getJSON("data/chapters.json");
  return state.chapters;
}
function updateProgress() {
  const percent = Math.round((state.completed.size / 18) * 100);
  if ($("#progress-value")) $("#progress-value").textContent = `${percent}%`;
  if ($("#progress-bar")) $("#progress-bar").style.width = `${percent}%`;
}
function stageMarkup(stage, chapters) {
  const meta = {"基本语法": ["01", "从 0 到可独立编写控制台程序"], "面向对象": ["02", "建立 Java 的核心设计思维"], "高级应用": ["03", "进入工程能力与底层原理"]}[stage];
  return `<section class="stage">
    <div class="stage-title"><div class="stage-number">${meta[0]}</div><h3>${stage}</h3><p>${meta[1]}</p></div>
    <div class="chapter-grid">${chapters.map(chapter => `<a class="chapter-card ${state.completed.has(chapter.id) ? "done" : ""}" href="chapter.html?id=${chapter.id}">
      <span class="chapter-index">${chapter.id}</span><div><h4>${escapeHTML(chapter.title)}</h4><p>${escapeHTML(chapter.summary)}</p><div class="chapter-topics">${chapter.topics.map(topic => `<span>${escapeHTML(topic)}</span>`).join("")}</div></div><span class="chapter-arrow">↗</span>
    </a>`).join("")}</div></section>`;
}
async function initHome() {
  const chapters = await loadChapters();
  const grouped = chapters.reduce((all, chapter) => ((all[chapter.stage] ||= []).push(chapter), all), {});
  $("#course-stages").innerHTML = ["基本语法", "面向对象", "高级应用"].map(stage => stageMarkup(stage, grouped[stage])).join("");
  $("#course-stages").removeAttribute("aria-busy");
  updateProgress();
  const last = chapters.find(chapter => chapter.id === state.lastChapter) || chapters[0];
  const continueLink = $("#continue-learning");
  continueLink.href = `chapter.html?id=${last.id}`;
  continueLink.textContent = state.lastChapter === "01" ? "从第 1 章开始" : `继续第 ${last.id} 章`;
  const stats = await getJSON("data/site-stats.json");
  $("#hero-files").textContent = stats.files.toLocaleString("zh-CN");
  $("#library-file-count").textContent = `${stats.files.toLocaleString("zh-CN")} 个文件 · ${stats.size}`;
}

function openSearch() {
  const dialog = $("#search-dialog");
  if (!dialog.open) dialog.showModal();
  setTimeout(() => $("#global-search")?.focus(), 50);
}
async function performSearch(query) {
  const results = $("#search-results");
  const hint = $(".search-hint");
  if (!query.trim()) { results.innerHTML = ""; hint.textContent = "输入关键词，检索章节标题与课件正文"; return; }
  state.searchIndex ||= await getJSON("data/search-index.json");
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = state.searchIndex.map(item => {
    const haystack = `${item.title} ${item.section} ${item.text}`.toLowerCase();
    const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? (item.section.toLowerCase().includes(term) ? 3 : 1) : -20), 0);
    return {...item, score};
  }).filter(item => item.score >= terms.length).sort((a, b) => b.score - a.score).slice(0, 30);
  hint.textContent = `找到 ${matches.length} 条相关内容`;
  results.innerHTML = matches.length ? matches.map(item => {
    const href = `chapter.html?id=${item.chapter}${item.anchor ? `#${item.anchor}` : ""}`;
    return `<a class="search-result" href="${href}"><b>第 ${item.chapter} 章 · ${escapeHTML(item.title)}</b><strong>${escapeHTML(item.section)}</strong><p>${escapeHTML(item.text || "打开章节查看完整内容").slice(0, 150)}</p></a>`;
  }).join("") : '<div class="search-empty">没有找到匹配内容，试试更短的关键词。</div>';
}
function initSearch() {
  $("#open-search")?.addEventListener("click", openSearch);
  $("#chapter-search")?.addEventListener("click", openSearch);
  document.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openSearch(); }
    if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) { event.preventDefault(); openSearch(); }
  });
  let timer;
  $("#global-search")?.addEventListener("input", event => { clearTimeout(timer); timer = setTimeout(() => performSearch(event.target.value), 120); });
}

function chapterMenuMarkup(chapters, current) {
  return chapters.map(chapter => `<a href="chapter.html?id=${chapter.id}" class="${chapter.id === current ? "active" : ""}"><span>${chapter.id}</span><b>${escapeHTML(chapter.title)}</b></a>`).join("");
}
function initReadingObservers() {
  const progress = $("#reading-progress");
  const update = () => {
    const article = $("#article");
    const max = Math.max(1, article.offsetHeight - innerHeight);
    const articleTop = article.getBoundingClientRect().top + scrollY;
    progress.style.width = `${Math.max(0, Math.min(100, ((scrollY - articleTop + 90) / max) * 100))}%`;
  };
  addEventListener("scroll", update, {passive: true}); update();
  const links = $$("#lesson-toc a");
  const headings = links.map(link => $(link.getAttribute("href"))).filter(Boolean);
  const observer = new IntersectionObserver(entries => entries.filter(entry => entry.isIntersecting).forEach(entry => links.forEach(link => link.classList.toggle("active", link.getAttribute("href") === `#${entry.target.id}`))), {rootMargin: "-18% 0px -72% 0px"});
  headings.forEach(heading => observer.observe(heading));
}
function miniResourceMarkup(item) {
  return `<a class="resource-mini" href="${safePath(item.path)}" target="_blank" rel="noopener"><span>${escapeHTML(item.ext).slice(0,5)}</span><div><strong title="${escapeHTML(item.name)}">${escapeHTML(item.name)}</strong><small>${escapeHTML(item.size)}</small></div></a>`;
}
async function initChapter() {
  const chapters = await loadChapters();
  let id = new URLSearchParams(location.search).get("id") || "01";
  if (!/^\d{2}$/.test(id) || !chapters.some(chapter => chapter.id === id)) id = "01";
  state.lastChapter = id; localStorage.setItem("java-last-chapter", id);
  const chapter = await getJSON(`data/chapters/${id}.json`);
  document.title = `第 ${id} 章 · ${chapter.title} · Java 学习站`;
  $("#chapter-menu").innerHTML = chapterMenuMarkup(chapters, id); $("#chapter-menu").removeAttribute("aria-busy");
  $("#lesson-stage").textContent = `${chapter.stage} · CHAPTER ${id}`;
  $("#lesson-title").textContent = chapter.title; $("#lesson-summary").textContent = chapter.summary;
  $("#lesson-resource-count").textContent = `${chapter.resourceCount} 项配套资料`;
  const plainText = chapter.content.replace(/<[^>]+>/g, " ");
  $("#lesson-read-time").textContent = `约 ${Math.max(3, Math.ceil(plainText.length / 550))} 分钟阅读`;
  $("#lesson-content").innerHTML = chapter.content;
  const materialPrefix = `m/chapters/${chapter.sourceDirectory}/`;
  $$("img", $("#lesson-content")).forEach(image => {
    const src = image.getAttribute("src") || "";
    if (!/^(https?:|data:|materials\/)/.test(src)) image.src = materialPrefix + src.replace(/^\.\//, "");
    image.loading = "lazy";
  });
  $("#article").removeAttribute("aria-busy");
  $("#lesson-toc").innerHTML = chapter.toc.filter(item => item.level > 1).map(item => `<a class="level-${item.level}" href="#${item.id}">${escapeHTML(item.title)}</a>`).join("");
  if (chapter.resources.length) {
    $("#chapter-resources").hidden = false;
    $("#featured-resources").innerHTML = chapter.resources.slice(0, 8).map(miniResourceMarkup).join("");
    $("#all-chapter-resources").href = `resources.html?chapter=${id}`;
  }
  const index = chapters.findIndex(item => item.id === id), previous = chapters[index - 1], next = chapters[index + 1];
  const prevLink = $("#prev-chapter"), nextLink = $("#next-chapter");
  prevLink.hidden = !previous; nextLink.hidden = !next;
  if (previous) { prevLink.href = `chapter.html?id=${previous.id}`; prevLink.textContent = `← ${previous.title}`; }
  if (next) { nextLink.href = `chapter.html?id=${next.id}`; nextLink.textContent = `${next.title} →`; }
  const completeButton = $("#mark-complete");
  const syncCompleteButton = () => completeButton.textContent = state.completed.has(id) ? "✓ 已学完" : "标记为已学完";
  syncCompleteButton();
  completeButton.addEventListener("click", () => {
    state.completed.has(id) ? state.completed.delete(id) : state.completed.add(id);
    localStorage.setItem("java-completed", JSON.stringify([...state.completed])); syncCompleteButton();
  });
  $("#bookmark-current").addEventListener("click", () => {
    const active = $("#lesson-toc a.active") || $("#lesson-toc a"); if (!active) return;
    const bookmarks = JSON.parse(localStorage.getItem("java-bookmarks") || "[]");
    const entry = {chapter: id, title: chapter.title, anchor: active.getAttribute("href"), section: active.textContent};
    const unique = bookmarks.filter(item => !(item.chapter === entry.chapter && item.anchor === entry.anchor));
    unique.unshift(entry); localStorage.setItem("java-bookmarks", JSON.stringify(unique.slice(0, 30)));
    $("#bookmark-current").textContent = "★ 已收藏当前位置";
  });
  requestAnimationFrame(initReadingObservers);
}

function resourceRow(item) {
  const chapter = item.chapter ? `第 ${item.chapter} 章` : (item.relative.startsWith("学习路线图") ? "学习路线图" : "综合资料");
  return `<a class="resource-row" href="${safePath(item.path)}" target="_blank" rel="noopener"><span class="file-icon">${escapeHTML(item.ext).slice(0,5)}</span><div class="file-info"><strong title="${escapeHTML(item.name)}">${escapeHTML(item.name)}</strong><small title="${escapeHTML(item.relative)}">${escapeHTML(item.relative)}</small></div><span class="file-chapter">${chapter}</span><span class="file-size">${escapeHTML(item.size)}</span><span class="file-open">↗</span></a>`;
}
async function initResources() {
  const [resources, stats] = await Promise.all([getJSON("data/resources.json"), getJSON("data/site-stats.json")]);
  $("#archive-files").textContent = stats.files.toLocaleString("zh-CN"); $("#archive-size").textContent = stats.size;
  const typeSelect = $("#resource-type");
  [...new Set(resources.map(item => item.ext))].sort().forEach(type => typeSelect.insertAdjacentHTML("beforeend", `<option value="${escapeHTML(type)}">${escapeHTML(type.toUpperCase())}</option>`));
  const chapterSelect = $("#resource-chapter");
  for (let n = 1; n <= 18; n++) { const id = String(n).padStart(2, "0"); chapterSelect.insertAdjacentHTML("beforeend", `<option value="${id}">第 ${id} 章</option>`); }
  chapterSelect.insertAdjacentHTML("beforeend", '<option value="route">学习路线图</option><option value="general">综合资料</option>');
  const params = new URLSearchParams(location.search); chapterSelect.value = params.get("chapter") || (params.get("group") ? "route" : "");
  let shown = 100, current = resources;
  const render = () => {
    const query = $("#resource-search").value.trim().toLowerCase(), chapter = chapterSelect.value, type = typeSelect.value;
    current = resources.filter(item => {
      const groupMatch = !chapter || item.chapter === chapter || (chapter === "route" && item.relative.startsWith("学习路线图")) || (chapter === "general" && !item.chapter && !item.relative.startsWith("学习路线图"));
      return groupMatch && (!type || item.ext === type) && (!query || `${item.name} ${item.relative} ${item.ext}`.toLowerCase().includes(query));
    });
    $("#resource-count").textContent = `显示 ${Math.min(shown, current.length).toLocaleString("zh-CN")} / ${current.length.toLocaleString("zh-CN")} 个文件`;
    $("#resource-list").innerHTML = current.slice(0, shown).map(resourceRow).join("") || '<div class="search-empty">没有符合条件的资料。</div>';
    $("#load-more-resources").hidden = shown >= current.length;
  };
  let timer;
  $("#resource-search").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { shown = 100; render(); }, 120); });
  [chapterSelect, typeSelect].forEach(select => select.addEventListener("change", () => { shown = 100; render(); }));
  $("#clear-filters").addEventListener("click", () => { $("#resource-search").value = ""; chapterSelect.value = ""; typeSelect.value = ""; shown = 100; render(); });
  $("#load-more-resources").addEventListener("click", () => { shown += 100; render(); }); render();
}

async function boot() {
  initTheme(); initSearch();
  try {
    if (page === "home") await initHome();
    if (page === "chapter") await initChapter();
    if (page === "resources") await initResources();
  } catch (error) {
    console.error(error);
    const target = $("#course-stages") || $("#lesson-content") || $("#resource-list");
    if (target) target.innerHTML = `<div class="search-empty">资料读取失败：${escapeHTML(error.message)}。请通过本地服务器访问本站。</div>`;
  }
}
boot();
