# World Mystery Archive — 世界の不思議映像検索

2026-10-15修正版です。修正内容と検証範囲は [修正内容.md](修正内容.md) を参照してください。JavaScriptの回帰テストにはNode.js 22以上を使用します。

**YouTube版とは別のWebアプリ**です。世界の不思議映像を、公開APIが利用可能な複数の動画サイトから検索できます。
PCとAndroidのChrome等で使用できます。広告や動画ファイルの取得・ダウンロード機能はありません。

## できること

- **ブラウザで即時検索**：PeerTube（SepiaSearch）とニコニコ動画のAPIに、ユーザー操作時に検索を送信します。ブラウザのCORS制限やサービス障害がある場合は利用できません。その場合は以下の**GitHub Actions一括更新**をご利用ください。
- **GitHub Actionsで一括検索**：PeerTube、ニコニコ動画、Vimeo（オプション）。検索実行後、検索結果JSONをGitHubに保存し、Pagesに再公開します。更新スケジュールはなく、**手動実行のみ**です。
- **多言語検索**：日本語のジャンル語が辞書に当たった場合に、英・西・仏・韓・中の検索キーワードを補助的に追加します。任意の文章を全言語に翻訳する機能ではありません。任意の外国語は「海外語を追加」で入力できます。
- **管理**：全件・お気に入り・手動登録、再生数順／新着順、お気に入りのJSONバックアップ・復元。
- **端末保存**：お気に入りと手動登録URLは端末のブラウザ（localStorage）に保存されます。GitHubへの同期はされません。端末を変えたらバックアップJSONを移してください。

## 最初の設置手順（Windows PC推奨）

1. ZIPをすべて展開します。中にある `.github` フォルダを含めて保管してください。
2. GitHubで**新しい公開（Public）リポジトリ**を `world-mystery-archive` などの名前で作成します。**前回のYouTubeアプリとは別**にします。リポジトリを初期化するREADME等は不要です。
3. GitHubの `Add file` → `Upload files` で、**フォルダの中身**をルートにアップロードします。ただしブラウザからのアップロードでは隠しフォルダ `.github` が欠落する場合があるため、**GitHub Desktopでフォルダごとコミット・Pushする方法が確実**です。少なくとも `.github/workflows/site.yml` がリポジトリに存在することを確認してください。
4. リポジトリの `Settings` → `Pages` → `Build and deployment` → `Source` を **GitHub Actions** に設定します。
5. `Actions` タブで **「公開と手動検索」** を開き、`Run workflow` → `search_query` に「心霊映像」などを入力 → 実行します。
6. 実行終了後、`Settings` → `Pages` に表示されるURLへアクセスします。例：`https://ユーザー名.github.io/world-mystery-archive/`。
7. アプリの検索欄ではPeerTubeとニコニコ動画を直接検索できます。Vimeoや安定した一括検索が必要な場合は `GitHub Actionsで3サイト一括更新` リンクを使います。

**注意**：GitHub Actions画面の入力値と結果は、公開リポジトリでは閲覧可能です。プライベートな検索語は入力しないでください。GitHub Pagesも公開サイトとなります。お気に入り・手動登録はGitHubに送信しません。

### Vimeoを追加する（任意）

Vimeoの検索APIは無料で扱える公開動画がありますが、APIアクセスにはVimeoアプリを登録してパーソナルアクセストークン等を取得する必要があります。利用可能な検索範囲やレート制限はアカウントの契約・権限・Vimeo側運用により変わります。トークン未設定でもPeerTube・ニコニコ動画は動作します。

1. Vimeo Developer（https://developer.vimeo.com/apps）でアプリを登録します。
2. `public` スコープなど検索に必要な範囲でAPIトークンを取得します。
3. GitHubリポジトリの `Settings` → `Secrets and variables` → `Actions` → `New repository secret` を選び、名前 `VIMEO_ACCESS_TOKEN`、値にトークンを登録します。
4. `Actions` →「公開と手動検索」で検索対象を `peertube,niconico,vimeo` に設定して実行します。

トークンをHTMLやJavaScriptに書き込まないでください。`VIMEO_ACCESS_TOKEN` はActions内だけで使用します。Vimeo API側の検索許可状況によってはVimeoのみ検索に失敗する場合があります。

## 日常の使い方

