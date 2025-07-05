// script.js

// Dán cấu hình Firebase của bạn vào đây
 const firebaseConfig = {
    apiKey: "AIzaSyC_8Q8Girww42mI-8uwYsJaH5Vi41FT1eA",
    authDomain: "tinh-gia-thanh-app-fbdc0.firebaseapp.com",
    projectId: "tinh-gia-thanh-app-fbdc0",
    storageBucket: "tinh-gia-thanh-app-fbdc0.firebasestorage.app",
    messagingSenderId: "306099623121",
    appId: "1:306099623121:web:157ce5827105998f3a61f0",
    measurementId: "G-D8EHTN2SWE"
  };

// Dán API Key của Gemini vào đây
const GEMINI_API_KEY = "AIzaSyCJzstBl8vuyzpbpm5q1YkNE_Bwmrn_AwQ";

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { 
    getAuth, onAuthStateChanged, 
    createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
    GoogleAuthProvider, signInWithPopup // Nâng cấp: Thêm các hàm cho Google Auth
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- DOM Elements ---
const loggedInView = document.getElementById('logged-in-view');
const loggedOutView = document.getElementById('logged-out-view');
const userEmailDisplay = document.getElementById('user-email-display');
const logoutBtn = document.getElementById('logout-btn');
const openLoginModalBtn = document.getElementById('open-login-modal-btn');
const openRegisterModalBtn = document.getElementById('open-register-modal-btn');
const loginModal = document.getElementById('login-modal');
const registerModal = document.getElementById('register-modal');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');
const materialsContent = document.getElementById('materials-content');
const loginPrompt = document.getElementById('login-prompt');
const materialForm = document.getElementById('material-form');
const materialIdInput = document.getElementById('material-id');
const materialNameInput = document.getElementById('material-name');
const materialPriceInput = document.getElementById('material-price');
const materialUnitInput = document.getElementById('material-unit');
const materialNotesInput = document.getElementById('material-notes');
const materialsTableBody = document.getElementById('materials-table-body');
const submitButton = document.getElementById('submit-button');
const cancelEditButton = document.getElementById('cancel-edit-button');
const calculateBtn = document.getElementById('calculate-btn');
const productDescriptionInput = document.getElementById('product-description');
const resultContainer = document.getElementById('result-content');
const loadingSpinner = document.getElementById('loading-spinner');
const itemNameInput = document.getElementById('item-name');
const saveItemBtn = document.getElementById('save-item-btn');
const savedItemsTableBody = document.getElementById('saved-items-table-body');
const viewItemModal = document.getElementById('view-item-modal');
const viewItemTitle = document.getElementById('view-item-title');
const viewItemContent = document.getElementById('view-item-content');
const googleLoginBtn = document.getElementById('google-login-btn'); // Nâng cấp

// --- Global State ---
let currentUserId = null;
let materialsCollectionRef = null;
let savedItemsCollectionRef = null;
let unsubscribeMaterials = null; 
let unsubscribeSavedItems = null;
let localMaterials = []; 
let localSavedItems = [];
let lastGeminiResult = null;

// --- Auth State Management ---
onAuthStateChanged(auth, user => {
    if (user) {
        currentUserId = user.uid;
        materialsCollectionRef = collection(db, `users/${currentUserId}/materials`);
        savedItemsCollectionRef = collection(db, `users/${currentUserId}/savedItems`);
        
        updateUIForLoggedIn(user.displayName || user.email);
        listenForMaterials();
        listenForSavedItems();
        closeAllModals();
    } else {
        currentUserId = null;
        if (unsubscribeMaterials) unsubscribeMaterials();
        if (unsubscribeSavedItems) unsubscribeSavedItems();
        localMaterials = [];
        localSavedItems = [];
        
        updateUIForLoggedOut();
    }
});

function updateUIForLoggedIn(name) {
    loggedInView.classList.remove('hidden');
    loggedOutView.classList.add('hidden');
    userEmailDisplay.textContent = name;
    materialsContent.classList.remove('disabled-content');
    loginPrompt.classList.add('hidden');
}

function updateUIForLoggedOut() {
    loggedInView.classList.add('hidden');
    loggedOutView.classList.remove('hidden');
    userEmailDisplay.textContent = '';
    materialsContent.classList.add('disabled-content');
    loginPrompt.classList.remove('hidden');
    renderMaterials([]);
    renderSavedItems([]);
}

// --- Modal Handling ---
function openModal(modal) { modal.classList.remove('hidden'); }
function closeModal(modal) { modal.classList.add('hidden'); }
function closeAllModals() {
    closeModal(loginModal);
    closeModal(registerModal);
    closeModal(viewItemModal);
}

openLoginModalBtn.addEventListener('click', () => openModal(loginModal));
openRegisterModalBtn.addEventListener('click', () => openModal(registerModal));

document.querySelectorAll('.modal-close-btn, .modal-overlay').forEach(el => {
    el.addEventListener('click', (e) => {
        if (e.target === el) closeAllModals();
    });
});

// --- Firebase Auth Actions ---
loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    loginError.textContent = '';
    try {
        await signInWithEmailAndPassword(auth, loginForm['login-email'].value, loginForm['login-password'].value);
    } catch (error) {
        loginError.textContent = "Email hoặc mật khẩu không đúng.";
    }
});

