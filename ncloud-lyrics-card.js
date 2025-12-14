/**
 * 云音乐歌词卡片 - Home Assistant Custom Lovelace Card
 * 
 * 
 * @version 0.3.4
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

  // 添加小缓冲区，避免时间戳为 0 的歌词立即高亮
  // 要求播放时间至少 0.3 秒后才开始匹配第一句
  const effectiveTime = currentTime - 0.3;
  if (effectiveTime < lyrics[0].time) return -1;
  if (effectiveTime >= lyrics[lyrics.length - 1].time) return lyrics.length - 1;

  let left = 0;
  let right = lyrics.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (lyrics[mid].time <= effectiveTime) {
      if (mid + 1 >= lyrics.length || lyrics[mid + 1].time > effectiveTime) {
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

  /* 歌词滚动容器 - 添加上下padding确保首尾歌词能居中 */
  .lyrics-scroll {
    position: absolute;
    width: calc(100% - 32px);
    padding: 150px 0; /* 容器高度的一半，确保首尾歌词居中 */
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

  /* 翻译歌词（中文）- 主要显示 */
  .translation {
    font-size: var(--lyrics-font-size);
    color: var(--secondary-text-color);
    opacity: 0.6;
    margin-bottom: 4px;
  }

  .lyric-line.current .translation {
    color: var(--primary-color, #03a9f4);
    opacity: 1;
    font-weight: 500;
  }

  /* 原文歌词（外文）- 辅助显示 */
  .original {
    font-size: 13px;
    color: var(--secondary-text-color);
    opacity: 0.5;
    margin-top: 2px;
  }

  .lyric-line.current .original {
    color: var(--primary-color, #03a9f4);
    opacity: 0.6;
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

  /* 歌词偏移控制 - 悬浮按钮设计 */
  .offset-widget {
    position: absolute;
    bottom: 16px;
    right: 16px;
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
  }

  .offset-fab {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--primary-color, #03a9f4);
    color: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    transition: all 0.3s;
    opacity: 0;
    pointer-events: none;
  }

  .lyrics-container:hover .offset-fab {
    opacity: 0.7;
    pointer-events: auto;
  }

  .offset-widget:hover .offset-fab {
    opacity: 1;
    transform: scale(1.1);
  }

  .offset-panel {
    background: var(--card-background-color);
    border-radius: 12px;
    padding: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    display: none;
    flex-direction: column;
    gap: 8px;
    min-width: 200px;
  }

  .offset-widget:hover .offset-panel,
  .offset-widget.active .offset-panel {
    display: flex;
  }

  .offset-panel-title {
    font-size: 12px;
    color: var(--secondary-text-color);
    text-align: center;
    margin-bottom: 4px;
  }

  .offset-controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .offset-btn {
    width: 32px;
    height: 32px;
    border: 1px solid var(--divider-color);
    border-radius: 6px;
    background: var(--card-background-color);
    color: var(--primary-text-color);
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    font-weight: bold;
  }

  .offset-btn:hover {
    background: var(--primary-color);
    color: white;
    border-color: var(--primary-color);
    transform: scale(1.05);
  }

  .offset-btn:active {
    transform: scale(0.95);
  }

  .offset-btn.reset {
    width: auto;
    padding: 0 12px;
    font-size: 12px;
  }

  .offset-value {
    text-align: center;
    font-weight: 500;
    font-family: monospace;
    font-size: 14px;
    color: var(--primary-text-color);
    padding: 4px 0;
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
    this._lyricOffset = this._loadOffset(); // 歌词时间偏移（秒）
    this._offsetWidgetActive = false; // 偏移控制面板是否激活
  }

  // 从 localStorage 加载偏移量
  _loadOffset() {
    try {
      const saved = localStorage.getItem('ncloud-lyrics-offset');
      return saved ? parseFloat(saved) : 0;
    } catch {
      return 0;
    }
  }

  // 保存偏移量到 localStorage
  _saveOffset() {
    try {
      localStorage.setItem('ncloud-lyrics-offset', String(this._lyricOffset));
    } catch { }
  }

  // 调整偏移量
  _adjustOffset(delta) {
    this._lyricOffset += delta;
    this._saveOffset();
    // 只更新偏移值显示，不重新渲染整个卡片
    this._updateOffsetDisplay();
    // 立即更新滚动位置，避免歌词消失
    setTimeout(() => this._updateLyricsScroll(), 0);
  }

  // 重置偏移量
  _resetOffset() {
    this._lyricOffset = 0;
    this._saveOffset();
    // 只更新偏移值显示
    this._updateOffsetDisplay();
    // 立即更新滚动位置
    setTimeout(() => this._updateLyricsScroll(), 0);
  }

  // 更新偏移值显示（不重新渲染整个卡片）
  _updateOffsetDisplay() {
    const offsetMs = Math.round(this._lyricOffset * 1000);
    const sign = offsetMs >= 0 ? '+' : '';
    const displayText = `${sign}${offsetMs}ms`;

    // 更新面板中的偏移值
    const valueEl = this.shadowRoot?.querySelector('.offset-value');
    if (valueEl) {
      valueEl.textContent = displayText;
    }

    // 更新悬浮按钮的 tooltip
    const fabEl = this.shadowRoot?.querySelector('.offset-fab');
    if (fabEl) {
      fabEl.title = `歌词偏移: ${displayText}`;
    }
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
      // 延迟执行滚动，确保 DOM 完全渲染（包括样式计算）
      setTimeout(() => this._updateLyricsScroll(), 300);
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
    // 应用歌词偏移量
    currentTime += this._lyricOffset;

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

    // 绑定按钮事件（每次渲染后都需要重新绑定）
    setTimeout(() => this._bindOffsetButtons(), 0);
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
      // 如果有翻译：翻译（中文）在上面，原文（外文）在下面
      // 如果没翻译：直接显示原文
      const hasTranslation = translation && this._config.show_translation;
      const contentHtml = hasTranslation
        ? `<div class="translation">${translation}</div><div class="original">${line.text}</div>`
        : line.text;

      return `
        <div class="lyric-line ${isCurrent ? 'current' : ''} ${isNear ? 'near' : ''}">
          ${contentHtml}
        </div>
      `;
    }).join('');

    return `
      <div class="lyrics-container">
        <div class="lyrics-scroll" id="lyrics-scroll">
          ${linesHtml}
        </div>
        ${this._renderOffsetWidget()}
      </div>
    `;
  }

  _renderOffsetWidget() {
    const offsetMs = Math.round(this._lyricOffset * 1000);
    const sign = offsetMs >= 0 ? '+' : '';

    return `
      <div class="offset-widget" id="offset-widget">
        <div class="offset-panel">
          <div class="offset-panel-title">歌词偏移调整</div>
          <div class="offset-value">${sign}${offsetMs}ms</div>
          <div class="offset-controls">
            <button class="offset-btn" id="offset-minus-fast" title="延后 1 秒">−−</button>
            <button class="offset-btn" id="offset-minus" title="延后 0.1 秒">−</button>
            <button class="offset-btn" id="offset-plus" title="提前 0.1 秒">+</button>
            <button class="offset-btn" id="offset-plus-fast" title="提前 1 秒">++</button>
          </div>
          <button class="offset-btn reset" id="offset-reset">重置</button>
        </div>
        <div class="offset-fab" title="歌词偏移: ${sign}${offsetMs}ms">⏱</div>
      </div>
    `;
  }

  _updateLyricsScroll() {
    const container = this.shadowRoot?.querySelector('.lyrics-container');
    const scroll = this.shadowRoot?.getElementById('lyrics-scroll');
    if (!container || !scroll) return;

    // 如果容器高度为 0，说明还没渲染完成，稍后重试
    const containerHeight = container.clientHeight;
    if (containerHeight === 0) {
      setTimeout(() => this._updateLyricsScroll(), 100);
      return;
    }

    // 更新高亮状态
    const lines = scroll.querySelectorAll('.lyric-line');
    lines.forEach((line, i) => {
      line.classList.toggle('current', i === this._currentIndex);
      line.classList.toggle('near', Math.abs(i - this._currentIndex) <= 2);
    });

    // 计算要居中显示的行（如果还没开始播放，显示第一行）
    const targetIndex = this._currentIndex >= 0 ? this._currentIndex : 0;
    if (targetIndex >= lines.length) return;

    const targetLine = lines[targetIndex];
    const targetTop = targetLine.offsetTop;
    const targetHeight = targetLine.clientHeight;

    // 让整个歌词行的中心对准容器中心
    // 向上微调 30px，补偿 header 占据的视觉空间
    const visualAdjustment = 30;
    const offset = targetTop + targetHeight / 2 - containerHeight / 2 + visualAdjustment;

    // 应用 transform
    scroll.style.transform = `translateY(-${offset}px)`;
  }

  _bindOffsetButtons() {
    const widget = this.shadowRoot?.getElementById('offset-widget');
    const minusFast = this.shadowRoot?.getElementById('offset-minus-fast');
    const minus = this.shadowRoot?.getElementById('offset-minus');
    const plus = this.shadowRoot?.getElementById('offset-plus');
    const plusFast = this.shadowRoot?.getElementById('offset-plus-fast');
    const reset = this.shadowRoot?.getElementById('offset-reset');

    // 点击widget内部时保持面板显示
    if (widget) {
      widget.addEventListener('mouseenter', () => {
        this._offsetWidgetActive = true;
        widget.classList.add('active');
      });
      widget.addEventListener('mouseleave', () => {
        this._offsetWidgetActive = false;
        widget.classList.remove('active');
      });
    }

    if (minusFast) {
      minusFast.onclick = (e) => {
        e.stopPropagation();
        this._adjustOffset(-1.0);
      };
    }
    if (minus) {
      minus.onclick = (e) => {
        e.stopPropagation();
        this._adjustOffset(-0.1);
      };
    }
    if (plus) {
      plus.onclick = (e) => {
        e.stopPropagation();
        this._adjustOffset(0.1);
      };
    }
    if (plusFast) {
      plusFast.onclick = (e) => {
        e.stopPropagation();
        this._adjustOffset(1.0);
      };
    }
    if (reset) {
      reset.onclick = (e) => {
        e.stopPropagation();
        this._resetOffset();
      };
    }
  }
}

// ==================== 注册卡片 ====================

if (!customElements.get('ncloud-lyrics-card')) {
  customElements.define('ncloud-lyrics-card', NcloudLyricsCard);
  console.info('[ncloud-lyrics-card] 已注册自定义元素');
}

// 注册到 HA 卡片选择器
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'ncloud-lyrics-card',
  name: '云音乐歌词卡片',
  description: '显示云音乐播放器的实时滚动歌词',
  preview: true,
});

console.info(
  '%c NCLOUD-LYRICS-CARD %c v0.3.4 ',
  'background: #03a9f4; color: white; font-weight: bold;',
  'background: #333; color: white;'
);
