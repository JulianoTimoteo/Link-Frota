const CACHE_KEY = 'linkfrota_search_cache';
const CACHE_TTL = 1000 * 60 * 30; // 30 minutos

export function loadSearchCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.expiresAt || Date.now() > parsed.expiresAt) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function saveSearchCache(cards) {
  try {
    const payload = {
      data: cards,
      expiresAt: Date.now() + CACHE_TTL,
      updatedAt: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    console.warn('Falha ao salvar cache de pesquisa.');
  }
}

export function clearSearchCache() {
  localStorage.removeItem(CACHE_KEY);
}

export function buildCardsFromState({
  radios,
  equipamentos,
  bordos,
  registros,
}) {
  const bordoById = {};
  bordos.forEach((b) => {
    bordoById[b.id] = b;
  });

  const regByEquip = {};
  registros.forEach((reg) => {
    regByEquip[reg.equipamentoId] = reg;
  });

  return equipamentos.map((equip) => {
    const reg = regByEquip[equip.id] || {};
    const radio = radios.find((r) => r.id === reg.radioId) || null;
    const tela = bordos.find((b) => b.id === reg.telaId && b.tipo === 'Tela') || null;
    const mag = bordos.find((b) => b.id === reg.magId && b.tipo === 'Mag') || null;
    const chip = bordos.find((b) => b.id === reg.chipId && b.tipo === 'Chip') || null;

    const normalized =
      (equip.codigo || '')
        .toString()
        .trim()
        .toUpperCase();

    const frota =
      (equip.frota || '')
        .toString()
        .trim()
        .toUpperCase();

    const serieRadio = radio && radio.serie
      ? radio.serie.toString().trim().toUpperCase()
      : 'N/A';

    const serieBordos = [tela, mag, chip]
      .filter(Boolean)
      .map((b) => b.numeroSerie.toString().trim().toUpperCase())
      .sort()
      .join(' / ');

    const searchText = [
      normalized,
      frota,
      serieRadio,
      equip.grupo || '',
      equip.gestor || '',
        ...(serieBordos ? [serieBordos] : []),
    ]
      .join(' ')
      .toLowerCase();

    return {
      id: equip.id,
      codigo: normalized || 'N/A',
      frota: frota || 'N/A',
      grupo: equip.grupo || 'N/A',
      serieRadio,
      serieBordos: serieBordos || 'N/A',
      gestor: equip.gestor || 'Sem Gestor',
      searchText,
    };
  });
}
