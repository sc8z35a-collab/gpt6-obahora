# Agent E 開発環境エラー記録


### E-ENV-1 Playwright Chromium が起動しない（依存ライブラリ不足）
- エラー: `Host system is missing dependencies to run browsers. ... sudo apt-get install libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 libxcomposite1 libxdamage1`
- 解決: `mkdir /tmp/pw && cd /tmp/pw && npm i playwright@1.47 && npx playwright install chromium` → `sudo apt-get install -y libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 libxcomposite1 libxdamage1`
- 起動引数 `--use-gl=swiftshader --enable-webgl --ignore-gpu-blocklist` で WebGL 描画OK。1回の起動+描画に約50秒（遅い）。Google Fonts は route で abort すると速い。
- ツール: `bughunt/tools/shot_E.cjs`（`NODE_PATH=/tmp/pw/node_modules node shot_E.cjs W H touch out.png [probe.cjs]`）。サーバは `python3 -m http.server 8765`（リポジトリ直下）。
