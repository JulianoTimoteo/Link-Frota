// SISTEMA DE AUTENTICAÇÃO SEM FIREBASE AUTH - APENAS FIRESTORE
// Importações do Firebase SDK (REMOVIDO AUTH)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";

import { 
    getFirestore, 
    doc, 
    getDoc, 
    addDoc, 
    setDoc, 
    updateDoc, 
    deleteDoc, 
    onSnapshot, 
    collection, 
    query, 
    writeBatch,
    setLogLevel,
    getDocs, 
    where,
    arrayUnion,
    arrayRemove
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Configuração e Variáveis Globais do Firebase ---
let app, db;

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCb0Dhh_eMHrs_Dyg1wS5nbMu1U6tKHa3A",
    authDomain: "gestaoradios-58b0a.firebaseapp.com",
    projectId: "gestaoradios-58b0a",
    storageBucket: "gestaoradios-58b0a.firebaseapp.com",
    messagingSenderId: "359260635463",
    appId: "1:359260635463:web:1c3ac47eebcd3434818c62",
    measurementId: "G-DVXXT79TZK"
};
const appId = "gestaoradios-58b0a";

let userId;
let isAuthReady = false;	
let firestoreListeners = [];	

// --- Variáveis de Estado Global (App) ---
let currentUser = null;	
let currentPage = 'login';
let currentLoginView = 'login';
let currentCadastroTab = 'radio';
let currentSettingTab = 'system'; 
let isLoggingIn = false;

const PAGE_SIZE = 10; 
let pendingUsers = [];
let duplicities = [];

// Paginação e Busca
let radioPage = 1, equipamentoPage = 1, bordosPage = 1, geralPage = 1, pesquisaPage = 1; 
const PESQUISA_PAGE_SIZE = 10;
let radioSearch = '', equipamentoSearch = '', bordosSearch = '', geralSearch = '';
let focusedSearchInputId = null;
let searchCursorPosition = 0;
let searchTermPesquisa = '';

// Constantes de Configuração
const GROUPS = ['Colheita', 'Transporte', 'Oficina', 'TPL', 'Industria'];
const DISPONIBLE_STATUSES = ['Disponível', 'Manutenção', 'Sinistro']; 
const TIPOS_BORDO = ['Tela', 'Mag', 'Chip'];
const DEFAULT_LETTER_MAP = {
    Colheita: 'A',
    Transporte: 'B', 
    Oficina: 'C',
    TPL: 'D',
    Industria: 'NUM'
};
const DEFAULT_NEXT_INDEX = { A: 1, B: 1, C: 1, D: 1, NUM: 1 };

const ADMIN_PRINCIPAL_EMAIL = 'julianotimoteo@usinapitangueiras.com.br';

// --- Estado do Banco de Dados (In-memory Cache) ---
let dbRadios = [];
let dbEquipamentos = [];
let dbBordos = [];
let dbRegistros = [];
let settings = {
    letterMap: DEFAULT_LETTER_MAP,
    nextIndex: DEFAULT_NEXT_INDEX,
    users: []	
};

// --- PWA: Variável para prompt de instalação ---
let deferredPrompt;
let pwaTimeoutId = null; 
const PWA_PROMPT_KEY = 'pwa_prompt_dismissed';

// --- Constantes de Tooltip para Importação ---
const RADIO_IMPORT_INFO = `
    O arquivo CSV ou XLSX deve conter as seguintes colunas obrigatórias:
    <ul class="list-disc list-inside mt-2 space-y-1">
        <li class="font-semibold">Numero de Serie</li>
        <li class="font-semibold">Modelo</li>
    </ul>
    Outras colunas serão ignoradas.
`;

const EQUIPAMENTO_IMPORT_INFO = `
    O arquivo CSV ou XLSX deve conter as seguintes colunas obrigatórias:
    <ul class="list-disc list-inside mt-2 space-y-1">
        <li class="font-semibold">Frota</li>
        <li class="font-semibold">Grupo (Deve ser um dos: Colheita, Transporte, Oficina, TPL, Industria)</li>
        <li class="font-semibold">Modelo do Equipamento</li>
        <li class="font-semibold">Subgrupo (Descrição do Equipamento)</li>
    </ul>
    <p class="mt-2"><span class="font-semibold">Coluna Opcional:</span> Gestor</p>
`;

const BORDO_IMPORT_INFO = `
    O arquivo CSV ou XLSX deve conter as seguintes colunas obrigatórias:
    <ul class="list-disc list-inside mt-2 space-y-1">
        <li class="font-semibold">Tipo (Deve ser: Tela, Mag ou Chip)</li>
        <li class="font-semibold">Numero de Serie</li>
        <li class="font-semibold">Modelo</li>
    </ul>
    <p class="mt-2 text-red-500 font-semibold">Atenção: A coluna "Tipo" deve ter um dos valores exatos: Tela, Mag ou Chip.</p>
`;

// ===========================
// NOVA FUNÇÃO: Hash de senha simples (para demonstração - use bcrypt em produção)
// ===========================
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ===========================
// NOVA FUNÇÃO: Verifica senha
// ===========================
async function verifyPassword(password, hashedPassword) {
    const hash = await hashPassword(password);
    return hash === hashedPassword;
}

// ===========================
// NOVA FUNÇÃO: Salva sessão no localStorage
// ===========================
function saveSession(user) {
    localStorage.setItem('currentSession', JSON.stringify({
        id: user.id,
        username: user.username,
        timestamp: Date.now()
    }));
}

// ===========================
// NOVA FUNÇÃO: Carrega sessão do localStorage
// ===========================
function loadSession() {
    const sessionData = localStorage.getItem('currentSession');
    if (!sessionData) return null;
    
    try {
        const session = JSON.parse(sessionData);
        // Verifica se a sessão tem menos de 7 dias
        const sessionAge = Date.now() - session.timestamp;
        const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 dias
        
        if (sessionAge > maxAge) {
            clearSession();
            return null;
        }
        
        return session;
    } catch (e) {
        clearSession();
        return null;
    }
}

// ===========================
// NOVA FUNÇÃO: Limpa sessão
// ===========================
function clearSession() {
    localStorage.removeItem('currentSession');
}

// ===========================
// FUNÇÕES ANTIGAS MANTIDAS (mas modificadas)
// ===========================

function detachFirestoreListeners() {
    firestoreListeners.forEach(unsub => unsub());
    firestoreListeners = [];
}

/**
 * NOVO: Verifica se o valor é um email ou um nome de usuário.
 */
function isEmail(value) {
    return value.includes('@') && value.includes('.');
}

function checkDuplicities() {
    const newDuplicities = [];

    // 1. Verificar Duplicidades de Rádios (Número de Série)
    const radioSeriesCount = {};
    dbRadios.forEach(r => {
        const serie = r.serie;
        if (serie) {
            if (!radioSeriesCount[serie]) {
                radioSeriesCount[serie] = [];
            }
            radioSeriesCount[serie].push(r);
        }
    });

    Object.values(radioSeriesCount).forEach(list => {
        if (list.length > 1) {
            list.forEach(r => {
                newDuplicities.push({
                    id: r.id,
                    type: 'Rádio',
                    field: 'Número de Série',
                    value: r.serie,
                    createdAt: r.createdAt,
                    collection: 'radios'
                });
            });
        }
    });

    // 2. Verificar Duplicidades de Equipamentos (Frota)
    const equipFrotaCount = {};
    dbEquipamentos.forEach(e => {
        const frota = e.frota;
        if (frota) {
            if (!equipFrotaCount[frota]) {
                equipFrotaCount[frota] = [];
            }
            equipFrotaCount[frota].push(e);
        }
    });

    Object.values(equipFrotaCount).forEach(list => {
        if (list.length > 1) {
            list.forEach(e => {
                newDuplicities.push({
                    id: e.id,
                    type: 'Equipamento',
                    field: 'Frota',
                    value: e.frota,
                    createdAt: e.createdAt,
                    collection: 'equipamentos'
                });
            });
        }
    });

    // 3. Verificar Duplicidades de Bordos (Tipo + Número de Série)
    const bordoSeriesCount = {};
    dbBordos.forEach(b => {
        // A chave de unicidade é Tipo + Série
        const key = `${b.tipo}-${b.numeroSerie}`;
        if (b.numeroSerie && b.tipo) {
            if (!bordoSeriesCount[key]) {
                bordoSeriesCount[key] = [];
            }
            bordoSeriesCount[key].push(b);
        }
    });

    Object.values(bordoSeriesCount).forEach(list => {
        if (list.length > 1) {
            list.forEach(b => {
                newDuplicities.push({
                    id: b.id,
                    type: `Bordo (${b.tipo})`,
                    field: 'Número de Série',
                    value: b.numeroSerie,
                    createdAt: b.createdAt,
                    collection: 'bordos'
                });
            });
        }
    });


    // Filtra duplicidades únicas e ordena por data de criação para melhor visualização
    duplicities = newDuplicities.filter((item, index, self) =>
        index === self.findIndex((t) => (t.id === item.id))
    ).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); 
}

async function loadInitialSettings() {
    if (!db || !appId) return;

    const settingsDocRef = doc(db, "artifacts", appId, "public", "data", "settings", "config");
    try {
        // Tenta ler as configurações
        const settingsSnap = await getDoc(settingsDocRef);
        if (settingsSnap.exists()) {
            const data = settingsSnap.data();
            settings.letterMap = data.letterMap || DEFAULT_LETTER_MAP;
            settings.nextIndex = data.nextIndex || DEFAULT_NEXT_INDEX;
            settings.users = data.users || []; 
        } else {
            console.warn("Documento de 'settings/config' não encontrado. Usando padrões locais.");
            // Cria usuário admin padrão com senha hasheada
            const defaultPassword = await hashPassword("admin123"); // ALTERE ISSO!
            settings.users = [{ 
                id: crypto.randomUUID(), 
                name: "Juliano Timoteo (Admin Padrão)", 
                username: "admin", 
                password: defaultPassword,
                role: "admin",
                permissions: { dashboard: true, cadastro: true, pesquisa: true, settings: true }
            }];
            // Tenta salvar
            saveSettings();	
        }
    } catch (e) {
        console.error("Erro ao carregar 'settings/config' na inicialização:", e);
    }
}

async function attachFirestoreListeners() {
    detachFirestoreListeners();	
    if (!db || !appId || !currentUser) return; // Só anexa se estiver autenticado

    // 1. Sincronizar Coleções
    const collectionsToSync = {
        'radios': (data) => dbRadios = data,
        'equipamentos': (data) => dbEquipamentos = data,
        'bordos': (data) => dbBordos = data, 
        'registros': (data) => dbRegistros = data,
        'users': (data) => {
             // Atualiza a lista global e ordena por nome
             settings.users = data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
             
             // Atualiza a tela sempre que houver mudanças
             checkDuplicities();
             if(!isLoggingIn) renderApp();
        }
    };

    Object.keys(collectionsToSync).forEach(colName => {
        const colPath = `artifacts/${appId}/public/data/${colName}`;
        const q = query(collection(db, colPath));
        
        const unsub = onSnapshot(q, (querySnapshot) => {
            const data = [];
            querySnapshot.forEach((doc) => {
                data.push({ id: doc.id, ...doc.data() });
            });
            
            collectionsToSync[colName](data);	
            
        }, (error) => {
            console.error(`Erro no listener de ${colName}:`, error);
        });
        firestoreListeners.push(unsub);
    });

    // 2. Listener para Solicitações Pendentes (Acesso: Apenas Admin)
    if (currentUser.role === 'admin') {
        const pendingColPath = `artifacts/${appId}/public/data/pending_approvals`;
        const qPending = query(collection(db, pendingColPath));

        const unsubPending = onSnapshot(qPending, (querySnapshot) => {
            const data = [];
            querySnapshot.forEach((doc) => {
                data.push({ id: doc.id, ...doc.data() });
            });
            pendingUsers = data;
            if(!isLoggingIn) renderApp();
        }, (error) => {
            console.error(`Erro no listener de pending_approvals:`, error);
        });
        firestoreListeners.push(unsubPending);
    }
    // 3. Força renderização
    handleHashChange();
}

async function saveSettings() {
    if (!db || !appId) return;
    const settingsDocRef = doc(db, "artifacts", appId, "public", "data", "settings", "config");
    try {
        await setDoc(settingsDocRef, {	
            letterMap: settings.letterMap,
            nextIndex: settings.nextIndex,
            users: settings.users // Salva a lista de usuários
        }, { merge: true });
    } catch (e) {
        showModal('Erro', 'Não foi possível salvar as configurações no banco de dados. Verifique a permissão do Administrador Principal.', 'error');
    }
}

function updateState(key, value) {
    switch (key) {
        case 'page':
            if (value === 'login' && currentUser) return;
            if (value !== 'login' && !currentUser) {
                currentPage = 'login';
                window.location.hash = '#login';
                return;
            }
            currentPage = value;
            currentCadastroTab = 'radio';
            currentSettingTab = 'system';
            // Reset da paginação
            radioPage = 1; equipamentoPage = 1, bordosPage = 1, geralPage = 1, pesquisaPage = 1; 
            // Reset da busca
            radioSearch = '', equipamentoSearch = '', bordosSearch = '', geralSearch = '', searchTermPesquisa = ''; 
            focusedSearchInputId = null;	
            break;
        case 'loginView':
            currentLoginView = value;
            break;
        case 'cadastroTab':
            currentCadastroTab = value;
            focusedSearchInputId = null;
            break;
        case 'settingTab':
            currentSettingTab = value;
            focusedSearchInputId = null;
            break;
        case 'settings':	
            settings = value;
            break;
    }
    
    let hash = `#${currentPage}`;
    if (currentPage === 'cadastro') hash = `#${currentPage}/${currentCadastroTab}`;
    else if (currentPage === 'settings') hash = `#${currentPage}/${currentSettingTab}`;
    
    if (window.location.hash.substring(1) !== hash.substring(1)) {
        window.location.hash = hash;
    } else {
        renderApp();	
    }
}

// --- Funções de Paginação ---
function setRadioPage(delta) {
    radioPage = Math.max(1, radioPage + delta);
    renderApp();
}
function setEquipamentoPage(delta) {
    equipamentoPage = Math.max(1, equipamentoPage + delta);
    renderApp();
}
function setBordosPage(delta) {
    bordosPage = Math.max(1, bordosPage + delta);
    renderApp();
}
function setGeralPage(delta) {
    geralPage = Math.max(1, geralPage + delta);
    renderApp();
}
function setPesquisaPage(delta) {
    pesquisaPage = Math.max(1, pesquisaPage + delta);
    renderApp();
}

// --- Funções de Geração de Código ---

function zpad(n, size) {	
    return String(n).padStart(size, '0');	
}

function generateCode(group) {
    const letterMap = settings.letterMap;
    const nextIndex = settings.nextIndex;
    const letter = letterMap[group];
    
    if (!letter) {
        showModal('Erro', `Mapeamento de letra não encontrado para o grupo: ${group}`, 'error');
        return null;
    }

    const indexKey = letter === 'NUM' ? 'NUM' : letter;
    let index = nextIndex[indexKey] || 1;	
    let code;

    if (letter === 'NUM') code = zpad(index, 3);
    else code = letter + zpad(index, 3);
    
    // **CORREÇÃO CRÍTICA**: O próximo índice DEVE ser salvo em um clone do objeto nextIndex
    const newNextIndex = { ...nextIndex };
    newNextIndex[indexKey] = index + 1;
    settings.nextIndex = newNextIndex;	
    
    saveSettings();	

    return code;
}

// --- Funções de CRUD ---

async function validateVinculoBeforeSave(data) {
    // Regra: Não pode haver registros de Rádio ou Bordo sem Frota.
    if (data.equipamentoId) {
        return true; 
    }
    
    if (data.collection !== 'registros') return true; 

    if (!data.equipamentoId) {
        showModal('Erro de Vínculo', 'O vínculo de Rádio ou Bordo **deve** ser feito a uma Frota (Equipamento).', 'error');
        return false;
    }

    return true;
}

async function saveRecord(collectionName, record) {
    if (!db || !appId) {
        showModal('Erro', 'Conexão com o banco de dados perdida.', 'error');
        return;
    }
    
    const colPath = `artifacts/${appId}/public/data/${collectionName}`;
    let recordData = { ...record };	

    if (collectionName === 'registros') {
        const isValid = await validateVinculoBeforeSave({ ...recordData, collection: collectionName });
        if (!isValid) return;
    }

    try {
        if (recordData.id) {
            // Update
            const docRef = doc(db, colPath, recordData.id);
            delete recordData.id;	
            await setDoc(docRef, recordData, { merge: true });
            showModal('Sucesso', `${collectionName} atualizado com sucesso!`, 'success');
        } else {
            // Create
            recordData.createdAt = new Date().toISOString();
            if (collectionName === 'radios' || collectionName === 'equipamentos' || collectionName === 'bordos') {
                recordData.ativo = true;
            }
            if (collectionName === 'radios') {
                recordData.status = recordData.status || 'Disponível';
            }
            if (collectionName === 'bordos') {
                recordData.status = recordData.status || 'Disponível'; 
            }
            delete recordData.id;	
            await addDoc(collection(db, colPath), recordData);
            showModal('Sucesso', `${collectionName} adicionado com sucesso!`, 'success');
        }
        
        await attachFirestoreListeners();
    } catch (error) {
        console.error(`Erro ao salvar registro de ${collectionName}:`, error);
        showModal('Erro', 'Não foi possível salvar o registro no banco de dados.', 'error');
    }
}

async function deleteLink(regId, type) {
    if (!db || !appId || type === 'registros') {
        showModal('Erro', 'Ação inválida de desvinculação.', 'error');
        return;
    }

    const regRef = doc(db, `artifacts/${appId}/public/data/registros`, regId);
    const regSnap = await getDoc(regRef);	

    if (!regSnap.exists()) {
        showModal('Erro', 'Registro de associação não encontrado.', 'error');
        return;
    }

    const registroAtual = regSnap.data();
    const batch = writeBatch(db);
    let successMessage = '';
    
    try {
        if (type === 'radio') {
            // Desvincular Rádio (e Equipamento)
            
            // 1. Atualiza o status do Rádio para "Disponível"
            if (registroAtual.radioId) {
                const radioRef = doc(db, `artifacts/${appId}/public/data/radios`, registroAtual.radioId);
                batch.update(radioRef, { status: 'Disponível' });
            }

            // 2. Remove o radioId e o Código do registro principal
            if (registroAtual.telaId || registroAtual.magId || registroAtual.chipId) {
                batch.update(regRef, {
                    radioId: null,
                    codigo: null
                });
                successMessage = 'Rádio desvinculado com sucesso! Os Bordos permanecem vinculados à Frota.';
            } else {
                batch.delete(regRef);
                successMessage = 'Rádio desvinculado e registro de associação removido com sucesso!';
            }

        } else if (type === 'bordos') {
            // Desvincular Bordos (Tela, Mag, Chip)

            // 1. Atualiza o status de cada Bordo para "Disponível"
            if (registroAtual.telaId) {
                const telaRef = doc(db, `artifacts/${appId}/public/data/bordos`, registroAtual.telaId);
                batch.update(telaRef, { status: 'Disponível' });
            }
            if (registroAtual.magId) {
                const magRef = doc(db, `artifacts/${appId}/public/data/bordos`, registroAtual.magId);
                batch.update(magRef, { status: 'Disponível' });
            }
            if (registroAtual.chipId) {
                const chipRef = doc(db, `artifacts/${appId}/public/data/bordos`, registroAtual.chipId);
                batch.update(chipRef, { status: 'Disponível' });
            }

            // 2. Nullifica as IDs dos bordos no registro principal
            if (registroAtual.radioId) {
                batch.update(regRef, {
                    telaId: null,
                    magId: null,
                    chipId: null
                });
                successMessage = 'Itens de Bordo desvinculados com sucesso! O Rádio e Frota permanecem vinculados.';
            } else {
                batch.delete(regRef);
                successMessage = 'Itens de Bordo desvinculados e registro removido com sucesso! (Frota agora livre)';
            }

        } else {
             showModal('Erro', 'Tipo de desvinculação não reconhecido.', 'error');
             return;
        }

        await batch.commit();
        showModal('Sucesso', successMessage, 'success');
        
        renderApp();

    } catch (error) {
        console.error("Erro ao desvincular registro:", error);
        showModal('Erro', 'Ocorreu um erro durante a operação de desvinculação.', 'error');
    }
}

function showVincularModal(equipamentoId, tipo) {
    const equipamento = dbEquipamentos.find(e => e.id === equipamentoId);
    if (!equipamento) {
        showModal('Erro', 'Frota não encontrada.', 'error');
        return;
    }
    
    // Encontra o registro de vínculo existente
    const registro = dbRegistros.find(reg => reg.equipamentoId === equipamentoId);
    
    // Filtra e mapeia ITENS DISPONÍVEIS para substituição/adição
    const availableRadios = dbRadios.filter(r =>    
        r.ativo !== false &&    
        r.status === 'Disponível' &&    
        !dbRegistros.some(reg => reg.radioId === r.id)
    );
    // Bordos disponíveis: aqueles ativos E com status 'Disponível' E não vinculados a outro registro.
    const availableBordos = dbBordos.filter(b => 
        b.ativo !== false &&
        b.status === 'Disponível' &&
        !dbRegistros.some(reg => reg.telaId === b.id || reg.magId === b.id || reg.chipId === b.id)
    );

    const bordosPorTipo = availableBordos.reduce((acc, b) => {
        acc[b.tipo] = acc[b.tipo] || [];
        acc[b.tipo].push(b);
        return acc;
    }, {});
    
    // Mapeamento de itens ATUALMENTE VINCULADOS
    const bordoMap = dbBordos.reduce((acc, b) => { acc[b.id] = b; return acc; }, {});
    const linkedBordos = {
        Tela: registro && registro.telaId ? bordoMap[registro.telaId] : null,
        Mag: registro && registro.magId ? bordoMap[registro.magId] : null,
        Chip: registro && registro.chipId ? bordoMap[registro.chipId] : null,
    };
    const linkedRadio = registro && registro.radioId ? dbRadios.find(r => r.id === registro.radioId) : null;

    const radioOptions = availableRadios
        .map(r => `<option value="${r.id}">${r.serie} (${r.modelo})</option>`)
        .join('');
    
    // Função para gerar options de substituição/vínculo
    const getBordoOptions = (tipo) => {
        const linkedItem = linkedBordos[tipo];
        let options = '';
        
        // 1. Opção padrão: Selecione/Manter
        if (linkedItem) {
            options += `<option value="" selected>Manter ${tipo} Atual / Desvincular</option>`;
        } else {
             options += `<option value="" selected>Selecione o ${tipo}</option>`;
        }

        // 2. Adiciona itens disponíveis
        const bordos = bordosPorTipo[tipo] || [];
        options += bordos.map(b => `<option value="${b.id}">${b.numeroSerie} (${b.modelo})</option>`).join('');
        
        return options;
    };

    const isRadioMode = tipo === 'radio';
    const isBordosMode = tipo === 'bordos';
    
    let infoHtml = '';
    let formHtml = '';
    let isEditingMode = !!registro; 

    if (isRadioMode) {
        if (linkedRadio && !isEditingMode) {
            infoHtml = '<p class="text-red-500 font-semibold">Erro: Um Rádio já está vinculado a esta Frota. Use a aba Geral para gerenciar.</p>';
        } else {
            const currentRadioDisplay = linkedRadio ? linkedRadio.serie + ' (' + linkedRadio.modelo + ')' : 'NENHUM RÁDIO VINCULADO';
            
            infoHtml = `<p class="text-gray-700 dark:text-gray-300"><b>Rádio Atual:</b> ${currentRadioDisplay}</p><p class="mt-2 text-sm text-yellow-600 dark:text-yellow-400">Selecione um Rádio abaixo para VINCULAR, SUBSTITUIR ou para **desvincular** (selecione a primeira opção).</p>`;
            
            formHtml = `
                <div>
                    <label for="modal-radio-id" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Rádio (Seleção/Substituição)</label>
                    <select id="modal-radio-id" class="tom-select-radio-modal mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border bg-white dark:bg-gray-700 dark:text-gray-100">
                        <option value="">${linkedRadio ? 'Manter Rádio Atual / Desvincular' : 'Selecione o Rádio para vincular...'}</option>
                        ${radioOptions}
                    </select>
                </div>
            `;
        }
    } else if (isBordosMode) {
        infoHtml = `<p class="text-gray-700 dark:text-gray-300">Gerencie a Tela, Mag e Chip. Para substituir ou desvincular uma peça, selecione a opção desejada no menu e clique em **"Atualizar Vínculos"**.</p>`;
        
        const renderBordoBlock = (tipo) => {
            const typeLower = tipo.toLowerCase();
            const linkedItem = linkedBordos[tipo];
            const currentSerie = linkedItem ? `${linkedItem.numeroSerie} (${linkedItem.modelo})` : 'NENHUM';
            
            return `
                <div class="border p-3 rounded-lg dark:border-gray-600">
                    <p class="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">${tipo} Atual: <span class="font-mono text-indigo-600 dark:text-indigo-400">${currentSerie}</span></p>
                    
                    <div>
                        <label for="modal-${typeLower}-id" class="block text-xs font-medium text-gray-700 dark:text-gray-300">${linkedItem ? 'Substituir ou Desvincular:' : 'Vincular novo item:'}</label>
                        <select id="modal-${typeLower}-id" 
                                class="tom-select-bordo-modal mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border bg-white dark:bg-gray-700 dark:text-gray-100">
                            ${getBordoOptions(tipo)}
                        </select>
                         <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Selecione a primeira opção para desvincular, ou um item para vincular/substituir.</p>
                    </div>
                </div>
            `;
        }
        
        formHtml = `
            <div class="space-y-4">
                ${renderBordoBlock('Tela')}
                ${renderBordoBlock('Mag')}
                ${renderBordoBlock('Chip')}
            </div>
        `;
    } else {
        showModal('Erro', 'Tipo de vínculo desconhecido.', 'error');
        return;
    }
    
    // Monta o conteúdo do modal
    const modal = document.getElementById('global-modal');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const actionsEl = document.getElementById('modal-actions');

    modal.querySelector('div').classList.remove('max-w-sm', 'max-w-md', 'max-w-lg');
    modal.querySelector('div').classList.add('max-w-xl'); 

    const modalTitle = isEditingMode 
        ? `Gerenciar Vínculos da Frota ${equipamento.frota} (Cód: ${equipamento.codigo || 'N/A'})`
        : `Novo Vínculo à Frota ${equipamento.frota}`;
        
    titleEl.textContent = modalTitle;
    titleEl.className = `text-xl font-bold mb-3 text-green-main dark:text-green-400`;
    
    messageEl.innerHTML = `
        <div class="max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
            <div class="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg shadow-inner border dark:border-gray-700 space-y-3 mb-4">
                <p class="font-semibold text-gray-800 dark:text-gray-100">Informações da Frota:</p>
                <p class="text-sm text-gray-700 dark:text-gray-300"><span class="font-semibold">Grupo:</span> ${equipamento.grupo}</p>
                <p class="text-sm text-gray-700 dark:text-gray-300"><span class="font-semibold">Modelo:</span> ${equipamento.modelo}</p>
                <p class="text-sm text-gray-700 dark:text-gray-300"><span class="font-semibold">Código Atual:</span> ${equipamento.codigo || 'N/A'}</p>
            </div>
            <div class="mt-4">
                ${infoHtml}
                <form id="form-vincular-modal" class="mt-4 space-y-4">
                    ${formHtml}
                </form>
            </div>
        </div>
    `;

    // Botões de ação do modal
    actionsEl.innerHTML = `
        <button onclick="hideVincularModal()" class="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors shadow-md">
            Fechar
        </button>
        <button id="confirm-vincular-btn" class="px-3 py-1.5 text-sm bg-green-main text-white font-semibold rounded-lg hover:bg-green-700 transition-colors shadow-md">
            <i class="fas fa-link mr-2"></i> ${isEditingMode ? 'Atualizar Vínculos' : 'Confirmar Novo Vínculo'}
        </button>
    `;
    
    // Exibe o modal
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    // Inicializa TomSelects
    const initTomSelectInstance = (el) => {
        if (el) {
            new TomSelect(el, {
                plugins: ['dropdown_input'],
                maxItems: 1,
                allowEmptyOption: true,
                placeholder: 'Selecione ou deixe vazio...',
            });
        }
    };
    
    initTomSelectInstance(document.getElementById('modal-radio-id'));
    initTomSelectInstance(document.getElementById('modal-tela-id'));
    initTomSelectInstance(document.getElementById('modal-mag-id'));
    initTomSelectInstance(document.getElementById('modal-chip-id'));
    
    const confirmBtn = document.getElementById('confirm-vincular-btn');
    if (confirmBtn) {
        confirmBtn.onclick = () => handleVincularSubmit(equipamentoId, tipo, registro);
    }
}

