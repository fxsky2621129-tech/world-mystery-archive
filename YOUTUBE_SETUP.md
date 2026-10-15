# YouTubeの一覧表示を有効にする

YouTubeの検索結果はGitHub Actionsで取得し、アプリ内にカード一覧として表示します。ブラウザの検索ボタンは取得済みデータを検索します。新しい検索語での取得にはActionsの手動実行が必要です。

1. Google Cloud Consoleでプロジェクトを選択または作成します。
2. 「APIとサービス」から **YouTube Data API v3** を有効にします。
3. 「認証情報」からAPIキーを作成します。APIの制限は **YouTube Data API v3** に限定します。Actionsから呼び出すため、Webサイト用のHTTPリファラー制限は使用できません。
4. このリポジトリの **Settings → Secrets and variables → Actions → New repository secret** で、名前を `YOUTUBE_API_KEY`、値をAPIキーにして保存します。キーはチャットやソースコードに貼らないでください。
5. **Actions → 公開と手動検索 → Run workflow** で検索語を指定し、検索するサイトに `youtube` または `youtube,peertube,niconico,vimeo` を選んで実行します。
6. 成功後、アプリの「公開データ再読込」を押します。サイト欄の「YouTube（取得済み）」でYouTubeだけを表示できます。

APIキー未設定時はYouTubeをスキップします。YouTubeだけ選択した場合は未取得のままエラー終了し、前回の公開データを保持します。キー設定後の実接続確認は別途必要です。

YouTubeは一括更新ごとに入力語で1回、最大25件を取得します。利用上限を抑えるためYouTubeには辞書の多言語展開を送信しません。再生数は取得しないため表示しません。動画再生はYouTubeのページを開きます。

公式資料：
- https://developers.google.com/youtube/v3/getting-started
- https://developers.google.com/youtube/v3/docs/search/list
