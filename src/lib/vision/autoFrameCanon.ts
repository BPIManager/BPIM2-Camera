import type { CanonicalLayout } from "./autoFrame";

/**
 * 基準の写真（リザルト画面を撮った 1080×1920 の写真）での、手がかりの文字と撮影枠の位置（画素）。
 * 実機で撮った 89 枚（internal/captures）から求めた（pnpm eval autoFrame で作り直せる）。
 * 手がかりは、各写真の位置を基準の写真に戻した中央値。枠は、各写真で撮影に使った枠を同じく戻した中央値
 */
export const CANONICAL_LAYOUT: CanonicalLayout = {
  "anchors": {
    "best": {
      "x": 158,
      "y": 682
    },
    "current": {
      "x": 319,
      "y": 660
    },
    "clearType": {
      "x": 171,
      "y": 723
    },
    "djLevel": {
      "x": 120,
      "y": 785
    },
    "missCount": {
      "x": 210,
      "y": 905
    },
    "great1": {
      "x": 285,
      "y": 1027
    },
    "great2": {
      "x": 286,
      "y": 1051
    },
    "good": {
      "x": 287,
      "y": 1067
    },
    "bad": {
      "x": 296,
      "y": 1092
    },
    "songTitle": {
      "x": 927,
      "y": 1114
    },
    "scoreLabel": {
      "x": 136,
      "y": 854
    },
    "poor": {
      "x": 306,
      "y": 1107
    },
    "difficulty": {
      "x": 624,
      "y": 1167
    },
    "notes": {
      "x": 1014,
      "y": 1162
    }
  },
  "frames": {
    "score": {
      "x": 293,
      "y": 798,
      "width": 203,
      "height": 73
    },
    "title": {
      "x": 613,
      "y": 1050,
      "width": 437,
      "height": 144
    },
    "judge": {
      "x": 364,
      "y": 991,
      "width": 156,
      "height": 130
    }
  }
};

/**
 * 2P の基準。2P では、パネル（スコア欄・判定表など）はまとまりのまま右へ動き、曲名・難易度・ノーツ数は左下へ動く。
 * パネルの手がかりは 1P と同じにし、曲名まわりの手がかりと曲名の枠だけを差し替える（2P の写真 3 枚から求めた。pnpm eval canon2p）
 */
export const CANONICAL_LAYOUT_2P: CanonicalLayout = {
  anchors: { ...CANONICAL_LAYOUT.anchors, difficulty: { x: -326, y: 1431 }, notes: { x: 13, y: 1351 }, songTitle: { x: -120, y: 1329 } },
  frames: { ...CANONICAL_LAYOUT.frames, title: { x: -388, y: 1265, width: 437, height: 144 } },
};