function hideVincularModal() {
    hideModal();
    document.getElementById('global-modal').querySelector('div').classList.remove('max-w-md', 'max-w-xl', 'max-w-lg');
    document.getElementById('global-modal').querySelector('div').classList.add('max-w-sm');
}

async function handleVincularSubmit(equipamentoId, tipo, existingReg) {
    const isEditingMode = !!existingReg;

    const radioSelect = document.getElementById('modal-radio-id');
    const telaSelect  = document.getElementById('modal-tela-id');
    const magSelect   = document.getElementById('modal-mag-id');
    const chipSelect  = document.getElementById('modal-chip-id');

    const radioIdNew = radioSelect ? (radioSelect.value || null) : null;
    const telaIdNew  = telaSelect  ? (telaSelect.value  || null) : null;
    const magIdNew   = magSelect   ? (magSelect.value   || null) : null;
    const chipIdNew  = chipSelect  ? (chipSelect.value  || null) : null;

    const radioIdExisting = existingReg ? existingReg.radioId : null;
    const telaIdExisting  = existingReg ? existingReg.telaId  : null;
    const magIdExisting   = existingReg ? existingReg.magId   : null;
    const chipIdExisting  = existingReg ? existingReg.chipId  : null;

    let radioToUse = radioIdExisting;
    let telaToUse  = telaIdExisting;
    let magToUse   = magIdExisting;
    let chipToUse  = chipIdExisting;

    if (!equipamentoId) {
        showModal('Erro', 'A Frota (Equipamento) é obrigatória para qualquer vínculo.', 'error');
        return;
    }

    if (!isEditingMode) {
        if (tipo === 'bordos') {
            const bordosSelecionados = [telaIdNew, magIdNew, chipIdNew].filter(Boolean).length;
            if (bordosSelecionados === 0 && !radioIdNew) {
                showModal('Erro', 'Para criar um novo registro, selecione um Rádio ou o Kit de Bordos (3 itens).', 'error');
                return;
            }
            if (bordosSelecionados > 0 && bordosSelecionados < 3) {
                showModal('Erro de Bordo', 'Vínculo de Bordos exige Tela, Mag e Chip (kit completo).', 'error');
                return;
            }
        }
    }

    const itensParaVerificar = [];
    if (tipo === 'radio' && radioIdNew) itensParaVerificar.push({ id: radioIdNew, type: 'Rádio' });
    if (tipo === 'bordos') {
        if (telaIdNew) itensParaVerificar.push({ id: telaIdNew, type: 'Tela' });
        if (magIdNew)  itensParaVerificar.push({ id: magIdNew,  type: 'Mag' });
        if (chipIdNew) itensParaVerificar.push({ id: chipIdNew, type: 'Chip' });
    }
    for (const item of itensParaVerificar) {
        const isReplacingCurrentItem =
            (item.type === 'Rádio' && item.id === radioIdExisting) ||
            (item.type === 'Tela'  && item.id === telaIdExisting) ||
            (item.type === 'Mag'   && item.id === magIdExisting) ||
            (item.type === 'Chip'  && item.id === chipIdExisting);
        if (isReplacingCurrentItem) continue;

        const isLinkedElsewhere = dbRegistros.some(reg =>
            (reg.radioId === item.id || reg.telaId === item.id || reg.magId === item.id || reg.chipId === item.id)
            && reg.equipamentoId !== equipamentoId
        );
        if (isLinkedElsewhere) {
            const itemDetails = dbRadios.find(r => r.id === item.id) || dbBordos.find(b => b.id === item.id);
            showModal('Item Já Vinculado', `${item.type} ${itemDetails?.serie || itemDetails?.numeroSerie || item.id} já está em uso em outra Frota. Desvincule-o primeiro.`, 'error');
            return;
        }
    }

    hideVincularModal();

    const equipamentoRef = doc(db, `artifacts/${appId}/public/data/equipamentos`, equipamentoId);
    const equipamentoSnap = await getDoc(equipamentoRef);
    const equipamento = { id: equipamentoSnap.id, ...equipamentoSnap.data() };
    let codigoDoEquipamento = equipamento.codigo;
    if (!codigoDoEquipamento) {
        codigoDoEquipamento = generateCode(equipamento.grupo);
        if (!codigoDoEquipamento) return;
        try { await updateDoc(equipamentoRef, { codigo: codigoDoEquipamento }); }
        catch (e) { showModal('Erro', 'Não foi possível salvar o novo código no equipamento.', 'error'); return; }
    }

    const batch = writeBatch(db);
    let targetRegId = existingReg ? existingReg.id : null;

    const itemsToUnlink = [];

    if (tipo === 'radio') {
        if (radioIdNew !== null && radioIdNew !== radioIdExisting) {
            if (radioIdExisting) itemsToUnlink.push({ id: radioIdExisting, type: 'radios' });
            radioToUse = radioIdNew;
            if (radioIdNew) {
                const radioRef = doc(db, `artifacts/${appId}/public/data/radios`, radioIdNew);
                batch.update(radioRef, { status: 'Em Uso' });
            }
        } else {
            radioToUse = radioIdExisting;
        }
        telaToUse = telaIdExisting;
        magToUse  = magIdExisting;
        chipToUse = chipIdExisting;
    } else if (tipo === 'bordos') {
        const bordoFields = [
            { newId: telaIdNew, existingId: telaIdExisting, field: 'telaId', type: 'bordos' },
            { newId: magIdNew,  existingId: magIdExisting,  field: 'magId',  type: 'bordos' },
            { newId: chipIdNew, existingId: chipIdExisting, field: 'chipId', type: 'bordos' }
        ];
        bordoFields.forEach(item => {
            if (item.newId !== null && item.newId !== item.existingId) {
                if (item.existingId) itemsToUnlink.push({ id: item.existingId, type: 'bordos' });
                if (item.field === 'telaId') telaToUse = item.newId;
                if (item.field === 'magId')  magToUse  = item.newId;
                if (item.field === 'chipId') chipToUse = item.newId;
                if (item.newId) {
                    const bordoRef = doc(db, `artifacts/${appId}/public/data/bordos`, item.newId);
                    batch.update(bordoRef, { status: 'Em Uso' });
                }
            } else {
                if (item.field === 'telaId') telaToUse = item.existingId;
                if (item.field === 'magId')  magToUse  = item.existingId;
                if (item.field === 'chipId') chipToUse = item.existingId;
            }
        });
        radioToUse = radioIdExisting;
    } else {
        radioToUse = radioIdExisting;
        telaToUse  = telaIdExisting;
        magToUse   = magIdExisting;
        chipToUse  = chipIdExisting;
    }

    itemsToUnlink.forEach(item => {
        const itemRef = doc(db, `artifacts/${appId}/public/data/${item.type}`, item.id);
        batch.update(itemRef, { status: 'Disponível' });
    });

    const finalRecord = {
        equipamentoId,
        codigo: codigoDoEquipamento,
        radioId: radioToUse || null,
        telaId:  telaToUse  || null,
        magId:   magToUse   || null,
        chipId:  chipToUse  || null
    };

    const hasAnyLink = finalRecord.radioId || finalRecord.telaId || finalRecord.magId || finalRecord.chipId;

    if (isEditingMode) {
        if (hasAnyLink) {
            batch.update(doc(db, `artifacts/${appId}/public/data/registros`, targetRegId), finalRecord);
        } else {
            batch.delete(doc(db, `artifacts/${appId}/public/data/registros`, targetRegId));
        }
    } else {
        if (!hasAnyLink) {
            showModal('Erro', 'Nenhum item selecionado para criar o vínculo.', 'error');
            return;
        }
        const newRegRef = doc(collection(db, `artifacts/${appId}/public/data/registros`));
        batch.set(newRegRef, { ...finalRecord, createdAt: new Date().toISOString() });
    }

    try {
        await batch.commit();
        const msg = isEditingMode ? `Vínculos da Frota ${equipamento.frota} atualizados com sucesso!` : `Novo Vínculo criado. Código: ${codigoDoEquipamento}`;
        showModal('Sucesso!', msg, 'success');
    } catch (error) {
        console.error("Erro ao salvar associação:", error);
        showModal('Erro', 'Ocorreu um erro ao salvar a associação.', 'error');
    }
}

async function deleteRecord(collectionName, id) {
    if (!db || !appId) {
        showModal('Erro', 'Conexão com o banco de dados perdida.', 'error');
        return;
    }
    
    const colPath = `artifacts/${appId}/public/data/${collectionName}`;

    try {
        if (collectionName === 'registros') {
             await deleteLink(id, 'radio');
             await deleteLink(id, 'bordos');
             showModal('Sucesso', 'Associação completa desvinculada e itens atualizados com sucesso!', 'success');
        } else {
            showModal('Erro', 'Ação não suportada. Use a função de Inativação/Ativação.', 'error');
        }
    } catch (error) {
        console.error("Erro ao deletar/desvincular registro:", error);
        showModal('Erro', 'Ocorreu um erro durante a operação.', 'error');
    }
}

async function toggleRecordAtivo(collectionName, id) {
    if (!db || !appId || (collectionName !== 'radios' && collectionName !== 'equipamentos' && collectionName !== 'bordos')) {
        showModal('Erro', 'Ação inválida.', 'error');
        return;
    }
    
    const colPath = `artifacts/${appId}/public/data/${collectionName}`;

    try {
        const docRef = doc(db, colPath, id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            showModal('Erro', 'Registro não encontrado.', 'error');
            return;
        }

        const currentData = docSnap.data();
        const newAtivoState = !(currentData.ativo !== false);	

        if (newAtivoState === false) {	
            if (collectionName === 'radios' && dbRegistros.some(reg => reg.radioId === id)) {
                showModal('Ação Bloqueada', 'Não é possível inativar um rádio que está vinculado.\n\nDesvincule na aba "Geral" primeiro.', 'error');
                return;
            }
            if (collectionName === 'equipamentos' && dbRegistros.some(reg => reg.equipamentoId === id)) {
                showModal('Ação Bloqueada', 'Não é possível inativar um equipamento que possui vínculos (Rádio e/ou Bordos).\n\nDesvincule na aba "Geral" primeiro.', 'error');
                return;
            }
            if (collectionName === 'bordos') {
                const isLinked = dbRegistros.some(reg => reg.telaId === id || reg.magId === id || reg.chipId === id);
                if (isLinked) {
                    showModal('Ação Bloqueada', `Não é possível inativar o Bordo (${currentData.tipo}) que está vinculado.\n\nDesvincule na aba "Geral" primeiro.`, 'error');
                    return;
                }
            }
        }
        
        await updateDoc(docRef, { ativo: newAtivoState });	
        showModal('Sucesso', `Registro ${newAtivoState ? 'ATIVADO' : 'INATIVADO'} com sucesso!`, 'success');
        
    } catch (error) {
        console.error("Erro ao alternar status do registro:", error);
        showModal('Erro', 'Ocorreu um erro durante a operação.', 'error');
    }
}

async function deleteDuplicity(collectionName, id) {
    if (!db || !appId) {
        showModal('Erro', 'Conexão com o banco de dados perdida.', 'error');
        return;
    }

    let isLinked = false;
    if (collectionName === 'radios') {
        isLinked = dbRegistros.some(reg => reg.radioId === id);
    } else if (collectionName === 'equipamentos') {
        isLinked = dbRegistros.some(reg => reg.equipamentoId === id);
    } else if (collectionName === 'bordos') {
        isLinked = dbRegistros.some(reg => reg.telaId === id || reg.magId === id || reg.chipId === id);
    }
    
    if (isLinked) {
        showModal('Ação Bloqueada', 'Não é possível excluir este item. Ele está atualmente vinculado a um registro ativo.', 'warning');
        return;
    }

    const colPath = `artifacts/${appId}/public/data/${collectionName}`;

    try {
        await deleteDoc(doc(db, colPath, id));

        showModal('Sucesso', 'Duplicidade removida com sucesso! A integridade dos dados será verificada novamente.', 'success');
        
        checkDuplicities(); 
        renderApp();
        hideDuplicityModal();
        
    } catch (error) {
        console.error("Erro ao excluir duplicidade:", error);
        showModal('Erro', 'Ocorreu um erro ao excluir a duplicidade.', 'error');
    }
}

function loadUserForEdit(id) {
    const user = settings.users.find(u => u.id === id);
    if (user) {
        document.getElementById('user-id').value = user.id;
        document.getElementById('user-name').value = user.name;
        document.getElementById('user-username').value = user.username;
        document.getElementById('user-role').value = user.role;
        
        document.getElementById('user-password-field').classList.add('hidden');
        document.getElementById('user-password').value = ''; 

        document.getElementById('user-form-title').textContent = 'Editar Perfil de Usuário';
        showModal('Edição', `Carregando perfil de ${user.name} para edição.`, 'info');
        window.scrollTo(0, 0);
    } else {
        showModal('Erro', 'Usuário não encontrado.', 'error');
    }
}

async function saveUser(e) {
    e.preventDefault();
    const id = document.getElementById('user-id').value;
    const name = document.getElementById('user-name').value.trim();
    const username = document.getElementById('user-username').value.trim();
    const password = document.getElementById('user-password').value;
    const role = document.getElementById('user-role').value;
    
    if (!name || !username || !role) {
        showModal('Erro', 'Nome Completo, Usuário e Perfil são obrigatórios.', 'error');
        return;
    }

    const isEditing = !!id;

    // Verifica duplicidade
    const isDuplicate = settings.users.some(u => 
        u.username.toLowerCase() === username.toLowerCase() && 
        (!isEditing || u.id !== id)
    );

    if (isDuplicate) {
        showModal('Erro', `O usuário "${username}" já está cadastrado no sistema.`, 'error');
        return;
    }

    // Para novo usuário, senha é obrigatória
    if (!isEditing && password.length < 6) {
        showModal('Erro', 'A senha deve ter no mínimo 6 caracteres.', 'error');
        return;
    }

    let userToSave;
    
    if (isEditing) {
        userToSave = settings.users.find(u => u.id === id);
        if (!userToSave) {
            showModal('Erro', 'Usuário original não encontrado.', 'error');
            return;
        }
        userToSave.name = name;
        userToSave.username = username;
        userToSave.role = role;

        // Atualiza senha apenas se fornecida
        if (password.length >= 6) {
            userToSave.password = await hashPassword(password);
        }
    } else {
        const hashedPassword = await hashPassword(password);
        userToSave = { 
            id: crypto.randomUUID(), 
            name, 
            username,
            password: hashedPassword,
            role, 
            permissions: { 
                dashboard: true, 
                cadastro: true, 
                pesquisa: true, 
                settings: role === 'admin' 
            }
        };
        settings.users.push(userToSave);
    }

    try {
        const settingsDocRef = doc(db, "artifacts", appId, "public", "data", "settings", "config");

        if (isEditing) {
            const snap = await getDoc(settingsDocRef);
            let currentUsers = snap.exists() ? snap.data().users || [] : [];

            const idx = currentUsers.findIndex(u => u.id === id);
            if (idx !== -1) {
                currentUsers[idx] = userToSave;
            } else {
                currentUsers.push(userToSave);
            }

            await setDoc(settingsDocRef, { users: currentUsers }, { merge: true });
            settings.users = currentUsers;

        } else {
            await setDoc(settingsDocRef, {
                users: arrayUnion(userToSave)
            }, { merge: true });
        }

        showModal('Sucesso', `Perfil de ${name} salvo com sucesso!`, 'success');
        renderApp();
        
        setTimeout(() => {
            const currentForm = document.getElementById('form-user');
            if (currentForm) {
                currentForm.reset();
                document.getElementById('user-id').value = '';
                const titleEl = document.getElementById('user-form-title');
                if(titleEl) titleEl.textContent = 'Novo Perfil de Usuário';
                const passField = document.getElementById('user-password-field');
                if(passField) passField.classList.remove('hidden');
            }
        }, 500);

    } catch (e) {
        console.error("Erro ao salvar usuário:", e);
        showModal('Erro', 'Ocorreu um erro ao salvar o perfil.', 'error');
    }
}

async function deleteUser(id) {
    const settingsDocRef = doc(db, "artifacts", appId, "public", "data", "settings", "config");
    
    const userToDelete = settings.users.find(u => u.id === id);
    
    if (!userToDelete) {
        showModal('Erro', 'Usuário não encontrado para exclusão.', 'error');
        return;
    }

    const userName = userToDelete.name;
    const userUsername = userToDelete.username;

    if (userUsername === ADMIN_PRINCIPAL_EMAIL) {
        showModal('Bloqueado', 'O usuário principal (Admin) não pode ser excluído.', 'warning');
        return;
    }
    
    try {
        await updateDoc(settingsDocRef, {
            users: arrayRemove(userToDelete)
        });

        settings.users = settings.users.filter(u => u.id !== id);

        showModal('Sucesso', `Perfil de ${userName} excluído com sucesso!`, 'success');
        renderApp(); 
    } catch (e) {
        showModal('Erro', 'Não foi possível excluir o perfil no banco de dados.', 'error');
    }
}

// --- Funções de Gerenciamento de Pendências ---

async function approveUser(pendingId, name, email, tempPassword) {
    if (!db || !appId || !currentUser || currentUser.role !== 'admin') {
        showModal('Acesso Negado', 'Você não tem permissão ou conexão para realizar esta ação.', 'error');
        return;
    }

    try {
        const settingsDocRef = doc(db, "artifacts", appId, "public", "data", "settings", "config");

        const hashedPassword = await hashPassword(tempPassword);
        const newUser = { 
            id: crypto.randomUUID(), 
            name: name, 
            username: email,
            password: hashedPassword,
            role: 'user',
            permissions: { dashboard: true, cadastro: true, pesquisa: true, settings: false }
        };

        const batch = writeBatch(db);
        
        batch.set(settingsDocRef, { 
            users: arrayUnion(newUser) 
        }, { merge: true });
        
        const pendingDocRef = doc(db, `artifacts/${appId}/public/data/pending_approvals`, pendingId);
        batch.delete(pendingDocRef);

        await batch.commit();
        
        await loadInitialSettings(); 
        
        hideModal();
        showModal('Sucesso', `Usuário <b>${name}</b> aprovado!<br>Login: ${email}<br>Senha: ${tempPassword}<br><br>Ele já pode logar.`, 'success');
        
        renderApp();

    } catch (e) {
        console.error("Erro ao salvar dados no Firestore:", e);
        showModal('Erro de Dados', 'Houve erro ao salvar os dados no sistema. Tente atualizar a página.', 'error');
    }
}

async function handleSolicitarAcesso(e) {
    e.preventDefault();
    
    const form = e.target;
    const nome = form['solicitar-name'].value.trim();
    const email = form['solicitar-email'].value.trim();
    const telefone = form['solicitar-phone'].value.trim();
    const senhaProvisoria = form['solicitar-temp-password'].value.trim();

    if (!nome || !email || !telefone || !senhaProvisoria) {
        showModal('Erro', 'Todos os campos são obrigatórios.', 'error');
        return;
    }
    if (!isEmail(email)) {
        showModal('Erro', 'Email inválido.', 'error');
        return;
    }
    if (senhaProvisoria.length < 6) {
        showModal('Erro', 'A Senha Provisória deve ter no mínimo 6 caracteres.', 'error');
        return;
    }

    const appUser = settings.users.find(u => u.username === email);
    if (appUser) {
        showModal('Acesso Já Aprovado', 'Este email já possui um perfil aprovado. Tente o login.', 'info');
        return;
    }

    const pendingColRef = collection(db, `artifacts/${appId}/public/data/pending_approvals`);
    const q = query(pendingColRef, where("email", "==", email));
    const pendingSnap = await getDocs(q);
    
    if (!pendingSnap.empty) {
        showModal('Solicitação Pendente', 'Este email já possui uma solicitação de acesso pendente. Aguarde a aprovação do administrador.', 'warning');
        return;
    }

    try {
        await addDoc(pendingColRef, {
            name: nome,
            email: email,
            phone: telefone,
            tempPassword: senhaProvisoria,
            createdAt: new Date().toISOString()
        });

        showModal('Solicitação Enviada', 
            `Sua solicitação de acesso foi enviada com sucesso para aprovação. Você será notificado após a análise.`, 
            'success');
        
        form.reset();
        updateState('loginView', 'login');
    
    } catch (error) {
        showModal('Erro', 'Ocorreu um erro ao enviar sua solicitação.', 'error');
    }
}

