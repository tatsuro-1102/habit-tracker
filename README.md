# 習慣トラッカー（第1段階）

個人用の習慣管理Webアプリ。GitHub Pages（画面）＋ Supabase（データ・ログイン）で動きます。

## できること（現時点）
- ログイン（自分専用）
- 習慣の追加・編集・終了（曜日指定、6カテゴリー）
- 日付ごとのチェックと達成率、直近7日の推移
- スマホのホーム画面に追加して使える

## ファイル構成
| ファイル | 役割 |
|---|---|
| index.html / style.css / app.js | 画面 |
| config.js | Supabaseの接続情報（URLとanonキー） |
| supabase/schema.sql | データベースの表を作るSQL |
| manifest.webmanifest / icon.svg | ホーム画面に追加したときの設定 |

## 初期設定
1. **表を作る**：Supabase → SQL Editor → `supabase/schema.sql` の中身を貼って Run
2. **自分のユーザーを作る**：Authentication → Users → Add user → Create new user（メール・パスワードを入力、Auto Confirm User にチェック）
3. **新規登録を閉じる**：Authentication → Sign In / Providers →「Allow new users to sign up」をオフ
4. **接続情報を貼る**：Project Settings → API（Data API / API Keys）の Project URL と anon（publishable）キーを `config.js` に貼る
   - `service_role` / `secret` キーは絶対に入れない
5. **手元で確認**：このフォルダで `npx --yes serve .` を実行し、表示されたURL（http://localhost:3000）を開く
   - index.html をダブルクリックで開くと動きません（ブラウザの制限）

## 公開（GitHub Pages）
1. GitHubで新しいリポジトリを作成（無料プランでPagesを使う場合は Public）
2. このフォルダの中身をpush
3. リポジトリの Settings → Pages → Branch を `main` / `(root)` にして Save
4. 数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で開ける

公開されるのは画面のプログラムだけです。記録データはSupabaseにあり、ログインした本人しか読めません（行レベルセキュリティ）。

## データ設計メモ
- `habits`：習慣。終了しても削除せず `archived_at` を入れて履歴を残す
- `habit_logs`：完了記録。**所要時間は持たない**（時間記録は第4段階で `time_entries` として別に作る）
- `source` 列で Web／LINE のどちらから記録したかを区別（第1段階後半のLINE連携用）
