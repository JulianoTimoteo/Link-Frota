// Importações do Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut,
    updatePassword,
    // NOVO IMPORT: Necessário para criar usuários se o Admin cadastrar com senha/username
    createUserWithEmailAndPassword,
    reauthenticateWithCredential,
    EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
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
    // NOVOS IMPORTS
    getDocs, 
    where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Configuração e Variáveis Globais do Firebase ---
let app, auth, db;

// [CORREÇÃO] Usando a constante FIREBASE_CONFIG e o appId hardcoded
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCb0Dhh_eMHrs_Dyg1wS5nbMu1U6tKHa3A",
    authDomain: "gestaoradios-58b0a.firebaseapp.com",
    projectId: "gestaoradios-58b0a",
    storageBucket: "gestaoradios-58b0a.firebaseapp.com",
    messagingSenderId: "359260635463",
    appId: "1:359260635463:web:1c3ac47eebcd3434818c62",
    measurementId: "G-DVXXT79TZK"
};
const appId = "gestaoradios-58b0a"; // [CORREÇÃO] appId hardcoded

let userId;
let isAuthReady = false;	
let firestoreListeners = [];	

// --- Variáveis de Estado Global (App) ---
let currentUser = null;	
let currentPage = 'login';
let currentLoginView = 'login'; // 'login' ou 'solicitar'
let currentCadastroTab = 'radio';
let currentSettingTab = 'system'; 
let isLoggingIn = false;
// 🌟 NOVO: Aumentado de 6 para 10
const PAGE_SIZE = 10; 
// NOVO: Armazena usuários aguardando aprovação
let pendingUsers = [];
// 🌟 NOVO: Armazena duplicidades críticas
let duplicities = [];

// Paginação e Busca
// 🌟 ATUALIZADO: bordosPage adicionado
let radioPage = 1, equipamentoPage = 1, bordosPage = 1, geralPage = 1, pesquisaPage = 1; 
const PESQUISA_PAGE_SIZE = 10; // 🌟 NOVO: Tamanho fixo para pesquisa
// 🌟 ATUALIZADO: bordosSearch adicionado
let radioSearch = '', equipamentoSearch = '', bordosSearch = '', geralSearch = '';
let focusedSearchInputId = null;
let searchCursorPosition = 0;
let searchTermPesquisa = ''; // 🌟 NOVO: Termo de busca da aba Pesquisa

// Constantes de Configuração
const GROUPS = ['Colheita', 'Transporte', 'Oficina', 'TPL', 'Industria'];
// 🌟 ATUALIZADO: Status de Rádio e Bordo (Incluindo Sinistro)
const DISPONIBLE_STATUSES = ['Disponível', 'Manutenção', 'Sinistro']; 
// 🌟 NOVO: Tipos de Bordos
const TIPOS_BORDO = ['Tela', 'Mag', 'Chip'];
const DEFAULT_LETTER_MAP = {
    Colheita: 'A',
    Transporte: 'B', 
    Oficina: 'NUM',
    TPL: 'D',
    Industria: 'C'
};
const DEFAULT_NEXT_INDEX = { A: 1, B: 1, C: 1, D: 1, NUM: 1 };

// E-mail do Administrador Principal (Corrigido para o email do usuário no último contexto)
const ADMIN_PRINCIPAL_EMAIL = 'julianotimoteo@usinapitangueiras.com.br';

// --- Estado do Banco de Dados (In-memory Cache) ---
let dbRadios = [];
let dbEquipamentos = [];
// 🌟 NOVO: Cache de Bordos
let dbBordos = [];
let dbRegistros = [];
let settings = {
    letterMap: DEFAULT_LETTER_MAP,
    nextIndex: DEFAULT_NEXT_INDEX,
    users: []	
};

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

// 🌟 NOVO: Constante de Tooltip para Bordos
const BORDO_IMPORT_INFO = `
    O arquivo CSV ou XLSX deve conter as seguintes colunas obrigatórias:
    <ul class="list-disc list-inside mt-2 space-y-1">
        <li class="font-semibold">Tipo (Deve ser: Tela, Mag ou Chip)</li>
        <li class="font-semibold">Numero de Serie</li>
        <li class="font-semibold">Modelo</li>
    </ul>
    <p class="mt-2 text-red-500 font-semibold">Atenção: A coluna "Tipo" deve ter um dos valores exatos: Tela, Mag ou Chip.</p>
`;


// 🌟 NOVO: Função central de verificação de duplicidades
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


// --- Funções de Utilitário e Estado ---
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

/**
 * NOVO: Cria um email genérico para uso no Firebase Auth
 */
