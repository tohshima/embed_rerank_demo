import {
  pipeline,
  AutoTokenizer,
  AutoModelForSequenceClassification,
  env,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3";
import { PRESETS } from "./presets.js";

// CDNからモデルを取得する（ローカルモデルは使わない）
env.allowLocalModels = false;

const DEVICE = "wasm"; // 互換性重視。WebGPU対応環境なら "webgpu" に変更可
const DTYPE = "q8"; // 量子化でダウンロードを軽量化

// 埋め込みモデルごとの設定（pooling方式とprefixがモデルで異なる）
const EMBED_MODELS = {
  "Xenova/multilingual-e5-small": { pooling: "mean", queryPrefix: "query: ", passagePrefix: "passage: " },
  "Xenova/multilingual-e5-base": { pooling: "mean", queryPrefix: "query: ", passagePrefix: "passage: " },
  "Xenova/multilingual-e5-large": { pooling: "mean", queryPrefix: "query: ", passagePrefix: "passage: " },
  "Xenova/bge-m3": { pooling: "cls", queryPrefix: "", passagePrefix: "" },
  "onnx-community/ruri-v3-30m-ONNX": { pooling: "mean", queryPrefix: "検索クエリ: ", passagePrefix: "検索文書: " },
  "jinaai/jina-embeddings-v2-base-code": { pooling: "mean", queryPrefix: "", passagePrefix: "" },
};
const embedCfg = () => EMBED_MODELS[embedModelName] || EMBED_MODELS["Xenova/multilingual-e5-base"];

// Rerankerはどちらもクロスエンコーダ(XLM-RoBERTa)で単一ロジットを出力 → sigmoidで関連度化（UIで選択）
// - Xenova/bge-reranker-base            : 多言語汎用・軽量
// - onnx-community/bge-reranker-v2-m3-ONNX : 多言語・高精度（baseより大幅に強い／重い）
// 注: jina-reranker-v2 は config に model_type が無く transformers.js でロード不可のため非採用

// ---- 状態 ----
let embedModelName = document.getElementById("modelSelect").value;
let rerankModelName = document.getElementById("rerankSelect").value;
let extractor = null; // feature-extraction pipeline
let embedTokenizer = null;
let rerankTokenizer = null;
let rerankModel = null;
let lastResult = null; // 直近の計算結果（トークン表示などで再利用）
let computeSeq = 0; // 古い非同期計算を破棄するためのシーケンス番号

// ---- DOM ----
const $ = (id) => document.getElementById(id);
const statusEl = $("status");
const statusText = $("statusText");

function setStatus(kind, text) {
  statusEl.className = kind;
  statusText.textContent = text;
}

// =================== モデル読み込み ===================
async function loadEmbedder(name) {
  setStatus("loading", `埋め込みモデル読み込み中: ${name.split("/").pop()} …`);
  extractor = await pipeline("feature-extraction", name, {
    dtype: DTYPE,
    device: DEVICE,
    progress_callback: (p) => {
      if (p.status === "progress" && p.file && p.total) {
        const pct = Math.round((p.loaded / p.total) * 100);
        setStatus("loading", `埋め込み DL ${p.file.split("/").pop()} ${pct}%`);
      }
    },
  });
  embedTokenizer = extractor.tokenizer;
  embedModelName = name;
}

async function loadReranker(name) {
  setStatus("loading", `Reranker 読み込み中: ${name.split("/").pop()} …`);
  rerankTokenizer = await AutoTokenizer.from_pretrained(name);
  rerankModel = await AutoModelForSequenceClassification.from_pretrained(
    name,
    {
      dtype: DTYPE,
      device: DEVICE,
      progress_callback: (p) => {
        if (p.status === "progress" && p.file && p.total) {
          const pct = Math.round((p.loaded / p.total) * 100);
          setStatus("loading", `Reranker DL ${p.file.split("/").pop()} ${pct}%`);
        }
      },
    }
  );
  rerankModelName = name;
}

// =================== 埋め込み・類似度 ===================
// モデルごとに prefix と pooling が異なる（EMBED_MODELS参照）
// 例: e5系は "query:"/"passage:"、ruriは "検索クエリ:"/"検索文書:"、bge-m3は prefixなし
async function embedTexts(texts, kind) {
  const cfg = embedCfg();
  const prefix = kind === "query" ? cfg.queryPrefix : cfg.passagePrefix;
  const prefixed = texts.map((t) => prefix + t);
  const out = await extractor(prefixed, { pooling: cfg.pooling, normalize: true });
  return out.tolist(); // [n][dim]（normalize済み＝単位ベクトル）
}

function cosine(a, b) {
  // 正規化済みなので内積＝コサイン類似度
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// =================== BM25 ===================
// 英単語/数字は単語単位、日本語などCJKは文字bigramに分解（軽量な多言語対応）
function tokenizeBM25(text) {
  const lower = text.toLowerCase();
  const tokens = [];
  const latin = lower.match(/[a-z0-9]+/g) || [];
  tokens.push(...latin);
  const cjk = lower.match(/[぀-ヿ㐀-鿿豈-﫿]+/g) || [];
  for (const run of cjk) {
    if (run.length === 1) tokens.push(run);
    for (let i = 0; i < run.length - 1; i++) tokens.push(run.slice(i, i + 2));
  }
  return tokens;
}

function bm25Scores(query, docs) {
  const k1 = 1.5,
    b = 0.75;
  const docToks = docs.map(tokenizeBM25);
  const N = docs.length;
  const avgdl = docToks.reduce((s, d) => s + d.length, 0) / Math.max(N, 1);
  // 文書頻度
  const df = {};
  docToks.forEach((toks) => {
    new Set(toks).forEach((t) => (df[t] = (df[t] || 0) + 1));
  });
  const qToks = tokenizeBM25(query);
  return docToks.map((toks) => {
    const tf = {};
    toks.forEach((t) => (tf[t] = (tf[t] || 0) + 1));
    const dl = toks.length;
    let score = 0;
    new Set(qToks).forEach((t) => {
      if (!tf[t]) return;
      const idf = Math.log(1 + (N - df[t] + 0.5) / (df[t] + 0.5));
      const f = tf[t];
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * dl) / avgdl)));
    });
    return score;
  });
}