- **ブラウザ即時検索**：日本語ワードを入力 → 「世界を検索」。多言語オンなら辞書を照合し、PeerTubeには国外の検索語も送信します。実際の検索件数と失敗は画面に表示されます。
- **3サイト一括更新（手動）**：GitHub Actions→`Run workflow`で検索ワード・言語・サイトを入力し実行。保存済み公開カタログは**前回の収集結果から置き換わります**。その後、アプリ内「公開データ再読込」で新しいデータを表示。
- **お気に入り**：動画の `♡` をタップ。データを再収集してもお気に入りは残ります。
- **手動登録**：「＋ URLを登録」から任意の投稿サイトのページURLとタイトルを入力。
- **移行**：「↓ お気に入りをバックアップ」でJSONを書き出し、移行先の「↑ バックアップを復元」で読み込み。
- **Androidホーム画面**：Chromeでサイトを開き、ブラウザメニューの「ホーム画面に追加」を選択。PWA風に起動できます（オフライン検索機能はありません）。

## 収集元

| 投稿サイト | 公式API | ブラウザ直接検索 | Actions一括検索 | 認証 |
|---|---|---|---|---|
| PeerTube（SepiaSearch世界共通インデックス） | `/api/v1/search/videos` | ○（CORS条件次第） | ○ | 不要 |
| ニコニコ動画 | スナップショット検索API v2 | ○（CORS条件次第） | ○ | 不要 |
| Vimeo | `GET /videos?query=` | × | ○（任意） | Vimeoアクセストークン |

Dailymotionは現在の推奨API v2がアクセストークン認証を要求するため、無設定の検索元としては追加していません。TikTok・Bilibili等も正式な一般公開の無制限検索APIを想定しないため未対応です。

参考URL：
- PeerTube REST API: https://docs.joinpeertube.org/api/rest-getting-started
- PeerTube OpenAPI: https://github.com/Chocobozzz/PeerTube/blob/develop/support/doc/api/openapi.yaml
- ニコニコ動画 スナップショット検索API: https://site.nicovideo.jp/search-api-docs/snapshot
- Vimeo API 認証: https://developer.vimeo.com/api/authentication
- Vimeo Video API: https://developer.vimeo.com/api/reference/videos
- Dailymotion API v2: https://developers.dailymotion.com/reference/introduction
- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

## 誤情報・利用上の注意

- **検索に出た映像が本物の心霊現象だとは断定できません**。動画の内容は投稿者による加工、演出、創作である可能性があります。
- サイトごとに検索品質・再生可能な地域・閲覧権限・NSFW判定・再生数の定義が異なります。全サイトで統一された精度は保証できません。PeerTubeのセーフサーチはAPIパラメータによる限定的な絞り込みです。
- 動画そのものは保存・再配布しません。各動画は投稿元の公式ページを別タブで開きます。サムネイルなどの表示は各サービスの提供状況に依存します。
- PeerTubeのインデックスは全PeerTubeサーバーを網羅するものではありません。収集件数はサイトの応答に依存します。
- **一括更新した検索結果（タイトル、URL、サムネイル等）はGitHub Pagesと公開リポジトリから第三者に見えます。** 個人用の検索語やプライベートURLは登録しないでください。
- API障害や認証不備等で全サイト失敗した場合、Actionsはエラー終了し、直前の公開データを維持します。一部成功した場合は成功結果だけを記録し、失敗元を画面に知らせます。
- 検索結果は最新実行分のみ最大300件保存し、過去の一覧は保持しません（ただしGit履歴に更新の記録が残ります）。各サイトの利用規約に合わせた保存期間等の見直しが必要なら運用を変更してください。
- 配布物は実際のAPI接続を通した動作確認は行っていません。PythonユニットテストとJavaScript構文チェックを行い、初回接続後は結果を確認してください。

## ローカルテスト（Python 3.12以上）

```
cd world-mystery-archive
python -m http.server 8000 -d site
```
`http://localhost:8000/` で開きます。GitHub Actionsでの更新はGitHub上で実行します。スクリプトのユニットテスト：

```
python -m unittest discover -s tests -v
```

JavaScript構文チェック（Node.jsがある場合）：`node --check site/app.js`

JavaScript回帰テスト：`node --test tests/test_app.cjs`
GitHub ActionsではPythonとJavaScriptのテストを公開前に実行します。

## 構成

```
.github/workflows/site.yml   # Pages公開と手動検索。定期実行なし
scripts/search.py           # 公式APIへの取得処理（Python標準ライブラリだけ）
site/index.html             # PC/Android両対応の画面
site/styles.css             # スタイル
site/app.js                 # 検索・お気に入り・保存・復元
site/data/dictionary.json  # キーワード辞書
site/data/catalog.json     # 最新公開検索結果（初回は空）
site/manifest.webmanifest   # ホーム画面追加用
site/icon.svg              # アイコン
tests/test_search.py        # APIレスポンスを模したテスト
```
