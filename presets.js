// プリセット集。各シナリオは Vector検索 / BM25 / Reranker の「効き方の違い」を
// 体感できるように設計してある。note にそのシナリオの狙いを書いてある。
export const PRESETS = [
  {
    id: "jp-paraphrase",
    title: "① 言い換え（日本語）",
    note: "クエリと正解は同義だがキーワードが一致しない。BM25は語の一致するダミーを拾いがち、ベクトル検索は意味で正解を拾う。",
    query: "電車が遅れたときの払い戻しのやり方",
    docs: [
      "遅延証明書を受け取り、運賃の返金を窓口で申請する手順を解説します。",
      "ダイヤが乱れた場合、特急料金は後日まとめて返金されることがあります。",
      "電車の車内マナーとして、優先席付近では携帯電話の電源を切りましょう。",
      "新しい電車の車両デザインが公開され、座席が広くなりました。",
      "鉄道会社の払い戻しは、定期券の解約時にも手数料を差し引いて行われます。",
      "台風で運休になった際の振替輸送の利用方法をまとめました。",
      "電車内に忘れ物をしたときは、忘れ物センターに問い合わせます。",
      "通勤ラッシュを避けるための時差出勤のすすめについて。",
      "遅延が発生したら、まず駅員に状況を確認するのが確実です。",
      "切符を払い戻す際は未使用であることが条件になります。"
    ]
  },
  {
    id: "en-exact-code",
    title: "② 完全一致のコード（英語）",
    note: "エラーコードのような固有文字列は BM25 が圧倒的に強い。ベクトルは意味が近い別物を拾ってしまうことがある。",
    query: "fix npm ERR! code ELIFECYCLE on build",
    docs: [
      "The error 'npm ERR! code ELIFECYCLE' usually means a script in package.json exited non-zero.",
      "To resolve build failures, delete node_modules and package-lock.json then reinstall.",
      "Yarn install errors can often be fixed by clearing the global cache.",
      "A general guide to debugging JavaScript runtime exceptions in the browser.",
      "ELIFECYCLE is emitted by npm when the lifecycle script returns a failure code.",
      "Webpack configuration tips for optimizing production bundle size.",
      "Node.js version mismatches can break native module compilation during install.",
      "How to write a custom npm build script using the scripts field.",
      "Common causes of 'EACCES permission denied' when installing packages globally.",
      "Continuous integration pipelines should cache dependencies to speed up builds."
    ]
  },
  {
    id: "crosslingual",
    title: "③ 言語をまたぐ検索（日→英）",
    note: "クエリは日本語、正解は英語。語が全く重ならないので BM25 は無力。多言語埋め込みだけが意味で対応付けできる。",
    query: "気候変動が農業に与える影響",
    docs: [
      "Rising global temperatures are shifting growing seasons and reducing crop yields worldwide.",
      "Droughts linked to climate change threaten wheat and maize harvests in many regions.",
      "The history of the steam engine and the Industrial Revolution in Britain.",
      "Farmers are adopting drought-resistant seeds to cope with a warming planet.",
      "A beginner's recipe for homemade vegetable soup with seasonal produce.",
      "Ocean acidification from CO2 emissions endangers coral reefs and fisheries.",
      "Stock market volatility increased after the central bank raised interest rates.",
      "Changing rainfall patterns are forcing changes in irrigation and planting schedules.",
      "Tips for taking better landscape photographs at sunrise.",
      "Soil degradation and extreme weather are key agricultural risks of climate change."
    ]
  },
  {
    id: "jp-polysemy",
    title: "④ 多義語の文脈（日本語）",
    note: "「ジャガー」は動物・車・OSなど複数の意味を持つ。埋め込みが文脈で意味を区別できるかを観察する。",
    query: "ジャガーという動物の生態と狩りの方法",
    docs: [
      "ジャガーはネコ科の大型肉食獣で、強い顎で獲物の頭蓋を噛み砕いて狩りをする。",
      "ジャガーは中南米の熱帯雨林に生息し、泳ぎが得意な点が特徴である。",
      "英国の高級車ジャガーは、流麗なデザインと走行性能で知られるブランドだ。",
      "ジャガーXJは伝統的なセダンで、内装に上質な革を採用している。",
      "Mac OS X 10.2 のコードネームは Jaguar で、2002年に登場した。",
      "アマゾンの生態系において、ジャガーは食物連鎖の頂点に立つ捕食者である。",
      "プロ野球チームの新しいマスコットがジャガーをモチーフにしている。",
      "ジャガーの毛皮の斑点模様はロゼットと呼ばれ、個体識別に使える。",
      "クラシックカーの祭典に、往年のジャガーEタイプが多数集まった。",
      "夜行性のジャガーは、待ち伏せ型の狩りでカピバラやシカを捕らえる。"
    ]
  },
  {
    id: "en-everyday",
    title: "⑤ 日常の意味検索（英語）",
    note: "口語的な質問。正解はキーワードが直接一致しない説明文。ベクトル検索の意味マッチが効く好例。",
    query: "how do I stop sliced apples from turning brown",
    docs: [
      "Toss cut apple slices in a little lemon juice; the acid slows the oxidation that causes browning.",
      "Soaking apple pieces in cold salt water for a few minutes keeps them looking fresh.",
      "Apple Inc. reported record quarterly revenue driven by strong iPhone sales.",
      "Enzymatic browning happens when cut fruit is exposed to oxygen in the air.",
      "A classic apple pie recipe with a flaky butter crust and cinnamon filling.",
      "Store peeled apples in an airtight container to limit contact with oxygen.",
      "The best hiking trails near the Blue Ridge Mountains in autumn.",
      "Blanching apple slices briefly in hot water deactivates the browning enzyme.",
      "How to prune an apple tree for better fruit production next season.",
      "Vitamin C powder dissolved in water works like lemon juice to prevent discoloration."
    ]
  },
  {
    id: "jp-reranker",
    title: "⑥ Rerankerで並べ替え（日本語）",
    note: "「リストの逆順」に関する文が複数あり、ベクトルでは僅差。Rerankerはクエリへの的確さで正解を明確に上位へ押し上げる。",
    query: "Pythonでリストを逆順に並べ替えるには",
    docs: [
      "リストを逆順にするには list[::-1] でスライスすると新しい逆順リストが得られる。",
      "list.reverse() を使うと元のリストをその場で逆順に並べ替えられる。",
      "reversed() 関数はイテレータを返すので list() で包むと逆順リストになる。",
      "list.sort() はリストを昇順に並べ替えるためのメソッドである。",
      "sorted(list, reverse=True) は降順に並べ替えた新しいリストを返す。",
      "リストの要素を追加するには append() や extend() を使う。",
      "リスト内包表記を使うと簡潔に新しいリストを生成できる。",
      "辞書のキーでソートするには sorted の key 引数を指定する。",
      "リストの特定要素を削除するには remove() や pop() を使う。",
      "numpy配列を逆順にするには np.flip() やスライスを利用する。"
    ]
  },
  {
    id: "jp-entity-number",
    title: "⑦ 固有名詞・数字（日本語）",
    note: "具体的な年や日付など、表層の一致が重要なケース。BM25が強く、ベクトルは曖昧になりやすい。",
    query: "2025年の体育の日（スポーツの日）は何月何日",
    docs: [
      "2025年のスポーツの日は10月13日（月）で、ハッピーマンデー制度により10月第2月曜日となる。",
      "スポーツの日はかつて体育の日と呼ばれ、1964年の東京五輪開会式に由来する。",
      "2024年のスポーツの日は10月14日だった。",
      "海の日は7月の第3月曜日に定められている国民の祝日である。",
      "祝日法の改正により、2020年から体育の日はスポーツの日に名称変更された。",
      "2025年のゴールデンウィークの並びと有給の取り方を解説する。",
      "勤労感謝の日は毎年11月23日で固定の祝日である。",
      "運動会で行われる定番競技の一覧と準備のコツ。",
      "2026年のスポーツの日は10月12日になる見込みである。",
      "国民の祝日が日曜と重なった場合は振替休日が設けられる。"
    ]
  },
  {
    id: "en-cloud-cost",
    title: "⑧ 長文の言い換え（英語）",
    note: "短いクエリに対し、説明的な長文が正解。ベクトルで候補を絞り、Rerankerが最も的確な節を上位に。",
    query: "ways to reduce cloud computing costs",
    docs: [
      "Buying reserved instances or savings plans commits you to usage in exchange for large discounts.",
      "Autoscaling shuts down idle servers automatically so you only pay for what you actually use.",
      "Spot instances offer spare capacity at steep discounts for fault-tolerant workloads.",
      "A tutorial on deploying your first container to a managed Kubernetes cluster.",
      "Right-sizing over-provisioned virtual machines is one of the fastest ways to cut your bill.",
      "An overview of the OSI networking model and its seven layers.",
      "Deleting unattached storage volumes and old snapshots removes silent recurring charges.",
      "How to set up single sign-on for your internal web applications.",
      "Moving infrequently accessed data to cheaper cold storage tiers lowers monthly spend.",
      "The cultural history of coffee houses in seventeenth century Europe."
    ]
  },
  {
    id: "mixed-docker",
    title: "⑨ 日英混在の技術ログ",
    note: "日本語の質問に対し、英語ログ・解説が正解。多言語埋め込みと、コード137の表層一致(BM25)の両方が効く。",
    query: "Dockerコンテナが exit code 137 で突然落ちる原因",
    docs: [
      "Exit code 137 means the container was killed by the OOM killer after exceeding its memory limit.",
      "Increase the container memory limit or fix the memory leak to stop the 137 crashes.",
      "Use 'docker logs' and 'docker inspect' to see why a container stopped.",
      "A guide to writing efficient multi-stage Dockerfiles to shrink image size.",
      "SIGKILL (signal 9) results in exit code 128+9 = 137 when a process is force-terminated.",
      "How to publish a container image to a private registry.",
      "Setting resource requests and limits in Kubernetes prevents nodes from running out of memory.",
      "Bind mounts and volumes are two ways to persist data outside a container.",
      "Monitor memory usage with 'docker stats' to catch leaks before the OOM kill.",
      "An introduction to container networking and port mapping basics."
    ]
  },
  {
    id: "jp-review",
    title: "⑩ レビューの含意（日本語）",
    note: "「コスパが良い」「静か」をクエリにするが、レビューは別の言い回しで述べている。含意を読むベクトル検索が活躍。",
    query: "コスパが良くて運転音が静かな掃除機",
    docs: [
      "値段の割に吸引力が高く、夜でも気兼ねなく使えるほど動作音が控えめでした。",
      "とにかく静音性が抜群で、寝ている子どもを起こさずに掃除できます。",
      "価格は安いものの、ゴミ捨ての構造が分かりやすく手入れが簡単で満足です。",
      "デザインは高級感がありますが、稼働中の騒音がかなり大きいのが難点です。",
      "高価格帯のモデルで、パワーは申し分ないが電気代もそれなりにかかります。",
      "バッテリーの持ちが良く、広い家でも一度の充電で最後まで掃除できました。",
      "見た目が可愛くインテリアに馴染みますが、吸引力は値段相応です。",
      "費用対効果に優れ、音も図書館並みに静かで買って正解でした。",
      "付属のヘッドが多く、隙間や階段の掃除に重宝しています。",
      "重量が軽くて取り回しは良いものの、ややうるさく感じる場面もあります。"
    ]
  }
];
