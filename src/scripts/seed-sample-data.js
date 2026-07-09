import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, doc, setDoc, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCb0Dhh_eMHrs_Dyg1wS5nbMu1U6tKHa3A",
    authDomain: "gestaoradios-58b0a.firebaseapp.com",
    projectId: "gestaoradios-58b0a",
    storageBucket: "gestaoradios-58b0a.firebasestorage.app",
    messagingSenderId: "359260635463",
    appId: "1:359260635463:web:1c3ac47eebcd3434818c62",
    measurementId: "G-DVXXT79TZK"
};
const appId = "gestaoradios-58b0a";

const SAMPLE_DATA = {
    radios: [
        { serie: "752NQX047G", modelo: "Motorola DP1400", status: "Disponível", ativo: true },
        { serie: "751IAU0820", modelo: "Motorola DP1400", status: "Disponível", ativo: true },
        { serie: "019NNT40VM", modelo: "Motorola DP1400", status: "Disponível", ativo: true },
        { serie: "019NMZ40JX", modelo: "Motorola DP1400", status: "Disponível", ativo: true },
        { serie: "752NQX05B1", modelo: "Motorola DP1400", status: "Disponível", ativo: true },
        { serie: "442TNJW570", modelo: "Motorola DP1400", status: "Disponível", ativo: true },
        { serie: "902EAFG458", modelo: "Motorola DP1400", status: "Disponível", ativo: true },
        { serie: "751IYE0069", modelo: "Motorola DP1400", status: "Disponível", ativo: true },
    ],
    equipamentos: [
        { frota: "HT COLHEITA 03", grupo: "Colheita", modelo: "Colheitadeira", subgrupo: "Linha 3", gestor: "REGINALDO MANTOVANE", codigo: "A056", ativo: true },
        { frota: "100125", grupo: "Colheita", modelo: "Colheitadeira", subgrupo: "Linha 1", gestor: "REGINALDO MANTOVANE", codigo: "A008", ativo: true },
        { frota: "31417", grupo: "Colheita", modelo: "Colheitadeira", subgrupo: "Linha 2", gestor: "RONILDO BARBOSA", codigo: "A038", ativo: true },
        { frota: "31715", grupo: "Colheita", modelo: "Colheitadeira", subgrupo: "Linha 4", gestor: "HEVERTON HENRIQUE", codigo: "A022", ativo: true },
        { frota: "31315", grupo: "Transporte", modelo: "Caminhão", subgrupo: "Caminhonete", gestor: "Sem Gestor", codigo: "B013", ativo: true },
        { frota: "31120", grupo: "Transporte", modelo: "Caminhão", subgrupo: "Truck", gestor: "Sem Gestor", codigo: "B018", ativo: true },
        { frota: "HT OFICINA 09", grupo: "Oficina", modelo: "Utilitário", subgrupo: "Oficina Móvel", gestor: "PAULO IESE", codigo: "C006", ativo: true },
        { frota: "HT PIT STOP 01", grupo: "Oficina", modelo: "Utilitário", subgrupo: "Pit Stop", gestor: "PAULO IESE", codigo: "C026", ativo: true },
        { frota: "HT INDUSTRIA 01", grupo: "Industria", modelo: "Empilhadeira", subgrupo: "Linha 1", gestor: "CASSIO APARECIDO", codigo: "004", ativo: true },
        { frota: "11318", grupo: "TPL", modelo: "Transp. Especial", subgrupo: "Linha 1", gestor: "GERSON PORTO", codigo: "D022", ativo: true },
    ],
    bordos: [
        { tipo: "Tela", numeroSerie: "2222222", modelo: "Tela 7\"", status: "Disponível", ativo: true },
        { tipo: "Mag", numeroSerie: "99999999", modelo: "Magnético", status: "Disponível", ativo: true },
        { tipo: "Chip", numeroSerie: "33333333", modelo: "Chip Claro", status: "Disponível", ativo: true },
        { tipo: "Tela", numeroSerie: "33031", modelo: "Tela 7\"", status: "Disponível", ativo: true },
        { tipo: "Mag", numeroSerie: "31058", modelo: "Magnético", status: "Disponível", ativo: true },
        { tipo: "Chip", numeroSerie: "8955106246 9002785283 69", modelo: "Chip Claro", status: "Disponível", ativo: true },
    ],
    registros: [
        { equipamentoId: "eq1", radioId: "rad1", telaId: "bor1", magId: "bor2", chipId: "bor3" },
        { equipamentoId: "eq4", radioId: "rad6", magId: "bor4", chipId: "bor5" },
        { equipamentoId: "eq5", radioId: "rad4", telaId: "bor1", magId: "bor2", chipId: "bor3" },
        { equipamentoId: "eq6", radioId: "rad8" },
        { equipamentoId: "eq7", radioId: "rad7" },
        { equipamentoId: "eq8", radioId: "rad5" },
        { equipamentoId: "eq9", telaId: "bor1", magId: "bor2", chipId: "bor3" },
        { equipamentoId: "eq10", radioId: "rad3" },
    ],
};

async function seed(db) {
    const batch = writeBatch(db);

    const radiosCol = collection(db, `artifacts/${appId}/public/data/radios`);
    SAMPLE_DATA.radios.forEach((item) => {
        const ref = doc(radiosCol);
        batch.set(ref, { ...item, createdAt: new Date().toISOString() });
        item._id = ref.id;
    });

    const eqCol = collection(db, `artifacts/${appId}/public/data/equipamentos`);
    SAMPLE_DATA.equipamentos.forEach((item) => {
        const ref = doc(eqCol);
        batch.set(ref, { ...item, createdAt: new Date().toISOString() });
        item._id = ref.id;
    });

    const bordosCol = collection(db, `artifacts/${appId}/public/data/bordos`);
    SAMPLE_DATA.bordos.forEach((item) => {
        const ref = doc(bordosCol);
        batch.set(ref, { ...item, createdAt: new Date().toISOString() });
        item._id = ref.id;
    });

    SAMPLE_DATA.registros.forEach((reg, index) => {
        const ref = doc(collection(db, `artifacts/${appId}/public/data/registros`));
        batch.set(ref, {
            ...reg,
            createdAt: new Date(Date.now() + index).toISOString(),
        });
    });

    await batch.commit();
    console.log('Dados de exemplo criados com sucesso.');
}

seed()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Erro ao popular dados:', error);
        process.exit(1);
    });