function createGenericEmail(customUsername, appId) {
    // Garante que o username é seguro para ser a parte local do email
    const safeUsername = customUsername.toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${safeUsername}@${appId}.fake`;
}

async function loadInitialSettings() {
    if (!db || !appId) return;

    const settingsDocRef = doc(db, "artifacts", appId, "public", "data", "settings", "config");
    try {
        // Tenta ler as configurações. A regra de segurança deve permitir a leitura para corrigir o erro inicial.
        const settingsSnap = await getDoc(settingsDocRef);
        if (settingsSnap.exists()) {
            const data = settingsSnap.data();
            settings.letterMap = data.letterMap || DEFAULT_LETTER_MAP;
            settings.nextIndex = data.nextIndex || DEFAULT_NEXT_INDEX;
            settings.users = data.users || []; 
        } else {
            console.warn("Documento de 'settings/config' não encontrado. Usando padrões locais.");
            // Define um usuário admin padrão se não houver configurações
            if (settings.users.length === 0) {
                settings.users = [{ 
                    id: crypto.randomUUID(), 
                    name: "Juliano Timoteo (Admin Padrão)", 
                    username: ADMIN_PRINCIPAL_EMAIL, 
                    role: "admin",
                    permissions: { dashboard: true, cadastro: true, pesquisa: true, settings: true }
                }];
            }
            // Tenta salvar, permitindo que a aplicação se configure se as regras permitirem.
            saveSettings();	
        }
    } catch (e) {
        // Loga o erro, mas a aplicação continua com os valores padrão de settings.users (a contingência no auth listener será usada).
        console.error("Erro ao carregar 'settings/config' na inicialização:", e);
    }
}


async function attachFirestoreListeners() {
    detachFirestoreListeners();	
    if (!db || !appId || !currentUser) return; // Só anexa se estiver autenticado

    // 1. Sincronizar Coleções (Acesso: Autenticado - Regra 3)
    const collectionsToSync = {
        'radios': (data) => dbRadios = data,
        'equipamentos': (data) => dbEquipamentos = data,
        // 🌟 NOVO: Listener para Bordos
        'bordos': (data) => dbBordos = data, 
        'registros': (data) => dbRegistros = data,
    };

    Object.keys(collectionsToSync).forEach(colName => {
        // Coleções públicas (Regra 3)
        const colPath = `artifacts/${appId}/public/data/${colName}`;
        const q = query(collection(db, colPath));
         
        const unsub = onSnapshot(q, (querySnapshot) => {
            const data = [];
            querySnapshot.forEach((doc) => {
                data.push({ id: doc.id, ...doc.data() });
            });
            
            collectionsToSync[colName](data);	
            
            // 🌟 NOVO: Verificar duplicidades após cada atualização do banco
            checkDuplicities();
            
            if(isAuthReady) {
                // A renderização principal agora é gerenciada pelo splash screen
                // Se não estiver logando, renderiza imediatamente
                if(!isLoggingIn) renderApp();
            }

        }, (error) => {
            console.error(`Erro no listener de ${colName}:`, error);
            showModal('Erro de Sincronia', `Não foi possível carregar dados de ${colName}. Verifique suas permissões.`, 'error');
        });
        firestoreListeners.push(unsub);
    });
    
    // 2. Listener para Solicitações Pendentes (Acesso: Apenas Admin - Regra 1)
    if (currentUser.role === 'admin') {
        const pendingColPath = `artifacts/${appId}/public/data/pending_approvals`;
        const qPending = query(collection(db, pendingColPath));

        const unsubPending = onSnapshot(qPending, (querySnapshot) => {
            const data = [];
            querySnapshot.forEach((doc) => {
                data.push({ id: doc.id, ...doc.data() });
            });
            pendingUsers = data;
            if(isAuthReady) {
                if(!isLoggingIn) renderApp();
            }
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
    // [CORREÇÃO] Usa appId hardcoded
    const settingsDocRef = doc(db, "artifacts", appId, "public", "data", "settings", "config");
    try {
        // A escrita aqui exige permissão de isAdmin() (Regra 1)
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
            // 🌟 ATUALIZADO: Nova aba de bordos é o default, se houver
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

// --- Funções de Paginação (NOVA CORREÇÃO) ---
function setRadioPage(delta) {
    radioPage = Math.max(1, radioPage + delta);
    renderApp();
}
function setEquipamentoPage(delta) {
    equipamentoPage = Math.max(1, equipamentoPage + delta);
    renderApp();
}
// 🌟 NOVO: Paginação para a aba Bordos
function setBordosPage(delta) {
    bordosPage = Math.max(1, bordosPage + delta);
    renderApp();
}
function setGeralPage(delta) {
    geralPage = Math.max(1, geralPage + delta);
    renderApp();
}
// 🌟 NOVO: Paginação para a aba Pesquisa
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
    
    nextIndex[indexKey] = index + 1;
    settings.nextIndex = nextIndex;	
    
    saveSettings();	

    return code;
}

// --- Funções de CRUD ---

async function saveRecord(collectionName, record) {
    if (!db || !appId) {
        showModal('Erro', 'Conexão com o banco de dados perdida.', 'error');
        return;
    }
    
    // [CORREÇÃO] Usa appId hardcoded
    const colPath = `artifacts/${appId}/public/data/${collectionName}`;
    let recordData = { ...record };	

    try {
        if (recordData.id) {
            // Update
            const docRef = doc(db, colPath, recordData.id);
            delete recordData.id;	
            await setDoc(docRef, recordData, { merge: true });
            showModal('Sucesso', 'Registro atualizado com sucesso!', 'success');
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
                 // 🌟 NOVO: Status padrão para itens de bordo
                recordData.status = 'Disponível'; 
            }
            delete recordData.id;	
            await addDoc(collection(db, colPath), recordData);
            showModal('Sucesso', 'Registro adicionado com sucesso!', 'success');
        }
    } catch (error) {
        console.error("Erro ao salvar registro:", error);
        showModal('Erro', 'Não foi possível salvar o registro no banco de dados.', 'error');
    }
}

async function deleteRecord(collectionName, id) {
    if (!db || !appId) {
        showModal('Erro', 'Conexão com o banco de dados perdida.', 'error');
        return;
    }
    
    // [CORREÇÃO] Usa appId hardcoded
    const colPath = `artifacts/${appId}/public/data/${collectionName}`;

    try {
        if (collectionName === 'registros') {
            // DESVINCULAÇÃO - Lógica do Registro Geral
            const regRef = doc(db, colPath, id);
            const regSnap = await getDoc(regRef);	

            if (!regSnap.exists()) {
                showModal('Erro', 'Registro não encontrado para desvinculação.', 'error');
                return;
            }

            const registroRemovido = regSnap.data();
            const batch = writeBatch(db);

            // 1. Remove o registro principal (Associação Rádio-Equipamento-Bordos)
            batch.delete(regRef);
            
            // 2. Atualiza o status do Rádio para "Disponível"
            if (registroRemovido && registroRemovido.radioId) {
                const radioRef = doc(db, `artifacts/${appId}/public/data/radios`, registroRemovido.radioId);
                batch.update(radioRef, { status: 'Disponível' });
            }

            // 3. Atualiza o status dos Bordos para "Disponível" (se existirem)
            if (registroRemovido.telaId) {
                const telaRef = doc(db, `artifacts/${appId}/public/data/bordos`, registroRemovido.telaId);
                batch.update(telaRef, { status: 'Disponível' });
            }
            if (registroRemovido.magId) {
                const magRef = doc(db, `artifacts/${appId}/public/data/bordos`, registroRemovido.magId);
                batch.update(magRef, { status: 'Disponível' });
            }
            if (registroRemovido.chipId) {
                const chipRef = doc(db, `artifacts/${appId}/public/data/bordos`, registroRemovido.chipId);
                batch.update(chipRef, { status: 'Disponível' });
            }

            await batch.commit();
            
            showModal('Sucesso', 'Associação desvinculada e itens atualizados com sucesso!', 'success');
        
        } else {
            // Lógica de inativação foi movida para toggleRecordAtivo
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
    
    // [CORREÇÃO] Usa appId hardcoded
    const colPath = `artifacts/${appId}/public/data/${collectionName}`;

    try {
        const docRef = doc(db, colPath, id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            showModal('Erro', 'Registro não encontrado.', 'error');
            return;
        }

        const currentData = docSnap.data();
        // Alterna o estado. Se ativo for false, vira true. Se for true ou undefined, vira false.
        const newAtivoState = !(currentData.ativo !== false);	

        // Se está tentando INATIVAR, checa as regras de bloqueio
        if (newAtivoState === false) {	
            if (collectionName === 'radios' && dbRegistros.some(reg => reg.radioId === id)) {
                showModal('Ação Bloqueada', 'Não é possível inativar um rádio que está vinculado.\n\nDesvincule na aba "Geral" primeiro.', 'error');
                return;
            }
            if (collectionName === 'equipamentos' && dbRegistros.some(reg => reg.equipamentoId === id)) {
                showModal('Ação Bloqueada', 'Não é possível inativar um equipamento que possui um rádio vinculado.\n\nDesvincule na aba "Geral" primeiro.', 'error');
                return;
            }
            // 🌟 NOVO: Bloqueio para Bordos
            if (collectionName === 'bordos') {
                const isLinked = dbRegistros.some(reg => reg.telaId === id || reg.magId === id || reg.chipId === id);
                if (isLinked) {
                    showModal('Ação Bloqueada', `Não é possível inativar o Bordo (${currentData.tipo}) que está vinculado.\n\nDesvincule na aba "Geral" primeiro.`, 'error');
                    return;
                }
            }
        }
        
        // Atualiza o status
        await updateDoc(docRef, { ativo: newAtivoState });	
        showModal('Sucesso', `Registro ${newAtivoState ? 'ATIVADO' : 'INATIVADO'} com sucesso!`, 'success');
        // renderApp() é chamado automaticamente pelo onSnapshot
        
    } catch (error) {
        console.error("Erro ao alternar status do registro:", error);
        showModal('Erro', 'Ocorreu um erro durante a operação.', 'error');
    }
}

// 🌟 NOVO: Função para excluir uma duplicidade (exceção à regra)
async function deleteDuplicity(collectionName, id) {
    if (!db || !appId) {
        showModal('Erro', 'Conexão com o banco de dados perdida.', 'error');
        return;
    }

    // Bloqueia a exclusão se o item estiver vinculado a um registro ativo
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

    // [CORREÇÃO] Usa appId hardcoded
    const colPath = `artifacts/${appId}/public/data/${collectionName}`;

    try {
        // Tenta excluir o documento
        await deleteDoc(doc(db, colPath, id));

        showModal('Sucesso', 'Duplicidade removida com sucesso! A integridade dos dados será verificada novamente.', 'success');
        
        // Força nova verificação e renderização
        checkDuplicities(); 
        renderApp();
        hideDuplicityModal();
        
    } catch (error) {
        console.error("Erro ao excluir duplicidade:", error);
        showModal('Erro', 'Ocorreu um erro ao excluir a duplicidade.', 'error');
    }
}


// --- Funções de CRUD de Usuário (ATUALIZADO PARA CUSTOM LOGIN) ---

function loadUserForEdit(id) {
    const user = settings.users.find(u => u.id === id);
    if (user) {
        document.getElementById('user-id').value = user.id;
        document.getElementById('user-name').value = user.name;
        document.getElementById('user-username').value = user.username; // Email
        document.getElementById('user-custom-username').value = user.customUsername || ''; // NOVO: Nome de usuário
        document.getElementById('user-role').value = user.role;
        
        // Oculta o campo de senha para edição, a menos que o admin queira alterá-la.
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
    let email = document.getElementById('user-username').value.trim(); // Email
    const customUsername = document.getElementById('user-custom-username').value.trim(); // NOVO: Nome de usuário
    const password = document.getElementById('user-password').value; // Senha (apenas para criação/reset)
    const role = document.getElementById('user-role').value;
    
    // Validação de campos obrigatórios
    if (!name || !role) {
        showModal('Erro', 'Nome Completo e Perfil são obrigatórios.', 'error');
        return;
    }

    // 1. Lógica de email/username
    if (customUsername) {
        // Se houver customUsername, o email é opcional.
        if (!email) {
            // Gera email genérico se customUsername existe e email não.
            email = createGenericEmail(customUsername, appId);
        } else if (!isEmail(email)) {
            showModal('Erro', 'O campo Username (Email) deve ser um email válido ou vazio se usar Nome de Usuário.', 'error');
            return;
        }
    } else if (!isEmail(email)) {
        // Se não houver customUsername, o email é obrigatório e deve ser válido.
        showModal('Erro', 'Username (Email) é obrigatório ou forneça um Nome de Usuário.', 'error');
        return;
    }


    const usersFromDB = settings.users;
    const isEditing = !!id;
    
    // 2. Checagem de duplicidade (Username/Email E Nome de Usuário)
    const isDuplicateEmail = usersFromDB.some(u => 
        u.username === email && (!isEditing || u.id !== id)
    );

    if (isDuplicateEmail) {
        showModal('Erro', `Este Email (${email}) já está em uso.`, 'error');
        return;
    }

    if (customUsername) {
         const isDuplicateCustomUsername = usersFromDB.some(u => 
             u.customUsername && u.customUsername.toLowerCase() === customUsername.toLowerCase() && (!isEditing || u.id !== id)
         );
         if (isDuplicateCustomUsername) {
             showModal('Erro', `Este Nome de Usuário (${customUsername}) já está em uso.`, 'error');
             return;
         }
    }

    let userToSave;
    let shouldCreateAuth = false;
    let shouldUpdateAuthPassword = false;

    if (isEditing) {
        userToSave = usersFromDB.find(u => u.id === id);
        if (!userToSave) {
            showModal('Erro', 'Erro ao encontrar usuário para edição.', 'error');
            return;
        }
        
        // Se a senha foi preenchida na edição
        if (password.length > 0) {
            if (password.length < 6) {
                showModal('Erro', 'A senha deve ter pelo menos 6 caracteres para ser salva.', 'error');
                return;
            }
            shouldUpdateAuthPassword = true;
        }

        userToSave.name = name;
        userToSave.username = email;
        userToSave.customUsername = customUsername;
        userToSave.role = role;
        // Mantém as permissões existentes

    } else {
        // Novo usuário
        if (password.length < 6) {
            showModal('Erro', 'Para um novo usuário, a Senha é obrigatória e deve ter pelo menos 6 caracteres.', 'error');
            return;
        }

        userToSave = { 
            id: crypto.randomUUID(), // Novo ID único
            name, 
            username: email, // O email (real ou fake) que será usado no Firebase Auth
            customUsername, // O nome de usuário de login (se existir)
            role, 
            permissions: {} // Permissões padrão vazias
        };
        usersFromDB.push(userToSave);
        shouldCreateAuth = true;
    }
    
    // Definição de permissões padrão para um novo usuário ou se o perfil mudou para admin
    if (!isEditing || role === 'admin') {
        userToSave.permissions = {
            dashboard: true, cadastro: true, pesquisa: true, settings: role === 'admin'
        };
    }

    try {
        // 3. (NOVO) Criar/Atualizar Usuário no Firebase Auth
        if (shouldCreateAuth) {
            // Se for customUsername, tentamos criar no Auth com o email fake
            if (userToSave.customUsername) {
                await createUserWithEmailAndPassword(auth, email, password);
            } else {
                // Se for email real, o Admin já deve ter criado no Auth ou o usuário se registrou por solicitação
                // Se a criação falhar aqui, o Admin deve resolver o Auth
            }
        }
        
        // Se for edição e a senha foi alterada
        if (shouldUpdateAuthPassword) {
            // Se for customUsername, armazenamos a senha para check local (método não-padrão)
            if (userToSave.customUsername) {
                userToSave.loginPassword = password; 
            } else {
                // Para login por email normal, a senha deve ser alterada pelo próprio usuário via modal de perfil.
                showModal('Aviso de Senha', 'Para usuários com email real, a senha só pode ser alterada via reautenticação do próprio usuário. O campo de senha para este perfil foi ignorado.', 'warning');
            }
        } else if (shouldCreateAuth && userToSave.customUsername) {
            // Para novos usuários com customUsername, armazena a senha inicial para o check no login.
            userToSave.loginPassword = password; 
        }

        // 4. Salva a lista completa no Firestore (incluindo customUsername e loginPassword)
        const settingsDocRef = doc(db, "artifacts", appId, "public", "data", "settings", "config");
        await setDoc(settingsDocRef, { users: usersFromDB }, { merge: true });

        showModal('Sucesso', `Perfil de ${name} ${isEditing ? 'atualizado' : 'cadastrado'} com sucesso!`, 'success');
        
        // Força a re-renderização
        renderApp();

        // Limpa o formulário após a próxima renderização para evitar o erro "Cannot read properties of null (reading 'reset')"
        setTimeout(() => {
            const currentForm = document.getElementById('form-user');
            if (currentForm) {
                currentForm.reset();
                document.getElementById('user-id').value = '';
                document.getElementById('user-form-title').textContent = 'Novo Perfil de Usuário';
                document.getElementById('user-password-field').classList.remove('hidden');
            }
        }, 100);

    } catch (e) {
        console.error("Erro ao salvar perfil de usuário/Auth:", e);
        let msg = 'Não foi possível salvar o perfil. Verifique se o usuário já existe no Firebase Auth ou se a senha tem 6+ caracteres.';
        if (e.code === 'auth/email-already-in-use') {
            msg = `O email (${email}) já está em uso no Firebase Auth. Verifique o console do Firebase ou exclua o usuário primeiro.`;
        }
        showModal('Erro', msg, 'error');
    }
}

async function deleteUser(id) {
    const settingsDocRef = doc(db, "artifacts", appId, "public", "data", "settings", "config");
    let usersFromDB = settings.users;
    const userIndex = usersFromDB.findIndex(u => u.id === id);
    
    if (userIndex === -1) {
        showModal('Erro', 'Usuário não encontrado para exclusão.', 'error');
        return;
    }

    const userName = usersFromDB[userIndex].name;
    const userUsername = usersFromDB[userIndex].username;

    // Bloqueia exclusão do admin principal
    if (userUsername === ADMIN_PRINCIPAL_EMAIL) {
        showModal('Bloqueado', 'O usuário principal (Admin) não pode ser excluído.', 'warning');
        return;
    }
    
    usersFromDB.splice(userIndex, 1); // Remove o usuário
    
    try {
        // Salva a lista completa (sem o usuário removido) no Firestore
        await setDoc(settingsDocRef, { users: usersFromDB }, { merge: true });
        showModal('Sucesso', `Perfil de ${userName} excluído com sucesso!`, 'success');
        // NOTA: A exclusão do usuário do Firebase Auth deve ser feita manualmente pelo Admin via Console, por segurança.
        renderApp(); 
    } catch (e) {
        console.error("Erro ao excluir perfil de usuário:", e);
        showModal('Erro', 'Não foi possível excluir o perfil no banco de dados.', 'error');
    }
}

// --- Funções de Gerenciamento de Pendências (Novo) ---

async function approveUser(pendingId, name, email, tempPassword) {
    if (!db || !appId || currentUser.role !== 'admin') {
        showModal('Acesso Negado', 'Você não tem permissão para aprovar usuários.', 'error');
        return;
    }

    const usersFromDB = settings.users;
    
    // 1. Criar usuário no Firebase Auth
    try {
        await createUserWithEmailAndPassword(auth, email, tempPassword);
    } catch (e) {
        if (e.code === 'auth/email-already-in-use') {
             // Se o email já estiver em uso, apenas o adicionamos ao Firestore
             showModal('Aviso de Auth', `O email ${email} já existe no Firebase Auth. Apenas o perfil no sistema será criado.`, 'warning');
        } else {
             showModal('Erro de Auth', `Erro ao criar usuário no Firebase Auth: ${e.message}`, 'error');
             return;
        }
    }

    // 2. Adicionar usuário na lista de usuários do sistema (settings.users)
    const newUser = { 
        id: crypto.randomUUID(), // Novo ID único
        name, 
        username: email, 
        role: 'user', // Começa como usuário padrão
        permissions: { dashboard: true, cadastro: true, pesquisa: true, settings: false } // Permissões padrão
    };
    usersFromDB.push(newUser);

    // 3. Remover da lista de pendências (pending_approvals)
    // [CORREÇÃO] Usa appId hardcoded
    const pendingDocRef = doc(db, `artifacts/${appId}/public/data/pending_approvals`, pendingId);

    try {
        // Usa batch para garantir atomicidade das operações
        const batch = writeBatch(db);
        
        // 3a. Remover pendência
        batch.delete(pendingDocRef);

        // 3b. Salvar nova lista de usuários
        const settingsDocRef = doc(db, "artifacts", appId, "public", "data", "settings", "config");
        batch.update(settingsDocRef, { users: usersFromDB });
        
        await batch.commit();

        // 4. Notificar sucesso e fechar modal
        hideModal();
        showModal('Usuário Aprovado', `O usuário <b>${name}</b> (${email}) foi aprovado como 'Usuário Padrão'. Ele pode logar agora.`, 'success');
        renderApp(); 
        
    } catch (e) {
        showModal('Erro', 'Não foi possível aprovar o usuário.', 'error');
    }
}

async function rejectUser(pendingId, name) {
    if (!db || !appId || currentUser.role !== 'admin') {
        showModal('Acesso Negado', 'Você não tem permissão para negar usuários.', 'error');
        return;
    }

    // 1. Remover da lista de pendências (pending_approvals)
    // [CORREÇÃO] Usa appId hardcoded
    const pendingDocRef = doc(db, `artifacts/${appId}/public/data/pending_approvals`, pendingId);
    
    try {
        await deleteDoc(pendingDocRef);

        // 2. Notificar sucesso e fechar modal
        hideModal();
        showModal('Usuário Negado', `O acesso de <b>${name}</b> foi negado e removido da lista de pendências.`, 'warning');
        renderApp(); 
        
    } catch (e) {
        showModal('Erro', 'Não foi possível negar o acesso.', 'error');
    }
}

// NOVO: Função para solicitar acesso
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

    // 1. Verificar se o email já está aprovado
    const appUser = settings.users.find(u => u.username === email);
    if (appUser) {
        showModal('Acesso Já Aprovado', 'Este email já possui um perfil aprovado. Tente o login.', 'info');
        return;
    }

    // 2. Verificar se já existe uma solicitação pendente com este email
    // [CORREÇÃO] Usa appId hardcoded
    const pendingColRef = collection(db, `artifacts/${appId}/public/data/pending_approvals`);
    const q = query(pendingColRef, where("email", "==", email));
    const pendingSnap = await getDocs(q);
    
    if (!pendingSnap.empty) {
        showModal('Solicitação Pendente', 'Este email já possui uma solicitação de acesso pendente. Aguarde a aprovação do administrador.', 'warning');
        return;
    }

    try {
        // 3. Envia a nova solicitação para o Firestore (Permissão permitida para qualquer usuário - Regra 1)
        await addDoc(pendingColRef, {
            name: nome,
            email: email,
            phone: telefone,
            tempPassword: senhaProvisoria, // A senha provisória é apenas para referência do Admin
            createdAt: new Date().toISOString()
        });

        showModal('Solicitação Enviada', 
            `Sua solicitação de acesso foi enviada com sucesso para aprovação. Você será notificado após a análise.`, 
            'success');
        
        // Volta para a tela de login principal
        form.reset();
        updateState('loginView', 'login');
    
    } catch (error) {
        showModal('Erro', 'Ocorreu um erro ao enviar sua solicitação.', 'error');
    }
}

function renderPendingApprovalsModal() {
    // Regra 1 permite apenas Admin Principal ler a coleção, mas vamos checar a role localmente
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
    // Remove a classe 'max-w-sm' do modal principal para permitir mais espaço
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

// Wrappers para lidar com aspas em strings
window.approveUserWrapper = (id, name, email, tempPassword) => {
    showConfirmModal('Confirmar Aprovação', `Deseja aprovar o acesso de <b>${name}</b>? Ele receberá permissões de 'Usuário Padrão' e será criado no Auth com a senha provisória.`, () => approveUser(id, name, email, tempPassword));
};
window.rejectUserWrapper = (id, name) => {
    showConfirmModal('Confirmar Negação', `Deseja negar o acesso de <b>${name}</b>? A solicitação será removida.`, () => rejectUser(id, name));
};
window.renderPendingApprovalsModal = renderPendingApprovalsModal;


// 🌟 NOVO: Funções de Gerenciamento de Duplicidades 🌟

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
        // 🌟 ATUALIZADO: Inclui Bordos na label
        let typeLabel;
        if (group.collection === 'radios') typeLabel = 'Rádio (Série)';
        else if (group.collection === 'equipamentos') typeLabel = 'Equipamento (Frota)';
        else if (group.collection === 'bordos') typeLabel = `Bordo (Tipo/Série)`;
        else typeLabel = 'Item Desconhecido';
        
        const itemsList = group.items.map(item => {
            const date = new Date(item.createdAt).toLocaleString();
            let isLinked = false;
            // 🌟 ATUALIZADO: Checa vínculo para Bordos também
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
// ----------------------------------------------------

// 🌟 NOVO: Lógica de Tema
function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    if (isDark) {
        localStorage.setItem('theme', 'dark');
    } else {
        localStorage.setItem('theme', 'light');
    }
    // Força a re-renderização apenas da TopBar para atualizar o botão
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
// ----------------------------------------------------


// --- Funções de Renderização (HTML) ---

function renderTopBar() {
    const allTabs = [
        // Corrigido para manter os nomes originais e IDs. A cor virá do CSS nth-child.
        { id: 'dashboard', name: 'Dashboard', icon: 'fa-chart-line' }, // 1º child -> Azul
        { id: 'cadastro', name: 'Cadastro', icon: 'fa-box' }, // 2º child -> Roxa
        { id: 'pesquisa', name: 'Pesquisa', icon: 'fa-search' }, // 3º child -> Verde Água
        // Removido 'my-profile' daqui. 'settings' agora é o 4º
        { id: 'settings', name: 'Configurações', icon: 'fa-cog', adminOnly: true } // 4º child -> Laranja
    ];
    
    // Filtra as abas para o usuário atual
    const tabs = allTabs.filter(tab => {
        if (!currentUser) return false;
        if (tab.id === 'settings' && currentUser.role !== 'admin') {
            // Permite a aba Settings apenas para Admin.
            return false;
        }
        // Permite acesso se for admin OU se tiver a permissão específica
        return currentUser.role === 'admin' || (currentUser.permissions && currentUser.permissions[tab.id] === true);
    });
    
    const tabLinks = tabs.map(tab => {
        const isActive = currentPage === tab.id;
        // 'checked' simula o estado ativo do radio button
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

    // 🌟 NOVO: Lógica do Sino de Integridade
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
                        <h1 class="text-xl font-bold text-gray-800 dark:text-gray-100 hidden sm:block">📻 Gestão de Rádios</h1>
                        <h1 class="text-xl font-bold text-gray-800 dark:text-gray-100 block sm:hidden">📻 GR</h1>
                    </div>

                    <nav class="hidden md:block mx-auto flex-none">
                        <div class="radio-group-container border-b border-gray-200 dark:border-gray-700">
                            ${tabLinks}
                        </div>
                    </nav>
                    
                    <div class="flex-1 flex justify-end items-center space-x-4">
                        
                        ${renderThemeButton()} ${duplicityBell}
                        
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
                            // Usando o nome original no mobile
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
    // [NOVO] Recupera o valor salvo (pode ser email ou username)
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
                    Use seu email ou nome de usuário e senha para continuar
                </p>
            </div>
            <form id="login-form" class="mt-8 space-y-6">
                <input type="text" id="login-input" placeholder="Email ou Nome de Usuário" required	
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
                            Lembrar Login
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

// --- Funções para Ícones SVG (Design mais moderno e controlável) ---
function getRadioIcon() {
    // Símbolo de rádio/onda (ajustado para a nova cor)
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
    // Símbolo de torre de transmissão (ajustado para a nova cor)
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
    // Símbolo de Chave de manutenção (ajustado para a nova cor)
    return `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.4 1.4a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.77 3.77z"></path>
        </svg>
    `;
}

function getWarehouseIcon() {
    // Símbolo de estoque/armazém (ajustado para a nova cor)
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
    // Símbolo de Alerta/Perigo/Risco
    return `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12" y2="17"></line>
        </svg>
    `;
}

// 🌟 NOVO: Ícone para itens de Bordo
function getBordoIcon() {
    // Símbolo de chip / circuito
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
    // Símbolo de empilhamento de componentes/kits
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


// --- NOVA FUNÇÃO PARA AVATAR/IMAGEM DE PERFIL ---
function getUserAvatar(user) {
    const defaultColor = 'bg-indigo-500';
    // Pega as iniciais do nome
    const initials = (user.name || 'NN').split(' ').map(n => n[0]).join('').toUpperCase();
    // Simula URL de foto (se disponível no objeto user, embora não seja comum no Auth sem provedor social)
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
    const equipamentoMap = dbEquipamentos.reduce((acc, e) => { acc[e.id] = e; return acc; }, {});
    const activeDbRadios = dbRadios.filter(r => r.ativo !== false);
    const activeDbBordos = dbBordos.filter(b => b.ativo !== false);
    
    // --- 1. ESTATÍSTICAS DE RÁDIOS ---
    const radioStats = {
        total: activeDbRadios.length,
        ativos: 0,
        manutencao: 0,
        sinistro: 0,
        estoque: 0,
    };
    
    activeDbRadios.forEach(r => {
        if (dbRegistros.some(reg => reg.radioId === r.id)) radioStats.ativos++;
        else if (r.status === 'Manutenção') radioStats.manutencao++;
        else if (r.status === 'Sinistro') radioStats.sinistro++;
        else radioStats.estoque++; // Disponível ou Outros
    });
    
    // --- 2. ESTATÍSTICAS E DISPONIBILIDADE DE BORDOS ---
    const bordosByTipo = TIPOS_BORDO.reduce((acc, tipo) => {
        acc[tipo] = {
            total: 0,
            ativos: 0,
            disponiveis: 0,
            manutencao: 0,
            sinistro: 0,
        };
        return acc;
    }, {});
    
    // Contagem de Bordos por Status e Tipo
    activeDbBordos.forEach(b => {
        const tipo = b.tipo;
        if (bordosByTipo[tipo]) {
            bordosByTipo[tipo].total++;
            if (b.status === 'Em Uso') bordosByTipo[tipo].ativos++;
            else if (b.status === 'Manutenção') bordosByTipo[tipo].manutencao++;
            else if (b.status === 'Sinistro') bordosByTipo[tipo].sinistro++;
            else if (b.status === 'Disponível') bordosByTipo[tipo].disponiveis++;
        }
    });

    // 2a. Cálculo de Kits Ativos (Registros com 3 Bordos)
    const kitsAtivos = dbRegistros.filter(reg => reg.telaId && reg.magId && reg.chipId).length;
    
    // 2b. Cálculo de Kits Disponíveis (Regra: mínimo entre os disponíveis)
    const dispTela = bordosByTipo['Tela'].disponiveis;
    const dispMag = bordosByTipo['Mag'].disponiveis;
    const dispChip = bordosByTipo['Chip'].disponiveis;
    
    const kitsDisponiveis = Math.min(dispTela, dispMag, dispChip);

    // 2c. Soma de todos os Bordos Ativos (unidades) e Manutenção/Sinistro (unidades)
    const totalBordosAtivos = bordosByTipo['Tela'].total + bordosByTipo['Mag'].total + bordosByTipo['Chip'].total;
    const totalBordosEmUso = bordosByTipo['Tela'].ativos + bordosByTipo['Mag'].ativos + bordosByTipo['Chip'].ativos;
    const totalBordosManutencao = bordosByTipo['Tela'].manutencao + bordosByTipo['Mag'].manutencao + bordosByTipo['Chip'].manutencao;
    const totalBordosSinistro = bordosByTipo['Tela'].sinistro + bordosByTipo['Mag'].sinistro + bordosByTipo['Chip'].sinistro;


    // --- 3. CONTAGEM POR GRUPO (Tabela inferior) ---
    const groupCounts = {};
    GROUPS.forEach(g => groupCounts[g] = 0);
    
    dbRegistros.forEach(reg => {
        const equipamento = equipamentoMap[reg.equipamentoId];
        if (equipamento && equipamento.ativo !== false) {
            groupCounts[equipamento.grupo] = (groupCounts[equipamento.grupo] || 0) + 1;
        }
    });


    // --- 4. PREPARAÇÃO DOS CARDS ---
    const cardData = [
        // RÁDIOS (5 Cards)
        { title: 'Total Rádios (Ativos)', value: radioStats.total, iconSvg: getRadioIcon(), color: 'bg-green-main' }, 
        { title: 'Rádios Ativos (Em Frota)', value: radioStats.ativos, iconSvg: getActiveRadioIcon(), color: 'bg-indigo-500' },
        { title: 'Rádios em Manutenção', value: radioStats.manutencao, iconSvg: getMaintenanceIcon(), color: 'bg-yellow-600' },
        { title: 'Rádios em Sinistro', value: radioStats.sinistro, iconSvg: getSinistroIcon(), color: 'bg-red-700' },
        { title: 'Rádios Em Estoque', value: radioStats.estoque, iconSvg: getWarehouseIcon(), color: 'bg-blue-600' },

        // BORDOS (Kits e Unidades Individuais)
        { title: 'KITS DE BORDO ATIVOS (Frotas)', value: kitsAtivos, iconSvg: getBordoKitIcon(), color: 'bg-teal-600' },
        { title: 'KITS DE BORDO DISPONÍVEIS (Mín.)', value: kitsDisponiveis, iconSvg: getBordoKitIcon(), color: 'bg-cyan-600' },
        
        { title: 'Total Bordos (Unidades)', value: totalBordosAtivos, iconSvg: getBordoIcon(), color: 'bg-pink-600' },
        // Adicionando os cards individuais solicitados (Telas, Mags, Chips - Total)
        { title: 'Telas Cadastradas', value: bordosByTipo['Tela'].total, iconSvg: getBordoIcon(), color: 'bg-blue-500' },
        { title: 'Mags Cadastrados', value: bordosByTipo['Mag'].total, iconSvg: getBordoIcon(), color: 'bg-yellow-500' },
        { title: 'Chips Cadastrados', value: bordosByTipo['Chip'].total, iconSvg: getBordoIcon(), color: 'bg-purple-500' },

        { title: 'Bordos em Manutenção (Unidades)', value: totalBordosManutencao, iconSvg: getMaintenanceIcon(), color: 'bg-orange-600' },
        { title: 'Bordos em Sinistro (Unidades)', value: totalBordosSinistro, iconSvg: getSinistroIcon(), color: 'bg-red-500' },
    ];
    
    // Filtra os cartões onde o valor é zero, exceto os cards de Total e Kits (para não sumir a informação central)
    const finalCardData = cardData.filter(card => card.value > 0 || card.title.startsWith('Total') || card.title.startsWith('KITS') || card.title.includes('Cadastradas'));

    const cardHtml = finalCardData.map(card => `
        <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-xl futuristic-card border border-gray-100 dark:border-gray-700">
            <div class="flex flex-col items-start space-y-3">
                <div class="p-3 rounded-xl ${card.color} text-white shadow-lg flex items-center justify-center">
                    ${card.iconSvg}
                </div>
                <div>
                    <p class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-widest">${card.title}</p>
                    <p class="text-4xl font-extrabold text-gray-900 dark:text-gray-100 mt-1">${card.value}</p>
                </div>
            </div>
        </div>
    `).join('');

    const tableRows = GROUPS.map(group => {
        const count = groupCounts[group] || 0;
        const letter = settings.letterMap[group] || 'N/A';	
        return `
            <tr class="dashboard-table-row border-b dark:border-gray-700">
                <td class="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center justify-between">
                    ${group}	
                    <span class="text-xs font-semibold text-gray-400 dark:text-gray-500">(${letter})</span>
                </td>
                <td class="px-6 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 font-bold">${count}</td>
            </tr>
        `;
    }).join('');
    
    const totalEquipamentos = dbRegistros.length;

    return `
        <div class="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
            <h2 class="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6 text-center">Dashboard de Rádios, Bordos e Frota</h2>

            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6 mb-10">
                ${cardHtml}
            </div>
            
            <div class="mt-10">
                <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 border border-gray-200 dark:border-gray-700 futuristic-card">
                    <h3 class="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center">
                        <i class="fas fa-boxes mr-2 text-green-main"></i>	
                        Equipamentos com Rádio Ativo (Total: ${totalEquipamentos})
                    </h3>
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead class="bg-green-main/10 dark:bg-green-main/30">
                                <tr>
                                    <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-200 uppercase tracking-wider w-3/5">Grupo</th>
                                    <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-200 uppercase tracking-wider w-2/5">Rádios Ativos</th>
                                </tr>
                            </thead>
                            <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                ${tableRows}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderCadastro() {
    // 🌟 ATUALIZADO: Adicionando a aba 'bordos'
    const tabs = [
        { id: 'radio', name: 'Rádio' },
        { id: 'equipamento', name: 'Equipamentos' },
        { id: 'bordos', name: 'Bordos' }, // Nova aba
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
        case 'bordos': content = renderCadastroBordos(); break; // Nova função
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
    // Conta apenas os ativos para o título
    const activeRadiosCount = dbRadios.filter(r => r.ativo !== false).length;

    // Filtra por termo de busca em todos os rádios (ativos e inativos)
    const filteredRadios = dbRadios.filter(r =>	
        r.serie.toLowerCase().includes(radioSearch) ||	
        r.modelo.toLowerCase().includes(radioSearch)
    );

    // Ordena: Ativos primeiro, Inativos por último. Dentro de cada grupo, ordena por série.
    filteredRadios.sort((a, b) => {
        const aAtivo = a.ativo !== false;
        const bAtivo = b.ativo !== false;

        if (aAtivo && !bAtivo) return -1; // Ativo vem antes do inativo
        if (!aAtivo && bAtivo) return 1;  // Inativo vem depois do ativo
        
        // Se o status for o mesmo (ambos ativos ou ambos inativos), ordena por série.
        return a.serie.localeCompare(b.serie);
    });
    
    const totalRadioPages = Math.ceil(filteredRadios.length / PAGE_SIZE);
    radioPage = Math.min(radioPage, totalRadioPages) || 1;
    const paginatedRadios = filteredRadios.slice((radioPage - 1) * PAGE_SIZE, radioPage * PAGE_SIZE);

    // 🌟 ATUALIZADO: Opções de Status com Sinistro
    const statusOptions = DISPONIBLE_STATUSES.map(s => `<option value="${s}">${s}</option>`).join('');

    const tableRows = paginatedRadios.map(r => {
        const isAtivo = r.ativo !== false;
        const rowClass = isAtivo ? 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b dark:border-gray-700' : 'hover:bg-red-50 dark:hover:bg-red-900/10 border-b dark:border-gray-700 opacity-60 italic';
        const statusText = isAtivo ? r.status || 'Disponível' : 'INATIVO';
        // 🌟 ATUALIZADO: Classe para Sinistro
        const statusClass = isAtivo ? (r.status === 'Disponível' ? 'text-green-main' : (r.status === 'Manutenção' ? 'text-yellow-600' : (r.status === 'Sinistro' ? 'text-red-700' : 'text-blue-600'))) : 'text-red-600';
        
        // Usa text-gray-700 para manter a cor do texto do item inativo em cinza, 
        // apenas a coluna do status e a linha de fundo muda.
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
                        // Invertendo a lógica da cor do ícone no toggle: se ATIVO, mostra o ícone verde, se INATIVO, mostra o ícone cinza.
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
        // CORREÇÃO: Chama a função global
        radioPaginator += `<button ${radioPage === 1 ? 'disabled' : ''} onclick="setRadioPage(-1)" class="px-2 py-1 text-sm rounded-md ${radioPage === 1 ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500' : 'bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-100'}">Anterior</button>`;
        radioPaginator += `<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Pág ${radioPage} de ${totalRadioPages}</span>`;
        // CORREÇÃO: Chama a função global
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
    // Conta apenas os ativos para o título
    const activeEquipamentosCount = dbEquipamentos.filter(e => e.ativo !== false).length;

    // Filtra por termo de busca em todos os equipamentos (ativos e inativos)
    const filteredEquipamentos = dbEquipamentos.filter(e =>	
        e.frota.toLowerCase().includes(equipamentoSearch) ||
        e.grupo.toLowerCase().includes(equipamentoSearch) ||
        e.modelo.toLowerCase().includes(equipamentoSearch) ||
        (e.subgrupo || '').toLowerCase().includes(equipamentoSearch)
    );

    // Ordena: Ativos primeiro, Inativos por último. Dentro de cada grupo, ordena por frota.
    filteredEquipamentos.sort((a, b) => {
        const aAtivo = a.ativo !== false;
        const bAtivo = b.ativo !== false;

        if (aAtivo && !bAtivo) return -1; // Ativo vem antes do inativo
        if (!aAtivo && bAtivo) return 1;  // Inativo vem depois do ativo

        // Se o status for o mesmo, ordena por frota
        return a.frota.localeCompare(b.frota);
    });

    const totalEquipamentoPages = Math.ceil(filteredEquipamentos.length / PAGE_SIZE);
    equipamentoPage = Math.min(equipamentoPage, totalEquipamentoPages) || 1;
    const paginatedEquipamentos = filteredEquipamentos.slice((equipamentoPage - 1) * PAGE_SIZE, equipamentoPage * PAGE_SIZE);
    
    const tableRows = paginatedEquipamentos.map(e => {
        const isAtivo = e.ativo !== false;
        const rowClass = isAtivo ? 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b dark:border-gray-700' : 'hover:bg-red-50 dark:hover:bg-red-900/10 border-b dark:border-gray-700 opacity-60 italic';
        const frotaClass = isAtivo ? 'text-gray-700 dark:text-gray-300' : 'text-red-700 dark:text-red-400';

        return `
            <tr class="${rowClass}">
                <td class="px-4 py-2 text-sm ${frotaClass} font-mono">${e.frota} ${isAtivo ? '' : '(INATIVO)'}</td>
                <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">${e.grupo}</td>
                <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">${e.modelo}</td>
                <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hidden md:table-cell">${e.subgrupo || 'N/A'}</td>
                <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hidden lg:table-cell">${e.gestor || 'N/A'}</td>
                <td class="px-4 py-2 whitespace-nowrap text-sm font-medium space-x-2">
                    <button onclick="loadEquipamentoForEdit('${e.id}')" class="text-indigo-600 hover:text-indigo-900 p-1 rounded-full hover:bg-indigo-50 dark:hover:bg-gray-700" title="Editar Equipamento">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${(() => {
                        const actionText = isAtivo ? 'INATIVAR' : 'ATIVAR';
                        // Invertendo a lógica da cor do ícone no toggle
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
        // CORREÇÃO: Chama a função global
        equipamentoPaginator += `<button ${equipamentoPage === 1 ? 'disabled' : ''} onclick="setEquipamentoPage(-1)" class="px-2 py-1 text-sm rounded-md ${equipamentoPage === 1 ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500' : 'bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-100'}">Anterior</button>`;
        equipamentoPaginator += `<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Pág ${equipamentoPage} de ${totalEquipamentoPages}</span>`;
        // CORREÇÃO: Chama a função global
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

                            return `
                                <tr class="${rowClass}">
                                    <td class="px-4 py-2 text-sm ${frotaClass} font-mono">${e.frota} ${isAtivo ? '' : '(INATIVO)'}</td>
                                    <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">${e.grupo}</td>
                                    <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">${e.modelo}</td>
                                    <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hidden md:table-cell">${e.subgrupo || 'N/A'}</td>
                                    <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hidden lg:table-cell">${e.gestor || 'N/A'}</td>
                                    <td class="px-4 py-2 whitespace-nowrap text-sm font-medium space-x-2">
                                        <button onclick="loadEquipamentoForEdit('${e.id}')" class="text-indigo-600 hover:text-indigo-900 p-1 rounded-full hover:bg-indigo-50 dark:hover:bg-gray-700" title="Editar Equipamento">
                                            <i class="fas fa-edit"></i>
                                        </button>
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

// 🌟 NOVO: Função de Renderização da aba Bordos
function renderCadastroBordos() {
    // Conta apenas os ativos para o título
    const activeBordosCount = dbBordos.filter(b => b.ativo !== false).length;

    // Filtra por termo de busca
    const filteredBordos = dbBordos.filter(b =>	
        (b.numeroSerie || '').toLowerCase().includes(bordosSearch) ||
        (b.modelo || '').toLowerCase().includes(bordosSearch) ||
        (b.tipo || '').toLowerCase().includes(bordosSearch)
    );

    // FIX para o erro: Uncaught TypeError: Cannot read properties of undefined (reading 'localeCompare')
    // Garantimos que 'a' e 'b' não são undefined e que as propriedades existem antes de comparar.
    filteredBordos.sort((a, b) => {
        // Se a ou b for undefined/null, forçamos para o final da lista (ou mantemos a ordem)
        if (!a || !a.ativo) return 1;
        if (!b || !b.ativo) return -1;
        
        const aAtivo = a.ativo !== false;
        const bAtivo = b.ativo !== false;

        if (aAtivo && !bAtivo) return -1; 
        if (!aAtivo && bAtivo) return 1; 
        
        // Ordena por Tipo (se existir)
        const tipoA = a.tipo || '';
        const tipoB = b.tipo || '';
        if (tipoA !== tipoB) return tipoA.localeCompare(tipoB);
        
        // Depois por Série (se existir)
        const serieA = a.numeroSerie || '';
        const serieB = b.numeroSerie || '';
        return serieA.localeCompare(serieB);
    });
    
    const totalBordosPages = Math.ceil(filteredBordos.length / PAGE_SIZE);
    bordosPage = Math.min(bordosPage, totalBordosPages) || 1;
    const paginatedBordos = filteredBordos.slice((bordosPage - 1) * PAGE_SIZE, bordosPage * PAGE_SIZE);

    // 🌟 ATUALIZADO: Opções de Status com Sinistro
    const statusOptions = DISPONIBLE_STATUSES.map(s => `<option value="${s}">${s}</option>`).join('');

    const tableRows = paginatedBordos.map(b => {
        const isAtivo = b.ativo !== false;
        const rowClass = isAtivo ? 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b dark:border-gray-700' : 'hover:bg-red-50 dark:hover:bg-red-900/10 border-b dark:border-gray-700 opacity-60 italic';
        const statusText = isAtivo ? b.status || 'Disponível' : 'INATIVO';
        // 🌟 ATUALIZADO: Classe para Sinistro
        const statusClass = isAtivo ? (b.status === 'Disponível' ? 'text-green-main' : (b.status === 'Manutenção' ? 'text-yellow-600' : (b.status === 'Sinistro' ? 'text-red-700' : 'text-blue-600'))) : 'text-red-600';
        
        const tipoClass = b.tipo === 'Tela' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' 
                        : b.tipo === 'Mag' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300' 
                        : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300'; // Chip
        
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
                                            : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300'; // Chip
                            
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
    // 🌟 NOVO: Mapa de Bordos
    const bordoMap = dbBordos.reduce((acc, b) => { acc[b.id] = b; return acc; }, {});
    
    const availableRadios = dbRadios.filter(r =>	
        r.ativo !== false &&	
        r.status === 'Disponível' &&	
        !dbRegistros.some(reg => reg.radioId === r.id)	
    );
    
    const availableEquipamentos = dbEquipamentos.filter(e =>	
        e.ativo !== false &&	
        !dbRegistros.some(reg => reg.equipamentoId === e.id)	
    );

    // 🌟 NOVO: Filtra bordos disponíveis
    const availableBordos = dbBordos.filter(b => 
        b.ativo !== false &&
        b.status === 'Disponível' &&
        !dbRegistros.some(reg => reg.telaId === b.id || reg.magId === b.id || reg.chipId === b.id)
    );
    
    // Agrupa bordos por tipo para os selects
    const bordosPorTipo = availableBordos.reduce((acc, b) => {
        acc[b.tipo] = acc[b.tipo] || [];
        acc[b.tipo].push(b);
        return acc;
    }, {});


    // Funções auxiliares para opções de select de Bordo
    const getBordoOptions = (tipo) => {
        const bordos = bordosPorTipo[tipo] || [];
        // 🌟 NOVO: Exibe o Modelo do Bordo no select
        return bordos
            .map(b => `<option value="${b.id}">${b.numeroSerie} (${b.modelo})</option>`)
            .join('');
    };

    const radioOptions = availableRadios
        // 🌟 NOVO: Exibe o Modelo do Rádio no select
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
            (e.codigo || reg.codigo || '').toLowerCase().includes(search) || // Busca pelo código do equipamento
            (r.serie || '').toLowerCase().includes(search) ||
            (e.frota || '').toLowerCase().includes(search) ||
            (e.grupo || '').toLowerCase().includes(search)
        );
    });

    const totalGeralPages = Math.ceil(filteredRegistros.length / PAGE_SIZE);
    geralPage = Math.min(geralPage, totalGeralPages) || 1;
    const paginatedRegistros = filteredRegistros.slice((geralPage - 1) * PAGE_SIZE, geralPage * PAGE_SIZE);
    
    const tableRows = paginatedRegistros.map(reg => {
        const r = radioMap[reg.radioId] || { serie: 'N/A', modelo: 'N/A' };
        const e = equipamentoMap[reg.equipamentoId] || { frota: 'N/A', grupo: 'N/A', subgrupo: 'N/A', codigo: null };
        const t = bordoMap[reg.telaId] || { numeroSerie: 'N/A' };
        const m = bordoMap[reg.magId] || { numeroSerie: 'N/A' };
        const c = bordoMap[reg.chipId] || { numeroSerie: 'N/A' };
        
        const codigo = e.codigo || reg.codigo || 'N/A'; // Prioriza código do equipamento
        
        // 🌟 NOVO: Exibe status dos Bordos vinculados
        const bordoStatus = (reg.telaId || reg.magId || reg.chipId) 
            ? `<span class="text-green-600 font-semibold">Bordos OK</span>`
            : `<span class="text-gray-500 italic">Sem Bordos</span>`;
        
        return `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b dark:border-gray-700">
                <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 font-mono">${codigo}</td>
                <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">${e.frota}</td>
                <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">${r.serie}</td>
                <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hidden sm:table-cell">${e.grupo}</td>
                <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hidden md:table-cell">${bordoStatus}</td>
                <td class="px-4 py-2 whitespace-nowrap text-sm font-medium">
                    <button onclick="showConfirmModal('Confirmar Desvinculação', 'Deseja realmente desvincular o Rádio ${r.serie} e todos os Bordos da Frota ${e.frota}?', () => deleteRecord('registros', '${reg.id}'))" class="text-red-600 hover:text-red-900 p-1 rounded-full hover:bg-red-50 dark:hover:bg-gray-700" title="Desvincular Associação">
                        <i class="fas fa-unlink"></i> Desvincular
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    let geralPaginator = '';
    if (filteredRegistros.length > PAGE_SIZE) {
        geralPaginator = '<div class="flex justify-center items-center space-x-2 mt-4">';
        // CORREÇÃO: Chama a função global
        geralPaginator += `<button ${geralPage === 1 ? 'disabled' : ''} onclick="setGeralPage(-1)" class="px-2 py-1 text-sm rounded-md ${geralPage === 1 ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500' : 'bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-100'}">Anterior</button>`;
        geralPaginator += `<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Pág ${geralPage} de ${totalGeralPages}</span>`;
        // CORREÇÃO: Chama a função global
        geralPaginator += `<button ${geralPage === totalGeralPages ? 'disabled' : ''} onclick="setGeralPage(1)" class="px-2 py-1 text-sm rounded-md ${geralPage === totalGeralPages ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500' : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-100'}">Próxima</button>`;
        geralPaginator += '</div>';
    }

    // 🌟 NOVO: Estrutura da aba de Bordos para vinculação
    const bordoBindingHTML = `
        <div class="space-y-4">
            <h5 class="text-md font-semibold text-gray-800 dark:text-gray-100 border-b pb-1 mb-2 flex items-center">
                <i class="fas fa-cube mr-2 text-indigo-500"></i> Vínculo de Itens de Bordo (Opcional)
            </h5>
            <p class="text-xs text-red-500 dark:text-red-400 font-semibold" id="bordo-obrigatoriedade-msg">
                Se qualquer item de Bordo for selecionado, todos os três (Tela, Mag, Chip) se tornam obrigatórios.
            </p>
            
            <div>
                <label for="geral-tela-id" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Tela (Display)</label>
                <select id="geral-tela-id" class="bordo-select mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border bg-white dark:bg-gray-700 dark:text-gray-100">
                    <option value="">Selecione a Tela Disponível (Série/Modelo)</option>
                    ${getBordoOptions('Tela')}
                </select>
            </div>

            <div>
                <label for="geral-mag-id" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Mag (Módulo de Gerenciamento)</label>
                <select id="geral-mag-id" class="bordo-select mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border bg-white dark:bg-gray-700 dark:text-gray-100">
                    <option value="">Selecione o Mag Disponível (Série/Modelo)</option>
                    ${getBordoOptions('Mag')}
                </select>
            </div>
            
            <div>
                <label for="geral-chip-id" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Chip (Módulo de Comunicação)</label>
                <select id="geral-chip-id" class="bordo-select mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border bg-white dark:bg-gray-700 dark:text-gray-100">
                    <option value="">Selecione o Chip Disponível (Série/Modelo)</option>
                    ${getBordoOptions('Chip')}
                </select>
            </div>
        </div>
    `;

    return `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-1 bg-gray-50 dark:bg-gray-900 p-4 rounded-xl shadow-inner border border-gray-200 dark:border-gray-700">
                <h4 class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Gerar Código e Associar</h4>
                <form id="form-geral" class="space-y-4">
                    <div>
                        <label for="geral-radio-id" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Número de Série (Rádio) <span class="text-red-500">*</span></label>
                        <select id="geral-radio-id" required class="tom-select-radio mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border bg-white dark:bg-gray-700 dark:text-gray-100">
                            <option value="">Selecione um Rádio Disponível (Série/Modelo)</option>
                            ${radioOptions}
                        </select>
                        <p id="radio-modelo-info" class="mt-1 text-xs text-gray-500 dark:text-gray-400"></p>
                    </div>
                    <div>
                        <label for="geral-equipamento-id" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Frota (Equipamento) <span class="text-red-500">*</span></label>
                        <select type="text" id="geral-equipamento-id" required class="tom-select-equipamento mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border bg-white dark:bg-gray-700 dark:text-gray-100">
                            <option value="">Selecione a Frota</option>
                            ${frotaOptions}
                        </select>
                    </div>
                    
                    ${bordoBindingHTML}

                    <div id="equipamento-info" class="space-y-2 text-sm p-3 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700">
                        <p class="text-gray-700 dark:text-gray-300"><span class="font-semibold">Grupo:</span> <span id="info-grupo">N/A</span></p>
                        <p class="text-gray-700 dark:text-gray-300"><span class="font-semibold">Subgrupo:</span> <span id="info-subgrupo">N/A</span></p>	
                        <p class="text-gray-700 dark:text-gray-300"><span class="font-semibold">Gestor:</span> <span id="info-gestor">N/A</span></p>
                        <p class="text-gray-700 dark:text-gray-300"><span class="font-semibold">Código:</span> <span id="info-codigo">N/A</span></p>
                    </div>
                    <button type="submit" class="w-full flex justify-center py-2 px-3 border border-transparent text-sm font-medium rounded-lg text-white bg-green-main hover:bg-green-700 shadow-md">
                        <i class="fas fa-barcode mr-2"></i> Gerar e Cadastrar
                    </button>
                </form>
            </div>
            <div class="lg:col-span-2">
                <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-2">
                    <h4 class="text-lg font-semibold text-gray-800 dark:text-gray-100">Registros Ativos (Total: ${dbRegistros.length})</h4>
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
                            const r = radioMap[reg.radioId] || { serie: 'N/A', modelo: 'N/A' };
                            const e = equipamentoMap[reg.equipamentoId] || { frota: 'N/A', grupo: 'N/A', subgrupo: 'N/A', codigo: null };
                            const t = bordoMap[reg.telaId] || { numeroSerie: 'N/A' };
                            const m = bordoMap[reg.magId] || { numeroSerie: 'N/A' };
                            const c = bordoMap[reg.chipId] || { numeroSerie: 'N/A' };
                            
                            const codigo = e.codigo || reg.codigo || 'N/A'; // Prioriza código do equipamento
                            
                            const bordoStatus = (reg.telaId || reg.magId || reg.chipId) 
                                ? `<span class="text-green-600 font-semibold">Bordos OK</span>`
                                : `<span class="text-gray-500 italic">Sem Bordos</span>`;

                            return `
                                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b dark:border-gray-700">
                                    <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 font-mono">${codigo}</td>
                                    <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">${e.frota}</td>
                                    <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">${r.serie}</td>
                                    <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hidden sm:table-cell">${e.grupo}</td>
                                    <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hidden md:table-cell">${bordoStatus}</td>
                                    <td class="px-4 py-2 whitespace-nowrap text-sm font-medium">
                                        <button onclick="showConfirmModal('Confirmar Desvinculação', 'Deseja realmente desvincular o Rádio ${r.serie} e todos os Bordos da Frota ${e.frota}?', () => deleteRecord('registros', '${reg.id}'))" class="text-red-600 hover:text-red-900 p-1 rounded-full hover:bg-red-50 dark:hover:bg-gray-700" title="Desvincular Associação">
                                            <i class="fas fa-unlink"></i> Desvincular
                                        </button>
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
    // 🌟 NOVO: Mapa de Bordos
    const bordoMap = dbBordos.reduce((acc, b) => { acc[b.id] = b; return acc; }, {});
    
    // 1. Processa e filtra todos os registros ativos (junção de dados)
    const allRecords = dbRegistros.map(reg => {
        const r = dbRadios.find(r => r.id === reg.radioId) || {};
        const e = dbEquipamentos.find(e => e.id === reg.equipamentoId) || {};
        const t = bordoMap[reg.telaId] || { tipo: 'Tela', numeroSerie: 'N/A' };
        const m = bordoMap[reg.magId] || { tipo: 'Mag', numeroSerie: 'N/A' };
        const c = bordoMap[reg.chipId] || { tipo: 'Chip', numeroSerie: 'N/A' };
        
        // 🌟 NOVO: Informações de Bordos para o registro
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
            // 🌟 NOVO: Adicionando dados de bordos
            bordosText, bordosDetailed, temBordos
        };
    });
    
    let filteredRecords = allRecords;
    const searchTerm = searchTermPesquisa.toLowerCase(); // Usa o termo global

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
            // 🌟 NOVO: Busca por Série de Bordo
            (r.bordosDetailed || '').toLowerCase().includes(searchTerm)
        );
    }
    
    // 2. Paginação
    const totalPesquisaPages = Math.ceil(filteredRecords.length / PESQUISA_PAGE_SIZE);
    pesquisaPage = Math.min(pesquisaPage, totalPesquisaPages) || 1;
    const paginatedRecords = filteredRecords.slice((pesquisaPage - 1) * PESQUISA_PAGE_SIZE, pesquisaPage * PESQUISA_PAGE_SIZE);
    
    let tableRows = '';
    if (paginatedRecords.length > 0) {
        // CORREÇÃO: Colunas separadas para melhor legibilidade
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
        // 🌟 CORREÇÃO: Mensagem em Português
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
        // Removida aba 'my-profile'
        { id: 'system', name: 'Mapeamento', icon: 'fa-sitemap' },
        { id: 'users', name: 'Usuários', icon: 'fa-users', requiredRole: 'admin' },
    ];

    // Se for admin, a aba 'Mapeamento' (system) é o default.
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
                // Conteúdo de usuários será renderizado por renderSettingsUsers()
            }
            break;
        default:
            currentSettingTab = defaultTab; // Redireciona default
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

// Removida renderSettingsMyProfile() pois foi movida para o Modal

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

/**
 * [CORREÇÃO] Função de eventos de Usuários movida para o escopo global.
 */
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
                // Garante que o campo de senha é visível para novo cadastro
                document.getElementById('user-password-field').classList.remove('hidden');
            };
        }
    }
}

// Função de renderização de Usuários com Formulário de CRUD
async function renderSettingsUsers() {
    // Recarrega lista de usuários (para garantir dados frescos para a renderização)
    const settingsDocRef = doc(db, "artifacts", appId, "public", "data", "settings", "config");
    const settingsSnap = await getDoc(settingsDocRef);
    const usersFromDB = settingsSnap.exists() ? settingsSnap.data().users || [] : [];
    settings.users = usersFromDB;	

    const tableRows = usersFromDB.map(u => {
        const isMainAdmin = u.username === ADMIN_PRINCIPAL_EMAIL;
        const isCurrent = currentUser.email === u.username;
        const canEditDelete = !isMainAdmin;
        
        const loginMethod = u.customUsername ? u.customUsername : u.username;

        return `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b dark:border-gray-700 ${isCurrent ? 'bg-indigo-50/50 dark:bg-indigo-900/50' : ''}">
                <td class="px-4 py-2 text-sm font-medium text-gray-900 dark:text-gray-100">${u.name} ${isCurrent ? '<span class="text-xs text-indigo-500">(Você)</span>' : ''}</td>
                <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 font-mono break-words-all min-w-0">
                    ${loginMethod} 
                    ${u.customUsername ? '<span class="text-xs text-green-main">(User Login)</span>' : '<span class="text-xs text-blue-500">(Email Login)</span>'}
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
                        <label for="user-custom-username" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Nome de Usuário (Login Principal)</label>
                        <input type="text" id="user-custom-username" placeholder="Ex: mariasilva"
                            class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border dark:bg-gray-700 dark:text-gray-100">
                    </div>

                    <div>
                        <label for="user-username" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Username (Email)</label>
                        <input type="email" id="user-username" placeholder="exemplo@empresa.com.br"
                            class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-green-main focus:ring-green-main p-2 border dark:bg-gray-700 dark:text-gray-100">
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Deve ser um email válido ou deixe em branco se usar Nome de Usuário.</p>
                        <p class="text-xs text-red-500 dark:text-red-400 mt-1">Se em branco, um email genérico será criado para o Firebase Auth.</p>
                    </div>
                    
                    <div id="user-password-field">
                        <label for="user-password" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Senha (Mín. 6 caracteres)</label>
                        <input type="password" id="user-password" placeholder="Preencha para novo cadastro ou alteração de senha" minlength="6"
                            class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-red-500 focus:ring-red-500 p-2 border dark:bg-gray-700 dark:text-gray-100">
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Obrigatório para novos usuários.</p>
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
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase min-w-32">Login Principal</th>
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

// --- Funções de Eventos (DOM) ---

// 🌟 NOVO: Salva o nome de exibição do usuário
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
    currentUser.name = newName; // Atualiza o estado global

    try {
        await setDoc(settingsDocRef, { users: usersFromDB }, { merge: true });
        showModal('Sucesso', 'Nome de exibição atualizado com sucesso!', 'success');
        hideProfileModal();
        renderApp();
    } catch (e) {
        showModal('Erro', 'Não foi possível salvar o nome.', 'error');
    }
}

// 🌟 NOVO: Altera a senha do usuário logado (requer reautenticação)
async function changePassword(e) {
    e.preventDefault();
    const newPassword = document.getElementById('profile-new-password').value;
    const confirmPassword = document.getElementById('profile-confirm-password').value;

    if (newPassword !== confirmPassword) {
        showModal('Erro', 'As senhas não coincidem.', 'error');
        return;
    }
    if (newPassword.length < 6) {
        showModal('Erro', 'A nova senha deve ter no mínimo 6 caracteres.', 'error');
        return;
    }

    try {
        // Para usuários com email real (não fake), usamos o Firebase Auth
        if (!currentUser.customUsername) {
            // NOTE: updatePassword requer que o usuário tenha se logado recentemente
            await updatePassword(auth.currentUser, newPassword);
            showModal('Sucesso', 'Senha alterada com sucesso via Firebase Auth!', 'success');
        } else {
            // Para usuários customizados (com email fake), a senha deve ser salva no Firestore (método não-padrão)
            const settingsDocRef = doc(db, "artifacts", appId, "public", "data", "settings", "config");
            let usersFromDB = settings.users;
            const userIndex = usersFromDB.findIndex(u => u.id === currentUser.id);

            if (userIndex === -1) {
                showModal('Erro', 'Seu perfil customizado não foi encontrado.', 'error');
                return;
            }

            usersFromDB[userIndex].loginPassword = newPassword; // Salva a senha para o próximo login
            await setDoc(settingsDocRef, { users: usersFromDB }, { merge: true });
            showModal('Sucesso', 'Senha de login customizado alterada com sucesso!', 'success');
        }
        hideProfileModal();
    } catch (e) {
        console.error("Erro ao alterar senha:", e);
        let msg = 'Erro ao alterar a senha. Você pode precisar fazer login novamente (reautenticação) para alterar a senha.';
        if (e.code === 'auth/requires-recent-login') {
            msg = 'Sua sessão expirou. Por favor, saia do sistema e faça login novamente para alterar sua senha.';
        } else if (e.code === 'auth/weak-password') {
            msg = 'A senha é muito fraca. Deve ter pelo menos 6 caracteres.';
        } else if (e.code === 'auth/invalid-credential') {
            msg = 'Credenciais inválidas. O nome de usuário/email pode estar incorreto.';
        }
        showModal('Erro de Senha', msg, 'error');
    }
}


function handleSearchInput(inputElement, stateVariable, pageToReset = null) {
    const value = inputElement.value;
    const cursorPos = inputElement.selectionStart;
    focusedSearchInputId = inputElement.id;	
    searchCursorPosition = cursorPos;	

    if (stateVariable === 'radioSearch') radioSearch = value.toLowerCase();
    else if (stateVariable === 'equipamentoSearch') equipamentoSearch = value.toLowerCase();
    // 🌟 NOVO: Salva o termo de busca da aba Bordos
    else if (stateVariable === 'bordosSearch') bordosSearch = value.toLowerCase();
    else if (stateVariable === 'geralSearch') geralSearch = value.toLowerCase();
    // 🌟 NOVO: Salva o termo de busca da pesquisa
    else if (stateVariable === 'searchTermPesquisa') searchTermPesquisa = value.toLowerCase();
    else if (stateVariable === '_searchTermTemp') window._searchTermTemp = value;	
    
    if (pageToReset) {
        if (stateVariable === 'radioSearch') radioPage = 1;
        else if (stateVariable === 'equipamentoSearch') equipamentoPage = 1;
        // 🌟 NOVO: Reseta a página de Bordos
        else if (stateVariable === 'bordosSearch') bordosPage = 1;
        else if (stateVariable === 'geralSearch') geralPage = 1;
        // 🌟 NOVO: Reseta a página de pesquisa
        else if (stateVariable === 'searchTermPesquisa') pesquisaPage = 1;
    }

    renderApp();
}

async function handleLogout() {
    try {
        await signOut(auth);
    } catch (error) {
        showModal('Erro', 'Não foi possível sair. Tente novamente.', 'error');
    }
}

async function handleLoginSubmit(e) {
    e.preventDefault();
    const loginInput = document.getElementById('login-input');
    const passwordInput = document.getElementById('password');
    const rememberMeCheckbox = document.getElementById('remember-me');
    const loginIdentifier = loginInput.value.trim();
    const password = passwordInput.value;
    
    // [NOVO] Salvar/Remover Login no localStorage
    if (rememberMeCheckbox.checked) {
        localStorage.setItem('rememberedLogin', loginIdentifier);
    } else {
        localStorage.removeItem('rememberedLogin');
    }

    isLoggingIn = true;
    renderApp();	

    let emailToLogin = '';
    let isCustomLogin = false;
    
    // 1. Determinar se é email ou nome de usuário
    if (isEmail(loginIdentifier)) {
        emailToLogin = loginIdentifier;
    } else {
        // 2. Se não for email, procura por customUsername no Firestore settings
        const appUser = settings.users.find(u => u.customUsername && u.customUsername.toLowerCase() === loginIdentifier.toLowerCase());
        
        if (appUser) {
            // Usuário encontrado pelo nome de usuário
            emailToLogin = appUser.username;
            isCustomLogin = true;

            // NOTA: Para customUsername (loginPassword armazenado no Firestore), fazemos uma checagem local.
            // Isso é menos seguro, mas necessário para suportar a feature solicitada sem depender do Firebase Auth para o username.
            if (appUser.loginPassword !== password) {
                 isLoggingIn = false;
                 renderApp();
                 showModal('Erro de Login', 'Nome de usuário ou senha inválidos.', 'error');
                 return;
            }
        } else {
             // Não é email e não é customUsername
             isLoggingIn = false;
             renderApp();
             showModal('Erro de Login', 'Login inválido. Tente novamente com email ou nome de usuário cadastrado.', 'error');
             return;
        }
    }
    
    // 3. Tenta autenticar no Firebase Auth com o emailToLogin
    try {
        // Para logins customizados, a checagem de senha já foi feita acima.
        // O Firebase Auth cuida da checagem de senha para logins baseados em email normal.
        
        await signInWithEmailAndPassword(auth, emailToLogin, password);
        // Sucesso: onAuthStateChanged cuidará do resto (incluindo o splash screen)
        
    } catch (error) {
        isLoggingIn = false;
        renderApp();	
        
        let msg = 'Email ou senha inválidos. Tente novamente.';
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            msg = 'Email ou senha inválidos.';
        } else if (error.code === 'auth/invalid-email') {
            msg = 'O formato do login é inválido.';
        } else if (error.code === 'auth/operation-not-allowed') {
            msg = 'Login por Email/Senha não está ativado no Firebase.';
        }
        showModal('Erro de Login (Interno)', msg, 'error');
    }
}

async function fetchAppUserProfile(email) {
    if (!db || !appId) return null;
    
    // [CORREÇÃO] Apenas retorna o perfil da lista pré-carregada ou recarrega.
    const appUser = settings.users.find(u => u.username === email);	
    return appUser || null;
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
    // Anexar evento do novo formulário
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
    // 🌟 NOVO: Anexa eventos da aba Bordos
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
            
            // Checagem de duplicidade: deve ser única entre todos os rádios (mesmo ativos ou inativos)
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
            
            // Checagem de duplicidade: deve ser única entre todas as frotas
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

// 🌟 NOVO: Funções de CRUD da aba Bordos
function attachCadastroBordosEvents() {
    const form = document.getElementById('form-bordos');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const id = document.getElementById('bordo-id').value;
            const tipo = document.getElementById('bordo-tipo').value;
            const numeroSerie = document.getElementById('bordo-serie').value.trim();
            const modelo = document.getElementById('bordo-modelo').value.trim();
            const status = document.getElementById('bordo-status').value; // 🌟 NOVO: Captura o status
            
            if (!tipo || !numeroSerie || !modelo) {
                showModal('Erro', 'Todos os campos são obrigatórios.', 'error');
                return;
            }
            
            // Checagem de duplicidade: deve ser única para a combinação TIPO + NÚMERO DE SÉRIE
            const isDuplicate = dbBordos.some(b => 
                b.tipo === tipo && 
                b.numeroSerie === numeroSerie && 
                b.id !== id
            );
            
            if (isDuplicate) {
                showModal('Erro', `Este Bordo (${tipo}) com Número de Série (${numeroSerie}) já está cadastrado. A combinação Tipo/Série deve ser única.`, 'error');
                return;
            }

            const record = { id, tipo, numeroSerie, modelo, status }; // 🌟 NOVO: Salva o status
            await saveRecord('bordos', record);	
            
            form.reset();
            document.getElementById('bordo-id').value = '';
            document.getElementById('bordo-tipo').disabled = false; // Desbloqueia o tipo após reset
        };
    }
}

function loadBordoForEdit(id) {
    const bordo = dbBordos.find(b => b.id === id);
    if (bordo) {
        document.getElementById('bordo-id').value = bordo.id;
        document.getElementById('bordo-tipo').value = bordo.tipo;
        document.getElementById('bordo-serie').value = bordo.numeroSerie;
        document.getElementById('bordo-modelo').value = bordo.modelo;
        document.getElementById('bordo-status').value = bordo.status || 'Disponível'; // 🌟 NOVO: Carrega o status
        
        // Bloqueia a edição do tipo se o bordo já foi cadastrado para evitar duplicidades críticas
        const tipoSelect = document.getElementById('bordo-tipo');
        const statusSelect = document.getElementById('bordo-status');
        const emUsoOption = statusSelect.querySelector('option[value="Em Uso"]');

        if (id) {
            tipoSelect.disabled = true;
            if (emUsoOption) {
                // Habilita/Desabilita "Em Uso" para visualização, mas a edição só pode ser feita na Geral
                emUsoOption.disabled = (bordo.status !== 'Em Uso');
            }
            showModal('Edição', `Carregando Bordo ${bordo.numeroSerie} (${bordo.tipo}) para edição. O Tipo foi bloqueado para manter a integridade.`, 'info');
        } else {
             tipoSelect.disabled = false;
             if (emUsoOption) emUsoOption.disabled = true;
             showModal('Edição', `Carregando Bordo ${bordo.numeroSerie} (${bordo.tipo}) para edição.`, 'info');
        }
        
        window.scrollTo(0, 0);
    } else {
        showModal('Erro', 'Bordo não encontrado.', 'error');
    }
}


function attachCadastroGeralEvents() {
    const radioSelect = document.getElementById('geral-radio-id');
    const equipamentoSelect = document.getElementById('geral-equipamento-id');
    const telaSelect = document.getElementById('geral-tela-id');
    const magSelect = document.getElementById('geral-mag-id');
    const chipSelect = document.getElementById('geral-chip-id');

    // Elementos de bordo para iteração
    const bordoSelects = [telaSelect, magSelect, chipSelect];
    const bordoIds = ['geral-tela-id', 'geral-mag-id', 'geral-chip-id'];
    
    // 🌟 INICIALIZAÇÃO DO TOM SELECT 🌟
    if (typeof TomSelect !== 'undefined') {
        // Inicializa o TomSelect apenas se ainda não estiver inicializado
        const initTomSelect = (el, placeholder) => {
            if (el && !el.TomSelect) {
                new TomSelect(el, {
                    plugins: ['dropdown_input'],
                    maxItems: 1,
                    allowEmptyOption: true,
                    placeholder: placeholder,
                });
            }
        };

        initTomSelect(radioSelect, 'Digite para buscar o Rádio...');
        initTomSelect(equipamentoSelect, 'Digite para buscar a Frota...');
        initTomSelect(telaSelect, 'Selecione a Tela Disponível...');
        initTomSelect(magSelect, 'Selecione o Mag Disponível...');
        initTomSelect(chipSelect, 'Selecione o Chip Disponível...');
    }
    // ------------------------------------

    // Lógica para atualizar info do rádio
    if (radioSelect) {
        radioSelect.onchange = () => {
            const radioId = radioSelect.value;
            const infoEl = document.getElementById('radio-modelo-info');
            if(infoEl){
                if (radioId) {
                    const radio = dbRadios.find(r => r.id === radioId);
                    infoEl.textContent = `Modelo: ${radio ? radio.modelo : 'N/A'}`;
                } else {
                    infoEl.textContent = '';
                }
            }
        };
        radioSelect.dispatchEvent(new Event('change'));
    }
    
    // Lógica para atualizar info do equipamento
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

    // 🌟 NOVO: Lógica de obrigatoriedade dos Bordos
    const checkBordoObligatoriedade = () => {
        const selectedBordos = bordoSelects.filter(s => s.value).length;
        const msgEl = document.getElementById('bordo-obrigatoriedade-msg');
        
        if (selectedBordos > 0) {
            msgEl.classList.remove('text-red-500');
            msgEl.classList.add('text-green-500');
            msgEl.innerHTML = `
                <i class="fas fa-exclamation-triangle mr-1"></i> 
                Vínculo de Bordos Ativado: Todos os três (Tela, Mag, Chip) são **OBRIGATÓRIOS** para salvar.
            `;
        } else {
            msgEl.classList.remove('text-green-500');
            msgEl.classList.add('text-red-500');
            msgEl.innerHTML = `
                Se qualquer item de Bordo for selecionado, todos os três (Tela, Mag, Chip) se tornam obrigatórios para salvar o vínculo.
            `;
        }
    };
    
    bordoSelects.forEach(s => {
        if (s) {
            s.onchange = checkBordoObligatoriedade;
            s.dispatchEvent(new Event('change'));
        }
    });

    const form = document.getElementById('form-geral');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const radioId = radioSelect.value;
            const equipamentoId = equipamentoSelect.value;
            const telaId = telaSelect.value || null;
            const magId = magSelect.value || null;
            const chipId = chipSelect.value || null;
            
            const bordosSelecionados = [telaId, magId, chipId].filter(id => id).length;
            
            if (!radioId || !equipamentoId) {
                showModal('Erro', 'Selecione um Rádio e uma Frota válidos.', 'error');
                return;
            }
            
            if (dbRegistros.some(reg => reg.equipamentoId === equipamentoId)) {
                showModal('Erro', 'Esta Frota já possui um Rádio ativo.', 'error');
                return;
            }
            if (dbRegistros.some(reg => reg.radioId === radioId)) {
                showModal('Erro', 'Este Rádio já está em uso.', 'error');
                return;
            }
            
            // 🌟 NOVO: Regra de obrigatoriedade de Bordos
            if (bordosSelecionados > 0 && bordosSelecionados < 3) {
                 showModal('Erro de Bordo', 'Vínculo de Bordos Ativado: Se você selecionou um item de Bordo, deve selecionar todos os três (Tela, Mag e Chip).', 'error');
                 return;
            }

            // Checagem de Bordos (se 3 selecionados, checa se não estão em uso)
            if (bordosSelecionados === 3) {
                 const bordosEmUso = dbRegistros.some(reg => reg.telaId === telaId || reg.magId === magId || reg.chipId === chipId);
                 if (bordosEmUso) {
                     showModal('Erro de Bordo', 'Um ou mais Bordos selecionados já estão em uso. Por favor, desvincule-os primeiro.', 'error');
                     return;
                 }
            }


            // [LÓGICA DE CÓDIGO]
            const equipamentoRef = doc(db, `artifacts/${appId}/public/data/equipamentos`, equipamentoId);
            const equipamentoSnap = await getDoc(equipamentoRef);
            
            if (!equipamentoSnap.exists()) {
                showModal('Erro', 'Equipamento não encontrado.', 'error');
                return;
            }

            const equipamento = { id: equipamentoSnap.id, ...equipamentoSnap.data() };
            let codigoDoEquipamento = equipamento.codigo;

            // Se o equipamento não tiver um código, gera um novo e salva nele
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
            
            const record = {
                radioId,
                equipamentoId,
                codigo: codigoDoEquipamento, 
                // 🌟 NOVO: Adiciona Bordos ao registro
                telaId: telaId, 
                magId: magId,
                chipId: chipId,
                createdAt: new Date().toISOString()
            };
            
            try {
                const batch = writeBatch(db);
                // 1. Salva o registro de associação
                const newRegRef = doc(collection(db, `artifacts/${appId}/public/data/registros`));
                batch.set(newRegRef, record);
                
                // 2. Atualiza o status do Rádio
                const radioRef = doc(db, `artifacts/${appId}/public/data/radios`, radioId);
                batch.update(radioRef, { status: 'Em Uso' });

                // 3. 🌟 NOVO: Atualiza o status dos Bordos para 'Em Uso'
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

                showModal('Sucesso!', `Equipamento cadastrado! Código: ${codigoDoEquipamento}`, 'success');
                
                // Limpa e atualiza os selects
                form.reset();
                if(radioSelect && radioSelect.TomSelect) radioSelect.TomSelect.clear();
                if(equipamentoSelect && equipamentoSelect.TomSelect) equipamentoSelect.TomSelect.clear();
                if(telaSelect && telaSelect.TomSelect) telaSelect.TomSelect.clear();
                if(magSelect && magSelect.TomSelect) magSelect.TomSelect.clear();
                if(chipSelect && chipSelect.TomSelect) chipSelect.TomSelect.clear();
                
                // Isso forçará a renderização e o re-anexo de eventos com a nova lista de Bordos/Rádios
                renderApp();
            
            } catch (error) {
                showModal('Erro', 'Ocorreu um erro ao salvar a associação.', 'error');
            }
        };
    }
}

function attachPesquisaEvents() {
    const searchInput = document.getElementById('search-term');
    if(searchInput) {
        // Garantindo que a busca reinicie a página de pesquisa
        searchInput.oninput = (e) => handleSearchInput(e.target, 'searchTermPesquisa', 1);
        
        const searchButton = document.getElementById('search-button');
        if(searchButton) {
            searchButton.onclick = () => searchInput.dispatchEvent(new Event('input'));
        }
    }
}

function attachSettingsEvents() {
    // Removido attachSettingsMyProfileEvents daqui
    if (currentSettingTab === 'system') {
        attachSettingsSystemEvents();
    } else if (currentSettingTab === 'users' && currentUser && currentUser.role === 'admin') {
        attachSettingsUsersEvents(); 
    }
}

// Removida attachSettingsMyProfileEvents()


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
    // [CORREÇÃO] Usa appId hardcoded
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

    // Remove a classe 'max-w-sm' do modal principal para permitir mais espaço
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
            // [CORREÇÃO] Usa appId hardcoded
            await setDoc(settingsDocRef, { users: usersFromDB }, { merge: true });
            hideModal();
            // Retorna o modal ao tamanho padrão
            document.getElementById('global-modal').querySelector('div').classList.remove('max-w-lg');
            document.getElementById('global-modal').querySelector('div').classList.add('max-w-sm');
            showModal('Sucesso', `Permissões de ${user.name} atualizadas.`, 'success');
            // Se estiver editando as próprias permissões, forçamos um novo check de Auth e render
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


// --- Funções Principais de Inicialização e Renderização ---

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
    
    // Permissão para Dashboard, Cadastro, Pesquisa, e Settings (se for admin)
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
        // Se não houver sub-aba e estiver em settings, forçamos para "Mapeamento"
        updateState('settingTab', 'system');
    }	
    else {
        renderApp();	
    }
}

// 🌟 NOVO: Tempo mínimo de exibição do splash screen (2 segundos)
const MIN_SPLASH_TIME = 2000;
let splashStart = 0;

function setupAuthListener() {
    // [NOVO] Carrega as configurações antes de checar o estado de autenticação para ter a lista de usuários
    loadInitialSettings().then(() => {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                // 🌟 INÍCIO DO SPLASH SCREEN
                splashStart = Date.now();
                isLoggingIn = true; // Mantém a flag ligada durante o carregamento dos dados
                renderApp();

                userId = user.uid;
                // Usa a lista de settings.users que já foi pré-carregada
                let appUser = settings.users.find(u => u.username === user.email);
                
                // [SOLUÇÃO DE CONTINGÊNCIA] Se for o Admin principal, forçamos a criação/uso do perfil Admin.
                if (!appUser && user.email === ADMIN_PRINCIPAL_EMAIL) {
                    appUser = { 
                        id: user.uid, 
                        name: "Juliano Timoteo (Admin Principal)", 
                        username: ADMIN_PRINCIPAL_EMAIL, 
                        role: "admin",
                        permissions: { dashboard: true, cadastro: true, pesquisa: true, settings: true }
                    };
                    // Adiciona o perfil à lista em memória e tenta salvar 
                    if (!settings.users.some(u => u.username === ADMIN_PRINCIPAL_EMAIL)) {
                        settings.users.push(appUser);
                        saveSettings();
                    }
                }

                if (appUser) {
                    // Usuário aprovado no Firestore, loga no App.
                    // Adiciona o customUsername ao objeto currentUser para uso no App
                    currentUser = { ...appUser, uid: user.uid, email: user.email, customUsername: appUser.customUsername || null };
                    isAuthReady = true;
                    // isLoggingIn é desligado após o delay

                    await attachFirestoreListeners();	

                    // 🌟 FIM DO SPLASH SCREEN APÓS O DELAY
                    const elapsed = Date.now() - splashStart;
                    const delay = Math.max(0, MIN_SPLASH_TIME - elapsed);
                    
                    setTimeout(() => {
                        isLoggingIn = false;
                        renderApp();
                    }, delay);
                } else {
                    // Usuário autenticado, mas sem perfil no Firestore (não aprovado).
                    if (user.email) {
                        showModal('Acesso Não Autorizado', `Seu perfil (${user.email}) foi autenticado, mas não possui acesso aprovado no sistema. Contate um administrador.`, 'error');
                    } else {
                        showModal('Erro', 'Falha na autenticação do perfil de acesso. Contate o suporte.', 'error');
                    }
                    
                    if (auth.currentUser) await signOut(auth); // Desloga o usuário
                    
                    isAuthReady = true;	
                    isLoggingIn = false;
                    updateState('page', 'login');
                }
            } else {
                currentUser = null;
                userId = null;
                isAuthReady = true;
                isLoggingIn = false;
                detachFirestoreListeners();	
                dbRadios = []; dbEquipamentos = []; dbBordos = []; dbRegistros = []; // 🌟 ATUALIZADO: Limpa Bordos
                // Volta para a tela de login principal por padrão
                updateState('loginView', 'login'); 
                renderApp();	
            }
        });
    });
}