// =================== Reranker ===================
async function rerankScores(query, docs) {
  // クロスエンコーダ: (query, doc) ペアを同時に符号化してスコア1個を出力
  const pairs_q = docs.map(() => query);
  const inputs = await rerankTokenizer(pairs_q, {
    text_pair: docs,
    padding: true,
    truncation: true,
  });
  const { logits } = await rerankModel(inputs);
  // bge-reranker は単一ロジット。sigmoidで0-1の関連度に
  const scores = logits.sigmoid().tolist().map((r) => r[0]);
  return scores;
}

// =================== 次元圧縮 ===================
function pca2d(vectors) {
  const n = vectors.length;
  const d = vectors[0].length;
  const mean = new Array(d).fill(0);
  for (const v of vectors) for (let j = 0; j < d; j++) mean[j] += v[j];
  for (let j = 0; j < d; j++) mean[j] /= n;
  const X = vectors.map((v) => v.map((x, j) => x - mean[j]));
  // グラム行列 (n x n) の固有分解でPCA（n < d のとき高速）
  const G = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++)
    for (let k = i; k < n; k++) {
      let s = 0;
      for (let j = 0; j < d; j++) s += X[i][j] * X[k][j];
      G[i][k] = s;
      G[k][i] = s;
    }
  const e1 = powerIteration(G, n);
  deflate(G, e1.vec, e1.val, n);
  const e2 = powerIteration(G, n);
  const c1 = Math.sqrt(Math.max(e1.val, 1e-9));
  const c2 = Math.sqrt(Math.max(e2.val, 1e-9));
  return vectors.map((_, i) => [e1.vec[i] * c1, e2.vec[i] * c2]);
}

function powerIteration(M, n, iters = 200) {
  let v = new Array(n).fill(0).map(() => Math.random() - 0.5);
  let val = 0;
  for (let it = 0; it < iters; it++) {
    const w = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) s += M[i][j] * v[j];
      w[i] = s;
    }
    let norm = Math.sqrt(w.reduce((s, x) => s + x * x, 0)) || 1;
    for (let i = 0; i < n; i++) w[i] /= norm;
    val = norm;
    v = w;
  }
  return { vec: v, val };
}

function deflate(M, vec, val, n) {
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) M[i][j] -= val * vec[i] * vec[j];
}

