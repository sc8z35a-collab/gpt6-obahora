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

### E-011 [重大度: Medium] [種別: visual] PC HUD: 操作ヒント(#desktop-hint)が STAMINA ゲージ/経過時間と重なる（狭い幅）
- 場所: css/style.css `#desktop-hint{bottom:32px;left:50%;transform:translateX(-50%)}` と `.hud-bottom{bottom:35px}`
- 内容: 全PCサイズで desktop-hint が hud-bottom の帯(同じ高さ)に入る。480x720 では「W A S D 移動」がスタミナゲージ(幅130px)の線と重なって描画、1024x600 でも帯内。ウィンドウ幅<≈620pxで常に文字と線が交差。
- 根拠: multi_E 重なり判定 `.hud-bottom x #desktop-hint`（1280/1024/480/1920全て）。480x720 スクショ拡大で文字を横線が貫通。

### E-012 [重大度: Medium] [種別: code] ゲーム終了画面(捕獲/脱出)に遷移してもフォーカスが移動しない（キーボード/SR利用者が気付けない）
- 場所: js/game.js 1178-1185 endGame
- 内容: endGame は `#end-screen` を表示するだけで retry-button に focus しない。`role`/`aria-live` も無い。activeElement は BODY のまま。スクリーンリーダーには「みつけた」も結果も読まれない。
- 根拠: probe_E2: 捕獲後 `endFocus = BODY#`、Tab 1回目で retry-button。

### E-013 [重大度: Medium] [種別: code] モーダル表示中も背景(タイトル/HUD)が inert/aria-hidden にならない
- 場所: js/game.js openModal 1360-1366 / index.html
- 内容: aria-modal="true" と独自の Tab トラップのみで、`#landing` 等に inert を付けない。フォーカスが body に落ちた状態から Shift+Tab や、スクリーンリーダーの仮想カーソルでは背景の「家に入る」等へ到達できる。Tab トラップは activeElement が最初/最後の要素のときしか働かない。
- 根拠: probe_E3: `#landing.inert=false, aria-hidden=null`（設定モーダル表示中）。

### E-014 [重大度: Medium] [種別: code] 「家に入る」をキーボード(Enter)で開始するとフォーカスが隠れたボタンに残り、Space/Enter が無視される/プレイ中にボタン再発火の恐れ
- 場所: js/game.js startGame 1131-1148
- 内容: startGame は `#landing` を hidden にするが、フォーカスを移さない。hidden 化で activeElement は BODY に落ちる（Chromium）。ゲーム中の HUD に focus 可能な操作要素が一時停止ボタンのみで、ポインターロックも Enter 起動では要求されるがフォーカス管理が無い。加えて `keydown` で Space は preventDefault されるが、フォーカスが一時停止ボタンに移ると（Tab）Space/Enter で pause が発火し E-015 の問題へ繋がる。
- 根拠: probe_E3: Enter 開始後 activeElement=BODY。

### E-015 [重大度: Low] [種別: code] 一時停止モーダルから Esc 2回で再開した後、フォーカスがどこにもない
- 場所: js/game.js closeModal 1367-1372（pause-modal の modalFocus は開いた時の BODY）
- 内容: 一時停止→設定→Esc(設定閉じ)→Esc(再開) で activeElement が空（BODY）。一時停止ボタンに戻らない。再度 Tab すると HUD の一時停止ボタン以外に飛ぶ可能性。
- 根拠: probe_E3: `afterEsc2 = ["playing", ""]`。

### E-016 [重大度: Medium] [種別: code] HUD情報がスクリーンリーダーに提供されない（経過時間・スタミナ・護符数・一時停止ボタン名）
- 場所: index.html:51-57
- 内容: スタミナは `div` の幅だけ（role=progressbar/aria-valuenow 無し）、護符の「符 符 符」は収集状態を色でのみ表現（色覚依存、aria無し）、経過時間に label 無し。一時停止ボタンのテキストは "Ⅱ"(ローマ数字2) で aria-label はあるが、ゲーム中の `#game-message` role=status は8秒毎に同じ内容の再読み上げなど。
- 根拠: probe_E3 hudLabels: time/stamina/keys 全て null。

