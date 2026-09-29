# Agent D バグ一覧

**開始**: 私はDエージェントとして動きます（担当: js/graphics.js・css/graphics.css（XHIGH、後処理、GPUリソース解放、リサイズ、コンテキスト喪失））。

### D-001 [重大度: Medium] [種別: visual] XHIGHの解像度が大画面では高画質より「低く」なる（「最大3×・スーパーサンプリング」の主張に反する）
- 場所: js/graphics.js:356-357 `resize()`
- 内容: `ratio = min(max(dpr,2), 3, sqrt(5e6/(w*h)), ...)`。500万画素上限が dpr 下限より優先されるため、3840×2160(DPR1)では ratio=0.776、2560×1440(CSS)×DPR1.5 では ratio=1.16。高画質は `min(dpr,1.7)`=1.0/1.5 なので **XHIGHの方が内部解像度が低くぼやける**。
- 根拠: 数式どおり。tests/graphics.js の `actual supersampled render buffer` は 1280×720 でしか検証しておらず見逃し。
- 修正案: 下限を `max(devicePixelRatio, 1)` 以上に保証し、上限超過時はMSAA/影を下げる。

### D-002 [重大度: Medium] [種別: code] `frames` カウンタが無効化/再有効化でリセットされず、再作成パイプラインの検証が偽陽性
- 場所: js/graphics.js:15,441,466-506（disableで`frames`未リセット）/ tests/graphics.js `recreated XHIGH pipeline`,`repeat XHIGH render`,`final XHIGH render`
- 内容: `stats.frames >= 2/3/4` を待つが、frames は累積値のため再有効化直後の最初のレポートで即成立。新パイプラインで1フレームも描けていなくても通る。`getStats().frames`/`data-graphics-frames` も「現セッションのフレーム数」として誤り。
- 修正案: enable()で `this.frames = 0`。

### D-003 [重大度: Medium] [種別: visual] XHIGHで床のバンプマップが板目と無関係な縞模様に置換される
- 場所: js/graphics.js:330, 180-190
- 内容: `floor.material.bumpMap = detailTexture`（64pxごとに暗線がある汎用ノイズ, repeat 2）。床は38m四方のBoxでUV 0..1なので、溝が約2.4m間隔の横縞になる一方、アルベドの板目は `repeat 24` で約0.2m間隔。**板の継ぎ目と凹凸が一致しない**。しかも floorMat は東棟の床(game.js:239)と共有のため東棟にも適用。元のreliefMap(板目由来)は失われる。
- 修正案: 元の bumpMap を維持し、roughness だけ変更。

### D-004 [重大度: Low] [種別: visual] XHIGHで部屋札・護符(Lambert+map)に縞状のバンプが付く
- 場所: js/graphics.js:198-202
- 内容: `bumpMap: original.map ? this.detailTexture : null` のため、文字テクスチャを持つ部屋札（game.js:361,476）と護符（985）に64px周期の暗線バンプが入り、文字面が横縞で汚れる。本来凹凸を与えたいのは木材等でありラベル類ではない。

### D-005 [重大度: Medium] [種別: visual] 床反射(水たまり)が本館1Fの38m四方のみ。東棟・2Fでは反射なしなのに反射パスは常に全シーン描画
- 場所: js/graphics.js:244-248, 414-423
- 内容: puddles は `PlaneGeometry(38,38)` を (18,-.025,18) に置くだけで、東棟(x 36〜74)と2F(y=floorHeight)は対象外。一方 `render()` は階・位置に関係なく毎フレーム鏡像カメラで全シーンを半解像度描画する（2Fにいても実行）。見た目の不整合＋無駄な負荷。
- 修正案: 階ごとの反射面を持つか、プレイヤーが反射面を見ない時はパスをスキップ。

### D-006 [重大度: Medium] [種別: visual] HDR非対応(LDR)フォールバックで線形値を8bitに格納 → 暗部バンディング・ハイライト飽和・ブルーム破綻
- 場所: js/graphics.js:33, 131-136, 159-164
- 内容: `EXT_color_buffer_float` が無いと sceneTarget 等が `UnsignedByteType` の**線形**色で保持され、合成で初めてACES+sRGB変換する。暗いホラーシーンで強いバンディング、1.0で頭打ちのため bright pass (0.32〜1.15) が常に飽和域で機能しない。UIは「LDRで描画します」とだけ表示し、画質は高画質より劣化する。
- 修正案: LDR時は XHIGH を拒否する、または sRGB 8bit ターゲット＋トーンマップ済み格納にする。

### D-007 [重大度: Low] [種別: code] `present()` はどこからも呼ばれないデッドコード / `isTouch`・`settings` 引数も未使用
- 場所: js/graphics.js:12-13, 381-383
- 根拠: `grep -n "present(" js/*.js` → 定義のみ。`this.isTouch`/`this.settings` は参照箇所なし。
