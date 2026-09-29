# Agent E バグ一覧

**開始**: 私はEエージェントとして動きます（担当: index.html・css/style.css・README整合（UI、レイアウト、レスポンシブ、アクセシビリティ、フォーカス、スクショによる見た目確認））。

検証方法: Playwright + SwiftShader で実ページを 1280x800 / 1280x720 / 1024x700 / 768x1024(touch) / 390x844(touch) / 320x568(touch) / 844x390(touch) / 667x375(touch) で表示・操作し、スクショ目視＋getBoundingClientRect の重なり判定で確認（`bughunt/tools/shot_E.cjs`, `multi_E.cjs`, `probe_E*.cjs`）。

### E-001 [重大度: Medium] [種別: visual] タッチHUD: ジョイスティックの「MOVE」ラベルが STAMINA 表示と重なる
- 場所: css/style.css `@media(pointer:coarse)` `#joystick-zone{bottom:52px;height:150px}` と `.hud-bottom{bottom:27px}`
- 内容: 全タッチ端末サイズでジョイスティック領域の下端が `.hud-bottom`（STAMINA ラベル＋ゲージ）に食い込み、「MOVE」文字が「STAMINA」の真上に重なって判読不能。
- 根拠: 390x844 で joystick-zone y=642〜792、hud-bottom y=788〜817。768x1024 でも 822〜972 vs 968〜997。スクショで "MOVE" と "STAMINA" が重なって描画。
- 修正案: joystick の bottom を hud-bottom の高さ分上げる or MOVE ラベルを非表示。

### E-002 [重大度: High] [種別: visual] スマホ横向き(844x390 / 667x375)のタイトルで要素が重なる
- 場所: css/style.css `@media(max-height:650px) and (min-width:601px)` ブロック
- 内容: 横向きスマホでは (1) `.hero-content` 下端(363/355px)が `.landing-footer`(上端342/327px)に食い込み、「ヘッドホン推奨」行とフッターの VOXEL 3D 行が重なる。(2) 667x375 では章見出し「第一夜 / THE HOUSE…」がブランドロゴ（KUCHIIE）と重なる（brand y=14〜57, hero y=54〜）。(3) `.vertical-label`（DO NOT LOOK BEHIND YOU）の高さが足りず "YOU" が2列目に折り返して上部に孤立し、下端はフッターを突き抜けて画面下端まで達する。
- 根拠: multi_E.cjs の重なり判定 hits: `.hero-content x .landing-footer`, `.landing-footer x .vertical-label`, `.brand x .hero-content`。スクショで目視確認。README は「縦画面・横画面レイアウト」対応を謳う。
- 修正案: max-height:430px 程度の追加ブレークポイントで hero を縮小/ footer を簡略化、vertical-label を非表示。

### E-003 [重大度: Medium] [種別: visual] スマホ横向きのゲームHUDで開始メッセージが護符カウンタを覆う
- 場所: css/style.css `#game-message{top:27%}` / 横向き時 `#game-message{top:22%}`
- 内容: 844x390 / 667x375 で `#game-message`（「本館・東棟・2階の護符を集め…」）が y≈83〜121 に表示され、`.objective`（y=30〜111）の「符 符 符 0 / 3」の上に文字が重なる。8秒間カウンタが読めない。
- 根拠: 重なり判定 `.objective x #game-message`。スクショで「0 / 本館・東棟…」と連結して見える。

### E-004 [重大度: Low] [種別: visual] スマホ横向きで「走る」ボタンが経過時間表示に被る
- 場所: css/style.css `.touch-actions{bottom:37px}`(横向き) と `.hud-bottom{bottom:15px}`
- 内容: 844x390 で touch-actions y=245〜353、hud-bottom y=346〜375。走るボタン円の下端が経過時間 "00:01" に接触/重なる。
- 根拠: 重なり判定 `.hud-bottom x .touch-actions`、スクショ。