### E-017 [重大度: Medium] [種別: system] js/game.js 読み込み失敗時、ローディング画面が「家の記憶を辿っています…」のまま永久に止まる（再読み込みボタンも出ない）
- 場所: index.html:74（script に onerror 無し）/ js/game.js 冒頭のみがエラー表示を担当
- 内容: game.js 自体が 404/通信断だとエラー処理コードが存在しないため、点滅する「…」のまま無限待ち。
- 根拠: fail_E.cjs で game.js を abort → `text: 家の記憶を辿っています…, reload btn width 0`。

### E-018 [重大度: Low] [種別: visual] core.js 読み込み失敗時のエラー表示に再読み込みボタンが無く、レイアウトも横並びのまま
- 場所: js/game.js:15（Core 無し分岐は reload-button を表示しない）
- 内容: 他の失敗分岐（THREE無し・WebGL無し）はボタンを出すが、Core 無しは文言だけ。「再読み込みしてください」と言いながらボタンが無い。`#loading:has(#reload-button:not(.hidden))` 依存のため flex-direction も row のままでロゴと文が横に並ぶ。
- 根拠: fail_E.cjs nocore → `btn width 0, flex row`。

### E-019 [重大度: Low] [種別: system] graphics.js が読み込めなくても何の通知も無く、設定の「XHIGH」選択肢はそのまま表示される
- 場所: index.html:73 / js/game.js applyQuality 1386-1389
- 内容: graphics.js 失敗時はゲームは動くが、XHIGH を選んで了承して初めて「WebGL 2対応ブラウザでお試しください」と誤った原因（WebGL2非対応）を表示する。実際はスクリプト読込失敗。
- 根拠: fail_E.cjs nographics で起動成功を確認＋コード読解（`!graphics` と `!graphics.enable()` を同一メッセージで処理）。

### E-020 [重大度: Low] [種別: visual] WebGL無効環境でもタイトル（家に入る/遊び方）がローディング幕の下に完全描画され、幕は不透明で閉じられない
- 場所: js/game.js:50-52
- 内容: エラー画面はOKだが、#loading を閉じる手段が無く「遊び方」や注意書きを読むこともできない。またエラー文言が「Safari / Chromeの最新版」を案内するだけで、ハードウェアアクセラレーション無効化など主因を示さない（今回の再現はChromiumの最新版で発生）。
- 根拠: fail_E.cjs nogl。

### E-021 [重大度: Low] [種別: code] Three.js を CDN から SRI(integrity)無し・バージョン固定のみで読み込み、フォールバック無し
- 場所: index.html:71
- 内容: `integrity`/`crossorigin` 属性が無く、CDN 改ざん時に任意コード実行。jsDelivr 障害時はゲームが一切起動しない（ローカルコピー無し）。README も「初回読み込みにネット接続が必要」。three.min.js は r160 で削除予定の非推奨ビルドで、コンソールに毎回 deprecation 警告。
- 根拠: コンソール `Scripts "build/three.js" and "build/three.min.js" are deprecated with r150+`。

### E-022 【撤回】favicon 404 は誤報
- 当初「Failed to load resource」を favicon 404 と判断したが、再検証の結果これは調査ツール側で Google Fonts を route.abort したことによるもの。favicon リクエストは発生しておらず、サイトのバグではない。件数から除外する。

### E-023 [重大度: Medium] [種別: visual] XHIGH の描画モニタがタイトル見出し・縦書き座標に重なる（スマホ）
- 場所: css/graphics.css `@media(max-width:600px){.graphics-monitor{top:91px;right:6%;width:160px}}`
- 内容: 320x568 で XHIGH 有効時、モニタ(x141〜301,y91〜166)が章見出し「第一夜 / THE HOUSE…」(y125〜134)と h1「おばあちゃんが、」の右半分、縦書き座標(y102〜181)を覆い隠す。
- 根拠: probe_E4 実測＋スクショ（見出し "THE HOUSE" がモニタの下で途切れる）。

### E-024 [重大度: Medium] [種別: visual] プレイ中の XHIGH モニタが一時停止ボタンの直下を覆い、画面右上 1/3 を占有（390px）
- 場所: css/graphics.css `.playing .graphics-monitor{top:86px;right:23px;width:145px}`
- 内容: 390x844 で モニタ x222〜367,y86〜198。幅の37%を占め、視界をふさぐうえ「高画質に戻す」ボタンが pointer-events:auto でタッチの視点スワイプ領域(右側)を奪う。pointerdown ハンドラは `button` 上では視点操作を開始しない（game.js:1479）。
- 根拠: probe_E5 実測。

