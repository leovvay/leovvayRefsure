document.addEventListener('click', (event) => {
  const button = event.target instanceof Element ? event.target.closest('button') : null;
  if (!button) return;
  const payload = {
    page: location.pathname,
    button: button.textContent.trim() || button.getAttribute('aria-label') || '',
  };
  const row = button.closest('tr');
  if (row) payload.row = row.cells[0] ? row.cells[0].textContent.trim() : row.textContent.trim();
  navigator.sendBeacon('/log', JSON.stringify(payload));
});

document.addEventListener('click', (event) => {
  const button = event.target instanceof Element ? event.target.closest('button[data-count]') : null;
  if (!button) return;
  const counter = document.getElementById('count');
  if (counter) counter.textContent = String(Number(counter.textContent) + 1);
});
