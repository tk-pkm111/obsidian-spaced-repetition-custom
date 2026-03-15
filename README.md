# Spaced Repetition (Custom)

Obsidian 用の間隔反復プラグインです。  
このリポジトリは、既存の `Spaced Repetition` プラグインをベースにしたカスタム fork です。

## 概要

この fork では、主に次の改善を加えています。

- レビュー画面とデッキ画面の UI 改善
- フローティングバーによる最小化 / 復帰
- 元ノートへの直接移動
- 画像 / Excalidraw 埋め込み表示の改善
- 右クリックからのフラッシュカード化
- `#cornell` と `>[!cue]` 記法を使った Cornell カード対応

## インストール

このプラグインは現時点では Obsidian の公式コミュニティプラグイン一覧には未登録です。  
そのため、`BRAT` を使ってインストールしてください。

### BRAT での導入手順

1. Obsidian で `BRAT` をインストールする
2. `BRAT` を開く
3. `Add Beta plugin` を選ぶ
4. 次の GitHub リポジトリ URL を入力する

`https://github.com/tk-pkm111/obsidian-spaced-repetition-custom`

5. 追加後、`Spaced Repetition (Custom)` を有効化する

### 更新方法

- 新しい release を公開した後、BRAT 経由で更新できます
- 手動更新する場合は、release assets の `main.js`、`manifest.json`、`styles.css` を差し替えてください

## 主な使い方

### フラッシュカード

フラッシュカード用タグ:

- `#flashcards`

基本記法:

```md
質問 ?? 回答
```

複数行カード:

```md
質問
>
回答
```

### Cornell カード

Cornell 用タグ:

- `#cornell`

対応記法:

```md
>[!cue] 質問
>
回答
```

例:

```md
#cornell

---
>[!cue] フランスの首都は？
>
パリ
```

## この fork の方向性

この fork は、見た目と操作性を強く改善しつつ、Obsidian 上での実用性を高めることを目的にしています。

特に以下を重視しています。

- スマホライクで触りやすい UI
- ノートとレビュー画面の往復をしやすい導線
- 画像や図解を含む学習に向いた表示
- Cornell ノートと通常フラッシュカードの併用

## リリース

最新 release:

- `1.14.0-custom.10`
- https://github.com/tk-pkm111/obsidian-spaced-repetition-custom/releases

## 元プロジェクトについて

このリポジトリは、以下のプロジェクトをベースにしています。

- https://github.com/st3v3nmw/obsidian-spaced-repetition

## ライセンス

このリポジトリは upstream のライセンス条件を引き継ぎます。  
詳細は `LICENSE` を参照してください。
