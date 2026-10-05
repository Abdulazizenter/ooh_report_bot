const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'index.html');
let content = fs.readFileSync(targetPath, 'utf8');

// 1. Modify reportRows to support bulkMode
content = content.replace(
  /function reportRows\(reports\)\{([\s\S]*?)return `(.*?)<thead><tr>(.*?)<\/tr><\/thead><tbody>\$\{reports\.slice\(0,16\)\.map\(r=>`<tr(.*?)>(.*?)<\/tr>`\)\.join\(''\)\}<\/tbody><\/table><\/div>`;\n\}/,
  function(match, init, wrap, th, trAttr, td) {
    const newTh = `\${state.bulkMode ? '<th><input type="checkbox" id="bulk-select-all"></th>' : ''}` + th;
    
    // Prevent clicking row from opening modal if clicking on checkbox
    const newTrAttr = trAttr.replace('class="clickable-row btn-inspect-report"', 'class="${state.bulkMode ? \'clickable-row bulk-row\' : \'clickable-row btn-inspect-report\'}"');
    
    const newTd = `\${state.bulkMode ? '<td><input type="checkbox" class="bulk-cb" value="'+escapeHtml(r.id)+'"></td>' : ''}` + td;
    
    return `function reportRows(reports){${init}return \`${wrap}<thead><tr>${newTh}</tr></thead><tbody>\${reports.slice(0,30).map(r=>\`<tr${newTrAttr}>${newTd}</tr>\`).join('')}</tbody></table></div>\`;\n}`;
  }
);

// 2. Modify registry view to include Bulk Actions button and floating bar
content = content.replace(
  /<button class="primary" data-action="export">Экспорт CSV<\/button><\/section><section class="card section">/,
  `<div style="display:flex;gap:12px"><button class="primary" id="btn-toggle-bulk" style="background:var(--surface-3)">\${state.bulkMode ? 'Отменить выделение' : 'Массовые действия'}</button><button class="primary" data-action="export">Экспорт CSV</button></div></section>
  \${state.bulkMode ? \`<div style="position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--surface-2);border:1px solid var(--line);padding:16px;border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);display:flex;align-items:center;gap:16px;z-index:90;">
    <span style="font-weight:600;font-family:var(--font-mono)"><span id="bulk-count">0</span> выделено</span>
    <button class="primary" id="btn-bulk-approve" style="background:var(--green);color:#090d12">Одобрить</button>
    <button class="primary" id="btn-bulk-reject" style="background:var(--red);color:#090d12">Отклонить</button>
  </div>\` : ''}
  <section class="card section">`
);

// 3. Add global state.bulkMode if missing
if (!content.includes('bulkMode: false')) {
  content = content.replace(
    /const state = \{/,
    'const state = {\n  bulkMode: false,'
  );
}

// 4. Wire events for bulk mode
const eventWiringCode = `
  const btnToggleBulk = $('#btn-toggle-bulk');
  if(btnToggleBulk) btnToggleBulk.onclick = () => {
    state.bulkMode = !state.bulkMode;
    render();
  };

  const selectAll = $('#bulk-select-all');
  if(selectAll) selectAll.onchange = (e) => {
    const cbs = document.querySelectorAll('.bulk-cb');
    cbs.forEach(cb => cb.checked = e.target.checked);
    updateBulkCount();
  };

  const bulkCbs = document.querySelectorAll('.bulk-cb');
  bulkCbs.forEach(cb => cb.onchange = updateBulkCount);
  
  const bulkRows = document.querySelectorAll('.bulk-row');
  bulkRows.forEach(row => {
    row.onclick = (e) => {
      if(e.target.tagName !== 'INPUT') {
        const cb = row.querySelector('.bulk-cb');
        if(cb) { cb.checked = !cb.checked; updateBulkCount(); }
      }
    };
  });

  function updateBulkCount() {
    const cbs = document.querySelectorAll('.bulk-cb:checked');
    const el = $('#bulk-count');
    if(el) el.textContent = cbs.length;
  }

  async function handleBulkAction(status) {
    const cbs = document.querySelectorAll('.bulk-cb:checked');
    const ids = Array.from(cbs).map(c => c.value);
    if(!ids.length) return toast('Выберите хотя бы один отчет');
    const comment = status === 'REJECTED' ? prompt('Укажите причину массового отклонения:') : '';
    if(status === 'REJECTED' && comment === null) return;
    
    try {
      const res = await api('/api/reports/bulk-verify', {
        method: 'POST',
        body: JSON.stringify({ reportIds: ids, status, comment })
      });
      if(res.success) {
        toast(\`Успешно \${status === 'APPROVED' ? 'одобрено' : 'отклонено'} отчетов: \${res.count}\`);
        state.bulkMode = false;
        await load();
        render();
      } else {
        toast('Ошибка: ' + res.error);
      }
    } catch(err) {
      toast('Ошибка соединения');
    }
  }

  const btnBulkApprove = $('#btn-bulk-approve');
  if(btnBulkApprove) btnBulkApprove.onclick = () => handleBulkAction('APPROVED');

  const btnBulkReject = $('#btn-bulk-reject');
  if(btnBulkReject) btnBulkReject.onclick = () => handleBulkAction('REJECTED');
`;

content = content.replace(
  /function wireEvents\(\)\{/,
  'function wireEvents(){\n' + eventWiringCode
);

fs.writeFileSync(targetPath, content, 'utf8');
console.log('Bulk Action UI injected');