/**
 * [CORREÇÃO] Inicializa o Firebase com a constante hardcoded.
 */
function initApp() {
    try {
        // Usa a constante FIREBASE_CONFIG hardcoded
        app = initializeApp(FIREBASE_CONFIG);
        auth = getAuth(app);
        db = getFirestore(app);
        setLogLevel('info');	
        
        // [CORREÇÃO] O setupAuthListener agora chama loadInitialSettings antes do onAuthStateChanged
        setupAuthListener(); 

    } catch (e) {
        console.error("Erro crítico ao inicializar Firebase:", e);
        document.getElementById('app').innerHTML = `<div class="p-4 text-red-500 dark:text-red-400 font-semibold text-center">Erro crítico ao inicializar o Firebase. Verifique as configurações e a conexão.</div>`;
    }
}

function renderApp() {
    const root = document.getElementById('app');
    
    // CORREÇÃO CRÍTICA DE SEGURANÇA: Se o elemento raiz não existe, saia imediatamente.
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

        // Se a página for settings e o usuário não for admin, volta para dashboard
        if (currentPage === 'settings' && currentUser.role !== 'admin') {
            currentPage = 'dashboard';
            window.location.hash = '#dashboard';
            contentHTML += renderDashboard();
        } 
        // Se a página não for acessível (baseado nas permissões)
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

    // Anexa eventos
    if (!isLoggingIn) {
        if (currentPage === 'login' && isAuthReady && !currentUser) {
            attachLoginEvents();
        } else if (currentUser) {
            if (currentPage === 'cadastro') attachCadastroEvents();
            if (currentPage === 'pesquisa') attachPesquisaEvents();
            
            // [CORREÇÃO] Chamada da função de eventos principal
            if (currentPage === 'settings') attachSettingsEvents();
            
            // Anexa eventos ao modal de perfil, se estiver no DOM
            // Não é mais necessário renderizar aqui, pois showProfileModal o fará quando aberto.
        }
    }
    
    // Renderiza conteúdo de usuários após a renderização principal (porque é assíncrono)
    if (currentUser && currentPage === 'settings' && currentSettingTab === 'users' && currentUser.role === 'admin') {
        renderSettingsUsers().then(html => {
            const settingsContent = document.getElementById('settings-content');
            if (settingsContent) {
                 // Evita re-renderizar se a aba mudou rapidamente
                 if (currentSettingTab === 'users') {
                     settingsContent.innerHTML = html;
                     attachSettingsUsersEvents();
                 }
            }
        });
    }

    // Restaura o foco da busca
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

// --- Funções de Modal e Utilitários (Implementação e Exposição Global) ---

// Funções de Importação (Movemos para o final para garantir que Papa/XLSX estejam carregados)
function handleImport(collection, event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    
    reader.onload = function(e) {
        const data = e.target.result;
        let parsedData = [];

        if (file.name.endsWith('.csv')) {
            // Papa está disponível globalmente via CDN no index.html
            Papa.parse(data, {
                header: true, skipEmptyLines: true,
                complete: function(results) {
                    processImportedData(collection, results.data);
                }
            });
        } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            // XLSX está disponível globalmente via CDN no index.html
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

// Funções para Modais
function showModal(title, message, type = 'info') {
    const modal = document.getElementById('global-modal');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const actionsEl = document.getElementById('modal-actions');

    // Volta o tamanho do modal para o padrão
    modal.querySelector('div').classList.remove('max-w-lg');
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

    // Volta o tamanho do modal para o padrão
    modal.querySelector('div').classList.remove('max-w-lg');
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

// Funções de Perfil
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
    
    // Layout centralizado para dispositivos móveis
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
                    <p><span class="font-semibold">Seu Login Principal:</span> ${currentUser.customUsername || currentUser.email}</p>
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
    // Anexa eventos ao modal
    document.getElementById('form-personal-name').onsubmit = savePersonalName;
    document.getElementById('form-change-password').onsubmit = changePassword;
}

// Funções de Duplicidades
function showDuplicityModal() {
    renderDuplicityModalContent();
    document.getElementById('duplicity-modal').classList.remove('hidden');
    document.getElementById('duplicity-modal').classList.add('flex');
}

function hideDuplicityModal() {
    document.getElementById('duplicity-modal').classList.add('hidden');
    document.getElementById('duplicity-modal').classList.remove('flex');
}

// Wrapper para exclusão que usa o modal de confirmação global
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

// Localize esta função no final do app.main.js
// app.main.js - Função processImportedData (CORRIGIDA)

async function processImportedData(collectionName, data) {
    if (!db || !appId) {
        showModal('Erro', 'Conexão com o banco de dados perdida.', 'error');
        return;
    }

    const newRecords = [];
    let currentDb = collectionName === 'radios' ? dbRadios : (collectionName === 'equipamentos' ? dbEquipamentos : dbBordos);
    let ignoredCount = 0;
    
    // NOVO: Lista para checar duplicidades DENTRO do próprio arquivo de importação
    const keysBeingImported = new Set(); 

    for (const item of data) {
        let record = { createdAt: new Date().toISOString(), ativo: true };
        let keyToValidate = ''; // Chave única: Número de Série ou Frota ou Tipo+Série

        if (collectionName === 'radios') {
            const serie = item['Numero de Serie'] || item['NumeroSerie'] || item['serie'];
            const modelo = item['Modelo'] || item['Modelo de Rádio'] || item['modelo'];
            
            if (!serie || !modelo) continue;
            
            record.serie = String(serie).trim();
            record.modelo = String(modelo).trim();
            record.status = 'Disponível';	
            keyToValidate = record.serie; // Duplicidade por Série
            
            // 1. Checagem de duplicidade no banco de dados
            const isDbDuplicate = currentDb.some(r => r.serie === keyToValidate);
            
            // 2. Checagem de duplicidade DENTRO do arquivo
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
            
            // Validação de campos obrigatórios e grupo
            if (!frota || !grupo || !modeloEq || !subgrupo || !GROUPS.includes(String(grupo).trim())) {
                console.warn('Registro de equipamento inválido ou incompleto:', item);
                continue;
            }

            record.frota = String(frota).trim();
            record.grupo = String(grupo).trim();
            record.modelo = String(modeloEq).trim();
            record.subgrupo = String(subgrupo).trim();	
            record.gestor = String(gestor).trim();
            keyToValidate = record.frota; // Duplicidade por Frota
            
             // 1. Checagem de duplicidade no banco de dados
            const isDbDuplicate = currentDb.some(e => e.frota === keyToValidate);

            // 2. Checagem de duplicidade DENTRO do arquivo
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
            
            keyToValidate = `${record.tipo}-${record.numeroSerie}`; // Duplicidade por Tipo+Série

            // 1. Checagem de duplicidade no banco de dados
            const isDbDuplicate = currentDb.some(b => 
                b.tipo === record.tipo && b.numeroSerie === record.numeroSerie
            );
            
            // 2. Checagem de duplicidade DENTRO do arquivo
            const isFileDuplicate = keysBeingImported.has(keyToValidate);

            if (isDbDuplicate || isFileDuplicate) {
                 ignoredCount++;
                 continue;
            }
            keysBeingImported.add(keyToValidate);

        } else {
            // Ignora coleção desconhecida
            continue;
        }
        
        newRecords.push(record);
    }

    if (newRecords.length > 0) {
        // [CORREÇÃO] Usa appId hardcoded
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

// -------------------------------------------------------------------------------------

// --- Inicialização ---

// --- Inicialização ---

window.onhashchange = handleHashChange;

// EXPOSIÇÕES GLOBAIS DE FUNÇÕES ESSENCIAIS (CORREÇÃO DE ESCOPO)
window.showModal = showModal;
window.showConfirmModal = showConfirmModal;
window.hideModal = hideModal;
window.handleImport = handleImport; 
window.handleLogout = handleLogout; // Expondo handleLogout
window.handleSearchInput = handleSearchInput;
window.loadRadioForEdit = loadRadioForEdit;
window.loadEquipamentoForEdit = loadEquipamentoForEdit;
window.loadBordoForEdit = loadBordoForEdit; // 🌟 NOVO: Expondo loadBordoForEdit
window.showPermissionModal = showPermissionModal;
window.renderApp = renderApp;	
window.updateState = updateState;	
window.deleteRecord = deleteRecord;	
window.toggleRecordAtivo = toggleRecordAtivo; 
window.loadUserForEdit = loadUserForEdit;
window.deleteUser = deleteUser;
window.setRadioPage = setRadioPage;
window.setEquipamentoPage = setEquipamentoPage;
window.setBordosPage = setBordosPage; // 🌟 NOVO: Expondo paginação Bordos
window.setGeralPage = setGeralPage;
window.setPesquisaPage = setPesquisaPage; // 🌟 NOVO: Expondo paginação da pesquisa
window.handleSolicitarAcesso = handleSolicitarAcesso; 
window.showProfileModal = showProfileModal;
window.hideProfileModal = hideProfileModal;
window.getUserAvatar = getUserAvatar; // Expondo getUserAvatar

// EXPOSIÇÕES DO SISTEMA DE INTEGRIDADE
window.showDuplicityModal = showDuplicityModal;
window.hideDuplicityModal = hideDuplicityModal;
window.deleteDuplicity = deleteDuplicity;
window.deleteDuplicityWrapper = deleteDuplicityWrapper;

// Exposições de wrappers para modal de aprovação
window.approveUserWrapper = approveUserWrapper;
window.rejectUserWrapper = rejectUserWrapper;
window.renderPendingApprovalsModal = renderPendingApprovalsModal;

// Expondo as novas funções do modal de perfil (para uso no formulário)
window.savePersonalName = savePersonalName;
window.changePassword = changePassword;

// 🌟 CORREÇÃO DE ERROS DE REFERÊNCIA: Expondo as constantes de Tooltip e Tema
document.addEventListener('DOMContentLoaded', initApp);
window.RADIO_IMPORT_INFO = RADIO_IMPORT_INFO;
window.EQUIPAMENTO_IMPORT_INFO = EQUIPAMENTO_IMPORT_INFO;
window.BORDO_IMPORT_INFO = BORDO_IMPORT_INFO; // 🌟 NOVO: Expondo constante de Bordo
window.toggleTheme = toggleTheme;



window.onload = initApp;