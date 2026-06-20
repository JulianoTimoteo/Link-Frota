export function saveSettings(db, appId, settings) {
  const settingsDocRef = doc(db, "artifacts", appId, "public", "data", "settings", "config");
  return updateDoc(settingsDocRef, {
    letterMap: settings.letterMap,
    nextIndex: settings.nextIndex,
    users: settings.users,
  });
}

export async function loadInitialSettings(db, appId, ADMIN_PRINCIPAL_EMAIL, settings) {
  if (!db || !appId) return;
  const settingsDocRef = doc(db, "artifacts", appId, "public", "data", "settings", "config");
  const settingsSnap = await getDoc(settingsDocRef);
  if (settingsSnap.exists()) {
    const data = settingsSnap.data();
    settings.letterMap = data.letterMap || { Colheita: 'A', Transporte: 'B', Oficina: 'C', TPL: 'D', Industria: 'NUM' };
    settings.nextIndex = data.nextIndex || { A: 1, B: 1, C: 1, D: 1, NUM: 1 };
    settings.users = Array.isArray(data.users) ? data.users : [];
  } else {
    settings.users = settings.users || [{
      id: crypto.randomUUID(),
      name: 'Juliano Timoteo (Admin Padrão)',
      username: ADMIN_PRINCIPAL_EMAIL,
      role: 'admin',
      permissions: { dashboard: true, cadastro: true, pesquisa: true, settings: true },
    }];
  }
}
