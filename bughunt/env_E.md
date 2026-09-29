# Agent E 開発環境エラー記録


### E-ENV-1 Playwright Chromium が起動しない（依存ライブラリ不足）
- エラー: `Host system is missing dependencies to run browsers. ... sudo apt-get install libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 libxcomposite1 libxdamage1`
- 解決: `mkdir /tmp/pw && cd /tmp/pw && npm i playwright@1.47 && npx playwright install chromium` → `sudo apt-get install -y libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 libxcomposite1 libxdamage1`
- 起動引数 `--use-gl=swiftshader --enable-webgl --ignore-gpu-blocklist` で WebGL 描画OK。1回の起動+描画に約50秒（遅い）。Google Fonts は route で abort すると速い。
- ツール: `bughunt/tools/shot_E.cjs`（`NODE_PATH=/tmp/pw/node_modules node shot_E.cjs W H touch out.png [probe.cjs]`）。サーバは `python3 -m http.server 8765`（リポジトリ直下）。

### E-ENV-2 サンドボックスがリセットされ /tmp（playwright, スクショ）とローカルブランチが消えた
- 症状: `ls bughunt` → No such file、`git status` が main に戻っていた、/tmp/pw 消失。長時間(400s)のブラウザ実行中にユーザー中断→リセット。
- 解決: `git fetch && git checkout -b genspark_ai_developer origin/genspark_ai_developer`（push済み分は無事）。playwright と apt 依存を再インストール（E-ENV-1 手順）。**ツールは作ったらすぐpush推奨**。
- 注意: 1ブラウザで多数ビューポート＋スクショを回すと SwiftShader で1枚 30s 以上かかり timeout。screenshot に `timeout:90000` を付け、1実行 ≤3 ビューポートに。
- 注意2: 自分のツールで Google Fonts を abort すると `Failed to load resource: net::ERR_FAILED` がコンソールに出る。サイトのバグと誤認しないこと（E-022 を撤回した）。