function renderPendingApprovalsModal() {
    if (currentUser.role !== 'admin') {
        showModal('Acesso Negado', 'Apenas administradores podem visualizar as solicitações de acesso.', 'error');
        return;
    }

    const pendingListHTML = pendingUsers.length > 0 ? 
        pendingUsers.map(u => `
            <div class="flex items-center justify-between p-3 border-b border-gray-100 last:border-b-0 bg-white dark:bg-gray-700 rounded-lg shadow-sm">
                <div>
                    <p class="font-semibold text-gray-800 dark:text-gray-100">${u.name}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-300">${u.email}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-300">Telefone: ${u.phone || 'N/A'}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-300">Senha Provisória: ${u.tempPassword || 'N/A'}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-300">Solicitado em: ${new Date(u.createdAt).toLocaleDateString()} ${new Date(u.createdAt).toLocaleTimeString()}</p>
                </div>
                <div class="flex space-x-2">
                    <button onclick="approveUserWrapper('${u.id}', '${u.name}', '${u.email}', '${u.tempPassword}')" class="px-3 py-1 text-xs bg-green-main text-white rounded-lg hover:bg-green-700 shadow-md transition-colors">
                        Aprovar
                    </button>
                    <button onclick="rejectUserWrapper('${u.id}', '${u.name}')" class="px-3 py-1 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 shadow-md transition-colors">
                        Negar
                    </button>
                </div>
            </div>
        `).join('')
        : '<p class="text-gray-500 dark:text-gray-400 text-center py-4">Nenhuma solicitação de acesso pendente.</p>';

    const modal = document.getElementById('global-modal');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const actionsEl = document.getElementById('modal-actions');

    titleEl.textContent = `Aprovações Pendentes (${pendingUsers.length})`;
    modal.querySelector('div').classList.remove('max-w-sm');
    modal.querySelector('div').classList.add('max-w-lg'); 
    
    messageEl.innerHTML = `
        <p class="text-sm text-gray-600 dark:text-gray-300 mb-4">Novos usuários aguardam sua aprovação.</p>
        <div class="max-h-80 overflow-y-auto space-y-3 p-2 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
            ${pendingListHTML}
        </div>
    `;
    titleEl.className = `text-xl font-bold mb-3 ${pendingUsers.length > 0 ? 'text-yellow-600' : 'text-gray-800 dark:text-gray-100'}`;

    actionsEl.innerHTML = `
        <button onclick="hideModal(); document.getElementById('global-modal').querySelector('div').classList.remove('max-w-lg'); document.getElementById('global-modal').querySelector('div').classList.add('max-w-sm');" 
                class="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors shadow-md">
            Fechar
        </button>
    `;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

window.approveUserWrapper = (id, name, email, tempPassword) => {
    showConfirmModal('Confirmar Aprovação', `Deseja aprovar o acesso de <b>${name}</b>? Ele receberá permissões de 'Usuário Padrão'.`, () => approveUser(id, name, email, tempPassword));
};

window.rejectUserWrapper = (id, name) => {
    showConfirmModal('Confirmar Negação', `Deseja negar o acesso de <b>${name}</b>? A solicitação será removida.`, () => rejectUser(id, name));
};

window.renderPendingApprovalsModal = renderPendingApprovalsModal;

function renderDuplicityModalContent() {
    const modalContent = document.getElementById('duplicity-modal-content');
    
    if (duplicities.length === 0) {
        modalContent.innerHTML = '<p class="text-green-600 text-center font-semibold">Parabéns! Não foram encontradas duplicidades críticas.</p>';
        return;
    }

    const groups = duplicities.reduce((acc, item) => {
        const key = `${item.collection}-${item.value}`;
        if (!acc[key]) {
            acc[key] = { items: [], collection: item.collection, field: item.field, value: item.value };
        }
        acc[key].items.push(item);
        return acc;
    }, {});
    
    let html = '';

    Object.values(groups).forEach(group => {
        let typeLabel;
        if (group.collection === 'radios') typeLabel = 'Rádio (Série)';
        else if (group.collection === 'equipamentos') typeLabel = 'Equipamento (Frota)';
        else if (group.collection === 'bordos') typeLabel = `Bordo (Tipo/Série)`;
        else typeLabel = 'Item Desconhecido';
        
        const itemsList = group.items.map(item => {
            const date = new Date(item.createdAt).toLocaleString();
            let isLinked = false;
            if (item.collection === 'radios') {
                isLinked = dbRegistros.some(reg => reg.radioId === item.id);
            } else if (item.collection === 'equipamentos') {
                isLinked = dbRegistros.some(reg => reg.equipamentoId === item.id);
            } else if (item.collection === 'bordos') {
                isLinked = dbRegistros.some(reg => reg.telaId === item.id || reg.magId === item.id || reg.chipId === item.id);
            }
            
            const actionButton = isLinked 
                ? `<span class="text-xs font-semibold text-red-500 bg-red-100 dark:bg-red-800/50 dark:text-red-300 px-2 py-1 rounded-full">EM USO</span>`
                : `<button onclick="deleteDuplicityWrapper('${item.collection}', '${item.id}', '${item.value}')" class="px-3 py-1 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 shadow-md transition-colors">
                    Remover Este
                   </button>`;

            return `
                <div class="flex justify-between items-center p-3 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-700 hover:bg-red-50/50 dark:hover:bg-red-900/20 transition-colors rounded-lg shadow-sm">
                    <div class="space-y-0.5">
                        <p class="font-semibold text-gray-800 dark:text-gray-100 break-words-all">ID: <span class="font-mono text-xs">${item.id}</span></p>
                        <p class="text-xs text-gray-600 dark:text-gray-300">Criado em: ${date}</p>
                    </div>
                    ${actionButton}
                </div>
            `;
        }).join('');

        html += `
            <div class="bg-red-50 dark:bg-red-900/10 p-4 rounded-xl shadow-inner border border-red-200 dark:border-red-700">
                <h4 class="text-lg font-bold text-red-700 dark:text-red-400 mb-3">${typeLabel}: ${group.value} (${group.items.length} duplicatas)</h4>
                <div class="space-y-2">
                    ${itemsList}
                </div>
                <p class="mt-3 text-xs text-red-700 dark:text-red-400 font-semibold">Regra: Mantenha um único registro. Registros "EM USO" não podem ser removidos.</p>
            </div>
        `;
    });

    modalContent.innerHTML = html;
}

function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    if (isDark) {
        localStorage.setItem('theme', 'dark');
    } else {
        localStorage.setItem('theme', 'light');
    }
    if (currentUser) {
        renderApp();
    }
}

function renderThemeButton() {
    const isDark = document.documentElement.classList.contains('dark');
    const icon = isDark ? 'fas fa-sun' : 'fas fa-moon';
    const title = isDark ? 'Mudar para Tema Claro' : 'Mudar para Tema Escuro';

    return `
        <button onclick="toggleTheme()" 
            class="text-gray-500 dark:text-gray-300 hover:text-yellow-500 dark:hover:text-yellow-300 transition-colors p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700" 
            title="${title}">
            <i class="${icon}"></i>
        </button>
    `;
}

function handlePwaPromptClose(action) {
    if (pwaTimeoutId) {
        clearTimeout(pwaTimeoutId);
        pwaTimeoutId = null;
    }
    
    const pwaModal = document.getElementById('pwa-install-modal');
    if (pwaModal) {
        pwaModal.classList.add('hidden');
        pwaModal.classList.remove('flex');
    }
    
    if (action === 'dismiss' || action === 'timeout') {
        localStorage.setItem(PWA_PROMPT_KEY, 'dismissed');
    } else if (action === 'install') {
        localStorage.setItem(PWA_PROMPT_KEY, 'installed');
    }
    
    deferredPrompt = null;
    
    renderApp();
}

function showInstallDialog() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const dismissed = localStorage.getItem(PWA_PROMPT_KEY);
    
    if (isStandalone || dismissed === 'installed' || dismissed === 'dismissed' || !deferredPrompt) {
        return;
    }
    
    const modal = document.getElementById('pwa-install-modal');
    if (!modal) {
        return;
    }
    
    if (pwaTimeoutId) clearTimeout(pwaTimeoutId);

    const content = modal.querySelector('.modal-content');
    content.innerHTML = `
        <div class="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-2xl relative">
            <button onclick="handlePwaPromptClose('dismiss')" class="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <i class="fas fa-times"></i>
            </button>
            <h3 class="text-2xl font-bold text-green-main dark:text-green-400 mb-3 flex items-center">
                <i class="fas fa-mobile-alt mr-3"></i> Instalar como Aplicativo
            </h3>
            <p class="text-gray-700 dark:text-gray-300 mb-4">
                Para ter a melhor experiência e acesso rápido, instale o Gestão de Rádios diretamente na sua tela inicial.
            </p>
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Esta caixa fechará automaticamente em 10 segundos.
            </p>
            <button id="pwa-install-button" class="w-full flex justify-center py-2 px-3 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-500 hover:bg-indigo-600 shadow-md transition-colors">
                <i class="fas fa-download mr-2"></i> Instalar Agora
            </button>
        </div>
    `;

    document.getElementById('pwa-install-button').onclick = async () => {
        handlePwaPromptClose('install');
        
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
            }
        }
    };
    
    pwaTimeoutId = setTimeout(() => {
        if (deferredPrompt) {
            handlePwaPromptClose('timeout');
            showModal('Instalação', 'A solicitação de instalação expirou. Tente novamente mais tarde.', 'info');
        }
    }, 10000);

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function renderInstallButton() {
    return '';
}

// --- Funções de Renderização (HTML) ---

function renderTopBar() {
    const allTabs = [
        { id: 'dashboard', name: 'Dashboard', icon: 'fa-chart-line' },
        { id: 'cadastro', name: 'Cadastro', icon: 'fa-box' },
        { id: 'pesquisa', name: 'Pesquisa', icon: 'fa-search' },
        { id: 'settings', name: 'Configurações', icon: 'fa-cog', adminOnly: true }
    ];
    
    const tabs = allTabs.filter(tab => {
        if (!currentUser) return false;
        if (tab.id === 'settings' && currentUser.role !== 'admin') {
            return false;
        }
        return currentUser.role === 'admin' || (currentUser.permissions && currentUser.permissions[tab.id] === true);
    });
    
    const tabLinks = tabs.map(tab => {
        const isActive = currentPage === tab.id;
        const isChecked = isActive ? 'checked' : ''; 
        
        let iconClass = tab.icon;

        return `
            <label class="radio-label" onclick="updateState('page', '${tab.id}')">
                <input type="radio" class="radio-input" name="main_nav_choice" ${isChecked} />
                <span class="radio-custom"></span>
                <span class="radio-text flex items-center space-x-1">
                    <i class="fas ${iconClass} text-base"></i> 
                    <span>${tab.name}</span>
                </span>
            </label>
        `;
    }).join('');

    const duplicityCount = duplicities.length;
    const duplicityBell = duplicityCount > 0 ? `
        <button onclick="showDuplicityModal()" class="relative text-gray-500 dark:text-red-400 hover:text-red-600 transition-colors p-2 rounded-full hover:bg-red-100 dark:hover:bg-gray-700" title="Alerta Crítico de Duplicidade de Dados">
            <i class="fas fa-bell duplicity-bell-active"></i>
            <span class="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-red-100 transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">${duplicityCount}</span>
        </button>
    ` : `
        <button onclick="showDuplicityModal()" class="relative text-gray-500 dark:text-gray-300 hover:text-green-main transition-colors p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700" title="Integridade de Dados (OK)">
            <i class="fas fa-heart-pulse"></i>
        </button>
    `;

    return `
        <header class="bg-white dark:bg-gray-800 shadow-lg sticky top-0 z-10 border-b border-gray-100 dark:border-gray-700">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex justify-between h-16 items-center">
                    
                    <div class="flex-1 flex justify-start items-center">
                        <h1 class="text-xl font-bold text-gray-800 dark:text-gray-100 hidden sm:block">📻 Link-Frota</h1>
                        <h1 class="text-xl font-bold text-gray-800 dark:text-gray-100 block sm:hidden">📻 LF</h1>
                    </div>

                    <nav class="hidden md:block mx-auto flex-none">
                        <div class="radio-group-container border-b border-gray-200 dark:border-gray-700">
                            ${tabLinks}
                        </div>
                    </nav>
                    
                    <div class="flex-1 flex justify-end items-center space-x-4">
                        
                        ${renderInstallButton()} ${renderThemeButton()} ${duplicityBell}
                        
                        ${currentUser.role === 'admin' ? `
                        <button onclick="renderPendingApprovalsModal()" class="relative text-gray-500 dark:text-gray-300 hover:text-yellow-600 transition-colors p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700" title="Novas Solicitações de Acesso">
                            <i class="fas fa-bell"></i>
                            ${pendingUsers.length > 0 ? `
                            <span class="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-red-100 transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">${pendingUsers.length}</span>
                            ` : ''}
                        </button>
                        ` : ''}

                        <span class="text-sm font-medium text-gray-600 dark:text-gray-300 hidden sm:inline">
                            Olá, ${currentUser.name}
                        </span>
                        <button onclick="showProfileModal()" class="text-gray-500 dark:text-gray-300 hover:text-green-main transition-colors p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700" title="Meu Perfil / Gerenciar Senha">
                            ${getUserAvatar(currentUser)}
                        </button>
                        <button onclick="handleLogout()" class="text-gray-500 dark:text-gray-300 hover:text-red-500 transition-colors p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700" title="Sair do Sistema">
                            <i class="fas fa-sign-out-alt"></i>
                        </button>
                    </div>
                </div>
            </div>
        </header>
        <nav class="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 fixed bottom-0 left-0 right-0 z-10 md:hidden shadow-2xl">
            <div class="flex justify-around">
                ${tabs.map(tab => {
                    const isActive = currentPage === tab.id;
                    const activeClass = isActive ? 'text-green-main tab-active font-semibold' : 'text-gray-500 dark:text-gray-300 hover:text-green-main';
                    const mobileName = tab.name; 

                    return `
                        <a href="#${tab.id}" class="py-3 px-4 flex flex-col items-center space-y-1 ${activeClass} transition-colors border-b-2 border-transparent">
                            <i class="fas ${tab.icon}"></i>
                            <span class="text-xs">${mobileName}</span>
                        </a>
                    `;
                }).join('')}
            </div>
        </nav>
        <div class="h-16 md:hidden"></div> `;
}

function renderLogin() {
    const savedLogin = localStorage.getItem('rememberedLogin') || '';
    const rememberMeChecked = savedLogin ? 'checked' : '';
    
    let content;
    if (currentLoginView === 'login') {
        content = `
            <div class="text-center">
                <img src="https://usinapitangueiras.com.br/wp-content/uploads/2020/04/usina-pitangueiras-logo.png" alt="Logo Usina Pitangueiras"	
                    class="mx-auto h-20 w-auto mb-4"	
                    onerror="this.onerror=null; this.src='https://placehold.co/150x80/40800c/FFFFFF?text=Logo'; this.alt='Logo Placeholder'">
                <h2 class="text-3xl font-extrabold text-gray-900 dark:text-gray-100">
                    Acesso ao Sistema
                </h2>
                <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
                    Use seu usuário e senha para continuar
                </p>
            </div>
            <form id="login-form" class="mt-8 space-y-6">
                <input type="text" id="login-input" placeholder="Usuário" required	
                    class="appearance-none relative block w-full px-4 py-3 border border-gray-300 dark:border-gray-600 placeholder-gray-500 text-gray-900 dark:text-gray-100 dark:bg-gray-700 rounded-lg focus:outline-none focus:ring-green-main focus:border-green-main focus:z-10 sm:text-sm shadow-sm"
                    value="${savedLogin}"
                >
                <div class="relative">
                    <input type="password" id="password" placeholder="Senha" required	
                        class="appearance-none relative block w-full px-4 py-3 border border-gray-300 dark:border-gray-600 placeholder-gray-500 text-gray-900 dark:text-gray-100 dark:bg-gray-700 rounded-lg focus:outline-none focus:ring-green-main focus:border-green-main focus:z-10 sm:text-sm shadow-sm pr-10"
                        value=""
                    >
                    <button type="button" id="toggle-password" class="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-100 focus:outline-none" title="Mostrar/Ocultar Senha">
                        <i id="toggle-password-icon" class="fas fa-eye"></i>
                    </button>
                </div>
                
                <div class="flex items-center justify-between">
                    <div class="flex items-center">
                        <input id="remember-me" name="remember-me" type="checkbox" ${rememberMeChecked}
                            class="h-4 w-4 text-green-main border-gray-300 dark:border-gray-600 rounded focus:ring-green-main">
                        <label for="remember-me" class="ml-2 block text-sm text-gray-900 dark:text-gray-100">
                            Lembrar Usuário
                        </label>
                    </div>
                </div>

                <button type="submit"	
                    class="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-green-main hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-main transition-all shadow-md">
                    <i class="fas fa-lock mr-2"></i>
                    Entrar
                </button>
            </form>
            
            <button type="button" onclick="updateState('loginView', 'solicitar')"
                class="group relative w-full flex justify-center py-3 px-4 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all shadow-md mt-4">
                <i class="fas fa-user-plus mr-2 text-indigo-500"></i>
                Solicitar Acesso
            </button>
        `;
    } else {
        content = renderSolicitarAcesso();
    }

    return `
        <div class="flex items-center justify-center min-h-screen bg-gray-900 dark:bg-gray-900">
            <div class="w-full max-w-md p-8 space-y-8 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-xl shadow-2xl border border-green-main/30 dark:border-green-main/50">
                ${content}
                <p class="text-xs text-center text-gray-500 dark:text-gray-400">
                    Usina Pitangueiras - "A ENERGIA QUE MOVE A REGIÃO"
                </p>
            </div>
        </div>
    `;
}

function renderSolicitarAcesso() {
    return `
        <div class="text-center">
            <h2 class="text-3xl font-extrabold text-gray-900 dark:text-gray-100">
                Solicitar Acesso
            </h2>
            <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
                Preencha seus dados para enviar a solicitação de perfil.
            </p>
        </div>
        <form id="form-solicitar-acesso" class="mt-8 space-y-4" onsubmit="handleSolicitarAcesso(event)">
            <div>
                <input type="text" name="solicitar-name" placeholder="Nome Completo" required	
                    class="appearance-none relative block w-full px-4 py-3 border border-gray-300 dark:border-gray-600 placeholder-gray-500 text-gray-900 dark:text-gray-100 dark:bg-gray-700 rounded-lg focus:outline-none focus:ring-green-main focus:border-green-main sm:text-sm shadow-sm"
                >
            </div>
            <div>
                <input type="email" name="solicitar-email" placeholder="Email (obrigatório para solicitação)" required	
                    class="appearance-none relative block w-full px-4 py-3 border border-gray-300 dark:border-gray-600 placeholder-gray-500 text-gray-900 dark:text-gray-100 dark:bg-gray-700 rounded-lg focus:outline-none focus:ring-green-main focus:border-green-main sm:text-sm shadow-sm"
                >
            </div>
            <div>
                <input type="tel" name="solicitar-phone" placeholder="Telefone (WhatsApp)" required	
                    class="appearance-none relative block w-full px-4 py-3 border border-gray-300 dark:border-gray-600 placeholder-gray-500 text-gray-900 dark:text-gray-100 dark:bg-gray-700 rounded-lg focus:outline-none focus:ring-green-main focus:ring-green-main sm:text-sm shadow-sm"
                >
            </div>
            <div>
                <input type="password" name="solicitar-temp-password" placeholder="Senha Provisória (Mín. 6 caracteres)" required minlength="6"	
                    class="appearance-none relative block w-full px-4 py-3 border border-gray-300 dark:border-gray-600 placeholder-gray-500 text-gray-900 dark:text-gray-100 dark:bg-gray-700 rounded-lg focus:outline-none focus:ring-green-main focus:border-green-main sm:text-sm shadow-sm"
                >
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400 text-left">A senha provisória será usada para configurar seu acesso inicial.</p>
            </div>
            
            <button type="submit"	
                class="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-500 hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all shadow-md">
                <i class="fas fa-paper-plane mr-2"></i>
                Enviar Solicitação
            </button>

            <button type="button" onclick="updateState('loginView', 'login')"
                class="group relative w-full flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all shadow-sm mt-3">
                <i class="fas fa-arrow-left mr-2"></i>
                Voltar para Login
            </button>
        </form>
    `;
}

function renderLoadingScreen() {
    return `
        <div class="flex flex-col items-center justify-center min-h-screen bg-gray-900 dark:bg-gray-900">
            <img src="https://usinapitangueiras.com.br/wp-content/uploads/2020/04/usina-pitangueiras-logo.png" alt="Logo Usina Pitangueiras"	
                class="h-40 w-auto mb-10 loader-logo-full"	
                onerror="this.onerror=null; this.src='https://placehold.co/200x100/40800c/FFFFFF?text=Logo'; this.alt='Logo Placeholder'">
                
            <h1 class="text-3xl font-extrabold text-green-main tracking-widest loading-text-animate">
                SISTEMA RÁDIOS
            </h1>
            <p class="mt-4 text-sm text-gray-300 dark:text-gray-300 italic loading-text-animate">Aguarde o carregamento...</p>
        </div>
    `;
}

// --- Funções para Ícones SVG ---
function getRadioIcon() {
    return `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect>
            <line x1="12" y1="4" x2="12" y2="20"></line>
            <path d="M5 8h2M5 12h2M5 16h2M17 8h2M17 12h2M17 16h2"></path>
            <circle cx="12" cy="12" r="3" fill="#ffffff" stroke="none"></circle>
        </svg>
    `;
}

function getActiveRadioIcon() {
    return `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v6"></path>
            <path d="M16 4h4a2 2 0 0 1 2 2v2M8 4H4a2 2 0 0 0-2 2v2"></path>
            <path d="M20 12h2M2 12h2"></path>
            <path d="M18 16h4a2 2 0 0 1 2 2v2M6 16H2a2 2 0 0 0-2 2v2"></path>
            <circle cx="12" cy="12" r="3" fill="#ffffff" stroke="none"></circle>
            <path d="M12 15v7"></path>
        </svg>
    `;
}

function getMaintenanceIcon() {
    return `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.4 1.4a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.77 3.77z"></path>
        </svg>
    `;
}

function getWarehouseIcon() {
    return `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 21V8a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v13"></path>
            <path d="M3 13h18"></path>
            <path d="M3 17h18"></path>
            <path d="M10 3L12 6L14 3"></path>
            <rect x="5" y="10" width="4" height="4" rx="1"></rect>
            <rect x="15" y="10" width="4" height="4" rx="1"></rect>
        </svg>
    `;
}

function getSinistroIcon() {
    return `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12" y2="17"></line>
        </svg>
    `;
}

function getBordoIcon() {
    return `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
            <rect x="9" y="9" width="6" height="6"></rect>
            <path d="M15 2h2"></path><path d="M15 22h2"></path><path d="M2 15v2"></path><path d="M22 15v2"></path>
            <path d="M9 2h-2"></path><path d="M9 22h-2"></path><path d="M2 9v2"></path><path d="M22 9v2"></path>
        </svg>
    `;
}

function getBordoKitIcon() {
    return `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="9" width="20" height="13" rx="2" ry="2"></rect>
            <path d="M12 2v7"></path>
            <path d="M7 6h10"></path>
            <path d="M7 14h10"></path>
            <path d="M7 18h10"></path>
        </svg>
    `;
}

function getUserAvatar(user) {
    const defaultColor = 'bg-indigo-500';
    const initials = (user.name || 'NN').split(' ').map(n => n[0]).join('').toUpperCase();
    const photoURL = user.photoURL || null; 

    if (photoURL) {
        return `<img src="${photoURL}" alt="Avatar de ${user.name}" class="h-8 w-8 rounded-full object-cover shadow-md" onerror="this.onerror=null; this.src='https://placehold.co/32x32/40800c/FFFFFF?text=${initials}';">`;
    }

    return `
        <div class="h-8 w-8 rounded-full ${defaultColor} flex items-center justify-center text-white font-bold text-sm shadow-md ring-2 ring-green-main/50">
            ${initials}
        </div>
    `;
}