function umap2d(vectors) {
  const n = vectors.length;
  const nNeighbors = Math.max(2, Math.min(n - 1, 10));
  const umap = new UMAP({
    nComponents: 2,
    nNeighbors,
    minDist: 0.1,
    spread: 1.0,
    random: mulberry32(42), // 再現性のため固定シード
  });
  return umap.fit(vectors);
}

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// =================== トークン化（表示用） ===================
async function tokenizeForDisplay(text) {
  try {
    if (typeof embedTokenizer.tokenize === "function") {
      return await embedTokenizer.tokenize(text);
    }
  } catch (e) {
    /* fall through */
  }
  const enc = await embedTokenizer(text);
  const ids = enc.input_ids.tolist()[0];
  return ids.map((id) => embedTokenizer.decode([id]));
}

// =================== メイン計算 ===================
async function computeAll() {
  if (!extractor || !rerankModel) return;
  const query = $("queryInput").value.trim();
  const docs = getDocs();
  if (!query || docs.length === 0) return;

  const seq = ++computeSeq;
  setStatus("loading", "計算中…");

  try {
    // 埋め込み
    const [qEmb] = await embedTexts([query], "query");
    const dEmb = await embedTexts(docs, "passage");
    if (seq !== computeSeq) return; // 新しい入力が来ていたら破棄

    // Vector検索
    const vecSim = dEmb.map((e) => cosine(qEmb, e));

    // BM25
    const bm = bm25Scores(query, docs);

    // Reranker
    const rr = await rerankScores(query, docs);
    if (seq !== computeSeq) return;

    // 次元圧縮（クエリ＋全ドキュメント）
    const allVecs = [qEmb, ...dEmb];
    let umapCoords, pcaCoords;
    try {
      umapCoords = umap2d(allVecs);
    } catch (e) {
      umapCoords = null;
    }
    pcaCoords = pca2d(allVecs);

    // トークン化を1回だけ計算してキャッシュ（描画は同期・レース無し）
    let queryTokens = [];
    let docTokens = [];
    try {
      queryTokens = await tokenizeForDisplay(query);
      for (const d of docs) docTokens.push(await tokenizeForDisplay(d));
    } catch (e) {
      console.warn("tokenize for display failed", e);
    }
    if (seq !== computeSeq) return;

    lastResult = {
      query,
      docs,
      vecSim,
      bm,
      rr,
      umapCoords,
      pcaCoords,
      queryTokens,
      docTokens,
    };

    renderPlot();
    renderResults();
    renderTokens();
    setStatus("ready", "完了 ✓");
  } catch (err) {
    console.error(err);
    setStatus("error", "計算エラー: " + err.message);
  }
}

// =================== レンダリング ===================
const docColor = (sim) => {
  // 類似度0..1 を青系の濃淡へ（簡易カラースケール）
  const t = Math.max(0, Math.min(1, (sim + 0.2) / 1.0));
  const r = Math.round(60 + t * 40);
  const g = Math.round(90 + t * 90);
  const b = Math.round(140 + t * 115);
  return `rgb(${r},${g},${b})`;
};

function currentCoords() {
  const mode = document.querySelector('input[name="proj"]:checked').value;
  if (mode === "umap" && lastResult.umapCoords) return lastResult.umapCoords;
  return lastResult.pcaCoords;
}

