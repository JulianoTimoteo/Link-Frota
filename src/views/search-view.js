export function renderSearchView(cards, query = '') {
  const trimmed = (query || '').trim();
  const pageSize = 50;
  const start = trimmed ? 0 : 0;
  const visible = trimmed ? cards : cards.slice(start, pageSize);

  const rows = visible.map(card => `
    <tr class="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
      <td class="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">${escapeHtml(card.codigo)}</td>
      <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-200 min-w-0">
        <div class="truncate max-w-[220px]">${escapeHtml(card.frota)}</div>
      </td>
      <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-200 whitespace-nowrap">${escapeHtml(card.grupo)}</td>
      <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-200 font-mono whitespace-nowrap">${escapeHtml(card.serieRadio)}</td>
      <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-200 min-w-0">
        <div class="truncate max-w-[280px]">${escapeHtml(card.serieBordos)}</div>
      </td>
      <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-200 whitespace-nowrap">${escapeHtml(card.gestor)}</td>
    </tr>
  `).join('');

  const empty = `
    <tr>
      <td colspan="6" class="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
        Nenhum registro encontrado para a pesquisa atual.
      </td>
    </tr>
  `;

  return `
    <div class="space-y-4">
      <div class="flex flex-col sm:flex-row gap-2">
        <input
          id="search-input"
          type="search"
          inputmode="search"
          autocomplete="off"
          placeholder="Buscar por código, frota, série..."
          class="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-main focus:border-green-main"
        />
        <button
          id="search-submit"
          class="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-green-main text-white font-semibold hover:bg-green-dark focus:outline-none focus:ring-2 focus:ring-green-main focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-colors"
        >
          <i class="fas fa-search mr-2"></i>
          Buscar
        </button>
      </div>
      <p class="text-xs text-gray-500 dark:text-gray-400">
        Resultados: <span id="search-count">${cards.length}</span>${trimmed ? ` | Visíveis: ${visible.length}` : ''}
      </p>
      <div class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead>
            <tr class="bg-gray-50 dark:bg-gray-700/60">
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-200 uppercase tracking-wider">Código</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-200 uppercase tracking-wider">Frota</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-200 uppercase tracking-wider">Grupo</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-200 uppercase tracking-wider">Série Rádio</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-200 uppercase tracking-wider">Séries Bordos</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-200 uppercase tracking-wider">Gestor</th>
            </tr>
          </thead>
          <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            ${visible.length > 0 ? rows : empty}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export function bindSearchEvents(onSearch) {
  const submitButton = document.getElementById('search-submit');
  const input = document.getElementById('search-input');
  if (!submitButton || !input) return;
  submitButton.addEventListener('click', () => onSearch(input.value));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onSearch(input.value);
    }
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