function renderDashboard() {
    
    // --- 1. Cálculos de Rádios ---
    const activeRadios = dbRadios.filter(r => r.ativo !== false);
    const totalRadios = activeRadios.length;
    const radiosEmUso = activeRadios.filter(r => r.status === 'Em Uso').length;
    const radiosDisponiveis = activeRadios.filter(r => r.status === 'Disponível').length;
    const radiosManutencao = activeRadios.filter(r => r.status === 'Manutenção').length;
    const radiosSinistro = activeRadios.filter(r => r.status === 'Sinistro').length;

    // --- 2. Cálculos de Bordos (Início) ---
    const activeBordos = dbBordos.filter(b => b.ativo !== false);

    // --- Cálculo de Stats de Bordos (Resumo por Tipo) ---
    const bordoStats = {
        Tela: { Total: 0, 'Em Uso': 0, 'Disponível': 0, 'Manutenção': 0, 'Sinistro': 0 },
        Mag: { Total: 0, 'Em Uso': 0, 'Disponível': 0, 'Manutenção': 0, 'Sinistro': 0 },
        Chip: { Total: 0, 'Em Uso': 0, 'Disponível': 0, 'Manutenção': 0, 'Sinistro': 0 }
    };
    
    activeBordos.forEach(b => {
        if (bordoStats[b.tipo]) {
            bordoStats[b.tipo].Total++;
            const statusKey = b.status || 'Disponível';
            if (bordoStats[b.tipo][statusKey] !== undefined) {
                bordoStats[b.tipo][statusKey]++;
            }
        }
    });

    // "Total Kits Bordo" (Total de kits completos que a empresa possui)
    const totalBordos = Math.min(bordoStats.Tela.Total, bordoStats.Mag.Total, bordoStats.Chip.Total);
    
    // "Kits em Uso" (Total de kits completos instalados)
    const bordosEmUso = dbRegistros.filter(reg => reg.telaId && reg.magId && reg.chipId).length;
    
    // Contagem de Disponíveis (para "Kits Disponíveis")
    const bordosDisponiveis = activeBordos.filter(b => b.status === 'Disponível');
    const dispTelas = bordosDisponiveis.filter(b => b.tipo === 'Tela').length;
    const dispMags = bordosDisponiveis.filter(b => b.tipo === 'Mag').length;
    const dispChips = bordosDisponiveis.filter(b => b.tipo === 'Chip').length;
    const kitsDisponiveis = Math.min(dispTelas, dispMags, dispChips);
    
    // Contagem de Manutenção
    const bordosManutencao = activeBordos.filter(b => b.status === 'Manutenção');
    const manutTelas = bordosManutencao.filter(b => b.tipo === 'Tela').length;
    const manutMags = bordosManutencao.filter(b => b.tipo === 'Mag').length;

    // Contagem de Sinistro
    const bordosSinistro = activeBordos.filter(b => b.status === 'Sinistro');
    const sinistroTelas = bordosSinistro.filter(b => b.tipo === 'Tela').length;
    const sinistroMags = bordosSinistro.filter(b => b.tipo === 'Mag').length;
    const sinistroChips = bordosSinistro.filter(b => b.tipo === 'Chip').length;

    // --- 3. Cálculos da Tabela de Equipamentos (Vínculos) ---
    const equipamentoMap = dbEquipamentos.reduce((acc, e) => { acc[e.id] = e; return acc; }, {});
    const groupCounts = {};
    GROUPS.forEach(g => groupCounts[g] = 0);

    // Conta os registros de vínculo por grupo
    dbRegistros.forEach(reg => {
        const equipamento = equipamentoMap[reg.equipamentoId];
        if (equipamento && equipamento.grupo && GROUPS.includes(equipamento.grupo)) {
            groupCounts[equipamento.grupo]++;
        }
    });
    
    // --- 5. Helper de Renderização de Card ---
    const _renderStatCard = (title, value, iconClass, colorClass, details = null) => {
        return `
            <div class="${colorClass} bg-opacity-10 dark:${colorClass} dark:bg-opacity-20 rounded-xl shadow-lg p-4 border border-${colorClass}/20 futuristic-card">
                <div class="flex items-center space-x-3">
                    <div class="p-2 rounded-full ${colorClass} text-white">
                        <i class="fas ${iconClass} fa-lg"></i>
                    </div>
                    <div>
                        <p class="text-sm font-semibold text-${colorClass} dark:text-${colorClass}-300">${title}</p>
                        <p class="text-3xl font-bold text-gray-900 dark:text-gray-100">${value}</p>
                    </div>
                </div>
                ${details ? `<div class="mt-2 text-xs text-gray-700 dark:text-gray-300">${details}</div>` : ''}
            </div>
        `;
    };

    // --- 6. Geração do HTML dos Cards ---
    
    // Rádios
    const cardHtmlRadios = `
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            ${_renderStatCard('Total Rádios', totalRadios, 'fa-broadcast-tower', 'bg-blue-600')}
            ${_renderStatCard('Em Uso', radiosEmUso, 'fa-wifi', 'bg-green-main')}
            ${_renderStatCard('Disponíveis', radiosDisponiveis, 'fa-check-circle', 'bg-sky-500')}
            ${_renderStatCard('Manutenção', radiosManutencao, 'fa-tools', 'bg-yellow-500')}
            ${_renderStatCard('Sinistro', radiosSinistro, 'fa-exclamation-triangle', 'bg-red-600')}
        </div>
    `;
    
    // Bordos
    const cardHtmlBordos = `
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            ${_renderStatCard('Total Componentes', totalBordos, 'fa-memory', 'bg-blue-600')}
            
            ${_renderStatCard('Kits em Uso', bordosEmUso, 'fa-microchip', 'bg-green-main')}
            
            ${_renderStatCard('Kits Disponíveis', kitsDisponiveis, 'fa-boxes', 'bg-sky-500')}
            
            ${_renderStatCard('Manutenção', manutTelas + manutMags, 'fa-tools', 'bg-yellow-500', 
                `Tela: ${manutTelas}<br>Mag: ${manutMags}`)}
            ${_renderStatCard('Sinistro', sinistroTelas + sinistroMags + sinistroChips, 'fa-exclamation-triangle', 'bg-red-600', 
                `Tela: ${sinistroTelas}<br>Mag: ${sinistroMags}<br>Chip: ${sinistroChips}`)}
        </div>
    `;

    // --- 7. Geração do HTML das Tabelas ---

    // Tabela de Equipamentos
    const tableRowsEquipamentos = GROUPS.map(group => {
        const count = groupCounts[group] || 0;
        return `
            <tr class="dashboard-table-row border-b dark:border-gray-700">
                <td class="px-6 py-3 text-sm font-medium text-gray-700 dark:text-gray-100">${group}</td>
                <td class="px-6 py-3 text-sm text-gray-700 dark:text-gray-100">${count}</td>
            </tr>
        `;
    }).join('');
    
    const totalEquipamentos = dbRegistros.length;
    
    // Tabela de Bordos (Resumo por tipo/componente)
    const tableRowsBordos = TIPOS_BORDO.map(tipo => {
        const stats = bordoStats[tipo];
        return `
            <tr class="dashboard-table-row border-b dark:border-gray-700">
                <td class="px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-100">${tipo}</td>
                <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-100">${stats.Total}</td>
                <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-100">${stats['Em Uso']}</td>
                <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-100">${stats['Disponível']}</td>
                <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-100">${stats['Manutenção']}</td>
                <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-100">${stats['Sinistro']}</td>
            </tr>
        `;
    }).join('');

    // --- 8. Retorno do HTML Final ---
    return `
        <div class="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
            <h2 class="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6 text-center">Dashboard de Rádios e Frota</h2>

            <h3 class="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4">Rádios</h3>
            <div class="mb-10">
                ${cardHtmlRadios}
            </div>
            
            <h3 class="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4">Bordos</h3>
            <div class="mb-10">
                ${cardHtmlBordos}
            </div>
            
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-10">
            
                <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 border border-gray-200 dark:border-gray-700 futuristic-card">
                    <h3 class="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center">
                        <i class="fas fa-boxes mr-2 text-green-main"></i>	
                        Equipamentos com Vínculo Ativo - Total: ${totalEquipamentos}
                    </h3>
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead class="bg-green-main/10 dark:bg-green-main/30">
                                <tr>
                                    <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-200 uppercase tracking-wider w-3/5">Grupo</th>
                                    <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-200 uppercase tracking-wider w-2/5">Frotas Vinculadas</th>
                                </tr>
                            </thead>
                            <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                ${tableRowsEquipamentos}
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 border border-gray-200 dark:border-gray-700 futuristic-card">
                   <h3 class="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center">
                        <i class="fas fa-microchip mr-2 text-blue-500"></i>	
                        Resumo de Componentes de Bordo - Total Kits: ${totalBordos}
                    </h3>
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead class="bg-blue-500/10 dark:bg-blue-500/30">
                                <tr>
                                    <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-200 uppercase tracking-wider">Tipo</th>
                                    <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-200 uppercase tracking-wider">Total</th>
                                    <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-200 uppercase tracking-wider">Uso</th>
                                    <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-200 uppercase tracking-wider">Disp.</th>
                                    <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-200 uppercase tracking-wider">Manut.</th>
                                    <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-200 uppercase tracking-wider">Sinist.</th>
                                </tr>
                            </thead>
                            <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                ${tableRowsBordos}
                            </tbody>
                        </table>
                    </div>
                </div>
                
            </div>
        </div>
    `;
}

function renderCadastro() {
    const tabs = [
        { id: 'radio', name: 'Rádio' },
        { id: 'equipamento', name: 'Equipamentos' },
        { id: 'bordos', name: 'Bordos' },
        { id: 'geral', name: 'Geral' }
    ];
    
    const tabNav = tabs.map(tab => {
        const isActive = currentCadastroTab === tab.id;
        const activeClass = isActive ? 'text-green-main border-green-main font-semibold' : 'text-gray-500 dark:text-gray-300 border-transparent hover:text-green-main';
        return `<button data-tab="${tab.id}" class="py-2 px-4 border-b-2 ${activeClass} transition-colors text-sm sm:text-base">${tab.name}</button>`;
    }).join('');
    
    let content = '';
    switch (currentCadastroTab) {
        case 'radio': content = renderCadastroRadio(); break;
        case 'equipamento': content = renderCadastroEquipamento(); break;
        case 'bordos': content = renderCadastroBordos(); break;
        case 'geral': content = renderCadastroGeral(); break;
    }

    return `
        <div class="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
            <h2 class="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6 text-center">Cadastro de Rádios, Equipamentos e Bordos</h2>
            <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
                <div id="cadastro-nav" class="flex border-b border-gray-200 dark:border-gray-700 px-6 pt-2 overflow-x-auto">${tabNav}</div>
                <div class="p-6">${content}</div>
            </div>
        </div>
    `;
}

function renderCadastroRadio() {
    const activeRadiosCount = dbRadios.filter(r => r.ativo !== false).length;

    const filteredRadios = dbRadios.filter(r =>	
        (r.serie || '').toLowerCase().includes(radioSearch) ||	
        (r.modelo || '').toLowerCase().includes(radioSearch)
    );

    filteredRadios.sort((a, b) => {
        const aAtivo = a.ativo !== false;
        const bAtivo = b.ativo !== false;

        if (aAtivo && !bAtivo) return -1;
        if (!aAtivo && bAtivo) return 1; 
        
        return (a.serie || '').localeCompare(b.serie || '');
    });
    
    const totalRadioPages = Math.ceil(filteredRadios.length / PAGE_SIZE);
    radioPage = Math.min(radioPage, totalRadioPages) || 1;
    const paginatedRadios = filteredRadios.slice((radioPage - 1) * PAGE_SIZE, radioPage * PAGE_SIZE);

    const statusOptions = DISPONIBLE_STATUSES.map(s => `<option value="${s}">${s}</option>`).join('');

    const tableRows = paginatedRadios.map(r => {
        const isAtivo = r.ativo !== false;
        const rowClass = isAtivo ? 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b dark:border-gray-700' : 'hover:bg-red-50 dark:hover:bg-red-900/10 border-b dark:border-gray-700 opacity-60 italic';
        const statusText = isAtivo ? r.status || 'Disponível' : 'INATIVO';
        const statusClass = isAtivo ? (r.status === 'Disponível' ? 'text-green-main' : (r.status === 'Manutenção' ? 'text-yellow-600' : (r.status === 'Sinistro' ? 'text-red-700' : 'text-blue-600'))) : 'text-red-600';
        
        return `
            <tr class="${rowClass}">
                <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 font-mono">${r.serie}</td>
                <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">${r.modelo}</td>
                <td class="px-4 py-2 text-sm font-semibold ${statusClass}">${statusText}</td>
                <td class="px-4 py-2 whitespace-nowrap text-sm font-medium space-x-2">
                    <button onclick="loadRadioForEdit('${r.id}')" class="text-indigo-600 hover:text-indigo-900 p-1 rounded-full hover:bg-indigo-50 dark:hover:bg-gray-700" title="Editar Rádio">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${(() => {
                        const actionText = isAtivo ? 'INATIVAR' : 'ATIVAR';
                        const iconClass = isAtivo ? 'fa-toggle-on text-green-main' : 'fa-toggle-off text-gray-500 dark:text-gray-400'; 
                        const btnClass = isAtivo ? 'hover:text-red-900' : 'hover:text-green-main';
                        const title = isAtivo ? 'Inativar Rádio' : 'Ativar Rádio';
                        return `
                        <button onclick="showConfirmModal('Confirmar ${actionText}ÇÃO', 'Deseja realmente ${actionText} o Rádio ${r.serie}?', () => toggleRecordAtivo('radios', '${r.id}'))" class="${btnClass} p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700" title="${title}">
                            <i class="fas ${iconClass} fa-lg"></i>
                        </button>
                        `;
                    })()}
                </td>
            </tr>
        `;
    }).join('');

    let radioPaginator = '';
    if (filteredRadios.length > PAGE_SIZE) {
        radioPaginator = '<div class="flex justify-center items-center space-x-2 mt-4">';
        radioPaginator += `<button ${radioPage === 1 ? 'disabled' : ''} onclick="setRadioPage(-1)" class="px-2 py-1 text-sm rounded-md ${radioPage === 1 ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500' : 'bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-100'}">Anterior</button>`;
        radioPaginator += `<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Pág ${radioPage} de ${totalRadioPages}</span>`;
        radioPaginator += `<button ${radioPage === totalRadioPages ? 'disabled' : ''} onclick="setRadioPage(1)" class="px-2 py-1 text-sm rounded-md ${radioPage === totalRadioPages ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500' : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-100'}">Próxima</button>`;
        radioPaginator += '</div>';
    }

    return `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-1 bg-gray-50 dark:bg-gray-900 p-4 rounded-xl shadow-inner border border-gray-200 dark:border-gray-700">
                <h4 class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Novo/Editar Rádio</h4>
                <form id="form-radio" class="space-y-4">
                    <input type="hidden" id="radio-id">
                    <div>
                        <label for="radio-serie" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Número de Série <span class="text-red-500">*</span></label>
                        <input type="text" id="radio-serie" required placeholder="Ex: 112sar234s"
                            class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border dark:bg-gray-700 dark:text-gray-100">
                    </div>
                    <div>
                        <label for="radio-modelo" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Modelo de Rádio <span class="text-red-500">*</span></label>
                        <input type="text" id="radio-modelo" required placeholder="Ex: EM200"
                            class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border dark:bg-gray-700 dark:text-gray-100">
                    </div>
                    <div>
                        <label for="radio-status" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                        <select id="radio-status" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border bg-white dark:bg-gray-700 dark:text-gray-100">
                            ${statusOptions}
                            <option value="Em Uso" disabled>Em Uso (automático)</option>
                        </select>
                    </div>
                    <div class="flex space-x-3">
                        <button type="submit" class="flex-1 w-full flex justify-center py-2 px-3 border border-transparent text-sm font-medium rounded-lg text-white bg-green-main hover:bg-green-700 shadow-md">
                            <i class="fas fa-save mr-2"></i> Salvar
                        </button>
                        <button type="button" onclick="document.getElementById('form-radio').reset(); document.getElementById('radio-id').value='';" class="w-1/4 flex justify-center py-2 px-3 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 shadow-sm">
                            <i class="fas fa-redo"></i>
                        </button>
                    </div>
                </form>
                <div class="flex justify-between items-center mt-4">
                    <input type="file" id="radio-import-file" accept=".csv, .xlsx, .xls" class="hidden" onchange="handleImport('radios', event)">
                    <button onclick="document.getElementById('radio-import-file').click()" class="flex-1 flex justify-center py-2 px-3 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-500 hover:bg-indigo-600 shadow-md">
                        <i class="fas fa-upload mr-2"></i> Importar (csv, xlsx)
                    </button>
                    <button onclick="showModal('Instruções de Importação - Rádio', window.RADIO_IMPORT_INFO, 'info')" class="ml-2 p-2 text-indigo-500 hover:text-indigo-700 transition-colors rounded-full" title="Instruções de arquivo">
                        <i class="fas fa-info-circle"></i>
                    </button>
                </div>
            </div>

            <div class="lg:col-span-2">
                <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-2">
                    <h4 class="text-lg font-semibold text-gray-800 dark:text-gray-100">Rádios Cadastrados (Ativos: ${activeRadiosCount})</h4>
                    <input type="text" id="radio-search-input" value="${radioSearch}"	
                        oninput="handleSearchInput(this, 'radioSearch', 1)"	
                        placeholder="Buscar Série ou Modelo..."	
                        class="rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border text-sm w-full sm:w-1/2 dark:bg-gray-700 dark:text-gray-100">
                </div>
                <div class="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl shadow-inner overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead class="bg-gray-50 dark:bg-gray-900">
                            <tr>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Série</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Modelo</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Status</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Ações</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">${paginatedRadios.map(r => {
                            const isAtivo = r.ativo !== false;
                            const rowClass = isAtivo ? 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b dark:border-gray-700' : 'hover:bg-red-50 dark:hover:bg-red-900/10 border-b dark:border-gray-700 opacity-60 italic';
                            const statusText = isAtivo ? r.status || 'Disponível' : 'INATIVO';
                            const statusClass = isAtivo ? (r.status === 'Disponível' ? 'text-green-main' : (r.status === 'Manutenção' ? 'text-yellow-600' : (r.status === 'Sinistro' ? 'text-red-700' : 'text-blue-600'))) : 'text-red-600';
                            return `
                                <tr class="${rowClass}">
                                    <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 font-mono">${r.serie}</td>
                                    <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">${r.modelo}</td>
                                    <td class="px-4 py-2 text-sm font-semibold ${statusClass}">${statusText}</td>
                                    <td class="px-4 py-2 whitespace-nowrap text-sm font-medium space-x-2">
                                        <button onclick="loadRadioForEdit('${r.id}')" class="text-indigo-600 hover:text-indigo-900 p-1 rounded-full hover:bg-indigo-50 dark:hover:bg-gray-700" title="Editar Rádio">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        ${(() => {
                                            const actionText = isAtivo ? 'INATIVAR' : 'ATIVAR';
                                            const iconClass = isAtivo ? 'fa-toggle-on text-green-main' : 'fa-toggle-off text-gray-500 dark:text-gray-400';
                                            const btnClass = isAtivo ? 'hover:text-red-900' : 'hover:text-green-main';
                                            const title = isAtivo ? 'Inativar Rádio' : 'Ativar Rádio';
                                            return `
                                            <button onclick="showConfirmModal('Confirmar ${actionText}ÇÃO', 'Deseja realmente ${actionText} o Rádio ${r.serie}?', () => toggleRecordAtivo('radios', '${r.id}'))" class="${btnClass} p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700" title="${title}">
                                                <i class="fas ${iconClass} fa-lg"></i>
                                            </button>
                                            `;
                                        })()}
                                    </td>
                                </tr>
                            `;
                        }).join('')}</tbody>
                    </table>
                </div>
                ${radioPaginator}
            </div>
        </div>
    `;
}

