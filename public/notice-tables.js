/** Table structure commands for the notice editor. Text formatting stays in notice-editor.js. */
export function bindNoticeTables(dialog, input, command) {
  function activeCell() {
    const node = window.getSelection()?.anchorNode;
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    const cell = element?.closest('td, th');
    return cell && input.contains(cell) ? cell : null;
  }
  function emptyCell() {
    const cell = document.createElement('td');
    cell.append(document.createElement('br'));
    return cell;
  }
  function replaceTable(action) {
    const cell = activeCell();
    if (!cell) return;
    const original = cell.closest('table');
    const table = original.cloneNode(true);
    const rowIndex = cell.parentElement.rowIndex;
    const columnIndex = cell.cellIndex;
    const row = table.rows[rowIndex];
    if (action === 'row-add') {
      const added = table.insertRow(rowIndex + 1);
      for (let i = 0; i < row.cells.length; i++) added.append(emptyCell());
    } else if (action === 'row-remove') row.remove();
    else if (action === 'column-add') {
      for (const item of table.rows)
        item.insertBefore(emptyCell(), item.cells[columnIndex + 1] || null);
    } else if (action === 'column-remove') {
      for (const item of table.rows) item.cells[columnIndex]?.remove();
    }
    // Use the browser editing command so structural edits participate in Undo/Redo.
    const range = document.createRange();
    range.selectNode(original);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    command(
      'insertHTML',
      action === 'remove' || !table.rows.length || !table.rows[0].cells.length
        ? '<p><br></p>'
        : table.outerHTML,
      false,
    );
  }
  for (const button of dialog.querySelectorAll('[data-table]')) {
    button.onmousedown = (event) => event.preventDefault();
    button.onclick = () => {
      if (button.dataset.table === 'insert') {
        const table = document.createElement('table');
        const row = table.createTBody().insertRow();
        for (let i = 0; i < 3; i++) row.append(emptyCell());
        command('insertHTML', table.outerHTML);
      } else replaceTable(button.dataset.table);
    };
  }
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const cell = activeCell();
    if (!cell) return;
    const cells = [...cell.closest('table').querySelectorAll('td, th')];
    const next = cells[cells.indexOf(cell) + (event.shiftKey ? -1 : 1)];
    if (!next) return;
    event.preventDefault();
    const range = document.createRange();
    range.selectNodeContents(next);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
}