registerForm.addEventListener('submit', async e => {
    e.preventDefault();
    registerError.textContent = '';
    try {
        await createUserWithEmailAndPassword(auth, registerForm['register-email'].value, registerForm['register-password'].value);
    } catch (error) {
        registerError.textContent = error.code === 'auth/email-already-in-use' ? "Email này đã được sử dụng." : "Đã xảy ra lỗi.";
    }
});

// Nâng cấp: Xử lý đăng nhập bằng Google
googleLoginBtn.addEventListener('click', async () => {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
        // onAuthStateChanged sẽ tự động xử lý phần còn lại
    } catch (error) {
        console.error("Google Sign-in failed:", error);
        loginError.textContent = "Không thể đăng nhập với Google. Vui lòng thử lại.";
    }
});

logoutBtn.addEventListener('click', () => signOut(auth));

// --- Firestore Data Handling ---
function listenForMaterials() {
    if (unsubscribeMaterials) unsubscribeMaterials(); 
    unsubscribeMaterials = onSnapshot(materialsCollectionRef, snapshot => {
        localMaterials = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderMaterials(localMaterials);
    }, console.error);
}

function renderMaterials(materials) {
    materialsTableBody.innerHTML = '';
    if (materials.length === 0) {
        materialsTableBody.innerHTML = `<tr><td colspan="4" class="text-center p-4 text-gray-500">Chưa có vật tư nào.</td></tr>`;
        return;
    }
    materials.forEach(material => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="py-3 px-4">${material.name}</td>
            <td class="py-3 px-4">${Number(material.price).toLocaleString('vi-VN')}đ / ${material.unit}</td>
            <td class="py-3 px-4">${material.notes || ''}</td>
            <td class="py-3 px-4 text-center">
                <button class="edit-btn text-blue-500 hover:text-blue-700 mr-2" data-id="${material.id}"><i class="fas fa-edit"></i></button>
                <button class="delete-btn text-red-500 hover:text-red-700" data-id="${material.id}"><i class="fas fa-trash"></i></button>
            </td>
        `;
        materialsTableBody.appendChild(tr);
    });
}

materialForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (!currentUserId) return;
    const materialData = {
        name: materialNameInput.value,
        price: Number(materialPriceInput.value),
        unit: materialUnitInput.value,
        notes: materialNotesInput.value
    };
    const id = materialIdInput.value;
    try {
        if (id) {
            await updateDoc(doc(db, `users/${currentUserId}/materials`, id), materialData);
        } else {
            await addDoc(materialsCollectionRef, materialData);
        }
        resetForm();
    } catch (error) { console.error("Error saving material: ", error); }
});

materialsTableBody.addEventListener('click', async e => {
    if (!currentUserId) return;
    const target = e.target.closest('button');
    if (!target) return;
    const id = target.dataset.id;
    if (target.classList.contains('delete-btn')) {
        if (confirm('Bạn có chắc chắn muốn xóa vật tư này?')) {
            await deleteDoc(doc(db, `users/${currentUserId}/materials`, id));
        }
    } else if (target.classList.contains('edit-btn')) {
        const materialToEdit = localMaterials.find(m => m.id === id);
        if (materialToEdit) {
            materialIdInput.value = materialToEdit.id;
            materialNameInput.value = materialToEdit.name;
            materialPriceInput.value = materialToEdit.price;
            materialUnitInput.value = materialToEdit.unit;
            materialNotesInput.value = materialToEdit.notes;
            submitButton.innerHTML = '<i class="fas fa-save mr-2"></i> Cập nhật';
            submitButton.classList.replace('bg-indigo-600', 'bg-yellow-500');
            cancelEditButton.classList.remove('hidden');
            window.scrollTo(0, 0);
        }
    }
});

function resetForm() {
    materialForm.reset();
    materialIdInput.value = '';
    submitButton.innerHTML = '<i class="fas fa-plus mr-2"></i> Thêm Vật tư';
    submitButton.classList.replace('bg-yellow-500', 'bg-indigo-600');
    cancelEditButton.classList.add('hidden');
}
cancelEditButton.addEventListener('click', resetForm);

function listenForSavedItems() {
    if (unsubscribeSavedItems) unsubscribeSavedItems();
    unsubscribeSavedItems = onSnapshot(savedItemsCollectionRef, snapshot => {
        localSavedItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderSavedItems(localSavedItems);
    }, console.error);
}

function renderSavedItems(items) {
    savedItemsTableBody.innerHTML = '';
    if (items.length === 0) {
        savedItemsTableBody.innerHTML = `<tr><td colspan="3" class="text-center p-4 text-gray-500">Chưa có hạng mục nào được lưu.</td></tr>`;
        return;
    }
    items.sort((a, b) => b.createdAt - a.createdAt);
    items.forEach(item => {
        const tr = document.createElement('tr');
        const createdAtDate = item.createdAt?.toDate();
        tr.innerHTML = `
            <td class="py-3 px-4">${item.name}</td>
            <td class="py-3 px-4">${createdAtDate ? createdAtDate.toLocaleDateString('vi-VN') : 'N/A'}</td>
            <td class="py-3 px-4 text-center">
                <button class="view-item-btn text-green-500 hover:text-green-700 mr-2" data-id="${item.id}"><i class="fas fa-eye"></i></button>
                <button class="delete-item-btn text-red-500 hover:text-red-700" data-id="${item.id}"><i class="fas fa-trash"></i></button>
            </td>
        `;
        savedItemsTableBody.appendChild(tr);
    });
}

saveItemBtn.addEventListener('click', async () => {
    if (!currentUserId || !lastGeminiResult) return;
    const itemName = itemNameInput.value.trim();
    if (!itemName) {
        alert('Vui lòng nhập tên sản phẩm / hạng mục để lưu.');
        return;
    }
    try {
        await addDoc(savedItemsCollectionRef, {
            name: itemName,
            description: productDescriptionInput.value,
            geminiResult: lastGeminiResult,
            createdAt: serverTimestamp()
        });
        alert(`Đã lưu thành công hạng mục "${itemName}"!`);
        lastGeminiResult = null;
        saveItemBtn.disabled = true;
    } catch (error) {
        console.error("Error saving item:", error);
        alert("Lỗi khi lưu hạng mục.");
    }
});

savedItemsTableBody.addEventListener('click', async e => {
    if (!currentUserId) return;
    const target = e.target.closest('button');
    if (!target) return;
    const id = target.dataset.id;
    if (target.classList.contains('delete-item-btn')) {
        if (confirm('Bạn có chắc chắn muốn xóa hạng mục đã lưu này?')) {
            await deleteDoc(doc(db, `users/${currentUserId}/savedItems`, id));
        }
    } else if (target.classList.contains('view-item-btn')) {
        const item = localSavedItems.find(i => i.id === id);
        if (item) {
            viewItemTitle.textContent = item.name;
            viewItemContent.textContent = item.geminiResult;
            openModal(viewItemModal);
        }
    }
});

// --- Gemini API Call ---
async function callGeminiAPI(prompt, resultElement) {
    resultElement.parentElement.classList.remove('hidden');
    resultElement.textContent = '';
    loadingSpinner.classList.remove('hidden');
    saveItemBtn.disabled = true;
    lastGeminiResult = null;

    try {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error((await response.json()).error.message);
        const data = await response.json();
        const resultText = data.candidates[0].content.parts[0].text;
        resultElement.textContent = resultText;
        return resultText;
    } catch (error) {
        resultElement.textContent = `Lỗi khi gọi Gemini: ${error.message}`;
        return null;
    } finally {
        loadingSpinner.classList.add('hidden');
    }
}

calculateBtn.addEventListener('click', async () => {
    const productDescription = productDescriptionInput.value;
    if (!productDescription) { alert('Vui lòng nhập mô tả sản phẩm.'); return; }
    if (localMaterials.length === 0 && currentUserId) { alert('Vui lòng thêm ít nhất một vật tư.'); return; }
    
    const materialsListString = localMaterials.map(m => `- ${m.name}: ${Number(m.price).toLocaleString('vi-VN')}đ / ${m.unit}`).join('\n');
    const prompt = `Bạn là chuyên gia dự toán chi phí nội thất. Dựa vào danh sách vật tư sau:\n${materialsListString}\n\nHãy phân tích chi phí, tối ưu hóa cắt ván, và gợi ý lợi nhuận cho sản phẩm: "${productDescription}". Trình bày kết quả rõ ràng.`;
    
    const result = await callGeminiAPI(prompt, resultContainer);
    if (result) {
        lastGeminiResult = result;
        saveItemBtn.disabled = false;
    }
});