function renderCadastroEquipamento() {
    const activeEquipamentosCount = dbEquipamentos.filter(e => e.ativo !== false).length;

    const filteredEquipamentos = dbEquipamentos.filter(e =>	
        (e.frota || '').toLowerCase().includes(equipamentoSearch) ||
        (e.grupo || '').toLowerCase().includes(equipamentoSearch) ||
        (e.modelo || '').toLowerCase().includes(equipamentoSearch) ||
        (e.subgrupo || '').toLowerCase().includes(equipamentoSearch)
    );

    filteredEquipamentos.sort((a, b) => {
        const aAtivo = a.ativo !== false;
        const bAtivo = b.ativo !== false;

        if (aAtivo && !bAtivo) return -1;
        if (!aAtivo && bAtivo) return 1; 

        return (a.frota || '').localeCompare(b.frota || '');
    });

    const totalEquipamentoPages = Math.ceil(filteredEquipamentos.length / PAGE_SIZE);
    equipamentoPage = Math.min(equipamentoPage, totalEquipamentoPages) || 1;
    const paginatedEquipamentos = filteredEquipamentos.slice((equipamentoPage - 1) * PAGE_SIZE, equipamentoPage * PAGE_SIZE);
    
    const tableRows = paginatedEquipamentos.map(e => {
        const isAtivo = e.ativo !== false;
        const rowClass = isAtivo ? 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b dark:border-gray-700' : 'hover:bg-red-50 dark:hover:bg-red-900/10 border-b dark:border-gray-700 opacity-60 italic';
        const frotaClass = isAtivo ? 'text-gray-700 dark:text-gray-300' : 'text-red-700 dark:text-red-400';
        
        const registro = dbRegistros.find(reg => reg.equipamentoId === e.id);
        const isLinked = !!registro;

        return `
            <tr class="${rowClass}">
                <td class="px-4 py-2 text-sm ${frotaClass} font-mono">${e.frota} ${isAtivo ? '' : '(INATIVO)'}</td>
                <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">${e.grupo}</td>
                <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">${e.modelo}</td>
                <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hidden md:table-cell">${e.subgrupo || 'N/A'}</td>
                <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hidden lg:table-cell">${e.gestor || 'N/A'}</td>
                <td class="px-4 py-2 whitespace-nowrap text-sm font-medium space-x-2 flex items-center">
                    <button onclick="loadEquipamentoForEdit('${e.id}')" class="text-indigo-600 hover:text-indigo-900 p-1 rounded-full hover:bg-indigo-50 dark:hover:bg-gray-700" title="Editar Equipamento">
                        <i class="fas fa-edit"></i>
                    </button>
                    
                    ${(isAtivo && !isLinked) ? `
                        <button onclick="showVincularModal('${e.id}', 'radio')" 
                            class="text-green-main hover:text-green-700 p-1 rounded-full hover:bg-green-50/50 dark:hover:bg-gray-700" 
                            title="Iniciar Vínculo (Rádio ou Bordos)">
                            <i class="fas fa-link fa-lg"></i>
                        </button>
                    ` : (isAtivo && isLinked) ? `
                        <button onclick="updateState('cadastroTab', 'geral'); geralSearch = '${e.frota.toLowerCase()}'" 
                            class="text-blue-600 hover:text-blue-800 p-1 rounded-full hover:bg-blue-50/50 dark:hover:bg-gray-700" 
                            title="Gerenciar Vínculos na Aba Geral">
                            <i class="fas fa-layer-group fa-lg"></i>
                        </button>
                    ` : ''}
                    
                    ${(() => {
                        const actionText = isAtivo ? 'INATIVAR' : 'ATIVAR';
                        const iconClass = isAtivo ? 'fa-toggle-on text-green-main' : 'fa-toggle-off text-gray-500 dark:text-gray-400';
                        const btnClass = isAtivo ? 'hover:text-red-900' : 'hover:text-green-main';
                        const title = isAtivo ? 'Inativar Equipamento' : 'Ativar Equipamento';
                        return `
                        <button onclick="showConfirmModal('Confirmar ${actionText}ÇÃO', 'Deseja realmente ${actionText} o Equipamento ${e.frota}?', () => toggleRecordAtivo('equipamentos', '${e.id}'))" class="${btnClass} p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700" title="${title}">
                            <i class="fas ${iconClass} fa-lg"></i>
                        </button>
                        `;
                    })()}
                </td>
            </tr>
        `;
    }).join('');
    
    const groupOptions = GROUPS.map(g => `<option value="${g}">${g}</option>`).join('');

    let equipamentoPaginator = '';
    if (filteredEquipamentos.length > PAGE_SIZE) {
        equipamentoPaginator = '<div class="flex justify-center items-center space-x-2 mt-4">';
        equipamentoPaginator += `<button ${equipamentoPage === 1 ? 'disabled' : ''} onclick="setEquipamentoPage(-1)" class="px-2 py-1 text-sm rounded-md ${equipamentoPage === 1 ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500' : 'bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-100'}">Anterior</button>`;
        equipamentoPaginator += `<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Pág ${equipamentoPage} de ${totalEquipamentoPages}</span>`;
        equipamentoPaginator += `<button ${equipamentoPage === totalEquipamentoPages ? 'disabled' : ''} onclick="setEquipamentoPage(1)" class="px-2 py-1 text-sm rounded-md ${equipamentoPage === totalEquipamentoPages ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500' : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-100'}">Próxima</button>`;
        equipamentoPaginator += '</div>';
    }

    return `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-1 bg-gray-50 dark:bg-gray-900 p-4 rounded-xl shadow-inner border border-gray-200 dark:border-gray-700">
                <h4 class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Novo/Editar Equipamento</h4>
                <form id="form-equipamento" class="space-y-4">
                    <input type="hidden" id="equipamento-id">
                    <div>
                        <label for="equipamento-frota" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Frota <span class="text-red-500">*</span></label>
                        <input type="text" id="equipamento-frota" required placeholder="Ex: 123456"
                            class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border dark:bg-gray-700 dark:text-gray-100">
                    </div>
                    <div>
                        <label for="equipamento-grupo" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Grupo <span class="text-red-500">*</span></label>
                        <select id="equipamento-grupo" required
                            class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border bg-white dark:bg-gray-700 dark:text-gray-100">
                            <option value="">Selecione o Grupo</option>
                            ${groupOptions}
                        </select>
                    </div>
                    <div>
                        <label for="equipamento-modelo" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Modelo do Equipamento <span class="text-red-500">*</span></label>
                        <input type="text" id="equipamento-modelo" required placeholder="Ex: Trator XYZ"
                            class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border dark:bg-gray-700 dark:text-gray-100">
                    </div>
                    <div>
                        <label for="equipamento-subgrupo" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Subgrupo <span class="text-red-500">*</span></label>
                        <input type="text" id="equipamento-subgrupo" required placeholder="Ex: Ferirrigação, Tratos Culturais"
                            class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border dark:bg-gray-700 dark:text-gray-100">
                    </div>
                    <div>
                        <label for="equipamento-gestor" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Gestor (Opcional)</label>
                        <input type="text" id="equipamento-gestor" placeholder="Ex: João da Silva"
                            class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border dark:bg-gray-700 dark:text-gray-100">
                    </div>
                    <div class="flex space-x-3">
                        <button type="submit" class="flex-1 w-full flex justify-center py-2 px-3 border border-transparent text-sm font-medium rounded-lg text-white bg-green-main hover:bg-green-700 shadow-md">
                            <i class="fas fa-save mr-2"></i> Salvar
                        </button>
                        <button type="button" onclick="document.getElementById('form-equipamento').reset(); document.getElementById('equipamento-id').value='';" class="w-1/4 flex justify-center py-2 px-3 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 shadow-sm">
                            <i class="fas fa-redo"></i>
                        </button>
                    </div>
                </form>
                <div class="flex justify-between items-center mt-4">
                    <input type="file" id="equipamento-import-file" accept=".csv, .xlsx, .xls" class="hidden" onchange="handleImport('equipamentos', event)">
                    <button onclick="document.getElementById('equipamento-import-file').click()" class="flex-1 flex justify-center py-2 px-3 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-500 hover:bg-indigo-600 shadow-md">
                        <i class="fas fa-upload mr-2"></i> Importar (csv, xlsx)
                    </button>
                    <button onclick="showModal('Instruções de Importação - Equipamento', window.EQUIPAMENTO_IMPORT_INFO, 'info')" class="ml-2 p-2 text-indigo-500 hover:text-indigo-700 transition-colors rounded-full" title="Instruções de arquivo">
                        <i class="fas fa-info-circle"></i>
                    </button>
                </div>
            </div>
            <div class="lg:col-span-2">
                <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-2">
                    <h4 class="text-lg font-semibold text-gray-800 dark:text-gray-100">Equipamentos Cadastrados (Ativos: ${activeEquipamentosCount})</h4>
                    <input type="text" id="equip-search-input" value="${equipamentoSearch}"	
                        oninput="handleSearchInput(this, 'equipamentoSearch', 1)"	
                        placeholder="Buscar Frota, Grupo ou Modelo..."	
                        class="rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border text-sm w-full sm:w-1/2 dark:bg-gray-700 dark:text-gray-100">
                </div>
                <div class="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl shadow-inner overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead class="bg-gray-50 dark:bg-gray-900">
                            <tr>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Frota</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Grupo</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Modelo</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase hidden md:table-cell">Subgrupo</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase hidden lg:table-cell">Gestor</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Ações</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">${paginatedEquipamentos.map(e => {
                            const isAtivo = e.ativo !== false;
                            const rowClass = isAtivo ? 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b dark:border-gray-700' : 'hover:bg-red-50 dark:hover:bg-red-900/10 border-b dark:border-gray-700 opacity-60 italic';
                            const frotaClass = isAtivo ? 'text-gray-700 dark:text-gray-300' : 'text-red-700 dark:text-red-400';
                            
                            const registro = dbRegistros.find(reg => reg.equipamentoId === e.id);
                            const isLinked = !!registro;

                            return `
                                <tr class="${rowClass}">
                                    <td class="px-4 py-2 text-sm ${frotaClass} font-mono">${e.frota} ${isAtivo ? '' : '(INATIVO)'}</td>
                                    <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">${e.grupo}</td>
                                    <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">${e.modelo}</td>
                                    <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hidden md:table-cell">${e.subgrupo || 'N/A'}</td>
                                    <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hidden lg:table-cell">${e.gestor || 'N/A'}</td>
                                    <td class="px-4 py-2 whitespace-nowrap text-sm font-medium space-x-2 flex items-center">
                                        <button onclick="loadEquipamentoForEdit('${e.id}')" class="text-indigo-600 hover:text-indigo-900 p-1 rounded-full hover:bg-indigo-50 dark:hover:bg-gray-700" title="Editar Equipamento">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        
                                        ${(isAtivo && !isLinked) ? `
                                            <button onclick="showVincularModal('${e.id}', 'radio')" 
                                                class="text-green-main hover:text-green-700 p-1 rounded-full hover:bg-green-50/50 dark:hover:bg-gray-700" 
                                                title="Iniciar Vínculo (Rádio ou Bordos)">
                                                <i class="fas fa-link fa-lg"></i>
                                            </button>
                                        ` : (isAtivo && isLinked) ? `
                                            <button onclick="updateState('cadastroTab', 'geral'); geralSearch = '${e.frota.toLowerCase()}'" 
                                                class="text-blue-600 hover:text-blue-800 p-1 rounded-full hover:bg-blue-50/50 dark:hover:bg-gray-700" 
                                                title="Gerenciar Vínculos na Aba Geral">
                                                <i class="fas fa-layer-group fa-lg"></i>
                                            </button>
                                        ` : ''}
                                        
                                        ${(() => {
                                            const actionText = isAtivo ? 'INATIVAR' : 'ATIVAR';
                                            const iconClass = isAtivo ? 'fa-toggle-on text-green-main' : 'fa-toggle-off text-gray-500 dark:text-gray-400';
                                            const btnClass = isAtivo ? 'hover:text-red-900' : 'hover:text-green-main';
                                            const title = isAtivo ? 'Inativar Equipamento' : 'Ativar Equipamento';
                                            return `
                                            <button onclick="showConfirmModal('Confirmar ${actionText}ÇÃO', 'Deseja realmente ${actionText} o Equipamento ${e.frota}?', () => toggleRecordAtivo('equipamentos', '${e.id}'))" class="${btnClass} p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700" title="${title}">
                                                <i class="fas ${iconClass} fa-lg"></i>
                                            </button>
                                            `;
                                        })()}
                                    </td>
                                </tr>
                            `;
                        }).join('')}</tbody>
                    </table>
                </div>
                ${equipamentoPaginator}
            </div>
        </div>
    `;
}

function renderCadastroBordos() {
    const activeBordosCount = dbBordos.filter(b => b.ativo !== false).length;

    const filteredBordos = dbBordos.filter(b =>	
        (b.numeroSerie || '').toLowerCase().includes(bordosSearch) ||
        (b.modelo || '').toLowerCase().includes(bordosSearch) ||
        (b.tipo || '').toLowerCase().includes(bordosSearch)
    );

    filteredBordos.sort((a, b) => {
        if (!a || !a.ativo) return 1;
        if (!b || !b.ativo) return -1;
        
        const aAtivo = a.ativo !== false;
        const bAtivo = b.ativo !== false;

        if (aAtivo && !bAtivo) return -1; 
        if (!aAtivo && bAtivo) return 1; 
        
        const tipoA = a.tipo || '';
        const tipoB = b.tipo || '';
        if (tipoA !== tipoB) return tipoA.localeCompare(tipoB);
        
        const serieA = a.numeroSerie || '';
        const serieB = b.numeroSerie || '';
        return serieA.localeCompare(serieB);
    });
    
    const totalBordosPages = Math.ceil(filteredBordos.length / PAGE_SIZE);
    bordosPage = Math.min(bordosPage, totalBordosPages) || 1;
    const paginatedBordos = filteredBordos.slice((bordosPage - 1) * PAGE_SIZE, bordosPage * PAGE_SIZE);

    const statusOptions = DISPONIBLE_STATUSES.map(s => `<option value="${s}">${s}</option>`).join('');

    const tableRows = paginatedBordos.map(b => {
        const isAtivo = b.ativo !== false;
        const rowClass = isAtivo ? 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b dark:border-gray-700' : 'hover:bg-red-50 dark:hover:bg-red-900/10 border-b dark:border-gray-700 opacity-60 italic';
        const statusText = isAtivo ? b.status || 'Disponível' : 'INATIVO';
        const statusClass = isAtivo ? (b.status === 'Disponível' ? 'text-green-main' : (b.status === 'Manutenção' ? 'text-yellow-600' : (b.status === 'Sinistro' ? 'text-red-700' : 'text-blue-600'))) : 'text-red-600';
        
        const tipoClass = b.tipo === 'Tela' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' 
                        : b.tipo === 'Mag' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300' 
                        : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300';
        
        return `
            <tr class="${rowClass}">
                <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${tipoClass}">${b.tipo}</span>
                </td>
                <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 font-mono">${b.numeroSerie}</td>
                <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">${b.modelo}</td>
                <td class="px-4 py-2 text-sm font-semibold ${statusClass}">${statusText}</td>
                <td class="px-4 py-2 whitespace-nowrap text-sm font-medium space-x-2">
                    <button onclick="loadBordoForEdit('${b.id}')" class="text-indigo-600 hover:text-indigo-900 p-1 rounded-full hover:bg-indigo-50 dark:hover:bg-gray-700" title="Editar Bordo">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${(() => {
                        const actionText = isAtivo ? 'INATIVAR' : 'ATIVAR';
                        const iconClass = isAtivo ? 'fa-toggle-on text-green-main' : 'fa-toggle-off text-gray-500 dark:text-gray-400';
                        const btnClass = isAtivo ? 'hover:text-red-900' : 'hover:text-green-main';
                        const title = isAtivo ? 'Inativar Bordo' : 'Ativar Bordo';
                        return `
                        <button onclick="showConfirmModal('Confirmar ${actionText}ÇÃO', 'Deseja realmente ${actionText} o Bordo ${b.numeroSerie} (${b.tipo})?', () => toggleRecordAtivo('bordos', '${b.id}'))" class="${btnClass} p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700" title="${title}">
                            <i class="fas ${iconClass} fa-lg"></i>
                        </button>
                        `;
                    })()}
                </td>
            </tr>
        `;
    }).join('');

    let bordosPaginator = '';
    if (filteredBordos.length > PAGE_SIZE) {
        bordosPaginator = '<div class="flex justify-center items-center space-x-2 mt-4">';
        bordosPaginator += `<button ${bordosPage === 1 ? 'disabled' : ''} onclick="setBordosPage(-1)" class="px-2 py-1 text-sm rounded-md ${bordosPage === 1 ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500' : 'bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-100'}">Anterior</button>`;
        bordosPaginator += `<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Pág ${bordosPage} de ${totalBordosPages}</span>`;
        bordosPaginator += `<button ${bordosPage === totalBordosPages ? 'disabled' : ''} onclick="setBordosPage(1)" class="px-2 py-1 text-sm rounded-md ${bordosPage === totalBordosPages ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500' : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-100'}">Próxima</button>`;
        bordosPaginator += '</div>';
    }

    const tipoOptions = TIPOS_BORDO.map(t => `<option value="${t}">${t}</option>`).join('');

    return `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-1 bg-gray-50 dark:bg-gray-900 p-4 rounded-xl shadow-inner border border-gray-200 dark:border-gray-700">
                <h4 class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Novo/Editar Item de Bordo</h4>
                <form id="form-bordos" class="space-y-4">
                    <input type="hidden" id="bordo-id">
                    <div>
                        <label for="bordo-tipo" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Tipo de Bordo <span class="text-red-500">*</span></label>
                        <select id="bordo-tipo" required
                            class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border bg-white dark:bg-gray-700 dark:text-gray-100">
                            <option value="">Selecione o Tipo</option>
                            ${tipoOptions}
                        </select>
                    </div>
                    <div>
                        <label for="bordo-serie" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Número de Série <span class="text-red-500">*</span></label>
                        <input type="text" id="bordo-serie" required placeholder="Ex: TEL123456"
                            class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border dark:bg-gray-700 dark:text-gray-100">
                    </div>
                    <div>
                        <label for="bordo-modelo" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Modelo <span class="text-red-500">*</span></label>
                        <input type="text" id="bordo-modelo" required placeholder="Ex: Vbox 3"
                            class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border dark:bg-gray-700 dark:text-gray-100">
                    </div>
                    <div>
                        <label for="bordo-status" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                        <select id="bordo-status" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border bg-white dark:bg-gray-700 dark:text-gray-100">
                            ${statusOptions}
                            <option value="Em Uso" disabled>Em Uso (automático)</option>
                        </select>
                    </div>
                    <div class="flex space-x-3">
                        <button type="submit" class="flex-1 w-full flex justify-center py-2 px-3 border border-transparent text-sm font-medium rounded-lg text-white bg-green-main hover:bg-green-700 shadow-md">
                            <i class="fas fa-save mr-2"></i> Salvar
                        </button>
                        <button type="button" onclick="document.getElementById('form-bordos').reset(); document.getElementById('bordo-id').value='';" class="w-1/4 flex justify-center py-2 px-3 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 shadow-sm">
                            <i class="fas fa-redo"></i>
                        </button>
                    </div>
                </form>
                <div class="flex justify-between items-center mt-4">
                    <input type="file" id="bordos-import-file" accept=".csv, .xlsx, .xls" class="hidden" onchange="handleImport('bordos', event)">
                    <button onclick="document.getElementById('bordos-import-file').click()" class="flex-1 flex justify-center py-2 px-3 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-500 hover:bg-indigo-600 shadow-md">
                        <i class="fas fa-upload mr-2"></i> Importar (csv, xlsx)
                    </button>
                    <button onclick="showModal('Instruções de Importação - Bordos', window.BORDO_IMPORT_INFO, 'info')" class="ml-2 p-2 text-indigo-500 hover:text-indigo-700 transition-colors rounded-full" title="Instruções de arquivo">
                        <i class="fas fa-info-circle"></i>
                    </button>
                </div>
            </div>

            <div class="lg:col-span-2">
                <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-2">
                    <h4 class="text-lg font-semibold text-gray-800 dark:text-gray-100">Itens de Bordo Cadastrados (Ativos: ${activeBordosCount})</h4>
                    <input type="text" id="bordos-search-input" value="${bordosSearch}"	
                        oninput="handleSearchInput(this, 'bordosSearch', 1)"	
                        placeholder="Buscar Tipo, Série ou Modelo..."	
                        class="rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border text-sm w-full sm:w-1/2 dark:bg-gray-700 dark:text-gray-100">
                </div>
                <div class="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl shadow-inner overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead class="bg-gray-50 dark:bg-gray-900">
                            <tr>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Tipo</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Série</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Modelo</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Status</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Ações</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">${paginatedBordos.map(b => {
                            const isAtivo = b.ativo !== false;
                            const rowClass = isAtivo ? 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b dark:border-gray-700' : 'hover:bg-red-50 dark:hover:bg-red-900/10 border-b dark:border-gray-700 opacity-60 italic';
                            const statusText = isAtivo ? b.status || 'Disponível' : 'INATIVO';
                            const statusClass = isAtivo ? (b.status === 'Disponível' ? 'text-green-main' : (b.status === 'Manutenção' ? 'text-yellow-600' : (b.status === 'Sinistro' ? 'text-red-700' : 'text-blue-600'))) : 'text-red-600';
                            
                            const tipoClass = b.tipo === 'Tela' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' 
                                            : b.tipo === 'Mag' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300' 
                                            : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300';
                            
                            return `
                                <tr class="${rowClass}">
                                    <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${tipoClass}">${b.tipo}</span>
                                    </td>
                                    <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 font-mono">${b.numeroSerie}</td>
                                    <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">${b.modelo}</td>
                                    <td class="px-4 py-2 text-sm font-semibold ${statusClass}">${statusText}</td>
                                    <td class="px-4 py-2 whitespace-nowrap text-sm font-medium space-x-2">
                                        <button onclick="loadBordoForEdit('${b.id}')" class="text-indigo-600 hover:text-indigo-900 p-1 rounded-full hover:bg-indigo-50 dark:hover:bg-gray-700" title="Editar Bordo">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        ${(() => {
                                            const actionText = isAtivo ? 'INATIVAR' : 'ATIVAR';
                                            const iconClass = isAtivo ? 'fa-toggle-on text-green-main' : 'fa-toggle-off text-gray-500 dark:text-gray-400';
                                            const btnClass = isAtivo ? 'hover:text-red-900' : 'hover:text-green-main';
                                            const title = isAtivo ? 'Inativar Bordo' : 'Ativar Bordo';
                                            return `
                                            <button onclick="showConfirmModal('Confirmar ${actionText}ÇÃO', 'Deseja realmente ${actionText} o Bordo ${b.numeroSerie} (${b.tipo})?', () => toggleRecordAtivo('bordos', '${b.id}'))" class="${btnClass} p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700" title="${title}">
                                                <i class="fas ${iconClass} fa-lg"></i>
                                            </button>
                                            `;
                                        })()}
                                    </td>
                                </tr>
                            `;
                        }).join('')}</tbody>
                    </table>
                </div>
                ${bordosPaginator}
            </div>
        </div>
    `;
}

