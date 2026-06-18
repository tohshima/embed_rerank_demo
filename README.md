# Embedding & Reranker ライブデモ

ベクトル検索 / BM25 / Reranker の違いをブラウザだけで体感する学習用デモです。
推論はすべて **あなたのブラウザ内**（[transformers.js](https://github.com/huggingface/transformers.js) + ONNX/WASM）で実行され、サーバーやAPIキーは不要です。

> ビルド不要のバニラJS（静的サイト）。`index.html` を簡易サーバーで開くだけで動きます。GitHub Pages 等にそのまま公開できます。

## できること

- **トークン化の可視化** — モデルが文章をどんな単位（サブワード）で見ているか
- **ベクトルの2次元可視化** — クエリとドキュメントの埋め込みを UMAP / PCA で投影。色＝クエリとのコサイン類似度
- **3つの検索結果を並べて比較**
  - **Vector検索**: 埋め込みのコサイン類似度（意味の近さ）
  - **BM25**: 語の一致頻度（キーワード一致に強い）
  - **Reranker**: クロスエンコーダで精密に再採点（Vector順位からの変化を矢印表示）
- **10個の学習シナリオ**（日本語/英語/言語横断/多義語/固有名詞 など）— それぞれ「どの手法が効くか」が分かるよう設計
- **ユーザー入力対応** — クエリ・ドキュメントを編集すると 0.6秒のデバウンス後にリアルタイム再計算

## 使うモデル

| 役割 | モデル | 備考 |
|---|---|---|
| 埋め込み | `onnx-community/ruri-v3-30m-ONNX` | 日本語特化・超軽量(30M)。mean pooling / `検索クエリ:`・`検索文書:` prefix |
| 埋め込み | `Xenova/multilingual-e5-{small,base,large}` | 多言語汎用。mean pooling / `query:`・`passage:` prefix |
| 埋め込み | `Xenova/bge-m3` | 多言語・最高精度（重い）。CLS pooling / prefixなし |
| Reranker | `Xenova/bge-reranker-base` | 多言語クロスエンコーダ |

埋め込みモデルはUIのドロップダウンで切替できます。モデルごとに pooling 方式と prefix が異なる点も学習ポイントです（[app.js](app.js) の `EMBED_MODELS`）。

初回はモデル（量子化 q8）のダウンロードが走るため、起動に少し時間がかかります。2回目以降はブラウザにキャッシュされます。

## 起動

ES Module と `fetch` を使うため、`file://` ではなく簡易HTTPサーバー経由で開いてください。

```sh
cd embed_rerank_demo
python3 -m http.server 8000
# ブラウザで http://localhost:8000 を開く
```

または同梱スクリプト:

```sh
./serve.sh
```

## 学習のヒント（シナリオの狙い）

- **言い換え / 日常質問** → BM25は語が一致するダミーに釣られ、Vectorが意味で正解を拾う
- **エラーコード / 固有名詞・日付** → 表層一致が重要で BM25 が強い。Vectorは曖昧になりがち
- **言語をまたぐ検索（日→英）** → 語が重ならず BM25 は無力。多言語埋め込みだけが対応付け可能
- **多義語（ジャガー等）** → 文脈で意味を区別できるかを観察
- **Reranker** → Vectorで僅差の候補を、クエリへの的確さで明確に並べ替える（矢印が並べ替えの効果）

## 構成

```
index.html    画面とCDN読み込み
style.css     スタイル
app.js        モデル読込・埋め込み・BM25・Reranker・UMAP/PCA・描画
presets.js    10個の学習シナリオ（プリセット）
serve.sh      簡易サーバー起動
```

すべてバニラJS。ビルド不要です。

## GitHub Pages で公開する

静的サイトなので、リポジトリの **Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / `root`** を選ぶだけで公開できます。
公開後の URL（例）: `https://tohshima.github.io/embed_rerank_demo/`

## License

[MIT](LICENSE) © 2026 tohshima