### E-005 [重大度: Medium] [種別: visual] 320px幅（iPhone SE 1st等）で「遊び方」と「ENTER THE HOUSE」が折り返し崩れる
- 場所: css/style.css `.hero-action{display:flex;gap:23px}` / `.howto-button`
- 内容: 320x568 で「遊び方」が「遊び／方」の2行に割れ、開始ボタンの小見出し "ENTER THE HOUSE" も "ENTER THE / HOUSE" に折り返す。
- 根拠: スクショ（/tmp/e_v_320x568x1_title.png）で目視。howto-button が 54x58 の縦長になる。
- 修正案: `white-space:nowrap`、320px 向けに gap/padding を縮める。

### E-006 [重大度: Low] [種別: visual] 320px幅でフッターの feature-list が画面外にはみ出し、座標表記が見出しと重なる
- 場所: css/style.css `.feature-list{gap:20px}` / `.scene-coordinate{top:18%;right:6%}`
- 内容: 320x568 で `.feature-list` 右端 321.8px > 320px（"2 FLOORS / 18 ROOMS" の末尾が切れる）。また縦書き座標(x276〜301,y102〜181)が `.hero-content`(y125〜) の章見出し行と重なる。
- 根拠: getBoundingClientRect 実測、重なり判定 `.hero-content x .scene-coordinate`。

### E-007 [重大度: Medium] [種別: code/visual] XHIGH確認パネルが設定を閉じても残り、再度開くと古い「EXTREME／了承」状態が表示される
- 場所: js/game.js 1421-1439（quality-select change）, closeModal
- 内容: 描画品質で XHIGH を選ぶ→確認せずに Esc/×で閉じる→再び設定を開くと、セレクトは「高画質」なのに XHIGH パネルと「負荷を了承して有効にする」ボタンが表示されたまま。ユーザーは XHIGH 選択中と誤解する。閉じる時にパネル状態がリセットされない。
- 根拠: probe_E3: 再オープン後 `xhigh-panel visible=true, xhigh-consent visible=true, tag=EXTREME`、select 値は high。
- 修正案: closeModal('settings-modal') 時に `applyQuality()` 相当でパネルを元に戻す。

### E-008 [重大度: Medium] [種別: visual] 文字サイズ6〜8px・低コントラストの文字が多数（可読性/アクセシビリティ）
- 場所: css/style.css（例: `@media(max-height:720px) and (max-width:600px){.chapter{font-size:6px}}`, `.feature-list{font-size:7px}`, `.scene-coordinate{color:#95957b66;font-size:7px}`, `#joystick-zone>span{font-size:8px;color:#a7ac9288}`）
- 内容: 320x568 実測で .chapter=6px, footer=7px, 座標=7px かつ alpha .4。注意書き「恐怖・点滅・突然の大きな音の演出があります」も 7px で、安全上重要な警告がほぼ読めない。
- 根拠: getComputedStyle 実測（probe_E2 の contrast 出力）。
- 修正案: 最小 10〜11px、警告文は特に大きく。

### E-009 [重大度: Medium] [種別: visual] viewport-fit=cover なのに safe-area-inset を一切考慮していない
- 場所: index.html:5 `viewport-fit=cover` / css 全体に `env(safe-area-inset-*)` が 0 件
- 内容: iPhone のノッチ/ダイナミックアイランド/ホームインジケータ領域にまで描画を広げているのに、HUD・ジョイスティック（left:10〜20px）・走るボタン（right:20〜25px）・一時停止ボタン・ヘッダーが安全領域を避けない。横向きでジョイスティックや一時停止がノッチ下に入り操作不能/視認不能になる。
- 根拠: `grep -c "safe-area\|env(" css/*.css` → 0。
- 修正案: padding に `env(safe-area-inset-left)` 等を加算。

### E-010 [重大度: Low] [種別: system] `maximum-scale=1` でピンチズームを禁止（WCAG 1.4.4）
- 場所: index.html:5
- 内容: 上記の 6〜8px の文字を拡大して読むこともできない。モーダルの注意書きも拡大不可。