function renderCadastroGeral() {
    const radioMap = dbRadios.reduce((acc, r) => { acc[r.id] = r; return acc; }, {});
    const equipamentoMap = dbEquipamentos.reduce((acc, e) => { acc[e.id] = e; return acc; }, {});
    const bordoMap = dbBordos.reduce((acc, b) => { acc[b.id] = b; return acc; }, {});
    
    const availableEquipamentos = dbEquipamentos.filter(e =>	
        e.ativo !== false &&	
        !dbRegistros.some(reg => reg.equipamentoId === e.id) 
    );
    
    const availableRadios = dbRadios.filter(r =>	
        r.ativo !== false &&	
        r.status === 'Disponível' &&	
        !dbRegistros.some(reg => reg.radioId === r.id)	
    );
    const availableBordos = dbBordos.filter(b => 
        b.ativo !== false &&
        b.status === 'Disponível' &&
        !dbRegistros.some(reg => reg.telaId === b.id || reg.magId === b.id || reg.chipId === b.id)
    );
    
    const bordosPorTipo = availableBordos.reduce((acc, b) => {
        acc[b.tipo] = acc[b.tipo] || [];
        acc[b.tipo].push(b);
        return acc;
    }, {});

    const getBordoOptions = (tipo) => {
        const bordos = bordosPorTipo[tipo] || [];
        return bordos
            .map(b => `<option value="${b.id}">${b.numeroSerie} (${b.modelo})</option>`)
            .join('');
    };

    const radioOptions = availableRadios
        .map(r => `<option value="${r.id}">${r.serie} (${r.modelo})</option>`)
        .join('');
    const frotaOptions = availableEquipamentos
        .map(e => `<option value="${e.id}">${e.frota}</option>`)
        .join('');
    
    const filteredRegistros = dbRegistros.filter(reg => {
        const r = radioMap[reg.radioId] || {};
        const e = equipamentoMap[reg.equipamentoId] || {};
        const search = geralSearch.toLowerCase();
        
        return (
            (e.codigo || reg.codigo || '').toLowerCase().includes(search) ||
            (r.serie || '').toLowerCase().includes(search) ||
            (e.frota || '').toLowerCase().includes(search) ||
            (e.grupo || '').toLowerCase().includes(search)
        );
    });

    const totalGeralPages = Math.ceil(filteredRegistros.length / PAGE_SIZE);
    geralPage = Math.min(geralPage, totalGeralPages) || 1;
    const paginatedRegistros = filteredRegistros.slice((geralPage - 1) * PAGE_SIZE, geralPage * PAGE_SIZE);
    
    const tableRows = paginatedRegistros.map(reg => {
        const r = radioMap[reg.radioId] || { id: null, serie: 'N/A', modelo: 'N/A' };
        const e = equipamentoMap[reg.equipamentoId] || { id: null, frota: 'N/A', grupo: 'N/A', subgrupo: 'N/A', codigo: null, ativo: false };
        const t = bordoMap[reg.telaId] || { numeroSerie: 'N/A' };
        const m = bordoMap[reg.magId] || { numeroSerie: 'N/A' };
        const c = bordoMap[reg.chipId] || { numeroSerie: 'N/A' };
        
        const codigo = e.codigo || reg.codigo || 'N/A';
        
        const isEquipamentoAtivo = e.ativo !== false;
        const temRadio = !!reg.radioId;
        const temBordos = reg.telaId || reg.magId || reg.chipId;
        
        const bordoStatus = temBordos 
            ? `<span class="text-green-600 font-semibold">Bordos OK</span>`
            : `<span class="text-gray-500 italic">Sem Bordos</span>`;
        
        const rowClass = isEquipamentoAtivo ? 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b dark:border-gray-700' : 'hover:bg-red-50 dark:hover:bg-red-900/10 border-b dark:border-gray-700 opacity-60 italic';
        const frotaDisplay = isEquipamentoAtivo ? e.frota : `${e.frota} (INATIVO)`;
        
        const radioButtonText = temRadio ? 'Desvincular Rádio' : 'Vincular Rádio';
        const radioButtonClass = temRadio ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-green-main text-white hover:bg-green-700';
        const radioButtonAction = temRadio 
            ? `showConfirmModal('Desvincular Rádio', 'Deseja desvincular o Rádio ${r.serie} da Frota ${e.frota}?', () => deleteLink('${reg.id}', 'radio'))`
            : `showVincularModal('${reg.equipamentoId}', 'radio')`; 
        
        const bordosButtonText = temBordos ? 'Substituir Bordo' : 'Vincular Bordos';
        const bordosButtonClass = temBordos ? 'bg-purple-600 text-white hover:bg-purple-700' : 'bg-green-main text-white hover:bg-green-700';
        const bordosButtonAction = `showVincularModal('${reg.equipamentoId}', 'bordos')`;

        const actionsDisabled = !isEquipamentoAtivo;
        const disabledClass = actionsDisabled ? 'opacity-50 cursor-not-allowed' : '';

        const actionsHtml = `
            <div class="flex flex-col space-y-1 w-full max-w-xs mx-auto">
                <button 
                    onclick="${actionsDisabled ? '' : radioButtonAction}" 
                    class="px-2 py-1 text-xs font-semibold rounded-lg shadow-sm transition-colors ${radioButtonClass} ${disabledClass}" 
                    title="${actionsDisabled ? 'Ações bloqueadas: Equipamento inativo' : radioButtonText}"
                    ${actionsDisabled ? 'disabled' : ''}>
                    <i class="fas fa-wifi"></i> ${radioButtonText}
                </button>
                <button 
                    onclick="${actionsDisabled ? '' : bordosButtonAction}" 
                    class="px-2 py-1 text-xs font-semibold rounded-lg shadow-sm transition-colors ${bordosButtonClass} ${disabledClass}"
                    title="${actionsDisabled ? 'Ações bloqueadas: Equipamento inativo' : bordosButtonText}"
                    ${actionsDisabled ? 'disabled' : ''}>
                    <i class="fas fa-microchip"></i> ${bordosButtonText}
                </button>
            </div>
        `;

        return `
            <tr class="${rowClass}">
                <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 font-mono">${codigo}</td>
                <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">${frotaDisplay}</td>
                <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">${r.serie}</td>
                <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hidden sm:table-cell">${e.grupo}</td>
                <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hidden md:table-cell">${bordoStatus}</td>
                <td class="px-4 py-2 whitespace-nowrap text-sm font-medium">
                    ${actionsHtml}
                </td>
            </tr>
        `;
    }).join('');

    let geralPaginator = '';
    if (filteredRegistros.length > PAGE_SIZE) {
        geralPaginator = '<div class="flex justify-center items-center space-x-2 mt-4">';
        geralPaginator += `<button ${geralPage === 1 ? 'disabled' : ''} onclick="setGeralPage(-1)" class="px-2 py-1 text-sm rounded-md ${geralPage === 1 ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500' : 'bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-100'}">Anterior</button>`;
        geralPaginator += `<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Pág ${geralPage} de ${totalGeralPages}</span>`;
        geralPaginator += `<button ${geralPage === totalGeralPages ? 'disabled' : ''} onclick="setGeralPage(1)" class="px-2 py-1 text-sm rounded-md ${geralPage === totalGeralPages ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500' : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-100'}">Próxima</button>`;
        geralPaginator += '</div>';
    }

    return `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-1 bg-gray-50 dark:bg-gray-900 p-4 rounded-xl shadow-inner border border-gray-200 dark:border-gray-700">
                <h4 class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center">
                    <i class="fas fa-plus-circle mr-2 text-green-main"></i> Novo Vínculo (Rádio ou Bordos)
                </h4>
                <p class="text-sm text-gray-600 dark:text-gray-300 mb-4">Para iniciar um novo registro, selecione a Frota, o Rádio e/ou os Bordos. O Código será gerado se a Frota ainda não tiver um.</p>
                
                <form id="form-geral" class="space-y-4">
                    <div>
                        <label for="geral-equipamento-id" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Frota (Equipamento) <span class="text-red-500">*</span></label>
                        <select id="geral-equipamento-id" required class="tom-select-equipamento mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border bg-white dark:bg-gray-700 dark:text-gray-100">
                            <option value="">Selecione a Frota</option>
                            ${frotaOptions}
                        </select>
                    </div>
                    
                    <div id="equipamento-info" class="space-y-2 text-sm p-3 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700">
                        <p class="text-gray-700 dark:text-gray-300"><span class="font-semibold">Grupo:</span> <span id="info-grupo">N/A</span></p>
                        <p class="text-gray-700 dark:text-gray-300"><span class="font-semibold">Subgrupo:</span> <span id="info-subgrupo">N/A</span></p>	
                        <p class="text-gray-700 dark:text-gray-300"><span class="font-semibold">Gestor:</span> <span id="info-gestor">N/A</span></p>
                        <p class="text-gray-700 dark:text-gray-300"><span class="font-semibold">Código:</span> <span id="info-codigo">N/A</span></p>
                    </div>

                    <h5 class="text-md font-semibold text-gray-800 dark:text-gray-100 border-b pb-1 mb-2 mt-4 flex items-center">
                        <i class="fas fa-wifi mr-2 text-indigo-500"></i> Componentes (Ao menos um é obrigatório)
                    </h5>
                    
                    <div>
                        <label for="geral-radio-id" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Rádio (Opcional)</label>
                        <select id="geral-radio-id" class="tom-select-radio-novo mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border bg-white dark:bg-gray-700 dark:text-gray-100">
                            <option value="">Selecione um Rádio Disponível (Série/Modelo)</option>
                            ${radioOptions}
                        </select>
                    </div>
                    
                    <div class="space-y-2 p-3 border border-gray-300 dark:border-gray-600 rounded-lg">
                        <p class="text-xs text-red-500 dark:text-red-400 font-semibold">
                            Selecione os 3 Bordos para formar o Kit (Opcional). Se um for selecionado, todos são obrigatórios.
                        </p>
                        <div>
                            <label for="geral-tela-id" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Tela</label>
                            <select id="geral-tela-id" class="bordo-select mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border bg-white dark:bg-gray-700 dark:text-gray-100">
                                <option value="">Selecione a Tela Disponível</option>
                                ${getBordoOptions('Tela')}
                            </select>
                        </div>
                        <div>
                            <label for="geral-mag-id" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Mag</label>
                            <select id="geral-mag-id" class="bordo-select mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border bg-white dark:bg-gray-700 dark:text-gray-100">
                                <option value="">Selecione o Mag Disponível</option>
                                ${getBordoOptions('Mag')}
                            </select>
                        </div>
                        <div>
                            <label for="geral-chip-id" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Chip</label>
                            <select id="geral-chip-id" class="bordo-select mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border bg-white dark:bg-gray-700 dark:text-gray-100">
                                <option value="">Selecione o Chip Disponível</option>
                                ${getBordoOptions('Chip')}
                            </select>
                        </div>
                    </div>

                    <button type="submit" class="w-full flex justify-center py-2 px-3 border border-transparent text-sm font-medium rounded-lg text-white bg-green-main hover:bg-green-700 shadow-md">
                        <i class="fas fa-barcode mr-2"></i> Criar Novo Vínculo
                    </button>
                </form>
            </div>
            
            <div class="lg:col-span-2">
                <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-2">
                    <h4 class="text-lg font-semibold text-gray-800 dark:text-gray-100">Registros de Vínculos Ativos (Total: ${dbRegistros.length})</h4>
                    <input type="text" id="geral-search-input" value="${geralSearch}"	
                        oninput="handleSearchInput(this, 'geralSearch', 1)"	
                        placeholder="Buscar Código, Série ou Frota..."	
                        class="rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border text-sm w-full sm:w-1/2 dark:bg-gray-700 dark:text-gray-100">
                </div>
                <div class="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl shadow-inner overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead class="bg-gray-50 dark:bg-gray-900">
                            <tr>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Código</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Frota</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Série Rádio</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase hidden sm:table-cell">Grupo</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase hidden md:table-cell">Bordos</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Ações</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">${paginatedRegistros.map(reg => {
                            const r = radioMap[reg.radioId] || { id: null, serie: 'N/A', modelo: 'N/A' };
                            const e = equipamentoMap[reg.equipamentoId] || { id: null, frota: 'N/A', grupo: 'N/A', subgrupo: 'N/A', codigo: null, ativo: false };
                            const t = bordoMap[reg.telaId] || { numeroSerie: 'N/A' };
                            const m = bordoMap[reg.magId] || { numeroSerie: 'N/A' };
                            const c = bordoMap[reg.chipId] || { numeroSerie: 'N/A' };
                            
                            const codigo = e.codigo || reg.codigo || 'N/A';
                            
                            const isEquipamentoAtivo = e.ativo !== false;
                            const temRadio = !!reg.radioId;
                            const temBordos = reg.telaId || reg.magId || reg.chipId;
                            
                            const bordoStatus = temBordos 
                                ? `<span class="text-green-600 font-semibold">Bordos OK</span>`
                                : `<span class="text-gray-500 italic">Sem Bordos</span>`;
                            
                            const rowClass = isEquipamentoAtivo ? 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b dark:border-gray-700' : 'hover:bg-red-50 dark:hover:bg-red-900/10 border-b dark:border-gray-700 opacity-60 italic';
                            const frotaDisplay = isEquipamentoAtivo ? e.frota : `${e.frota} (INATIVO)`;
                            
                            const radioButtonText = temRadio ? 'Desvincular Rádio' : 'Vincular Rádio';
                            const radioButtonClass = temRadio ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-green-main text-white hover:bg-green-700';
                            const radioButtonAction = temRadio 
                                ? `showConfirmModal('Desvincular Rádio', 'Deseja desvincular o Rádio ${r.serie} da Frota ${e.frota}?', () => deleteLink('${reg.id}', 'radio'))`
                                : `showVincularModal('${reg.equipamentoId}', 'radio')`; 
                            
                            const bordosButtonText = temBordos ? 'Substituir Bordo' : 'Vincular Bordos';
                            const bordosButtonClass = temBordos ? 'bg-purple-600 text-white hover:bg-purple-700' : 'bg-green-main text-white hover:bg-green-700';
                            const bordosButtonAction = `showVincularModal('${reg.equipamentoId}', 'bordos')`;

                            const actionsDisabled = !isEquipamentoAtivo;
                            const disabledClass = actionsDisabled ? 'opacity-50 cursor-not-allowed' : '';

                            const actionsHtml = `
                                <div class="flex flex-col space-y-1 w-full max-w-xs mx-auto">
                                    <button 
                                        onclick="${actionsDisabled ? '' : radioButtonAction}" 
                                        class="px-2 py-1 text-xs font-semibold rounded-lg shadow-sm transition-colors ${radioButtonClass} ${disabledClass}" 
                                        title="${actionsDisabled ? 'Ações bloqueadas: Equipamento inativo' : radioButtonText}"
                                        ${actionsDisabled ? 'disabled' : ''}>
                                        <i class="fas fa-wifi"></i> ${radioButtonText}
                                    </button>
                                    <button 
                                        onclick="${actionsDisabled ? '' : bordosButtonAction}" 
                                        class="px-2 py-1 text-xs font-semibold rounded-lg shadow-sm transition-colors ${bordosButtonClass} ${disabledClass}"
                                        title="${actionsDisabled ? 'Ações bloqueadas: Equipamento inativo' : bordosButtonText}"
                                        ${actionsDisabled ? 'disabled' : ''}>
                                        <i class="fas fa-microchip"></i> ${bordosButtonText}
                                    </button>
                                </div>
                            `;

                            return `
                                <tr class="${rowClass}">
                                    <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 font-mono">${codigo}</td>
                                    <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">${frotaDisplay}</td>
                                    <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">${r.serie}</td>
                                    <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hidden sm:table-cell">${e.grupo}</td>
                                    <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hidden md:table-cell">${bordoStatus}</td>
                                    <td class="px-4 py-2 whitespace-nowrap text-sm font-medium">
                                        ${actionsHtml}
                                    </td>
                                </tr>
                            `;
                        }).join('')}</tbody>
                    </table>
                </div>
                ${geralPaginator}
            </div>
        </div>
    `;
}

function renderPesquisa() {
    const radioMap = dbRadios.reduce((acc, r) => { acc[r.id] = r; return acc; }, {});
    const equipamentoMap = dbEquipamentos.reduce((acc, e) => { acc[e.id] = e; return acc; }, {});
    const bordoMap = dbBordos.reduce((acc, b) => { acc[b.id] = b; return acc; }, {});
    
    const allRecords = dbRegistros.map(reg => {
        const r = radioMap[reg.radioId] || {};
        const e = equipamentoMap[reg.equipamentoId] || {};
        const t = bordoMap[reg.telaId] || { tipo: 'Tela', numeroSerie: 'N/A' };
        const m = bordoMap[reg.magId] || { tipo: 'Mag', numeroSerie: 'N/A' };
        const c = bordoMap[reg.chipId] || { tipo: 'Chip', numeroSerie: 'N/A' };
        
        const bordos = [t, m, c];
        const bordosText = bordos.map(b => b.numeroSerie).join(' / ');
        const bordosDetailed = bordos.map(b => `${b.tipo}: ${b.numeroSerie}`).join(', ');
        const temBordos = bordos.some(b => b.numeroSerie !== 'N/A');

        return {
            id: reg.id,	
            codigo: e.codigo || reg.codigo,
            serie: r.serie || 'N/A',
            modeloRadio: r.modelo || 'N/A', 
            frota: e.frota || 'N/A',
            modeloEquipamento: e.modelo || 'N/A',
            grupo: e.grupo || 'N/A', 
            subgrupo: e.subgrupo || 'N/A',
            gestor: e.gestor || 'N/A', 
            createdAt: reg.createdAt,
            bordosText, bordosDetailed, temBordos
        };
    });
    
    let filteredRecords = allRecords;
    const searchTerm = searchTermPesquisa.toLowerCase();

    if (searchTerm) {
        filteredRecords = allRecords.filter(r =>	
            (r.codigo || '').toLowerCase().includes(searchTerm) ||
            (r.serie || '').toLowerCase().includes(searchTerm) ||
            (r.modeloRadio || '').toLowerCase().includes(searchTerm) ||
            (r.frota || '').toLowerCase().includes(searchTerm) ||
            (r.grupo || '').toLowerCase().includes(searchTerm) ||
            (r.subgrupo || '').toLowerCase().includes(searchTerm) ||
            (r.gestor || '').toLowerCase().includes(searchTerm) ||
            (r.modeloEquipamento || '').toLowerCase().includes(searchTerm) ||
            (r.bordosDetailed || '').toLowerCase().includes(searchTerm)
        );
    }
    
    const totalPesquisaPages = Math.ceil(filteredRecords.length / PESQUISA_PAGE_SIZE);
    pesquisaPage = Math.min(pesquisaPage, totalPesquisaPages) || 1;
    const paginatedRecords = filteredRecords.slice((pesquisaPage - 1) * PESQUISA_PAGE_SIZE, pesquisaPage * PESQUISA_PAGE_SIZE);
    
    let tableRows = '';
    if (paginatedRecords.length > 0) {
        tableRows = paginatedRecords.map(r => `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b dark:border-gray-700">
                <td class="px-3 py-2 text-sm font-semibold text-gray-900 dark:text-gray-100 font-mono">${r.codigo}</td>
                <td class="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">${r.frota}</td>
                <td class="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hidden sm:table-cell">${r.grupo}</td>
                <td class="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">${r.serie}</td>
                <td class="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hidden md:table-cell" title="${r.bordosDetailed}">${r.temBordos ? `<i class="fas fa-check-circle text-green-500 mr-1"></i> ${r.bordosText}` : 'N/A'}</td>
                <td class="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hidden lg:table-cell">${r.gestor}</td>
            </tr>
        `).join('');
    } else {
        tableRows = `
            <tr>
                <td colspan="6" class="px-4 py-4 text-center text-gray-500 dark:text-gray-400 italic">
                    Nenhum registro ativo encontrado.
                </td>
            </tr>
        `;
    }

    let pesquisaPaginator = '';
    if (filteredRecords.length > PESQUISA_PAGE_SIZE) {
        pesquisaPaginator = '<div class="flex justify-center items-center space-x-2 mt-4">';
        pesquisaPaginator += `<button ${pesquisaPage === 1 ? 'disabled' : ''} onclick="setPesquisaPage(-1)" class="px-2 py-1 text-sm rounded-md ${pesquisaPage === 1 ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500' : 'bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-100'}">Anterior</button>`;
        pesquisaPaginator += `<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Pág ${pesquisaPage} de ${totalPesquisaPages}</span>`;
        pesquisaPaginator += `<button ${pesquisaPage === totalPesquisaPages ? 'disabled' : ''} onclick="setPesquisaPage(1)" class="px-2 py-1 text-sm rounded-md ${pesquisaPage === totalPesquisaPages ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500' : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-100'}">Próxima</button>`;
        pesquisaPaginator += '</div>';
    }

    return `
        <div class="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
            <h2 class="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6 text-center">Pesquisa de Registros Ativos</h2>
            <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
                <div class="mb-4 flex space-x-2">
                    <input type="text" id="search-term" placeholder="Buscar por Código, Série, Frota, Bordo..."	
                        value="${searchTermPesquisa}"	
                        oninput="handleSearchInput(this, 'searchTermPesquisa', 1)"
                        class="flex-1 rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border dark:bg-gray-700 dark:text-gray-100"
                    >
                    <button id="search-button" onclick="document.getElementById('search-term').dispatchEvent(new Event('input'))" class="py-2 px-3 border border-transparent text-sm font-medium rounded-lg text-white bg-green-main hover:bg-green-700 shadow-md" title="Iniciar Busca">
                        <i class="fas fa-search"></i> <span class="hidden sm:inline">Buscar</span>
                    </button>
                </div>
                
                <h4 class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4 mt-6">Resultados (${filteredRecords.length})</h4>
                <div class="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl shadow-inner overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead class="bg-gray-50 dark:bg-gray-900">
                            <tr>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Código</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Frota</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase hidden sm:table-cell">Grupo</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Série Rádio</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase hidden md:table-cell">Séries Bordos</th>
                                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase hidden lg:table-cell">Gestor</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">${tableRows}</tbody>
                    </table>
                </div>
                ${pesquisaPaginator}
            </div>
        </div>
    `;
}

function renderSettings() {
    const isAdmin = currentUser && currentUser.role === 'admin';
    
    const tabs = [
        { id: 'system', name: 'Mapeamento', icon: 'fa-sitemap' },
        { id: 'users', name: 'Usuários', icon: 'fa-users', requiredRole: 'admin' },
    ];

    const defaultTab = 'system';
    const filteredTabs = tabs.filter(tab => !tab.requiredRole || (tab.requiredRole === 'admin' && isAdmin));

    const tabNav = filteredTabs.map(tab => {
        const isActive = currentSettingTab === tab.id;
        const activeClass = isActive ? 'text-green-main border-green-main font-semibold' : 'text-gray-500 dark:text-gray-300 border-transparent hover:text-green-main';
        return `
            <a href="#settings/${tab.id}" onclick="updateState('settingTab', '${tab.id}')" class="py-2 px-4 border-b-2 ${activeClass} transition-colors text-sm sm:text-base flex items-center space-x-2">
                <i class="fas ${tab.icon}"></i>
                <span>${tab.name}</span>
            </a>
        `;
    }).join('');
    
    let content = '';
    switch (currentSettingTab) {
        case 'system':
            content = renderSettingsSystem();
            break;
        case 'users':
            content = isAdmin ? "Carregando usuários..." : `<p class="p-6 text-red-500 dark:text-red-400 font-semibold">Acesso negado. Apenas administradores podem gerenciar usuários.</p>`;
            if (isAdmin) {
            }
            break;
        default:
            currentSettingTab = defaultTab;
            content = renderSettingsSystem();
    }

    return `
        <div class="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
            <h2 class="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6 text-center">Configurações do Sistema</h2>
            <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
                <div id="settings-nav" class="flex border-b border-gray-200 dark:border-gray-700 px-6 pt-2 overflow-x-auto">${tabNav}</div>
                <div id="settings-content" class="p-6">${content}</div>
            </div>
        </div>
    `;
}

function renderSettingsSystem() {
    const currentMap = settings.letterMap;
    const nextIndex = settings.nextIndex;
    
    const groupInputs = GROUPS.map(group => {
        const prefix = currentMap[group] || '';
        const indexKey = prefix === 'NUM' ? 'NUM' : prefix;
        const nextNum = nextIndex[indexKey] || 1;	
        const nextCodeDisplay = prefix ? (prefix === 'NUM' ? zpad(nextNum, 3) : prefix + zpad(nextNum, 3)) : 'N/A';

        return `
            <div class="flex items-center space-x-4 border-b pb-3 mb-3 dark:border-gray-600">
                <label class="w-1/3 text-sm font-medium text-gray-700 dark:text-gray-300">${group}</label>
                <input type="text" id="map-${group.replace(/\s/g, '')}" value="${prefix}" required maxlength="3"
                    class="w-1/4 rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border text-center font-mono uppercase dark:bg-gray-700 dark:text-gray-100"
                >
                <div class="w-1/4 text-sm text-gray-500 dark:text-gray-400">
                    Próximo: ${nextCodeDisplay}	
                </div>
            </div>`;
    }).join('');

    return `
        <h4 class="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-6">Mapeamento de Letras por Grupo</h4>
        <form id="form-settings-system" class="space-y-4 max-w-lg">
            <p class="text-sm text-gray-600 dark:text-gray-300 mb-4">Defina a letra ou código para o prefixo do Código de Rastreamento. Use 'NUM' para código sequencial.</p>
            <div class="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg shadow-inner border dark:border-gray-700">
                <div class="flex items-center space-x-4 font-bold text-sm text-gray-800 dark:text-gray-100 border-b-2 pb-2 mb-3 dark:border-gray-600">
                    <span class="w-1/3">Grupo</span>
                    <span class="w-1/4 text-center">Prefixo</span>
                    <span class="w-1/4">Próx. Código</span>
                </div>
                ${groupInputs}
            </div>
            <button type="submit" class="flex justify-center py-2 px-3 border border-transparent text-sm font-medium rounded-lg text-white bg-green-main hover:bg-green-700 shadow-md">
                <i class="fas fa-save mr-2"></i> Salvar Mapeamento
            </button>
        </form>
    `;
}

function attachSettingsUsersEvents() {
    const form = document.getElementById('form-user');
    if (form) {
        form.onsubmit = saveUser;
        const resetButton = document.getElementById('user-reset-btn');
        if (resetButton) {
            resetButton.onclick = () => {
                form.reset();
                document.getElementById('user-id').value = '';
                document.getElementById('user-form-title').textContent = 'Novo Perfil de Usuário';
                document.getElementById('user-password-field').classList.remove('hidden');
            };
        }
    }
}