function renderPlot() {
  const coords = currentCoords();
  const { docs, vecSim } = lastResult;
  const qc = coords[0];
  const dc = coords.slice(1);

  const docTrace = {
    x: dc.map((c) => c[0]),
    y: dc.map((c) => c[1]),
    mode: "markers+text",
    type: "scatter",
    text: docs.map((_, i) => String(i + 1)),
    textposition: "top center",
    textfont: { color: "#9aa4b2", size: 11 },
    marker: {
      size: 16,
      color: vecSim,
      colorscale: [
        [0, "#2a313c"],
        [0.5, "#3d6bb0"],
        [1, "#5b9cff"],
      ],
      showscale: true,
      colorbar: { title: "cos類似", titlefont: { color: "#9aa4b2" }, tickfont: { color: "#9aa4b2" }, thickness: 10, len: 0.8 },
      line: { color: "#0f1216", width: 1 },
    },
    hovertext: docs.map(
      (d, i) => `#${i + 1} cos=${vecSim[i].toFixed(3)}<br>${wrap(d)}`
    ),
    hoverinfo: "text",
    name: "docs",
  };

  const queryTrace = {
    x: [qc[0]],
    y: [qc[1]],
    mode: "markers+text",
    type: "scatter",
    text: ["Q"],
    textposition: "bottom center",
    textfont: { color: "#ff5d8f", size: 13 },
    marker: { size: 20, color: "#ff5d8f", symbol: "star", line: { color: "#fff", width: 1 } },
    hovertext: [`クエリ<br>${wrap(lastResult.query)}`],
    hoverinfo: "text",
    name: "query",
  };

  const layout = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 30, r: 10, t: 10, b: 30 },
    showlegend: false,
    xaxis: { gridcolor: "#222831", zerolinecolor: "#222831", color: "#9aa4b2" },
    yaxis: { gridcolor: "#222831", zerolinecolor: "#222831", color: "#9aa4b2" },
    height: 380,
  };
  Plotly.react("plot", [docTrace, queryTrace], layout, { displayModeBar: false, responsive: true });
}

function wrap(s, n = 40) {
  const out = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out.join("<br>");
}

function rankMap(scores) {
  // index -> rank(1始まり), スコア降順
  const order = scores.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]);
  const rank = {};
  order.forEach(([, i], r) => (rank[i] = r + 1));
  return { order: order.map(([, i]) => i), rank };
}

function badge(i, color) {
  return `<span class="r-badge" style="background:${color}">${i + 1}</span>`;
}

function renderResults() {
  const { docs, vecSim, bm, rr } = lastResult;
  const vec = rankMap(vecSim);
  const bmR = rankMap(bm);
  const rrR = rankMap(rr);
  const maxVec = Math.max(...vecSim, 1e-9);
  const minVec = Math.min(...vecSim);
  const maxBm = Math.max(...bm, 1e-9);
  const maxRr = Math.max(...rr, 1e-9);

  // Vector
  $("vecResults").innerHTML = vec.order
    .map((i, r) => {
      const w = ((vecSim[i] - minVec) / (maxVec - minVec || 1)) * 100;
      return item(r + 1, i, docs[i], vecSim[i].toFixed(3), w, "var(--vector)");
    })
    .join("");

  // BM25
  $("bmResults").innerHTML = bmR.order
    .map((i, r) => {
      const w = (bm[i] / maxBm) * 100;
      const score = bm[i] > 0 ? bm[i].toFixed(2) : "0";
      return item(r + 1, i, docs[i], score, w, "var(--vector)");
    })
    .join("");

  // Reranker（Vector順位からの変化を矢印で）
  $("rrResults").innerHTML = rrR.order
    .map((i, r) => {
      const w = (rr[i] / maxRr) * 100;
      const delta = vec.rank[i] - (r + 1); // +なら順位上昇
      let dHtml = "";
      if (delta > 0) dHtml = `<span class="r-delta up">▲${delta}</span>`;
      else if (delta < 0) dHtml = `<span class="r-delta down">▼${-delta}</span>`;
      else dHtml = `<span class="r-delta">±0</span>`;
      return item(r + 1, i, docs[i], rr[i].toFixed(3), w, "var(--vector)", dHtml);
    })
    .join("");

  // クリックでトークン表示を切替
  document.querySelectorAll(".r-item").forEach((el) => {
    el.addEventListener("click", () => {
      const i = +el.dataset.idx;
      $("tokenDocSelect").value = String(i);
      showDocTokens(i);
    });
  });
}

