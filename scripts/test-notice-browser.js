/** Exercise geometry in Chromium; DOM-only test environments cannot measure text. */
export async function checkNoticeSizing(page) {
  await page.evaluate(async () => {
    const { fitNoticeColumns } = await import('/notice-layout.js');
    const panel = document.createElement('aside');
    panel.style.cssText = 'position:fixed;width:480px;height:320px;top:0;left:0;padding:0';
    const body = document.createElement('div');
    body.className = 'info-markdown';
    const content = document.createElement('div');
    content.className = 'info-content';
    content.style.fontSize = '12px';
    body.append(content);
    panel.append(body);
    document.body.append(panel);
    function measure() {
      fitNoticeColumns(panel);
      const scale = new DOMMatrixReadOnly(content.style.transform).a;
      if (content.scrollWidth * scale > 481 || content.scrollHeight * scale > 321)
        throw Error('Notice overflow');
      return scale;
    }
    try {
      content.textContent = 'Short notice';
      if (measure() <= 1) throw Error('Small content was not enlarged');
      content.replaceChildren();
      for (let i = 0; i < 80; i++) {
        const line = document.createElement('div');
        line.textContent = 'A long notice with many lines';
        content.append(line);
      }
      if (measure() >= 1) throw Error('Dense content was not reduced');
      content.replaceChildren();
      const table = document.createElement('table');
      const cell = table.insertRow().insertCell();
      cell.style.whiteSpace = 'nowrap';
      cell.textContent = 'Very wide unbreakable table content '.repeat(8);
      content.append(table);
      const first = measure(),
        second = measure();
      if (Math.abs(first - second) > 0.001) throw Error('Repeated fitting changed size');
    } finally {
      panel.remove();
    }
  });
}