async function renderSettingsUsers() {
    const settingsDocRef = doc(db, "artifacts", appId, "public", "data", "settings", "config");
    const settingsSnap = await getDoc(settingsDocRef);
    const usersFromDB = settingsSnap.exists() ? settingsSnap.data().users || [] : [];
    settings.users = usersFromDB;		

    const tableRows = usersFromDB.map(u => {
        const isMainAdmin = u.username === ADMIN_PRINCIPAL_EMAIL;
        const isCurrent = currentUser.id === u.id;
        const canEditDelete = !isMainAdmin;

        return `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b dark:border-gray-700 ${isCurrent ? 'bg-indigo-50/50 dark:bg-indigo-900/50' : ''}">
                <td class="px-4 py-2 text-sm font-medium text-gray-900 dark:text-gray-100">${u.name} ${isCurrent ? '<span class="text-xs text-indigo-500">(Você)</span>' : ''}</td>
                <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 font-mono break-words-all min-w-0">
                    ${u.username}
                </td>
                <td class="px-4 py-2 text-sm font-semibold ${u.role === 'admin' ? 'text-green-main' : 'text-blue-600'}">${(u.role || 'N/A').toUpperCase()}</td>
                <td class="px-4 py-2 whitespace-nowrap text-sm font-medium space-x-2">
                    <button onclick="loadUserForEdit('${u.id}')" ${canEditDelete ? '' : 'disabled'} class="text-indigo-600 hover:text-indigo-900 p-1 rounded-full hover:bg-indigo-50 dark:hover:bg-gray-700 ${canEditDelete ? '' : 'opacity-50 cursor-not-allowed'}" title="Editar Perfil">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="showPermissionModal('${u.id}')" ${canEditDelete ? '' : 'disabled'} class="text-green-600 hover:text-green-900 p-1 rounded-full hover:bg-green-50 dark:hover:bg-gray-700 ${canEditDelete ? '' : 'opacity-50 cursor-not-allowed'}" title="Alterar permissões">
                        <i class="fas fa-user-cog"></i>
                    </button>
                    <button onclick="showConfirmModal('Confirmar Exclusão', 'Deseja realmente excluir o perfil de ${u.name}? Isso é irreversível.', () => deleteUser('${u.id}'))" ${canEditDelete ? '' : 'disabled'} class="text-red-600 hover:text-red-900 p-1 rounded-full hover:bg-red-50 dark:hover:bg-gray-700 ${canEditDelete ? '' : 'opacity-50 cursor-not-allowed'}" title="Excluir Perfil">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    return `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-1 bg-gray-50 dark:bg-gray-900 p-4 rounded-xl shadow-inner border border-gray-200 dark:border-gray-700">
                <h4 id="user-form-title" class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Novo Perfil de Usuário</h4>
                <form id="form-user" class="space-y-4">
                    <input type="hidden" id="user-id">
                    <div>
                        <label for="user-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Nome Completo <span class="text-red-500">*</span></label>
                        <input type="text" id="user-name" required placeholder="Ex: Maria da Silva"
                            class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border dark:bg-gray-700 dark:text-gray-100">
                    </div>
                    
                    <div>
                        <label for="user-username" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Usuário (Login) <span class="text-red-500">*</span></label>
                        <input type="text" id="user-username" required placeholder="Ex: maria.silva"
                            class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border dark:bg-gray-700 dark:text-gray-100">
                    </div>
                    
                    <div id="user-password-field">
                        <label for="user-password" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Senha (Mín. 6 caracteres) <span class="text-red-500">*</span></label>
                        <input type="password" id="user-password" placeholder="Preencha para novo cadastro ou alteração de senha" minlength="6"
                            class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-red-500 focus:ring-red-500 p-2 border dark:bg-gray-700 dark:text-gray-100">
                    </div>

                    <div>
                        <label for="user-role" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Perfil/Role <span class="text-red-500">*</span></label>
                        <select id="user-role" required
                            class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border bg-white dark:bg-gray-700 dark:text-gray-100">
                            <option value="user">Usuário Padrão</option>
                            <option value="admin">Administrador</option>
                        </select>
                    </div>
                    <div class="flex space-x-3">
                        <button type="submit" class="flex-1 w-full flex justify-center py-2 px-3 border border-transparent text-sm font-medium rounded-lg text-white bg-green-main hover:bg-green-700 shadow-md">
                            <i class="fas fa-save mr-2"></i> Salvar Perfil
                        </button>
                        <button type="button" id="user-reset-btn" class="w-1/4 flex justify-center py-2 px-3 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 shadow-sm">
                            <i class="fas fa-redo"></i>
                        </button>
                    </div>
                </form>
            </div>

            <div class="lg:col-span-2">
                <h4 class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Perfis Cadastrados (Total: ${usersFromDB.length})</h4>
                <div class="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl shadow-inner overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead class="bg-gray-50 dark:bg-gray-900">
                            <tr>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Nome</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase min-w-32">Usuário</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Perfil</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Ações</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">${tableRows}</tbody>
                    </table>
                </div>
                <p class="mt-4 text-sm text-yellow-600 dark:text-yellow-400">
                    A exclusão ou edição do usuário principal (Admin) é bloqueada. 
                    As permissões de um novo usuário ou de um 'admin' são definidas automaticamente no salvamento.
                </p>
            </div>
        </div>
    `;
}

async function savePersonalName(e) {
    e.preventDefault();
    const newName = document.getElementById('profile-name').value.trim();
    if (!newName) {
        showModal('Erro', 'O nome não pode ser vazio.', 'error');
        return;
    }

    const settingsDocRef = doc(db, "artifacts", appId, "public", "data", "settings", "config");
    let usersFromDB = settings.users;
    const userIndex = usersFromDB.findIndex(u => u.id === currentUser.id);

    if (userIndex === -1) {
        showModal('Erro', 'Seu perfil não foi encontrado no banco de dados.', 'error');
        return;
    }

    usersFromDB[userIndex].name = newName;
    currentUser.name = newName;

    try {
        await setDoc(settingsDocRef, { users: usersFromDB }, { merge: true });
        showModal('Sucesso', 'Nome de exibição atualizado com sucesso!', 'success');
        hideProfileModal();
        renderApp();
    } catch (e) {
        showModal('Erro', 'Não foi possível salvar o nome.', 'error');
    }
}

async function changePassword(e) {
    e.preventDefault();
    const currentPassword = document.getElementById('profile-current-password').value;
    const newPassword = document.getElementById('profile-new-password').value;
    const confirmPassword = document.getElementById('profile-confirm-password').value;

    if (!currentPassword || !newPassword || !confirmPassword) {
        showModal('Erro', 'Preencha todos os campos.', 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        showModal('Erro', 'A nova senha e a confirmação não coincidem.', 'error');
        return;
    }

    if (newPassword.length < 6) {
        showModal('Erro', 'A nova senha deve ter no mínimo 6 caracteres.', 'error');
        return;
    }

    try {
        // Verifica senha atual
        const passwordMatch = await verifyPassword(currentPassword, currentUser.password);
        
        if (!passwordMatch) {
            showModal('Erro', 'Senha atual incorreta.', 'error');
            return;
        }

        // Atualiza senha no banco
        const newHashedPassword = await hashPassword(newPassword);
        
        const userIndex = settings.users.findIndex(u => u.id === currentUser.id);
        if (userIndex !== -1) {
            settings.users[userIndex].password = newHashedPassword;
            
            // Salva no Firestore
            const settingsDocRef = doc(db, "artifacts", appId, "public", "data", "settings", "config");
            await setDoc(settingsDocRef, { users: settings.users }, { merge: true });
            
            // Atualiza currentUser
            currentUser.password = newHashedPassword;
            
            showModal('Sucesso', 'Senha alterada com sucesso!', 'success');
            document.getElementById('profile-current-password').value = '';
            document.getElementById('profile-new-password').value = '';
            document.getElementById('profile-confirm-password').value = '';
        } else {
            throw new Error('Usuário não encontrado');
        }

    } catch (error) {
        console.error("Erro ao alterar senha:", error);
        showModal('Erro', 'Erro ao alterar senha. Tente novamente.', 'error');
    }
}

function handleSearchInput(inputElement, stateVariable, pageToReset = null) {
    const value = inputElement.value;
    const cursorPos = inputElement.selectionStart;
    focusedSearchInputId = inputElement.id;	
    searchCursorPosition = cursorPos;	

    if (stateVariable === 'radioSearch') radioSearch = value.toLowerCase();
    else if (stateVariable === 'equipamentoSearch') equipamentoSearch = value.toLowerCase();
    else if (stateVariable === 'bordosSearch') bordosSearch = value.toLowerCase();
    else if (stateVariable === 'geralSearch') geralSearch = value.toLowerCase();
    else if (stateVariable === 'searchTermPesquisa') searchTermPesquisa = value.toLowerCase();
    else if (stateVariable === '_searchTermTemp') window._searchTermTemp = value;	
    
    if (pageToReset) {
        if (stateVariable === 'radioSearch') radioPage = 1;
        else if (stateVariable === 'equipamentoSearch') equipamentoPage = 1;
        else if (stateVariable === 'bordosSearch') bordosPage = 1;
        else if (stateVariable === 'geralSearch') geralPage = 1;
        else if (stateVariable === 'searchTermPesquisa') pesquisaPage = 1;
    }

    renderApp();
}

async function handleLogout() {
    showConfirmModal('Confirmar Saída', 'Deseja realmente sair do sistema?', async () => {
        try {
            clearSession();
            currentUser = null;
            userId = null;
            detachFirestoreListeners();
            dbRadios = []; 
            dbEquipamentos = []; 
            dbBordos = []; 
            dbRegistros = [];
            isAuthReady = true;
            currentPage = 'login';
            renderApp();
        } catch (error) {
            console.error("Erro ao fazer logout:", error);
            showModal('Erro', 'Ocorreu um erro ao sair. Por favor, recarregue a página.', 'error');
        }
    });
}

function attachLoginEvents() {
    const form = document.getElementById('login-form');
    const solicitacaoForm = document.getElementById('form-solicitar-acesso');
    const passwordInput = document.getElementById('password');
    const togglePasswordButton = document.getElementById('toggle-password');
    const togglePasswordIcon = document.getElementById('toggle-password-icon');

    if (form) {
        form.onsubmit = handleLoginSubmit;	
        
        if (passwordInput) {
            passwordInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') handleLoginSubmit(e);
            });
        }
        if (togglePasswordButton) {
            togglePasswordButton.addEventListener('click', () => {
                const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                passwordInput.setAttribute('type', type);
                togglePasswordIcon.classList.toggle('fa-eye');
                togglePasswordIcon.classList.toggle('fa-eye-slash');
            });
        }
    }
    if (solicitacaoForm) {
        solicitacaoForm.onsubmit = handleSolicitarAcesso;
    }
}

function attachCadastroEvents() {
    const nav = document.getElementById('cadastro-nav');
    if(nav) {
        nav.onclick = (e) => {
            const button = e.target.closest('button');
            if (button) {
                const tabId = button.dataset.tab;
                if (tabId && tabId !== currentCadastroTab) {
                    updateState('cadastroTab', tabId);
                }
            }
        };
    }
    
    if (currentCadastroTab === 'radio') attachCadastroRadioEvents();
    else if (currentCadastroTab === 'equipamento') attachCadastroEquipamentoEvents();
    else if (currentCadastroTab === 'bordos') attachCadastroBordosEvents();
    else if (currentCadastroTab === 'geral') attachCadastroGeralEvents();
}

function attachCadastroRadioEvents() {
    const form = document.getElementById('form-radio');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const id = document.getElementById('radio-id').value;
            const serie = document.getElementById('radio-serie').value.trim();
            const modelo = document.getElementById('radio-modelo').value.trim();
            const status = document.getElementById('radio-status').value;
            
            if (!serie || !modelo) {
                showModal('Erro', 'Número de Série e Modelo são obrigatórios.', 'error');
                return;
            }
            
            const isDuplicateSerie = dbRadios.some(r => r.serie === serie && r.id !== id);
            if (isDuplicateSerie) {
                showModal('Erro', `Este Número de Série (${serie}) já está cadastrado.`, 'error');
                return;
            }

            const record = { id, serie, modelo, status };
            
            if (id) {
                const existingRadio = dbRadios.find(r => r.id === id);
                if (existingRadio && existingRadio.status === 'Em Uso' && status !== 'Em Uso') {
                    record.status = 'Em Uso';	
                    showModal('Aviso', 'O status "Em Uso" só pode ser alterado na aba "Geral" (pela desvinculação).', 'warning');
                }
            }

            await saveRecord('radios', record);	
            
            form.reset();
            document.getElementById('radio-id').value = '';
        };
    }
}

function loadRadioForEdit(id) {
    const radio = dbRadios.find(r => r.id === id);
    if (radio) {
        document.getElementById('radio-id').value = radio.id;
        document.getElementById('radio-serie').value = radio.serie;
        document.getElementById('radio-modelo').value = radio.modelo;
        document.getElementById('radio-status').value = radio.status || 'Disponível';
        
        const statusSelect = document.getElementById('radio-status');
        const emUsoOption = statusSelect.querySelector('option[value="Em Uso"]');
        if (emUsoOption) {
            if (radio.status === 'Em Uso') {
                emUsoOption.disabled = false;
            } else {
                emUsoOption.disabled = true;
            }
        }
        
        showModal('Edição', `Carregando Rádio ${radio.serie} para edição.`, 'info');
        window.scrollTo(0, 0);
    } else {
        showModal('Erro', 'Rádio não encontrado.', 'error');
    }
}

function loadBordoForEdit(id) {
    const bordo = dbBordos.find(b => b.id === id);
    if (bordo) {
        document.getElementById('bordo-id').value = bordo.id;
        document.getElementById('bordo-tipo').value = bordo.tipo;
        document.getElementById('bordo-serie').value = bordo.numeroSerie;
        document.getElementById('bordo-modelo').value = bordo.modelo;
        document.getElementById('bordo-status').value = bordo.status || 'Disponível';

        const statusSelect = document.getElementById('bordo-status');
        const emUsoOption = statusSelect.querySelector('option[value="Em Uso"]');
        if (emUsoOption) {
            if (bordo.status === 'Em Uso') {
                emUsoOption.disabled = false;
            } else {
                emUsoOption.disabled = true;
            }
        }

        showModal('Edição', `Carregando Bordo ${bordo.numeroSerie} (${bordo.tipo}) para edição.`, 'info');
        window.scrollTo(0, 0);
    } else {
        showModal('Erro', 'Bordo não encontrado.', 'error');
    }
}

function attachCadastroBordosEvents() {
    const form = document.getElementById('form-bordos');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const id = document.getElementById('bordo-id').value;
            const tipo = document.getElementById('bordo-tipo').value;
            const numeroSerie = document.getElementById('bordo-serie').value.trim();
            const modelo = document.getElementById('bordo-modelo').value.trim();
            const status = document.getElementById('bordo-status').value;

            if (!tipo || !numeroSerie || !modelo) {
                showModal('Erro', 'Tipo, Número de Série e Modelo são obrigatórios.', 'error');
                return;
            }

            const isDuplicate = dbBordos.some(b => 
                b.tipo === tipo && b.numeroSerie === numeroSerie && b.id !== id
            );
            
            if (isDuplicate) {
                showModal('Erro', `Este Bordo (${tipo}: ${numeroSerie}) já está cadastrado.`, 'error');
                return;
            }

            const record = { id, tipo, numeroSerie, modelo, status };
            
            if (id) {
                const existingBordo = dbBordos.find(b => b.id === id);
                if (existingBordo && existingBordo.status === 'Em Uso' && status !== 'Em Uso') {
                    record.status = 'Em Uso';	
                    showModal('Aviso', 'O status "Em Uso" só pode ser alterado na aba "Geral" (pela desvinculação).', 'warning');
                }
            }

            await saveRecord('bordos', record);	
            
            form.reset();
            document.getElementById('bordo-id').value = '';
        };
    }
}

function attachCadastroEquipamentoEvents() {
    const form = document.getElementById('form-equipamento');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const id = document.getElementById('equipamento-id').value;
            const frota = document.getElementById('equipamento-frota').value.trim();
            const grupo = document.getElementById('equipamento-grupo').value;
            const modelo = document.getElementById('equipamento-modelo').value.trim();
            const subgrupo = document.getElementById('equipamento-subgrupo').value.trim();
            const gestor = document.getElementById('equipamento-gestor').value.trim() || 'Sem Gestor';
            
            if (!frota || !grupo || !modelo || !subgrupo) {
                showModal('Erro', 'Todos os campos, exceto Gestor, são obrigatórios.', 'error');
                return;
            }
            
            const isDuplicateFrota = dbEquipamentos.some(eq => eq.frota === frota && eq.id !== id);
            if (isDuplicateFrota) {
                showModal('Erro', `Esta Frota (${frota}) já está cadastrada.`, 'error');
                return;
            }

            const record = { id, frota, grupo, modelo, subgrupo, gestor };
            await saveRecord('equipamentos', record);	
            
            form.reset();
            document.getElementById('equipamento-id').value = '';
        };
    }
}

function loadEquipamentoForEdit(id) {
    const equipamento = dbEquipamentos.find(e => e.id === id);
    if (equipamento) {
        document.getElementById('equipamento-id').value = equipamento.id;
        document.getElementById('equipamento-frota').value = equipamento.frota;
        document.getElementById('equipamento-grupo').value = equipamento.grupo;
        document.getElementById('equipamento-modelo').value = equipamento.modelo;
        document.getElementById('equipamento-subgrupo').value = equipamento.subgrupo;
        document.getElementById('equipamento-gestor').value = equipamento.gestor === 'Sem Gestor' ? '' : equipamento.gestor;
        showModal('Edição', `Carregando Frota ${equipamento.frota} para edição.`, 'info');
        window.scrollTo(0, 0);
    } else {
        showModal('Erro', 'Equipamento não encontrado.', 'error');
    }
}

function attachCadastroGeralEvents() {
    const equipamentoSelect = document.getElementById('geral-equipamento-id');
    const radioSelect = document.getElementById('geral-radio-id');
    const telaSelect = document.getElementById('geral-tela-id');
    const magSelect = document.getElementById('geral-mag-id');
    const chipSelect = document.getElementById('geral-chip-id');

    const bordoSelects = [telaSelect, magSelect, chipSelect];

    const initTomSelect = (el, placeholder) => {
        if (typeof TomSelect === 'undefined' || !el) return; 
        if (el && !el.TomSelect) {
            new TomSelect(el, {
                plugins: ['dropdown_input'],
                maxItems: 1,
                allowEmptyOption: true,
                placeholder: placeholder,
            });
        }
    };

    const destroyTomSelect = (el) => {
        if (el && el.TomSelect) {
            el.TomSelect.destroy();
        }
    };
    
    destroyTomSelect(equipamentoSelect);
    destroyTomSelect(radioSelect);
    destroyTomSelect(telaSelect);
    destroyTomSelect(magSelect);
    destroyTomSelect(chipSelect);
    
    initTomSelect(equipamentoSelect, 'Digite para buscar a Frota...');
    initTomSelect(radioSelect, 'Digite para buscar o Rádio...');
    initTomSelect(telaSelect, 'Selecione a Tela Disponível...');
    initTomSelect(magSelect, 'Selecione o Mag Disponível...');
    initTomSelect(chipSelect, 'Selecione o Chip Disponível...');

    if (equipamentoSelect) {
        equipamentoSelect.onchange = () => {
            const equipamentoId = equipamentoSelect.value;
            const infoGrupo = document.getElementById('info-grupo');
            const infoSubgrupo = document.getElementById('info-subgrupo');
            const infoGestor = document.getElementById('info-gestor');
            const infoCodigo = document.getElementById('info-codigo');
            
            if(infoGrupo && infoSubgrupo && infoGestor && infoCodigo){	
                if (equipamentoId) {
                    const equipamento = dbEquipamentos.find(e => e.id === equipamentoId);
                    if (equipamento) {
                        infoGrupo.textContent = equipamento.grupo;
                        infoSubgrupo.textContent = equipamento.subgrupo;
                        infoGestor.textContent = equipamento.gestor;

                        if (equipamento.codigo) {
                            infoCodigo.innerHTML = `<span class="font-bold text-green-main">${equipamento.codigo}</span> (Código já vinculado)`;
                        } else {
                            infoCodigo.innerHTML = `<span class="font-semibold text-yellow-600">Nenhum</span> (Será gerado ao salvar)`;
                        }
                        
                        const isLinked = dbRegistros.some(reg => reg.equipamentoId === equipamentoId);
                        const submitBtn = document.querySelector('#form-geral button[type="submit"]');

                        if (isLinked) {
                            submitBtn.disabled = true;
                            submitBtn.textContent = 'Frota já em uso (Gerencie abaixo)';
                            submitBtn.classList.add('bg-gray-400', 'hover:bg-gray-400');
                            submitBtn.classList.remove('bg-green-main', 'hover:bg-green-700');
                            
                            if(radioSelect && radioSelect.TomSelect) radioSelect.TomSelect.disable();
                            bordoSelects.forEach(s => { if(s && s.TomSelect) s.TomSelect.disable(); });
                            
                            showModal('Aviso', 'Esta Frota já possui vínculos ativos. Por favor, use os botões na tabela abaixo para gerenciar (Desvincular/Vincular).', 'warning');
                        } else {
                            submitBtn.disabled = false;
                            submitBtn.textContent = 'Criar Novo Vínculo';
                            submitBtn.classList.remove('bg-gray-400', 'hover:bg-gray-400');
                            submitBtn.classList.add('bg-green-main', 'hover:bg-green-700');
                            
                            if(radioSelect && radioSelect.TomSelect) radioSelect.TomSelect.enable();
                            bordoSelects.forEach(s => { if(s && s.TomSelect) s.TomSelect.enable(); });

                            if(radioSelect && radioSelect.TomSelect) radioSelect.TomSelect.clear();
                            bordoSelects.forEach(s => { if(s && s.TomSelect) s.TomSelect.clear(); });
                        }

                    } else {
                        infoGrupo.textContent = 'N/A'; infoSubgrupo.textContent = 'N/A'; infoGestor.textContent = 'N/A';
                        infoCodigo.textContent = 'N/A';
                    }
                } else {
                    infoGrupo.textContent = 'N/A'; infoSubgrupo.textContent = 'N/A'; infoGestor.textContent = 'N/A';
                    infoCodigo.textContent = 'N/A';
                }
            }
        };
        equipamentoSelect.dispatchEvent(new Event('change'));
    }

    const checkBordoObligatoriedade = () => {
        const selectedBordos = bordoSelects.filter(s => s.value).length;
        const submitBtn = document.querySelector('#form-geral button[type="submit"]');
        
        if (submitBtn.disabled) return;

        if (selectedBordos > 0 && selectedBordos < 3) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Selecione todos os 3 Bordos';
            submitBtn.classList.add('bg-red-400', 'hover:bg-red-400');
            submitBtn.classList.remove('bg-green-main', 'hover:bg-green-700');
            return;
        } 
        
        const radioSelected = !!radioSelect.value;
        const equipamentoSelected = !!equipamentoSelect.value;

        if (equipamentoSelected && (radioSelected || selectedBordos === 3)) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Criar Novo Vínculo';
            submitBtn.classList.remove('bg-red-400', 'hover:bg-red-400', 'bg-gray-400');
            submitBtn.classList.add('bg-green-main', 'hover:bg-green-700');
        } else if (equipamentoSelected) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Selecione Rádio ou Bordos';
            submitBtn.classList.add('bg-gray-400', 'hover:bg-gray-400');
            submitBtn.classList.remove('bg-green-main', 'hover:bg-green-700', 'bg-red-400');
        }
    };
    
    bordoSelects.forEach(s => {
        if (s) {
            s.onchange = checkBordoObligatoriedade;
            s.dispatchEvent(new Event('change'));
        }
    });
    
    if (radioSelect) {
        radioSelect.onchange = checkBordoObligatoriedade;
        radioSelect.dispatchEvent(new Event('change'));
    }

    const form = document.getElementById('form-geral');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            
            const radioId = radioSelect.value || null;
            const equipamentoId = equipamentoSelect.value;
            const telaId = telaSelect.value || null;
            const magId = magSelect.value || null;
            const chipId = chipSelect.value || null;
            
            const bordosSelecionados = [telaId, magId, chipId].filter(id => id).length;

            if (!equipamentoId) {
                showModal('Erro', 'A Frota (Equipamento) é obrigatória para qualquer vínculo.', 'error');
                return;
            }
            if (!radioId && bordosSelecionados === 0) {
                 showModal('Erro', 'Para criar um novo registro, selecione um Rádio ou o Kit de Bordos (3 itens).', 'error');
                 return;
            }
            if (bordosSelecionados > 0 && bordosSelecionados < 3) {
                 showModal('Erro de Bordo', 'Vínculo de Bordos: Se você selecionou um item de Bordo, deve selecionar todos os três (Tela, Mag e Chip).', 'error');
                 return;
            }
            
            const allLinkedItems = [radioId, telaId, magId, chipId].filter(id => id);
            for(const itemId of allLinkedItems) {
                 const isRadio = radioId === itemId;
                 const isLinked = dbRegistros.some(reg => 
                     reg.radioId === itemId || reg.telaId === itemId || reg.magId === itemId || reg.chipId === itemId
                 );
                 if (isLinked) {
                     const item = isRadio ? dbRadios.find(r => r.id === itemId) : dbBordos.find(b => b.id === itemId);
                     const itemType = isRadio ? 'Rádio' : item.tipo;
                     showModal('Item Já Vinculado', `${itemType} ${item.serie || item.numeroSerie} já está em uso em outra Frota. Desvincule-o primeiro.`, 'error');
                     return;
                 }
            }

            const equipamentoRef = doc(db, `artifacts/${appId}/public/data/equipamentos`, equipamentoId);
            const equipamentoSnap = await getDoc(equipamentoRef);
            
            if (!equipamentoSnap.exists()) {
                showModal('Erro', 'Equipamento não encontrado.', 'error');
                return;
            }

            const equipamento = { id: equipamentoSnap.id, ...equipamentoSnap.data() };
            let codigoDoEquipamento = equipamento.codigo;

            if (!codigoDoEquipamento) {
                codigoDoEquipamento = generateCode(equipamento.grupo);	
                if (!codigoDoEquipamento) return; 

                try {
                    await updateDoc(equipamentoRef, { codigo: codigoDoEquipamento });
                } catch (e) {
                    showModal('Erro', 'Não foi possível salvar o novo código no equipamento.', 'error');
                    return;
                }
            }
            
            let record = {
                radioId: radioId,
                equipamentoId: equipamentoId,
                codigo: codigoDoEquipamento, 
                telaId: telaId, 
                magId: magId,
                chipId: chipId,
                createdAt: new Date().toISOString()
            };

            try {
                const batch = writeBatch(db);
                
                const newRegRef = doc(collection(db, `artifacts/${appId}/public/data/registros`));
                batch.set(newRegRef, record);
                
                if (radioId) {
                    const radioRef = doc(db, `artifacts/${appId}/public/data/radios`, radioId);
                    batch.update(radioRef, { status: 'Em Uso' });
                }

                if (telaId) {
                    const telaRef = doc(db, `artifacts/${appId}/public/data/bordos`, telaId);
                    batch.update(telaRef, { status: 'Em Uso' });
                }
                if (magId) {
                    const magRef = doc(db, `artifacts/${appId}/public/data/bordos`, magId);
                    batch.update(magRef, { status: 'Em Uso' });
                }
                if (chipId) {
                    const chipRef = doc(db, `artifacts/${appId}/public/data/bordos`, chipId);
                    batch.update(chipRef, { status: 'Em Uso' });
                }

                await batch.commit();

                showModal('Sucesso!', `Novo Vínculo criado. Código: ${codigoDoEquipamento}`, 'success');
                
                form.reset();
                if(radioSelect && radioSelect.TomSelect) radioSelect.TomSelect.clear();
                if(equipamentoSelect && equipamentoSelect.TomSelect) equipamentoSelect.TomSelect.clear();
                if(telaSelect && telaSelect.TomSelect) telaSelect.TomSelect.clear();
                if(magSelect && magSelect.TomSelect) magSelect.TomSelect.clear();
                if(chipSelect && chipSelect.TomSelect) chipSelect.TomSelect.clear();
                
            } catch (error) {
                console.error("Erro ao salvar associação:", error);
                showModal('Erro', 'Ocorreu um erro ao salvar a associação.', 'error');
            }
        };
    }
}

function attachPesquisaEvents() {
    const searchInput = document.getElementById('search-term');
    if(searchInput) {
        searchInput.oninput = (e) => handleSearchInput(e.target, 'searchTermPesquisa', 1);
        
        const searchButton = document.getElementById('search-button');
        if(searchButton) {
            searchButton.onclick = () => searchInput.dispatchEvent(new Event('input'));
        }
    }
}

function attachSettingsEvents() {
    if (currentSettingTab === 'system') {
        attachSettingsSystemEvents();
    } else if (currentSettingTab === 'users' && currentUser && currentUser.role === 'admin') {
        attachSettingsUsersEvents(); 
    }
}

function attachSettingsSystemEvents() {
    const form = document.getElementById('form-settings-system');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            
            let newLetterMap = {};
            let isValid = true;
            
            GROUPS.forEach(group => {
                const input = document.getElementById(`map-${group.replace(/\s/g, '')}`);
                if (input) {
                    newLetterMap[group] = input.value.trim().toUpperCase();
                    if (!newLetterMap[group]) {
                        isValid = false;
                        showModal('Erro', `O prefixo para '${group}' não pode ser vazio.`, 'error');
                    }
                }
            });

            if (isValid) {
                const newNextIndex = { ...settings.nextIndex };
                
                Object.values(newLetterMap).forEach(prefix => {
                    const indexKey = prefix === 'NUM' ? 'NUM' : prefix;
                    if (newNextIndex[indexKey] === undefined) newNextIndex[indexKey] = 1; 
                });

                settings.letterMap = newLetterMap;
                settings.nextIndex = newNextIndex;	
                
                await saveSettings();	

                showModal('Sucesso', 'Mapeamento de letras salvo!', 'success');
                renderApp();	
            }
        };
    }
}

async function showPermissionModal(userId)	
{
    const settingsDocRef = doc(db, "artifacts", appId, "public", "data", "settings", "config");
    const settingsSnap = await getDoc(settingsDocRef);
    if (!settingsSnap.exists()) {
        showModal('Erro', 'Não foi possível carregar os dados de usuário.', 'error');
        return;
    }

    const usersFromDB = settingsSnap.data().users || [];
    const userIndex = usersFromDB.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
        showModal('Erro', 'Usuário não encontrado.', 'error');
        return;
    }
    
    const user = usersFromDB[userIndex];
    
    if (user.username === ADMIN_PRINCIPAL_EMAIL) {	
        showModal('Permissões Fixas', 'As permissões do usuário Administrador principal são fixas e não podem ser alteradas.', 'warning');
        return;
    }

    const currentPerms = user.permissions || { dashboard: true, cadastro: true, pesquisa: true, settings: false };
    const allTabs = [
        { id: 'dashboard', name: 'Dashboard' }, { id: 'cadastro', name: 'Cadastro' },
        { id: 'pesquisa', name: 'Pesquisa' }, { id: 'settings', name: 'Configurações' }
    ];

    const checkboxesHTML = allTabs.map(tab => `
        <div class="flex items-center">
            <input id="perm-${tab.id}-${user.id}" type="checkbox" ${currentPerms[tab.id] ? 'checked' : ''} class="h-4 w-4 text-green-main border-gray-300 dark:border-gray-600 rounded focus:ring-green-main dark:bg-gray-700" ${tab.id === 'settings' && user.role !== 'admin' ? 'disabled' : ''}>
            <label for="perm-${tab.id}-${user.id}" class="ml-2 block text-sm text-gray-900 dark:text-gray-100">
                ${tab.name} 
                ${tab.id === 'settings' && user.role !== 'admin' ? '<span class="text-xs text-red-500 dark:text-red-400">(Admin-Only)</span>' : ''}
            </label>
        </div>
    `).join('');

    const modal = document.getElementById('global-modal');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const actionsEl = document.getElementById('modal-actions');

    modal.querySelector('div').classList.remove('max-w-sm');
    modal.querySelector('div').classList.add('max-w-lg'); 

    titleEl.textContent = `Permissões de ${user.name}`;
    messageEl.innerHTML = `
        <p class="text-sm text-gray-600 dark:text-gray-300 mb-4">Selecione as abas que este usuário pode acessar.</p>
        <div class="space-y-2">${checkboxesHTML}</div>
    `;
    titleEl.className = `text-xl font-bold mb-3 text-gray-800 dark:text-gray-100`;	

    actionsEl.innerHTML = `
        <button onclick="hideModal(); document.getElementById('global-modal').querySelector('div').classList.remove('max-w-lg'); document.getElementById('global-modal').querySelector('div').classList.add('max-w-sm');"
                class="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 shadow-md">Cancelar</button>
        <button id="confirm-action-btn" class="px-3 py-1.5 text-sm bg-green-main text-white rounded-lg hover:bg-green-700 shadow-md">Salvar</button>
    `;
    
    document.getElementById('confirm-action-btn').onclick = async () => {
        const newPermissions = {};
        allTabs.forEach(tab => {
            const checkbox = document.getElementById(`perm-${tab.id}-${user.id}`);	
            if (checkbox) newPermissions[tab.id] = checkbox.checked;
        });
        
        usersFromDB[userIndex].permissions = newPermissions;
        
        try {
            await setDoc(settingsDocRef, { users: usersFromDB }, { merge: true });
            hideModal();
            document.getElementById('global-modal').querySelector('div').classList.remove('max-w-lg');
            document.getElementById('global-modal').querySelector('div').classList.add('max-w-sm');
            showModal('Sucesso', `Permissões de ${user.name} atualizadas.`, 'success');
            if (currentUser.id === userId) {
                currentUser.permissions = newPermissions;
                handleHashChange();
            } else {
                renderApp();	
            }
        } catch (e) {
            showModal('Erro', 'Não foi possível salvar as permissões.', 'error');
        }
    };

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function handleHashChange() {
    if (!isAuthReady) return;	

    const hash = window.location.hash.substring(1);
    const parts = hash.split('/');
    const targetPage = parts[0] || (currentUser ? 'dashboard' : 'login');
    const subTab = parts.length > 1 ? parts[1] : null;
    
    if (targetPage === 'login' && currentUser) {
        window.history.pushState(null, null, `#${currentPage}`);
        return;
    }
    if (targetPage !== 'login' && !currentUser) {
        updateState('page', 'login');
        return;
    }
    
    const isSettingsAdminPage = targetPage === 'settings';
    const canAccessTargetPage = !currentUser || targetPage === 'login' || currentUser.role === 'admin' || (currentUser.permissions && currentUser.permissions[targetPage]);

    if (isSettingsAdminPage && currentUser.role !== 'admin') {
         showModal('Acesso Negado', 'Você não tem permissão para acessar a página de Configurações.', 'error');
         window.history.pushState(null, null, `#${currentPage}`);	
         return;
    }
    
    if (!canAccessTargetPage) {
        showModal('Acesso Negado', 'Você não tem permissão para acessar esta página.', 'error');
        window.history.pushState(null, null, `#${currentPage}`);	
        return;
    }

    if (targetPage && targetPage !== currentPage) {
        updateState('page', targetPage);
    }	
    else if (targetPage === 'cadastro' && subTab && subTab !== currentCadastroTab) {
        updateState('cadastroTab', subTab);
    } else if (targetPage === 'cadastro' && !subTab && currentCadastroTab !== 'radio') {
        updateState('cadastroTab', 'radio');
    }
    else if (targetPage === 'settings' && subTab && subTab !== currentSettingTab) {
        updateState('settingTab', subTab);
    } else if (targetPage === 'settings' && !subTab && currentSettingTab !== 'system') {
        updateState('settingTab', 'system');
    }	
    else {
        renderApp();	
    }
}

const MIN_SPLASH_TIME = 2000;
let splashStart = 0;

function setupSession() {
    splashStart = Date.now();
    isLoggingIn = true;
    
    loadInitialSettings().then(async () => {
        const session = loadSession();
        
        if (session) {
            const user = settings.users.find(u => u.id === session.id);
            
            if (user) {
                currentUser = {
                    ...user,
                    uid: user.id,
                    email: user.username
                };
                userId = user.id;
                isAuthReady = true;
                
                await attachFirestoreListeners();
                
                const elapsed = Date.now() - splashStart;
                const delay = Math.max(0, MIN_SPLASH_TIME - elapsed);
                
                setTimeout(() => {
                    isLoggingIn = false;
                    currentPage = 'dashboard';
                    renderApp();
                    
                    if (deferredPrompt) {
                        showInstallDialog();
                    }
                }, delay);
                return;
            }
        }
        
        const elapsed = Date.now() - splashStart;
        const delay = Math.max(0, MIN_SPLASH_TIME - elapsed);
        
        setTimeout(() => {
            isAuthReady = true;
            isLoggingIn = false;
            currentPage = 'login';
            renderApp();
        }, delay);
    });
}

function initApp() {
    try {
        app = initializeApp(FIREBASE_CONFIG);
        db = getFirestore(app);
        setLogLevel('info');    
        
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
            const dismissed = localStorage.getItem(PWA_PROMPT_KEY);

            if (!isStandalone && dismissed !== 'installed' && dismissed !== 'dismissed') {
                if (currentUser) {
                    showInstallDialog();
                }
            }
        });
        
        window.addEventListener('appinstalled', () => {
             localStorage.setItem(PWA_PROMPT_KEY, 'installed');
             deferredPrompt = null;
             handlePwaPromptClose('install');
        });
        
        setupSession(); 

    } catch (e) {
        console.error("Erro crítico ao inicializar Firebase:", e);
        const appRoot = document.getElementById('app');
        if (appRoot) {
            appRoot.innerHTML = `<div class="p-4 text-red-500 dark:text-red-400 font-semibold text-center">Erro crítico ao inicializar o Firebase. Verifique as configurações e a conexão.</div>`;
        }
    }
}