function item(rank, idx, text, score, barW, _color, extra = "") {
  return `<div class="r-item" data-idx="${idx}">
    <div class="r-head">
      <span class="r-rank">${rank}.</span>
      ${badge(idx, docColor(lastResult.vecSim[idx]))}
      ${extra}
      <span class="r-score">${score}</span>
    </div>
    <div class="r-text">${escapeHtml(text)}</div>
    <div class="bar"><div style="width:${Math.max(2, barW)}%"></div></div>
  </div>`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// ---- トークン表示（キャッシュから同期描画） ----
function renderTokens() {
  $("queryTokens").innerHTML = renderTokChips(lastResult.queryTokens || []);
  // ドキュメント選択肢
  const sel = $("tokenDocSelect");
  const prev = sel.value;
  sel.innerHTML = lastResult.docs
    .map((d, i) => `<option value="${i}">#${i + 1}: ${escapeHtml(d.slice(0, 30))}…</option>`)
    .join("");
  // 直前の選択を維持（範囲外なら0）
  const keep = prev !== "" && +prev < lastResult.docs.length ? prev : "0";
  sel.value = keep;
  showDocTokens(+keep);
}

function showDocTokens(i) {
  const toks = (lastResult.docTokens && lastResult.docTokens[i]) || [];
  $("docTokens").innerHTML = toks.length
    ? renderTokChips(toks)
    : '<span class="tok special">（トークンなし）</span>';
}

function renderTokChips(tokens) {
  return tokens
    .map((t) => {
      const isSpecial = /^(<s>|<\/s>|\[CLS\]|\[SEP\]|<pad>|<unk>)$/.test(t);
      const disp = escapeHtml(t.replace(/^▁/, "·").replace(/^##/, "##"));
      return `<span class="tok ${isSpecial ? "special" : ""}">${disp || "␣"}</span>`;
    })
    .join("");
}

// =================== ドキュメント編集UI ===================
function getDocs() {
  return [...document.querySelectorAll("#docList textarea")]
    .map((t) => t.value.trim())
    .filter((t) => t.length > 0);
}

function renderDocInputs(docs) {
  const list = $("docList");
  list.innerHTML = "";
  docs.forEach((d, i) => addDocRow(d, i));
}

function addDocRow(value = "", i = null) {
  const list = $("docList");
  const idx = i == null ? list.children.length : i;
  const row = document.createElement("div");
  row.className = "doc-row";
  row.innerHTML = `
    <span class="idx" style="background:var(--vector)">${idx + 1}</span>
    <textarea rows="1">${escapeHtml(value)}</textarea>
    <button title="削除">✕</button>`;
  row.querySelector("button").addEventListener("click", () => {
    row.remove();
    renumber();
    scheduleCompute();
  });
  row.querySelector("textarea").addEventListener("input", scheduleCompute);
  list.appendChild(row);
}

function renumber() {
  [...document.querySelectorAll("#docList .doc-row .idx")].forEach(
    (el, i) => (el.textContent = i + 1)
  );
}

// =================== デバウンス ===================
let debounceTimer = null;
function scheduleCompute() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(computeAll, 600);
}

// =================== 初期化 ===================
function loadPreset(p) {
  $("queryInput").value = p.query;
  $("presetNote").textContent = "💡 " + p.note;
  renderDocInputs(p.docs);
}

function initUI() {
  const sel = $("presetSelect");
  sel.innerHTML = PRESETS.map((p, i) => `<option value="${i}">${p.title}</option>`).join("");
  sel.addEventListener("change", () => {
    loadPreset(PRESETS[sel.value]);
    scheduleCompute();
  });
  loadPreset(PRESETS[0]);

  $("queryInput").addEventListener("input", scheduleCompute);
  $("addDocBtn").addEventListener("click", () => {
    addDocRow("");
    scheduleCompute();
  });
  $("runBtn").addEventListener("click", computeAll);
  document.querySelectorAll('input[name="proj"]').forEach((r) =>
    r.addEventListener("change", () => lastResult && renderPlot())
  );
  $("tokenDocSelect").addEventListener("change", (e) => showDocTokens(+e.target.value));
  $("modelSelect").addEventListener("change", async (e) => {
    try {
      await loadEmbedder(e.target.value);
      setStatus("ready", "埋め込みモデル切替完了");
      computeAll();
    } catch (err) {
      console.error(err);
      setStatus("error", "埋め込み読み込み失敗: " + err.message);
    }
  });
  $("rerankSelect").addEventListener("change", async (e) => {
    try {
      await loadReranker(e.target.value);
      setStatus("ready", "Reranker切替完了");
      computeAll();
    } catch (err) {
      console.error(err);
      setStatus("error", "Reranker読み込み失敗: " + err.message);
    }
  });
}

async function main() {
  initUI();
  try {
    await loadEmbedder(embedModelName);
    await loadReranker(rerankModelName);
    setStatus("ready", "準備完了 — 入力するとリアルタイムで更新されます");
    await computeAll();
  } catch (err) {
    console.error(err);
    setStatus("error", "モデル読み込み失敗: " + err.message);
  }
}

main();