### E-025 [重大度: Low] [種別: code] SwiftShader 等で 0.3 FPS でも「低FPS」通知は出るが自動では戻らず、モニタの「0.3 FPS」表記が小数（整数前提UI）
- 場所: js/game.js 1339-1347
- 内容: XHIGH有効直後のタイトル画面（プレイ前）でも "0.3 FPS / 低FPS：高画質への変更を推奨" が表示される。タイトル画面はゲーム中ではないのに警告が出る（`frozen` は intro+modal のみ）。
- 根拠: 320x568 スクショ。

### E-026 [重大度: Medium] [種別: visual] 「遊び方」モーダルがスマホで縦に収まらず、閉じるボタン（わかった）までスクロールが必要／スクロールできることが分からない
- 場所: css/style.css `.modal-card{max-height:100%;overflow:auto}`
- 内容: 320x568 で card scrollHeight 791 > clientHeight 530。スクロールバーやフェード等の手掛かりが無く、「03/04」の本文が画面下で切れる。390x844 の設定モーダル＋XHIGHパネルでも 966 > 806。
- 根拠: probe_E4/E5 実測＋スクショ。

### E-027 [重大度: Low] [種別: visual] 遊び方モーダルを開くと × ボタンに大きなフォーカス枠が表示される（マウス/タップ操作でも）
- 場所: js/game.js:1365 `querySelector('button').focus()` + css `button:focus-visible{outline:2px solid;outline-offset:5px}`
- 内容: プログラムによる focus() が :focus-visible を発火させ、タッチで開いても × に橙色の四角枠が出る（スクショで確認）。視覚的ノイズ。
- 修正案: `focus({focusVisible:false})` またはダイアログ見出しへ tabindex=-1 でフォーカス。

### E-028 [重大度: Low] [種別: visual] タッチ端末で XHIGH を了承しても「G ↘」キーボードショートカット表記が表示される
- 場所: index.html:69 `#graphics-recover` 内 `<span>G ↘</span>`
- 内容: キーボードの無いスマホでも "G" ショートカットが表示される。desktop-hint 同様 pointer:coarse で隠すべき。
- 根拠: 320x568 touch スクショ。

### E-029 [重大度: Low] [種別: code] OS の「視差効果を減らす(prefers-reduced-motion)」を一切参照しない
- 場所: js/game.js（matchMedia は pointer:coarse のみ）, css（@media prefers-reduced-motion 無し）
- 内容: 点滅・揺れ抑制は手動設定のみ。初回起動時からジャンプスケアと画面揺れが有効で、`.loading-dots` の点滅アニメ等も止まらない。注意書きで点滅に言及しているのに OS 設定を尊重しない。
- 根拠: `grep -n "prefers-reduced\|matchMedia"` → pointer:coarse の1件のみ。

### E-030 [重大度: Low] [種別: visual] `.hidden` 解除時 #loading の opacity が1 に戻らないケース（通常フロー）でのフェード不整合
- 場所: js/game.js 1334-1336 と 1527
- 内容: 初回3フレームで opacity 0 → 750ms 後 hidden。750ms 以内にコンテキスト喪失が起きると `!contextLost` 判定で hidden にならないのは良いが、webglcontextlost 側は opacity=1 を設定している一方、`transition:opacity 1s` のためエラー文が1秒かけてフェードインし、その間は背景が透けて読めない。
- 根拠: コード読解（style.css `#loading{transition:opacity 1s}`）。

### E-031 [重大度: Medium] [種別: code] 音量0を保存した状態で開始すると「SOUND ON」表示なのに無音。サウンドボタンをONにしても音量0のまま
- 場所: js/game.js:1146 `if(!soundPreferenceTouched)soundOn=true;` / 1378 sound-button / 1049 `master.gain = soundOn?settings.volume:0`
- 内容: 設定で音量0→リロード→「家に入る」で soundOn=true となりラベル「SOUND ON」・aria「サウンドをオフにする」になるが gain=0 で無音。ユーザーがサウンドボタンで ON にしても volume は 0 のまま復帰しない（音量スライダーは input で soundOn=volume>0 と連動しているのに、逆方向の連動が無い）。
- 根拠: probe_E7: before `[SOUND OFF, 0]` → 開始後 `[SOUND ON, 0, volume 0]`; ボタン操作後も `[SOUND ON, volume 0]`。

