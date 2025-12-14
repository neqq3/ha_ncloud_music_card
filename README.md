# 云音乐歌词卡片

[![License](https://img.shields.io/github/license/neqq3/ha_ncloud_music_card)](LICENSE)

Home Assistant 自定义仪表盘卡片，用于显示云音乐播放器的实时滚动歌词。

## 特性

-  实时歌词滚动
-  翻译歌词双行显示

## 截图



## 安装

### HACS（推荐）

1. 打开 HACS → 前端
2. 点击右上角 ⋮ → 自定义存储库
3. 添加 `https://github.com/neqq3/ha_ncloud_music_card`，类别选择「Dashboard」
4. 安装「云音乐歌词卡片」
5. 刷新浏览器

### 手动安装

1. 下载 `ncloud-lyrics-card.js` 到 HA 配置目录的 `www/` 文件夹
2. 在仪表盘添加资源：
   - **设置 → 仪表盘 → ⋮ → 资源**
   - 添加 `/local/ncloud-lyrics-card.js`，类型选择 **JavaScript 模块**

## 配置

### 基础配置

```yaml
type: custom:ncloud-lyrics-card
entity: media_player.cloud_music_xxx
```

### 完整配置

```yaml
type: custom:ncloud-lyrics-card
entity: media_player.cloud_music_xxx
show_header: true         # 可选，显示歌曲信息头部（默认 true）
show_cover: true          # 可选，显示专辑封面（默认 true）
show_translation: true    # 可选，显示翻译歌词（默认 true）
lyric_offset: 0           # 可选，歌词偏移秒数（默认 0）
                          # 正数=歌词延后，负数=歌词提前
                          # 例如：lyric_offset: -2 表示歌词提前 2 秒
```

## 依赖

此卡片需配合 [ha_ncloud_music](https://github.com/neqq3/ha_ncloud_music) 集成使用。

## 致谢

- [shaonianzhentan](https://github.com/shaonianzhentan/ha_cloud_music) - 原项目作者

## 许可证

MIT
