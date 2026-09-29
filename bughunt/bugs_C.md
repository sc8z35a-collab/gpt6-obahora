# Agent C バグ一覧

**開始**: 私はCエージェントとして動きます（担当: js/core.js（設定検証・経路探索・衝突・階段・視線・スタミナ）と tests/*（テスト自体の誤り・偽陽性））。

検証ツール: `bughunt/tools/c_core_harness.cjs`（core.jsをNodeで読込）, `c_sim_ai.cjs`（game.js updatePlaying の敵AIを1/60固定ステップで忠実再現）, `c_safe_spots.cjs`, `c_fuzz_move.cjs`, `c_sight_exact.cjs`, `c_count_pure.cjs`, `c_runtests.cjs`（tests/*.html をヘッドレス実行）

### C-001 [重大度: Critical] [種別: system] 部屋の角に立つだけで おばあさんが永久に捕まえられない（安全地帯）
- 場所: js/core.js:199（HouseNavigation.findPath の `start === goal` → `[]`）、js/game.js:1219（`clearSight(granny, player, .25)`）、core.js:57-60
- 内容: プレイヤー半径は .24 なので壁から .24〜.25 の位置に立てるが、敵の視線判定は半径 .25 で「終点(プレイヤー位置)」も canStand 検査するため、壁に密着したプレイヤーは常に「見えない」扱い。見えないので経路探索に切り替わるが、敵がプレイヤーと同じセルに入ると `start===goal` で空経路を返し、target=undefined で敵は停止。部屋の角（セル中心から(.755,.755)）では停止位置までの距離が約1.15 > 捕獲距離0.92 のため永遠に捕まらない。
- 根拠/再現: `node bughunt/tools/c_sim_ai.cjs` → プレイヤー(1.245,1.245)：150秒経過しても caught:false、敵は(2.00,2.12)で停止、距離1.15。`c_safe_spots.cjs` で 1331 箇所中 179 箇所（全部屋の角・壁際）が安全地帯。護符3枚取得後（速度最大）でも同じ。
- 修正案: 同一セル時は `[to]` を返す／直接追跡に切替。視線の終点判定はプレイヤー半径以下にするか終点を除外。

### C-002 [重大度: High] [種別: system] 階段上端（踊り場の継ぎ目）にも安全地帯。敵が0.8m手前で止まる
- 場所: js/core.js:178-183（HouseNavigation.clearSight は layers[floor].clearSight を直接呼び、canStand の階段継ぎ目例外(core.js:140-141)を通らない）
- 内容: 2F踊り場の西端 x≈49.05（1F側 x≈48.9 も同様）に立つと、Navigation 単層の canStand では隣接セル(24,16)が壁扱いになり視線が常に false。敵は同一セルに到達して停止（C-001と同じ空経路）。距離0.79〜0.91で止まり捕獲されない。
- 根拠/再現: `sim({x:49.05,z:32,floor:1})` → caught:false, 敵は(49.90,32.00)で停止 dist 0.85。`sim({x:48.9,z:32,floor:0})` → 敵(48.11,31.99) dist 0.79 でも捕獲されない。`nav.canStand(49.05,32,.12,1)=true` だが `nav.layers[1].canStand(49.05,32,.12)=false`。
- 修正案: HouseNavigation.clearSight を自前の canStand（継ぎ目例外込み）でサンプリングする。

### C-003 [重大度: Medium] [種別: code] 視線判定がサンプリング方式で細い壁角をすり抜ける（壁越しに見える）
- 場所: js/core.js:54-62（Navigation.clearSight：cell*0.1=0.2 間隔の点サンプル）
- 内容: 線分が壁セルの角を0.2未満の長さだけ横切る場合に検出漏れ。敵が壁越しにプレイヤーを「見て」直進追跡し壁に張り付く／アイテム取得の視線判定も同様。
- 根拠/再現: `node bughunt/tools/c_sight_exact.cjs`：厳密な線分×拡張AABB判定と比較し 7433 本中 18 本で「壁を通して見える」誤判定。例 a=(22.18,17.39)→b=(34.36,13.86)。
- 修正案: DDA（グリッドトラバーサル）で厳密判定。

### C-004 [重大度: Medium] [種別: code] 敵の視線(半径.25)と捕獲判定(半径.12)・プレイヤー衝突(半径.24)の半径不一致
- 場所: js/game.js:1219, 1244 / core.js:175
- 内容: 同じ「敵→プレイヤーの視線」に3種の半径が混在。.25 > .24 なのでプレイヤーが合法に立てる位置が視線終点として不合法になる（C-001の根本原因）。捕獲判定だけ .12 で通るため、「見えていないのに触れたら捕まる」「見えているのに近寄れない」の不整合が生じる。
- 修正案: 終点サンプルを除外するか、半径を min(敵,プレイヤー) に統一。

### C-005 [重大度: Low] [種別: code] HouseNavigation.canStand の2F継ぎ目例外が x 範囲を制限しておらず、2Fの壁セル(24,16)上に立てる判定を返す
- 場所: js/core.js:141 `(floor === 1 && cx === this.stairs.last)` 
- 内容: 1F側の例外は `x >= 47 && x < endX` で制限しているのに2F側は無制限。`canStand(47.3, 32, .24, 1)` が true（壁セルのど真ん中）。現状は move() が x<49 で1Fに切り替えるため表面化しにくいが、canStand を単独で使う箇所（今後のスポーン判定・テスト等）で誤判定。
- 根拠: `nav.canStand(47.3,32,.24,1)` → true。

### C-006 [重大度: Low] [種別: system] tests: README記載「回帰テスト81項目」だが実際は86項目
- 場所: README.md:42,79 / tests/audit.js
- 根拠: `c_runtests.cjs regression.html 960 640` → `[AUDIT COMPLETE] 86 assertions passed.`（純粋規則39＋DOM47）。README とテスト数が不一致。