### E-032 [重大度: Medium] [種別: visual] プレイ中はヘッダーが非表示なので、ゲーム中にサウンドON/OFFを切り替える手段が無い
- 場所: css/style.css `.playing .site-header{display:none}` / index.html:27
- 内容: サウンドボタンはヘッダーにしか無く、一時停止中も `.playing` クラスが残るため非表示（probe_E7: 一時停止中 `.site-header display:none`）。一時停止→設定の音量スライダーでしか変えられず、ミュート状態も確認できない。README「ゲーム中の音量は一時停止→設定から変更できます」とは合うが、音量0↔ONのラベル不一致（E-031）と組み合わせて状態が分からない。

### E-033 [重大度: Medium] [種別: visual] タップ領域が小さすぎる（設定ボタン 16×32px、サウンド 79×32px）
- 場所: css/style.css `.icon-button{padding:8px 0}` / index.html:29
- 内容: 390x844 実測で `#settings-button` 16×32px、PCでも 18×34px。推奨 44×44px（Apple HIG / WCAG 2.5.5）を大幅に下回る。スマホでは設定を開くのが困難、隣のサウンドボタンの誤タップも起きやすい。
- 根拠: probe_E6 targets 実測。

### E-034 [重大度: Low] [種別: visual] 一時停止ボタンのアイコンに全角ローマ数字「Ⅱ」を使用（フォント依存で「2」に見える）
- 場所: index.html:51 `aria-label="一時停止">Ⅱ</button>`
- 内容: U+2161 ROMAN NUMERAL TWO。セリフ体では上下にセリフが付き「II」＝ローマ数字の2として描画され、一時停止記号(⏸)に見えない端末がある。スクショでも Ⅱ にセリフ線が見える。
- 修正案: SVG か CSS の2本線で描く。

### E-035 [重大度: Low] [種別: system] README とマップ仕様の不一致: 「2フロア×19行×37列」なのに屋敷座標/東棟判定の説明と HUD 判定境界が不一致（x>36 と x>37）
- 場所: js/game.js:1096 `player.x > 36 ? '1F / 東棟'` と 1205 `player.x>37 ? 'east'`
- 内容: HUD の現在地表示は x>36 で「1F / 東棟」、初回進入メッセージは x>37 で東棟判定。x=36〜37 の1mの帯では HUD が東棟なのに到達メッセージが出ない（境界不一致）。README 上の「本館・東棟」の区切りも未定義。
- 根拠: コード読解（2か所の閾値が異なる）。DUP? (A/B 範囲)

### E-036 [重大度: Medium] [種別: visual] html/body が overflow:hidden 固定のため、高さの足りない画面ではタイトルの内容がスクロールで救えない
- 場所: css/style.css `html,body{overflow:hidden}` + `#landing{height:100%}` + 全要素 absolute 配置
- 内容: E-002 のように要素が画面外/重なりになっても、ページはスクロール不能で、PCの短いウィンドウ(900x420)でも `.hero-content x .landing-footer` が発生（PC幅でも再現、タッチ限定ではない）。ブラウザのツールバー表示で高さが縮むモバイルでも同様。
- 根拠: multi_E NOSHOT 900x420 → hits `.hero-content x .landing-footer`。

### E-037 [重大度: Low] [種別: visual] 開始メッセージが PC の低い窓(601x500 など)でも護符カウンタ直下に接触
- 場所: css/style.css `#game-message{top:22%}`(max-height:650px)
- 内容: 601x500 で game-message y=110〜148、objective 下端 y=111 と接触/重なり（`.objective x #game-message`）。E-003 の PC 版（DUP寄り、条件が異なるため別記）。