function renderApp() {
    const root = document.getElementById('app');
    
   if (!root) {
        console.warn("Elemento raiz '#app' não encontrado. O renderApp será interrompido.");
        return; 
    }    
    let contentHTML = '';

    if (isLoggingIn) {
        contentHTML = renderLoadingScreen();
    } else if (currentUser) {
        contentHTML += renderTopBar();
        contentHTML += '<main class="pb-20 md:pb-8">';
        
        const canAccessCurrentPage = currentUser.role === 'admin' || (currentUser.permissions && currentUser.permissions[currentPage]);

        if (currentPage === 'settings' && currentUser.role !== 'admin') {
            currentPage = 'dashboard';
            window.location.hash = '#dashboard';
            contentHTML += renderDashboard();
        } 
        else if (!canAccessCurrentPage && currentPage !== 'login') {
            showModal('Acesso Negado', 'Você não tem permissão para acessar esta página.', 'error');
            currentPage = 'dashboard';
            window.location.hash = '#dashboard';
            contentHTML += renderDashboard();
        } else {
            switch (currentPage) {
                case 'dashboard': contentHTML += renderDashboard(); break;
                case 'cadastro': contentHTML += renderCadastro(); break;
                case 'pesquisa': contentHTML += renderPesquisa(); break;
                case 'settings': contentHTML += renderSettings(); break;
                default:
                    currentPage = 'dashboard';
                    window.location.hash = '#dashboard';
                    contentHTML += renderDashboard();   
            }
        }
        contentHTML += '</main>';
    } else if (isAuthReady) {
        currentPage = 'login';
        contentHTML += renderLogin();
    } else {
        contentHTML = renderLoadingScreen();
    }

    root.innerHTML = contentHTML;

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', async () => {
            try {
                await navigator.serviceWorker.register('/service-worker.js');
                console.log('✅ Service Worker registrado');
            } catch (e) {
                console.warn('⚠️ Falha ao registrar SW', e);
            }
        });
    }

    if (!isLoggingIn) {
        if (currentPage === 'login' && isAuthReady && !currentUser) {
            attachLoginEvents();
        } else if (currentUser) {
            if (currentPage === 'cadastro') attachCadastroEvents();
            if (currentPage === 'pesquisa') attachPesquisaEvents();
            
            if (currentPage === 'settings') attachSettingsEvents();
            
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
            const dismissed = localStorage.getItem(PWA_PROMPT_KEY);
            
            if (!isStandalone && dismissed !== 'installed' && dismissed !== 'dismissed' && deferredPrompt) {
                 showInstallDialog();
            }
        }
    }
    
    if (currentUser && currentPage === 'settings' && currentSettingTab === 'users' && currentUser.role === 'admin') {
        renderSettingsUsers().then(html => {
            const settingsContent = document.getElementById('settings-content');
            if (settingsContent) {
                 if (currentSettingTab === 'users') {
                     settingsContent.innerHTML = html;
                     attachSettingsUsersEvents();
                 }
            }
        });
    }

    if (focusedSearchInputId) {
        const focusedInput = document.getElementById(focusedSearchInputId);
        if (focusedInput) {
            focusedInput.focus();
            try { focusedInput.setSelectionRange(searchCursorPosition, searchCursorPosition); } 
            catch (e) { /* ignora */ }
        }
    } else {
        window._searchTermTemp = '';    
    }
}

window.onload = initApp;

function handleImport(collection, event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    
    reader.onload = function(e) {
        const data = e.target.result;
        let parsedData = [];

        if (file.name.endsWith('.csv')) {
            Papa.parse(data, {
                header: true, skipEmptyLines: true,
                complete: function(results) {
                    processImportedData(collection, results.data);
                }
            });
        } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            const workbook = XLSX.read(data, { type: 'binary' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            parsedData = XLSX.utils.sheet_to_json(worksheet);
            processImportedData(collection, parsedData);
        } else {
            showModal('Erro', 'Formato de arquivo não suportado. Use CSV ou XLSX.', 'error');
        }
    };
    
    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) reader.readAsBinaryString(file);
    else reader.readAsText(file);
}

function showModal(title, message, type = 'info') {
    const modal = document.getElementById('global-modal');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const actionsEl = document.getElementById('modal-actions');

    modal.querySelector('div').classList.remove('max-w-lg', 'max-w-md', 'max-w-xl');
    modal.querySelector('div').classList.add('max-w-sm');

    titleEl.textContent = title;
    messageEl.innerHTML = message.replace(/\n/g, '<br>');
    
    let titleClass = 'text-gray-800 dark:text-gray-100';
    if (type === 'success') titleClass = 'text-green-main';
    if (type === 'error') titleClass = 'text-red-600 dark:text-red-400';
    if (type === 'warning') titleClass = 'text-yellow-600 dark:text-yellow-400';
    if (type === 'info') titleClass = 'text-blue-600 dark:text-blue-400'; 
    titleEl.className = `text-xl font-bold mb-3 ${titleClass}`;

    actionsEl.innerHTML = `
        <button onclick="hideModal()" class="px-3 py-1.5 text-sm bg-green-main text-white font-semibold rounded-lg hover:bg-green-700 transition-colors shadow-md">
            OK
        </button>
    `;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function showConfirmModal(title, message, callback) {
    const modal = document.getElementById('global-modal');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const actionsEl = document.getElementById('modal-actions');

    modal.querySelector('div').classList.remove('max-w-lg', 'max-w-md', 'max-w-xl');
    modal.querySelector('div').classList.add('max-w-sm');

    titleEl.textContent = title;
    messageEl.innerHTML = message.replace(/\n/g, '<br>');
    titleEl.className = `text-xl font-bold mb-3 text-red-600 dark:text-red-400`;	

    actionsEl.innerHTML = `
        <button onclick="hideModal()" class="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors shadow-md">
            Cancelar
        </button>
        <button id="confirm-action-btn" class="px-3 py-1.5 text-sm bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors shadow-md">
            Confirmar
        </button>
    `;
    
    document.getElementById('confirm-action-btn').onclick = () => {
        hideModal();
        callback();	
    };

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function hideModal() {
    document.getElementById('global-modal').classList.add('hidden');
    document.getElementById('global-modal').classList.remove('flex');
}

function showProfileModal() {
    renderProfileModalContent();
    document.getElementById('profile-modal').classList.remove('hidden');
    document.getElementById('profile-modal').classList.add('flex');
}

function hideProfileModal() {
    document.getElementById('profile-modal').classList.add('hidden');
    document.getElementById('profile-modal').classList.remove('flex');
}

function renderProfileModalContent() {
    const modalContent = document.getElementById('profile-modal-content');
    if (!currentUser) {
        modalContent.innerHTML = '<p class="text-red-500 dark:text-red-400">Erro: Usuário não logado.</p>';
        return;
    }
    
    modalContent.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl shadow-inner border border-gray-200 dark:border-gray-700">
                <h4 class="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3 flex items-center">
                    <i class="fas fa-user-edit mr-2 text-green-main"></i> Gerenciar Nome
                </h4>
                <p class="text-xs text-gray-600 dark:text-gray-300 mb-3">
                    Altere o nome que aparece na barra superior.
                </p>
                <form id="form-personal-name" class="space-y-3">
                    <div>
                        <label for="profile-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Nome de Exibição Atual</label>
                        <input type="text" id="profile-name" required value="${currentUser.name}"
                            class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border text-sm dark:bg-gray-700 dark:text-gray-100">
                    </div>
                    <button type="submit" class="w-full flex justify-center py-2 px-3 border border-transparent text-sm font-medium rounded-lg text-white bg-green-main hover:bg-green-700 shadow-md">
                        <i class="fas fa-save mr-2"></i> Salvar Nome
                    </button>
                </form>
                <div class="mt-4 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-700 dark:text-gray-300 break-words-all">
                    <p><span class="font-semibold">Seu Usuário:</span> ${currentUser.username}</p>
                    <p><span class="font-semibold">Seu Perfil:</span> ${currentUser.role.toUpperCase()}</p>
                </div>
            </div>
            
            <div class="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl shadow-inner border border-red-200 dark:border-red-700">
                <h4 class="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3 flex items-center">
                    <i class="fas fa-key mr-2 text-red-600"></i> Alterar Senha
                </h4>
                <p class="text-xs text-red-600 dark:text-red-400 mb-3">
                    A nova senha deve ter no mínimo 6 caracteres.
                </p>
                <form id="form-change-password" class="space-y-3">
                    <div>
                        <label for="profile-current-password" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Senha Atual</label>
                        <input type="password" id="profile-current-password" required
                            class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-red-500 focus:ring-red-500 p-2 border text-sm dark:bg-gray-700 dark:text-gray-100">
                    </div>
                    <div>
                        <label for="profile-new-password" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Nova Senha</label>
                        <input type="password" id="profile-new-password" required minlength="6"
                            class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-red-500 focus:ring-red-500 p-2 border text-sm dark:bg-gray-700 dark:text-gray-100">
                    </div>
                    <div>
                        <label for="profile-confirm-password" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Confirmar Nova Senha</label>
                        <input type="password" id="profile-confirm-password" required minlength="6"
                            class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-red-500 focus:ring-red-500 p-2 border text-sm dark:bg-gray-700 dark:text-gray-100">
                    </div>
                    <button type="submit" class="w-full flex justify-center py-2 px-3 border border-transparent text-sm font-medium rounded-lg text-white bg-red-600 hover:bg-red-700 shadow-md">
                        <i class="fas fa-lock mr-2"></i> Alterar Senha
                    </button>
                </form>
            </div>
        </div>
    `;
    document.getElementById('form-personal-name').onsubmit = savePersonalName;
    document.getElementById('form-change-password').onsubmit = changePassword;
}

function showDuplicityModal() {
    renderDuplicityModalContent();
    document.getElementById('duplicity-modal').classList.remove('hidden');
    document.getElementById('duplicity-modal').classList.add('flex');
}

function hideDuplicityModal() {
    document.getElementById('duplicity-modal').classList.add('hidden');
    document.getElementById('duplicity-modal').classList.remove('flex');
}

function deleteDuplicityWrapper(collection, id, value) {
    let type;
    if (collection === 'radios') type = 'Rádio (Série)';
    else if (collection === 'equipamentos') type = 'Equipamento (Frota)';
    else if (collection === 'bordos') type = 'Bordo (Tipo/Série)';
    else type = 'Registro';

    showConfirmModal('Confirmar Exclusão de Duplicidade', 
        `Deseja **EXCLUIR PERMANENTEMENTE** o registro duplicado de ${type}: <b>${value}</b>?`, 
        () => deleteDuplicity(collection, id)
    );
}

async function processImportedData(collectionName, data) {
    if (!db || !appId) {
        showModal('Erro', 'Conexão com o banco de dados perdida.', 'error');
        return;
    }

    const newRecords = [];
    let currentDb = collectionName === 'radios' ? dbRadios : (collectionName === 'equipamentos' ? dbEquipamentos : dbBordos);
    let ignoredCount = 0;
    
    const keysBeingImported = new Set(); 

    for (const item of data) {
        let record = { createdAt: new Date().toISOString(), ativo: true };
        let keyToValidate = '';

        if (collectionName === 'radios') {
            const serie = item['Numero de Serie'] || item['NumeroSerie'] || item['serie'];
            const modelo = item['Modelo'] || item['Modelo de Rádio'] || item['modelo'];
            
            if (!serie || !modelo) continue;
            
            record.serie = String(serie).trim();
            record.modelo = String(modelo).trim();
            record.status = 'Disponível';	
            keyToValidate = record.serie;
            
            const isDbDuplicate = currentDb.some(r => r.serie === keyToValidate);
            const isFileDuplicate = keysBeingImported.has(keyToValidate);

            if (isDbDuplicate || isFileDuplicate) {
                 ignoredCount++;
                 continue;
            }
            keysBeingImported.add(keyToValidate);

        } else if (collectionName === 'equipamentos') {
            const frota = item['Frota'];
            const grupo = item['Grupo'];
            const modeloEq = item['Modelo do Equipamento'] || item['Modelo Equipamento'];
            const subgrupo = item['Subgrupo'] || item['Descricao do Equipamento'] || item['Descricao Equipamento'];
            const gestor = item['Gestor'] || 'Sem Gestor';
            
            if (!frota || !grupo || !modeloEq || !subgrupo || !GROUPS.includes(String(grupo).trim())) {
                console.warn('Registro de equipamento inválido ou incompleto:', item);
                continue;
            }

            record.frota = String(frota).trim();
            record.grupo = String(grupo).trim();
            record.modelo = String(modeloEq).trim();
            record.subgrupo = String(subgrupo).trim();	
            record.gestor = String(gestor).trim();
            keyToValidate = record.frota;
            
            const isDbDuplicate = currentDb.some(e => e.frota === keyToValidate);
            const isFileDuplicate = keysBeingImported.has(keyToValidate);

            if (isDbDuplicate || isFileDuplicate) {
                 ignoredCount++;
                 continue;
            }
            keysBeingImported.add(keyToValidate);

        } else if (collectionName === 'bordos') {
            const tipo = item['Tipo'] || item['tipo'];
            const numeroSerie = item['Numero de Serie'] || item['NumeroSerie'] || item['numeroSerie'];
            const modelo = item['Modelo'] || item['modelo'];

            if (!tipo || !numeroSerie || !modelo || !TIPOS_BORDO.includes(String(tipo).trim())) continue;

            record.tipo = String(tipo).trim();
            record.numeroSerie = String(numeroSerie).trim();
            record.modelo = String(modelo).trim();
            record.status = 'Disponível';
            
            keyToValidate = `${record.tipo}-${record.numeroSerie}`;

            const isDbDuplicate = currentDb.some(b => 
                b.tipo === record.tipo && b.numeroSerie === record.numeroSerie
            );
            
            const isFileDuplicate = keysBeingImported.has(keyToValidate);

            if (isDbDuplicate || isFileDuplicate) {
                 ignoredCount++;
                 continue;
            }
            keysBeingImported.add(keyToValidate);

        } else {
            continue;
        }
        
        newRecords.push(record);
    }

    if (newRecords.length > 0) {
        const colPath = `artifacts/${appId}/public/data/${collectionName}`;
        const colRef = collection(db, colPath);
        const batch = writeBatch(db);
        
        newRecords.forEach(record => {
            const newDocRef = doc(colRef);	
            batch.set(newDocRef, record);
        });

        try {
            await batch.commit();
            let msg = `${newRecords.length} registros de ${collectionName} importados com sucesso.`;
            if (ignoredCount > 0) {
                msg += `<br>(${ignoredCount} duplicatas de Série/Frota/Tipo+Série ignoradas.)`;
            }
            showModal('Importação Concluída', msg, 'success');
        } catch (error) {
            showModal('Erro de Importação', 'Ocorreu um erro ao salvar os dados no banco de dados.', 'error');
        }
    } else {
        let msg = 'Nenhum registro novo válido foi encontrado no arquivo.';
        if (ignoredCount > 0) {
            msg += `<br>(${ignoredCount} duplicatas de Série/Frota/Tipo+Série ignoradas.)`;
        }
        showModal('Importação', msg, 'info');
    }
}

window.onhashchange = handleHashChange;

window.showModal = showModal;
window.showConfirmModal = showConfirmModal;
window.hideModal = hideModal;
window.handleImport = handleImport; 
window.handleLogout = handleLogout;
window.handleSearchInput = handleSearchInput;
window.loadRadioForEdit = loadRadioForEdit;
window.loadEquipamentoForEdit = loadEquipamentoForEdit;
window.loadBordoForEdit = loadBordoForEdit; 
window.showPermissionModal = showPermissionModal;
window.renderApp = renderApp;	
window.updateState = updateState;	
window.deleteRecord = deleteRecord;	
window.toggleRecordAtivo = toggleRecordAtivo; 
window.loadUserForEdit = loadUserForEdit;
window.deleteUser = deleteUser;
window.setRadioPage = setRadioPage;
window.setEquipamentoPage = setEquipamentoPage;
window.setBordosPage = setBordosPage;
window.setGeralPage = setGeralPage;
window.setPesquisaPage = setPesquisaPage;
window.handleSolicitarAcesso = handleSolicitarAcesso; 
window.showProfileModal = showProfileModal;
window.hideProfileModal = hideProfileModal;
window.getUserAvatar = getUserAvatar;

window.showDuplicityModal = showDuplicityModal;
window.hideDuplicityModal = hideDuplicityModal;
window.deleteDuplicity = deleteDuplicity;
window.deleteDuplicityWrapper = deleteDuplicityWrapper;

window.approveUserWrapper = approveUserWrapper;
window.rejectUserWrapper = rejectUserWrapper;
window.renderPendingApprovalsModal = renderPendingApprovalsModal;

window.savePersonalName = savePersonalName;
window.changePassword = changePassword;

window.RADIO_IMPORT_INFO = RADIO_IMPORT_INFO;
window.EQUIPAMENTO_IMPORT_INFO = EQUIPAMENTO_IMPORT_INFO;
window.BORDO_IMPORT_INFO = BORDO_IMPORT_INFO;
window.toggleTheme = toggleTheme;

window.deleteLink = deleteLink;
window.deleteDuplicity = deleteDuplicity;
window.deleteDuplicityWrapper = (collectionName, id, value) => {
    showConfirmModal('Confirmar Exclusão', `Deseja realmente excluir esta duplicidade (${value})?`, () => deleteDuplicity(collectionName, id));
};
window.showVincularModal = showVincularModal;
window.hideVincularModal = hideVincularModal; 

window.onload = initApp;
