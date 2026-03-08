フローティングバー表示中のキーボード操作を改善しました。

- フローティングバーへ最小化した時点で modal の keymap scope を外し、Obsidian のコマンドを使えるように修正
- `復帰` 時と `閉じる` 時だけ review modal の scope を安全に戻すよう調整
- フローティングバー表示中でも command palette などのショートカットが使える挙動を unit test で追加確認
