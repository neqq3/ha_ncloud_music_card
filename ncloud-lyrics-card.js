/**
 * 云音乐歌词卡片 - Home Assistant Custom Lovelace Card
 * 
 * 
 * @version 0.1.0
 * @author neqq3
 * @license MIT
 */

// ==================== LRC 解析器 ====================

/**
 * 解析 LRC 格式歌词
 * @param {string} lrcText - LRC 格式的歌词文本
 * @returns {Array<{time: number, text: string}>} 按时间排序的歌词行数组
 */
function parseLrc(lrcText) {
    if (!lrcText) return [];

    const TIME_REGEX = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;
    const lines = [];
    const rawLines = lrcText.split('\n');

    for (const line of rawLines) {
        // 跳过元数据行
        if (/^\[(ti|ar|al|by|offset):/.test(line)) continue;

        // 提取所有时间戳
        const timeMatches = [...line.matchAll(TIME_REGEX)];
        if (timeMatches.length === 0) continue;

        // 提取歌词文本
        const text = line.replace(TIME_REGEX, '').trim();
        if (!text) continue;

        // 每个时间戳生成一行
        for (const match of timeMatches) {
            const minutes = parseInt(match[1], 10);
            const seconds = parseInt(match[2], 10);
            const ms = match[3].length === 2
                ? parseInt(match[3], 10) * 10
                : parseInt(match[3], 10);

            lines.push({
                time: minutes * 60 + seconds + ms / 1000,
                text,
            });
        }
    }

    return lines.sort((a, b) => a.time - b.time);
}

/**
 * 二分查找当前歌词索引
 * @param {Array} lyrics - 歌词数组
 * @param {number} currentTime - 当前时间（秒）
 * @returns {number} 当前歌词索引，-1 表示尚未开始
 */
function findCurrentLyricIndex(lyrics, currentTime) {
    if (!lyrics.length) return -1;
    if (currentTime < lyrics[0].time) return -1;
    if (currentTime >= lyrics[lyrics.length - 1].time) return lyrics.length - 1;

    let left = 0;
    let right = lyrics.length - 1;

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        if (lyrics[mid].time <= currentTime) {
            if (mid + 1 >= lyrics.length || lyrics[mid + 1].time > currentTime) {
                return mid;
            }
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }
    return left;
}

// ==================== 卡片样式 ====================

const CARD_STYLES = `
  :host {
    --lyrics-font-size: 16px;
    --lyrics-line-height: 2;
    --lyrics-current-scale: 1.1;
    --lyrics-transition: all 0.3s ease;
  }

  ha-card {
    overflow: hidden;
    position: relative;
  }

  .card-header {
    display: flex;
    align-items: center;
    padding: 16px;
    gap: 12px;
  }

  .cover {
    width: 64px;
    height: 64px;
    border-radius: 8px;
    object-fit: cover;
    flex-shrink: 0;
  }

  .media-info {
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

  .title {
    font-size: 16px;
    font-weight: 500;
    color: var(--primary-text-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .artist {
    font-size: 14px;
    color: var(--secondary-text-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 4px;
  }

  .lyrics-container {
    height: 300px;
    overflow: hidden;
    position: relative;
    padding: 0 16px;
  }

  .lyrics-scroll {
    position: absolute;
    width: calc(100% - 32px);
    transition: transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1);
  }

  .lyric-line {
    text-align: center;
    padding: 8px 0;
    font-size: var(--lyrics-font-size);
    line-height: var(--lyrics-line-height);
    color: var(--secondary-text-color);
    transition: var(--lyrics-transition);
    opacity: 0.6;
  }

  .lyric-line.current {
    color: var(--primary-color, #03a9f4);
    font-weight: 500;
    transform: scale(var(--lyrics-current-scale));
    opacity: 1;
  }

  .lyric-line.near {
    opacity: 0.8;
  }

  .translation {
    font-size: 13px;
    color: var(--secondary-text-color);
    opacity: 0.7;
    margin-top: 2px;
  }

  .no-lyrics {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--secondary-text-color);
    font-size: 14px;
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
  }

  .loading::after {
    content: '';
    width: 24px;
    height: 24px;
    border: 2px solid var(--divider-color);
    border-top-color: var(--primary-color);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* 上下渐变遮罩 */
  .lyrics-container::before,
  .lyrics-container::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 60px;
    pointer-events: none;
    z-index: 1;
  }

  .lyrics-container::before {
    top: 0;
    background: linear-gradient(to bottom, var(--card-background-color, #fff), transparent);
  }

  .lyrics-container::after {
    bottom: 0;
    background: linear-gradient(to top, var(--card-background-color, #fff), transparent);
  }
`;

// ==================== 主卡片类 ====================

class NcloudLyricsCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        // 状态
        this._config = {};
        this._hass = null;
        this._lyrics = [];
        this._translationMap = new Map();
        this._currentIndex = -1;
        this._currentSongId = '';
        this._animationId = 0;
        this._lastPosition = 0;
        this._loading = false;
        this._error = '';
    }

    // ========== HA 卡片 API ==========

    setConfig(config) {
        if (!config.entity) {
            throw new Error('请配置 entity（媒体播放器实体）');
        }
        this._config = {
            show_header: true,
            show_cover: true,
            show_translation: true,
            ...config,
        };
    }

    set hass(hass) {
        const oldHass = this._hass;
        this._hass = hass;

        if (!this._config.entity) return;

        const entity = hass.states[this._config.entity];
        if (!entity) return;

        const songId = String(entity.attributes.song_id || '');

        // 歌曲切换时重新获取歌词
        if (songId && songId !== this._currentSongId) {
            this._currentSongId = songId;
            this._fetchLyrics(songId);
        }

        // 首次渲染
        if (!oldHass) {
            this._render();
            this._startRenderLoop();
        }
    }

    getCardSize() {
        return 6;
    }

    static getStubConfig() {
        return {
            entity: '',
            show_header: true,
            show_cover: true,
            show_translation: true,
        };
    }

    // ========== 生命周期 ==========

    connectedCallback() {
        if (this._hass) {
            this._startRenderLoop();
        }
    }

    disconnectedCallback() {
        this._stopRenderLoop();
    }

    // ========== 歌词获取 ==========

    async _fetchLyrics(songId) {
        this._loading = true;
        this._error = '';
        this._lyrics = [];
        this._translationMap.clear();
        this._render();

        try {
            const response = await fetch(
                `/cloud_music/api?action=lyric&id=${encodeURIComponent(songId)}`
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            // 解析主歌词
            this._lyrics = parseLrc(data.lrc);

            // 解析翻译歌词
            if (data.tlyric && this._config.show_translation) {
                const tlines = parseLrc(data.tlyric);
                for (const line of tlines) {
                    const mainLine = this._lyrics.find(
                        (l) => Math.abs(l.time - line.time) < 0.1
                    );
                    if (mainLine) {
                        this._translationMap.set(mainLine.time, line.text);
                    }
                }
            }

            if (this._lyrics.length === 0) {
                this._error = '暂无歌词';
            }
        } catch (err) {
            console.error('[ncloud-lyrics-card] 获取歌词失败:', err);
            this._error = '获取歌词失败';
        } finally {
            this._loading = false;
            this._render();
        }
    }

    // ========== 渲染循环 ==========

    _startRenderLoop() {
        const tick = () => {
            this._updateCurrentPosition();
            this._animationId = requestAnimationFrame(tick);
        };
        this._animationId = requestAnimationFrame(tick);
    }

    _stopRenderLoop() {
        if (this._animationId) {
            cancelAnimationFrame(this._animationId);
            this._animationId = 0;
        }
    }

    _updateCurrentPosition() {
        if (!this._hass || !this._config.entity || this._lyrics.length === 0) return;

        const entity = this._hass.states[this._config.entity];
        if (!entity) return;

        const state = entity.state;
        const position = Number(entity.attributes.media_position) || 0;
        const updatedAt = entity.attributes.media_position_updated_at;

        let currentTime = position;
        if (state === 'playing' && updatedAt) {
            const elapsed = (Date.now() - new Date(updatedAt).getTime()) / 1000;
            currentTime = position + elapsed;
        }

        // 避免频繁更新
        if (Math.abs(currentTime - this._lastPosition) < 0.05) return;
        this._lastPosition = currentTime;

        const newIndex = findCurrentLyricIndex(this._lyrics, currentTime);
        if (newIndex !== this._currentIndex) {
            this._currentIndex = newIndex;
            this._updateLyricsScroll();
        }
    }

    // ========== 渲染 ==========

    _render() {
        if (!this._config.entity) {
            this.shadowRoot.innerHTML = `
        <style>${CARD_STYLES}</style>
        <ha-card>
          <div class="no-lyrics">请配置卡片</div>
        </ha-card>
      `;
            return;
        }

        const entity = this._hass?.states[this._config.entity];
        if (!entity) {
            this.shadowRoot.innerHTML = `
        <style>${CARD_STYLES}</style>
        <ha-card>
          <div class="no-lyrics">实体不存在: ${this._config.entity}</div>
        </ha-card>
      `;
            return;
        }

        const header = this._config.show_header ? this._renderHeader(entity) : '';
        const lyrics = this._renderLyrics();

        this.shadowRoot.innerHTML = `
      <style>${CARD_STYLES}</style>
      <ha-card>
        ${header}
        ${lyrics}
      </ha-card>
    `;
    }

    _renderHeader(entity) {
        const title = entity.attributes.media_title || '未知歌曲';
        const artist = entity.attributes.media_artist || '未知歌手';
        const cover = entity.attributes.entity_picture || entity.attributes.media_image_url || '';

        const coverHtml = this._config.show_cover && cover
            ? `<img class="cover" src="${cover}" alt="封面" />`
            : '';

        return `
      <div class="card-header">
        ${coverHtml}
        <div class="media-info">
          <div class="title">${title}</div>
          <div class="artist">${artist}</div>
        </div>
      </div>
    `;
    }

    _renderLyrics() {
        if (this._loading) {
            return `<div class="lyrics-container"><div class="loading"></div></div>`;
        }

        if (this._error || this._lyrics.length === 0) {
            return `<div class="lyrics-container">
        <div class="no-lyrics">${this._error || '暂无歌词'}</div>
      </div>`;
        }

        const linesHtml = this._lyrics.map((line, i) => {
            const isCurrent = i === this._currentIndex;
            const isNear = Math.abs(i - this._currentIndex) <= 2;
            const translation = this._translationMap.get(line.time);
            const transHtml = translation && this._config.show_translation
                ? `<div class="translation">${translation}</div>`
                : '';

            return `
        <div class="lyric-line ${isCurrent ? 'current' : ''} ${isNear ? 'near' : ''}">
          ${line.text}
          ${transHtml}
        </div>
      `;
        }).join('');

        return `
      <div class="lyrics-container">
        <div class="lyrics-scroll" id="lyrics-scroll">
          ${linesHtml}
        </div>
      </div>
    `;
    }

    _updateLyricsScroll() {
        const scroll = this.shadowRoot?.getElementById('lyrics-scroll');
        if (!scroll) return;

        const lineHeight = 48;
        const containerHeight = 300;
        const centerOffset = containerHeight / 2 - lineHeight / 2;
        const scrollY = this._currentIndex >= 0
            ? centerOffset - this._currentIndex * lineHeight
            : centerOffset;

        scroll.style.transform = `translateY(${scrollY}px)`;

        // 更新高亮状态
        const lines = scroll.querySelectorAll('.lyric-line');
        lines.forEach((line, i) => {
            line.classList.toggle('current', i === this._currentIndex);
            line.classList.toggle('near', Math.abs(i - this._currentIndex) <= 2);
        });
    }
}

// ==================== 注册卡片 ====================

customElements.define('ncloud-lyrics-card', NcloudLyricsCard);

// 注册到 HA 卡片选择器
window.customCards = window.customCards || [];
window.customCards.push({
    type: 'ncloud-lyrics-card',
    name: '云音乐歌词卡片',
    description: '显示云音乐播放器的实时滚动歌词',
    preview: true,
});

console.info(
    '%c NCLOUD-LYRICS-CARD %c v0.1.0 ',
    'background: #03a9f4; color: white; font-weight: bold;',
    'background: #333; color: white;'
);
