function initUesReport(root = document) {
  root.querySelectorAll('[data-ues-overall-score]').forEach(card => {
    const raw = card.getAttribute('data-ues-overall-score');
    const score = raw && raw.trim() !== '' ? Number(raw) : NaN;
    if (!Number.isFinite(score) || score < 0 || score > 10) {
      card.removeAttribute('data-score-tone');
      return;
    }
    card.dataset.scoreTone = score >= 8.5 ? 'green' : score >= 7 ? 'blue' : score >= 5 ? 'orange' : 'red';
  });
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  tabs.forEach((tab) => tab.addEventListener('click', () => {
    tabs.forEach((item) => item.setAttribute('aria-selected', String(item === tab)));
    root.querySelectorAll('[role="tabpanel"]').forEach((panel) => {
      panel.hidden = panel.id !== tab.getAttribute('aria-controls');
    });
    tab.focus();
  }));

  tabs.forEach((tab, index) => {
    tab.tabIndex = tab.getAttribute('aria-selected') === 'true' ? 0 : -1;
    tab.addEventListener('click', () => tabs.forEach(item => item.tabIndex = item === tab ? 0 : -1));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next !== undefined) { event.preventDefault(); tabs[next].click(); }
    });
  });
  root.querySelectorAll('[data-ues-filter-table]').forEach(container => {
    const search = container.querySelector('[data-ues-search]');
    const filters = [...container.querySelectorAll('[data-ues-filter]')];
    const rows = [...container.querySelectorAll('[data-ues-row]')];
    const update = () => {
      const query = (search?.value || '').trim().toLocaleLowerCase();
      let count = 0;
      rows.forEach(row => {
        const match = row.textContent.toLocaleLowerCase().includes(query) && filters.every(filter => !filter.value || row.dataset[filter.dataset.uesFilter] === filter.value);
        row.hidden = !match;
        if (match) count++;
      });
      const output = container.querySelector('[data-ues-filter-count]');
      if (output) { output.textContent = `显示 ${count} / ${rows.length} 条`; output.setAttribute('aria-live', 'polite'); }
      const empty = container.querySelector('[data-ues-empty]');
      if (empty) empty.hidden = count !== 0;
    };
    search?.addEventListener('input', update);
    filters.forEach(filter => filter.addEventListener('change', update));
    update();
  });

  const dialog = root.querySelector('[data-ues-lightbox]');
  if (!dialog) return;
  const full = dialog.querySelector('img');
  const caption = dialog.querySelector('[data-ues-lightbox-caption]');
  let opener;
  dialog.addEventListener('close', () => opener?.focus());
  const open = (image) => {
    opener = image;
    full.src = image.dataset.uesFullSrc || image.currentSrc || image.src;
    full.alt = image.alt;
    caption.textContent = image.alt || '证据原图';
    dialog.showModal();
  };
  root.querySelectorAll('[data-ues-evidence-image]').forEach((image) => {
    image.tabIndex = 0;
    image.setAttribute('role', 'button');
    image.setAttribute('aria-label', `${image.alt}，双击查看原图`);
    image.title = '双击查看原图';
    image.addEventListener('dblclick', () => open(image));
    image.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open(image);
      }
    });
  });
  dialog.querySelector('[data-ues-lightbox-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
}
window.initUesReport = initUesReport;