### E-038 [重大度: Low] [種別: visual] 結果画面タイトルが字間 10px / 6px の「み つ け た。」で、元テキストに半角スペース(U+0020)を入れた上に letter-spacing も付与
- 場所: js/game.js:1181 `'み つ け た。'`, `'夜 が 明 け る。'` / css `#end-screen h2{letter-spacing:10px}`
- 内容: 文字間にスペース文字＋letter-spacing の二重指定のため、スクリーンリーダーは「み、つ、け、た」と1字ずつ読み上げ、コピーすると空白入り文字列になる。視覚上も 320px 幅で「み つ け た。」がほぼ全幅（スクショ）。「夜 が 明 け る。」は 320px で折り返しの恐れ。
- 修正案: 空白を削除し CSS の letter-spacing のみで表現。

### E-039 [重大度: Low] [種別: code] ブランドロゴ `href="./"` がゲーム状態を破棄してページ再読み込みになる（タイトル画面でも）
- 場所: index.html:24
- 内容: タイトル画面でロゴをクリック/Enter すると単にページ全体をリロード（Three.js 再初期化・約数秒のローディング）。SPA 内の「ホーム」の意味にならず、XHIGH も解除される（restoreXhigh）。Tab 順の先頭にあるため、キーボード利用者が最初に Enter を押すとリロードになる。
- 根拠: probe_E2 tabOrder 先頭が `brand`。

### E-040 [重大度: Low] [種別: code] 一時停止中に設定を背景クリックで閉じるとフォーカスが消失
- 場所: js/game.js:1377（backdrop click → closeModal）/ 1371
- 内容: 一時停止→設定→背景クリックで閉じると activeElement が空（BODY）。「設定」ボタン（modalFocus）へ戻るはずが、クリックでフォーカスが外れた後に復元判定が走るため戻らない。以降 Tab で一時停止モーダル外へ出られる。
- 根拠: probe_E9 `afterSettingsBackdrop: ["paused", false, ""]`。

### E-041 [重大度: Low] [種別: code] 「タイトルに戻る」後もフォーカスが BODY、ゲームメッセージの visible クラスが残ったまま
- 場所: js/game.js:1177 goHome
- 内容: goHome は `#game-message.visible` を外さない（HUDごと非表示なので見えないが、次回 startGame 直後の1フレームに前回メッセージが一瞬表示されうる）。またフォーカスを「家に入る」へ戻さないため、キーボード利用者は位置を失う。
- 根拠: probe_E9 `home: {focus: BODY, msgVisible: true}`。

### E-042 [重大度: Low] [種別: code] `aria-label` を role の無い div に付与（支援技術に無視される）
- 場所: index.html:17 `<div id="world" aria-label="3Dホラーゲーム画面">`
- 内容: ARIA 1.2 では generic 要素への aria-label は禁止/無視。canvas にも role・代替テキストが無く、ゲーム画面の存在がスクリーンリーダーに伝わらない。
- 修正案: `role="img"` か `role="application"` を付ける。

### E-043 [重大度: Low] [種別: code] 「調べる」プロンプト(#interaction-prompt)がライブリージョンでなく、護符・玄関に近づいても支援技術に通知されない
- 場所: index.html:53
- 内容: `#game-message` は role=status だが、行動可能を示す `#interaction-prompt`（「[ E ] 護符を取る」「封じられた玄関」）は aria-live 無し。表示/非表示は class 切替のみ。

### E-044 [重大度: Low] [種別: visual] 遊び方の本文が開発履歴の表現「約3倍に広がった屋敷」になっている
- 場所: index.html:61
- 内容: 初めて遊ぶプレイヤーには「何の3倍か」が意味不明。旧版比の変更履歴（README の「探索面積は旧版の約3倍」）がそのままゲーム内説明に流用されている。

### E-045 [重大度: Low] [種別: visual] 視点感度・音量スライダーに現在値の表示が無い
- 場所: index.html:64 `#sensitivity-input`, `#volume-input`
- 内容: range 入力のみで数値/パーセント表示・aria-valuetext が無い。音量0かどうか（E-031）も見た目で判別しにくい（スクショで確認、つまみ位置のみ）。

---
**E 進捗メモ（リーダー向け）**: E は有効 44 件（E-022 は撤回）。C=6, D=7 と合わせてチーム計 57 件（A/B は未投稿の時点）。使用ツール: `bughunt/tools/shot_E.cjs`, `multi_E.cjs`（NOSHOT=1 でスクショ省略・高速）, `fail_E.cjs`, `probe_E1..9.cjs`。
