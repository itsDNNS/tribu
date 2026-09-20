// Sample the browser-painted gradient beneath each detail, preserving its real
// computed foreground. Only the measurement screenshot hides the glyphs.
async function measureStatusDetails(page) {
  const results = [];
  for (const kind of ['tasks', 'shopping']) {
    const detail = page.locator(`.today-status-item-${kind} .today-status-detail`);
    const foreground = await detail.evaluate((node) => getComputedStyle(node).color);
    const png = await detail.screenshot({ animations: 'disabled', style: '.today-status-detail { color: transparent !important; }' });
    const contrast = await page.evaluate(async ({ encoded, foreground }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${encoded}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
      const color = foreground.match(/[\d.]+/g).map(Number);
      const luminance = (rgb) => rgb.slice(0, 3).map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
      let minimum = Infinity;
      let background;
      for (let index = 0; index < pixels.length; index += 4) {
        const rgb = Array.from(pixels.slice(index, index + 3));
        const alpha = color[3] ?? 1;
        const paintedText = color.slice(0, 3).map((channel, i) => channel * alpha + rgb[i] * (1 - alpha));
        const a = luminance(paintedText);
        const b = luminance(rgb);
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        if (ratio < minimum) { minimum = ratio; background = rgb; }
      }
      return { minimum, background };
    }, { encoded: png.toString('base64'), foreground });
    results.push({ kind, foreground, ...contrast });
  }
  return results;
}

async function measureCaptureText(page) {
  return page.locator('.quick-capture-input').evaluate((input) => {
    const rect = input.getBoundingClientRect();
    const wrapper = input.closest('.quick-capture-input-wrap').getBoundingClientRect();
    return { height: rect.height, clientHeight: input.clientHeight, scrollHeight: input.scrollHeight, scrollWidth: input.scrollWidth, clientWidth: input.clientWidth, top: rect.top, bottom: rect.bottom, wrapperTop: wrapper.top, wrapperBottom: wrapper.bottom };
  });
}

async function measureCompletedWord(page) {
  return page.locator('.today-status-item-tasks .today-status-detail').evaluate((node) => {
    const text = node.firstChild;
    const start = text.textContent.indexOf('completed');
    const range = document.createRange();
    range.setStart(text, start);
    range.setEnd(text, start + 'completed'.length);
    return { fragments: [...range.getClientRects()].map((rect) => rect.toJSON()), container: node.getBoundingClientRect().toJSON() };
  });
}

module.exports = { measureStatusDetails, measureCaptureText, measureCompletedWord };
