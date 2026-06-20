const CACHE_KEY = 'linkfrota_search_cache_v1';
const CACHE_TTL_MS = 30 * 60 * 1000;

export function loadSearchCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.expiresAt !== 'number' || Date.now() > parsed.expiresAt) {
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
      expiresAt: Date.now() + CACHE_TTL_MS,
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

export function buildCards(dbRadios, dbEquipamentos, dbBordos, dbRegistros) {
  const regByEquip = {};
  dbRegistros.forEach(reg => {
    regByEquip[reg.equipamentoId] = reg;
  });

  const bordoById = {};
  dbBordos.forEach((b) => {
    bordoById[b.id] = b;
  });

  return dbEquipamentos.map((equip) => {
    const reg = regByEquip[equip.id] || {};
    const radio = dbRadios.find(r => r.id === reg.radioId) || null;
    const tela = dbBordos.find(b => b.id === reg.telaId && b.tipo === 'Tela') || null;
    const mag = dbBordos.find(b => b.id === reg.magId && b.tipo === 'Mag') || null;
    const chip = dbBordos.find(b => b.id === reg.chipId && b.tipo === 'Chip') || null;

    const codigo = (equip.codigo || '').toString().trim().toUpperCase();
    const frota = (equip.frota || '').toString().trim().toUpperCase();
    const serieRadio = radio && radio.serie ? radio.serie.toString().trim().toUpperCase() : 'N/A';
    const bordoSeries = [tela, mag, chip].filter(Boolean).map(b => b.numeroSerie.toString().trim().toUpperCase()).sort().join(' / ');
    const normalizedBordo = bordoSeries || 'N/A';

    const haystack = `${codigo} ${frota} ${serieRadio} ${normalizedBordo} ${(equip.grupo || '').trim()} ${(equip.gestor || '').trim()}`.toLowerCase();

    return {
      id: equip.id,
      codigo: codigo || 'N/A',
      frota: frota || 'N/A',
      grupo: equip.grupo || 'N/A',
      serieRadio,
      serieBordos: normalizedBordo,
      gestor: equip.gestor || 'Sem Gestor',
      haystack,
    };
  });
}
