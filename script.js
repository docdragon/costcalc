// script.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { GoogleGenAI } from "@google/genai";

// --- Cấu hình Firebase ---
const firebaseConfig = {
    apiKey: "AIzaSyC_8Q8Girww42mI-8uwYsJaH5Vi41FT1eA",
    authDomain: "tinh-gia-thanh-app-fbdc0.firebaseapp.com",
    projectId: "tinh-gia-thanh-app-fbdc0",
    storageBucket: "tinh-gia-thanh-app-fbdc0.firebasestorage.app",
    messagingSenderId: "306099623121",
    appId: "1:306099623121:web:157ce5827105998f3a61f0",
    measurementId: "G-D8EHTN2SWE"
};

// --- Cấu hình Gemini AI ---
// !!! QUAN TRỌNG: Thay thế chuỗi bên dưới bằng khóa API của bạn từ Google AI Studio.
const API_KEY = "YOUR_GOOGLE_AI_API_KEY_HERE";
let ai;
if (API_KEY && API_KEY !== "YOUR_GOOGLE_AI_API_KEY_HERE") {
    ai = new GoogleGenAI({ apiKey: API_KEY });
} else {
    ai = null;
    console.warn("Chưa cấu hình khóa API cho Gemini. Các tính năng AI sẽ bị vô hiệu hóa.");
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- DOM Elements ---
const loggedInView = document.getElementById('logged-in-view');
const userEmailDisplay = document.getElementById('user-email-display');
const logoutBtn = document.getElementById('logout-btn');
const loginModal = document.getElementById('login-modal');
const registerModal = document.getElementById('register-modal');
const viewItemModal = document.getElementById('view-item-modal');
const confirmModal = document.getElementById('confirm-modal');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');
const googleLoginBtn = document.getElementById('google-login-btn');
const materialForm = document.getElementById('material-form');
const materialsTableBody = document.getElementById('materials-table-body');
const savedItemsTableBody = document.getElementById('saved-items-table-body');
const calculateBtn = document.getElementById('calculate-btn');
const saveItemBtn = document.getElementById('save-item-btn');
const resultContainer = document.getElementById('result-content');
const addAccessoryBtn = document.getElementById('add-accessory-btn');
const accessoriesList = document.getElementById('accessories-list');
const priceSummaryContainer = document.getElementById('price-summary-container');
const totalCostValue = document.getElementById('total-cost-value');
const suggestedPriceValue = document.getElementById('suggested-price-value');
const estimatedProfitValue = document.getElementById('estimated-profit-value');
const imageUploader = document.getElementById('image-uploader');
const imageInput = document.getElementById('image-input');
const imageUploadPrompt = document.getElementById('image-upload-prompt');
const imagePreviewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview');
const removeImageBtn = document.getElementById('remove-image-btn');


// --- Global State ---
let currentUserId = null;
let materialsCollectionRef = null;
let savedItemsCollectionRef = null;
let unsubscribeMaterials = null; 
let unsubscribeSavedItems = null;
let localMaterials = { 'Ván': [], 'Cạnh': [], 'Phụ kiện': [] };
let localSavedItems = [];
let lastGeminiResult = null;
let addedAccessories = [];
let uploadedImage = null;

// --- Auth & UI State Management ---
onAuthStateChanged(auth, user => {
    const loggedIn = !!user;
    if (loggedIn) {
        currentUserId = user.uid;
        materialsCollectionRef = collection(db, `users/${currentUserId}/materials`);
        savedItemsCollectionRef = collection(db, `users/${currentUserId}/savedItems`);
        listenForData();
    } else {
        currentUserId = null;
        if (unsubscribeMaterials) unsubscribeMaterials();
        if (unsubscribeSavedItems) unsubscribeSavedItems();
        clearLocalData();
    }
    updateUIVisibility(loggedIn, user);
    // Hide initial loader once auth state is resolved
    document.getElementById('initial-loader').style.opacity = '0';
    setTimeout(() => document.getElementById('initial-loader').style.display = 'none', 300);
});

function listenForData() {
    listenForMaterials();
    listenForSavedItems();
}

function clearLocalData() {
    localMaterials = { 'Ván': [], 'Cạnh': [], 'Phụ kiện': [] };
    localSavedItems = [];
    renderMaterials([]);
    renderSavedItems([]);
    populateSelects();
}

function updateUIVisibility(isLoggedIn, user) {
    loggedInView.classList.toggle('hidden', !isLoggedIn);
    document.getElementById('logged-out-view').classList.toggle('hidden', isLoggedIn);
    userEmailDisplay.textContent = isLoggedIn ? (user.displayName || user.email) : '';
    
    document.querySelectorAll('.calculator-form-content, .materials-form-content, .saved-items-content').forEach(el => {
        el.style.display = isLoggedIn ? 'block' : 'none';
    });
    document.querySelectorAll('.login-prompt-view').forEach(el => {
        el.style.display = isLoggedIn ? 'none' : 'block';
    });

    if (isLoggedIn) closeAllModals();
}

// --- Tab Navigation ---
const tabs = document.getElementById('tabs');
const tabContent = document.getElementById('tab-content');
tabs.addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (button) {
        const tabName = button.dataset.tab;
        tabs.querySelector('.active').classList.remove('active');
        button.classList.add('active');
        
        for (let pane of tabContent.children) {
            pane.classList.toggle('hidden', pane.id !== `${tabName}-tab`);
        }
    }
});

// --- Modal Handling ---
function openModal(modal) { modal.classList.remove('hidden'); }
function closeModal(modal) { modal.classList.add('hidden'); }
function closeAllModals() {
    [loginModal, registerModal, viewItemModal, confirmModal].forEach(closeModal);
}
document.getElementById('open-login-modal-btn').addEventListener('click', () => openModal(loginModal));
document.getElementById('open-register-modal-btn').addEventListener('click', () => openModal(registerModal));
document.querySelectorAll('.modal-close-btn, .modal-overlay').forEach(el => {
    el.addEventListener('click', (e) => { if (e.target === el) closeAllModals(); });
});

// --- Custom Confirm Modal ---
const confirmOkBtn = document.getElementById('confirm-ok-btn');
const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
const confirmMessage = document.getElementById('confirm-message');

function showConfirm(message) {
    return new Promise((resolve) => {
        confirmMessage.textContent = message;
        openModal(confirmModal);

        confirmOkBtn.onclick = () => {
            closeModal(confirmModal);
            resolve(true);
        };
        confirmCancelBtn.onclick = () => {
            closeModal(confirmModal);
            resolve(false);
        };
    });
}

// --- Toast Notification ---
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    
    const icons = { info: 'info-circle', success: 'check-circle', error: 'exclamation-triangle' };
    toast.innerHTML = `<i class="fas fa-${icons[type]} toast-icon"></i> ${message}`;
    
    toastContainer.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 4000);
}

// --- Firebase Auth Actions ---
loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    loginError.textContent = '';
    try {
        await signInWithEmailAndPassword(auth, loginForm['login-email'].value, loginForm['login-password'].value);
    } catch (error) { loginError.textContent = "Email hoặc mật khẩu không đúng."; }
});

registerForm.addEventListener('submit', async e => {
    e.preventDefault();
    registerError.textContent = '';
    try {
        await createUserWithEmailAndPassword(auth, registerForm['register-email'].value, registerForm['register-password'].value);
    } catch (error) { registerError.textContent = error.code === 'auth/email-already-in-use' ? "Email này đã được sử dụng." : "Đã xảy ra lỗi."; }
});

googleLoginBtn.addEventListener('click', async () => {
    try {
        await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) { loginError.textContent = "Không thể đăng nhập với Google."; }
});

logoutBtn.addEventListener('click', () => signOut(auth));

// --- Materials Management ---
function listenForMaterials() {
    if (unsubscribeMaterials) unsubscribeMaterials(); 
    unsubscribeMaterials = onSnapshot(materialsCollectionRef, snapshot => {
        localMaterials = { 'Ván': [], 'Cạnh': [], 'Phụ kiện': [] };
        snapshot.docs.forEach(doc => {
            const material = { id: doc.id, ...doc.data() };
            if (localMaterials[material.type]) {
                localMaterials[material.type].push(material);
            }
        });
        renderMaterials(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        populateSelects();
    }, console.error);
}

function renderMaterials(materials) {
    materialsTableBody.innerHTML = '';
    if (materials.length === 0) {
        materialsTableBody.innerHTML = `<tr><td colspan="5" class="text-center p-4 text-gray-400">Chưa có vật tư nào.</td></tr>`;
        return;
    }
    materials.forEach(m => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${m.name}</td>
            <td><span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">${m.type}</span></td>
            <td>${Number(m.price).toLocaleString('vi-VN')}đ / ${m.unit}</td>
            <td>${m.notes || ''}</td>
            <td class="text-center">
                <button class="edit-btn text-blue-500 hover:text-blue-700 mr-2" data-id="${m.id}"><i class="fas fa-edit"></i></button>
                <button class="delete-btn text-red-500 hover:text-red-700" data-id="${m.id}"><i class="fas fa-trash"></i></button>
            </td>
        `;
        materialsTableBody.appendChild(tr);
    });
}

materialForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (!currentUserId) return;
    const materialData = {
        name: materialForm['material-name'].value,
        type: materialForm['material-type'].value,
        price: Number(materialForm['material-price'].value),
        unit: materialForm['material-unit'].value,
        notes: materialForm['material-notes'].value
    };
    const id = materialForm['material-id'].value;
    try {
        if (id) {
            await updateDoc(doc(db, `users/${currentUserId}/materials`, id), materialData);
            showToast('Cập nhật vật tư thành công!', 'success');
        } else {
            await addDoc(materialsCollectionRef, materialData);
            showToast('Thêm vật tư thành công!', 'success');
        }
        resetMaterialForm();
    } catch (error) { 
        showToast('Đã có lỗi xảy ra.', 'error');
        console.error("Error saving material: ", error); 
    }
});

materialsTableBody.addEventListener('click', async e => {
    const btn = e.target.closest('button');
    if (!currentUserId || !btn) return;
    const id = btn.dataset.id;
    if (btn.classList.contains('delete-btn')) {
        if (await showConfirm('Bạn có chắc chắn muốn xóa vật tư này? Hành động này không thể hoàn tác.')) {
            await deleteDoc(doc(db, `users/${currentUserId}/materials`, id));
            showToast('Đã xóa vật tư.', 'info');
        }
    } else if (btn.classList.contains('edit-btn')) {
        const allMaterials = Object.values(localMaterials).flat();
        const material = allMaterials.find(m => m.id === id);
        if (material) {
            materialForm['material-id'].value = material.id;
            materialForm['material-name'].value = material.name;
            materialForm['material-type'].value = material.type;
            materialForm['material-price'].value = material.price;
            materialForm['material-unit'].value = material.unit;
            materialForm['material-notes'].value = material.notes;
            materialForm.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-save mr-2"></i> Cập nhật';
            document.getElementById('cancel-edit-button').classList.remove('hidden');
        }
    }
});

function resetMaterialForm() {
    materialForm.reset();
    materialForm['material-id'].value = '';
    materialForm.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-plus mr-2"></i> Thêm Vật tư';
    document.getElementById('cancel-edit-button').classList.add('hidden');
}
document.getElementById('cancel-edit-button').addEventListener('click', resetMaterialForm);


// --- Image Upload Logic ---
imageUploader.addEventListener('click', () => imageInput.click());
imageUploader.addEventListener('dragover', (e) => {
    e.preventDefault();
    imageUploader.style.borderColor = 'var(--primary-color)';
});
imageUploader.addEventListener('dragleave', (e) => {
    e.preventDefault();
    imageUploader.style.borderColor = 'var(--border-color)';
});
imageUploader.addEventListener('drop', (e) => {
    e.preventDefault();
    imageUploader.style.borderColor = 'var(--border-color)';
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleImageFile(files[0]);
    }
});
imageInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleImageFile(e.target.files[0]);
    }
});
removeImageBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // prevent triggering the uploader click
    uploadedImage = null;
    imageInput.value = ''; // Reset file input
    imagePreview.src = '#';
    imagePreviewContainer.classList.add('hidden');
    imageUploadPrompt.classList.remove('hidden');
});

function handleImageFile(file) {
    if (!file.type.startsWith('image/')) {
        showToast('Vui lòng chọn một file ảnh.', 'error');
        return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
        uploadedImage = {
            mimeType: file.type,
            data: reader.result.split(',')[1] // Get base64 part
        };
        imagePreview.src = reader.result;
        imageUploadPrompt.classList.add('hidden');
        imagePreviewContainer.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

// --- Calculator Tab Logic ---
function populateSelects() {
    const selects = {
        'material-wood': 'Ván',
        'material-edge': 'Cạnh',
        'material-accessories': 'Phụ kiện'
    };
    for (const [selectId, type] of Object.entries(selects)) {
        const selectEl = document.getElementById(selectId);
        selectEl.innerHTML = '<option value="">-- Chọn --</option>';
        localMaterials[type].forEach(m => {
            selectEl.innerHTML += `<option value="${m.id}">${m.name}</option>`;
        });
    }
}

addAccessoryBtn.addEventListener('click', () => {
    const accessorySelect = document.getElementById('material-accessories');
    const quantityInput = document.getElementById('accessory-quantity');
    const selectedId = accessorySelect.value;
    const quantity = parseInt(quantityInput.value) || 1;

    if (!selectedId) return;
    const accessory = localMaterials['Phụ kiện'].find(a => a.id === selectedId);
    if (accessory) {
        addedAccessories.push({ ...accessory, quantity });
        renderAddedAccessories();
        quantityInput.value = 1;
        accessorySelect.value = '';
    }
});

function renderAddedAccessories() {
    accessoriesList.innerHTML = '';
    addedAccessories.forEach((acc, index) => {
        const li = document.createElement('li');
        li.className = 'flex justify-between items-center text-sm text-gray-600 bg-gray-100 p-2 rounded';
        li.innerHTML = `<span>${acc.quantity} ${acc.unit} ${acc.name}</span> <button data-index="${index}" class="remove-acc-btn text-red-400 hover:text-red-600">&times;</button>`;
        accessoriesList.appendChild(li);
    });
}

accessoriesList.addEventListener('click', e => {
    if (e.target.classList.contains('remove-acc-btn')) {
        addedAccessories.splice(e.target.dataset.index, 1);
        renderAddedAccessories();
    }
});

calculateBtn.addEventListener('click', async () => {
    const itemName = document.getElementById('item-name').value;
    const dimensions = `Dài ${document.getElementById('item-length').value || 0}mm x Rộng ${document.getElementById('item-width').value || 0}mm x Cao ${document.getElementById('item-height').value || 0}mm`;
    const woodId = document.getElementById('material-wood').value;
    const edgeId = document.getElementById('material-edge').value;
    const wood = localMaterials['Ván'].find(m => m.id === woodId);
    const edge = localMaterials['Cạnh'].find(m => m.id === edgeId);
    const description = document.getElementById('product-description').value;
    
    if (!itemName) { showToast('Vui lòng nhập tên sản phẩm.', 'error'); return; }
    if (!wood) { showToast('Vui lòng chọn loại ván chính.', 'error'); return; }

    let materialsText = `* Ván chính: ${wood.name}\n`;
    if (edge) materialsText += `* Nẹp cạnh: ${edge.name}\n`;
    addedAccessories.forEach(acc => {
        materialsText += `* ${acc.name}: ${acc.quantity} ${acc.unit}\n`;
    });

    const fullMaterialsList = Object.values(localMaterials).flat().map(m => `- ${m.name}: ${Number(m.price).toLocaleString('vi-VN')}đ / ${m.unit}`).join('\n');

    const prompt = `Bạn là chuyên gia dự toán chi phí và định giá sản phẩm nội thất. Hãy phân tích và báo giá cho sản phẩm sau, dựa vào mô tả và hình ảnh được cung cấp (nếu có):\n\n**Tên sản phẩm:** ${itemName}\n**Kích thước:** ${dimensions}\n**Danh sách vật tư được chọn:**\n${materialsText}\n**Yêu cầu thêm:** ${description || 'Không có'}\n\n**Nhiệm vụ:**\n1.  **Phân tích chi tiết:** Dựa vào cả hình ảnh và mô tả, hãy ước tính lượng vật tư cần thiết (ván, cạnh). Tạo bảng kê chi phí chi tiết. Toàn bộ phần phân tích này sẽ được đặt trong một trường JSON.\n2.  **Trích xuất tổng chi phí:** Xác định con số TỔNG CHI PHÍ VẬT TƯ cuối cùng và đặt nó vào một trường JSON riêng.\n3.  **Đề xuất giá bán:** Dựa trên tổng chi phí, độ phức tạp (suy ra từ hình ảnh và mô tả), và giá thị trường, hãy đề xuất một mức GIÁ BÁN HỢP LÝ (thường có lợi nhuận từ 40-60%) và đặt nó vào một trường JSON riêng.\n4.  **Tính lợi nhuận:** Tính toán LỢI NHUẬN DỰ KIẾN (Giá bán - Tổng chi phí) và đặt nó vào một trường JSON riêng.\n\n**Yêu cầu định dạng đầu ra:**\nHãy trả về một đối tượng JSON duy nhất, không có bất kỳ văn bản nào khác bên ngoài. JSON phải có cấu trúc như sau:\n{\n  "analysisText": "Toàn bộ bài phân tích chi tiết của bạn ở đây, bao gồm cả bảng kê chi phí...",\n  "totalCost": <con_số_tổng_chi_phí_vật_tư>,\n  "suggestedSellingPrice": <con_số_giá_bán_hợp_lý>,\n  "estimatedProfit": <con_số_lợi_nhuận_dự_kiến>\n}\n\n**Danh sách vật tư đầy đủ (để tham khảo đơn giá):**\n${fullMaterialsList}`;
    
    const resultObject = await callGeminiAPI(prompt, resultContainer, uploadedImage);
    if (resultObject) {
        lastGeminiResult = resultObject.analysisText;
        
        totalCostValue.textContent = `${Number(resultObject.totalCost || 0).toLocaleString('vi-VN')}đ`;
        suggestedPriceValue.textContent = `${Number(resultObject.suggestedSellingPrice || 0).toLocaleString('vi-VN')}đ`;
        estimatedProfitValue.textContent = `${Number(resultObject.estimatedProfit || 0).toLocaleString('vi-VN')}đ`;
        priceSummaryContainer.classList.remove('hidden');
        
        resultContainer.textContent = resultObject.analysisText;
        
        saveItemBtn.disabled = false;
    }
});

// --- Saved Items Logic ---
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
        savedItemsTableBody.innerHTML = `<tr><td colspan="3" class="text-center p-4 text-gray-400">Chưa có hạng mục nào được lưu.</td></tr>`;
        return;
    }
    items.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
    items.forEach(item => {
        const tr = document.createElement('tr');
        const createdAtDate = item.createdAt?.toDate();
        tr.innerHTML = `
            <td>${item.name}</td>
            <td>${createdAtDate ? createdAtDate.toLocaleDateString('vi-VN') : 'N/A'}</td>
            <td class="text-center">
                <button class="view-item-btn text-green-500 hover:text-green-700 mr-2" data-id="${item.id}"><i class="fas fa-eye"></i></button>
                <button class="delete-item-btn text-red-500 hover:text-red-700" data-id="${item.id}"><i class="fas fa-trash"></i></button>
            </td>
        `;
        savedItemsTableBody.appendChild(tr);
    });
}

saveItemBtn.addEventListener('click', async () => {
    if (!currentUserId || !lastGeminiResult) return;
    const itemName = document.getElementById('item-name').value.trim();
    if (!itemName) { showToast('Vui lòng nhập tên sản phẩm để lưu.', 'error'); return; }
    try {
        await addDoc(savedItemsCollectionRef, {
            name: itemName,
            geminiResult: lastGeminiResult,
            createdAt: serverTimestamp()
        });
        showToast(`Đã lưu thành công hạng mục "${itemName}"!`, 'success');
        lastGeminiResult = null;
        saveItemBtn.disabled = true;
    } catch (error) { console.error("Error saving item:", error); }
});

savedItemsTableBody.addEventListener('click', async e => {
    const btn = e.target.closest('button');
    if (!currentUserId || !btn) return;
    const id = btn.dataset.id;
    if (btn.classList.contains('delete-item-btn')) {
        if (await showConfirm('Bạn có chắc chắn muốn xóa hạng mục này?')) {
            await deleteDoc(doc(db, `users/${currentUserId}/savedItems`, id));
            showToast('Đã xóa hạng mục.', 'info');
        }
    } else if (btn.classList.contains('view-item-btn')) {
        const item = localSavedItems.find(i => i.id === id);
        if (item) {
            document.getElementById('view-item-title').textContent = item.name;
            document.getElementById('view-item-content').textContent = item.geminiResult;
            openModal(viewItemModal);
        }
    }
});

// --- Gemini API Call (Client-side) ---
async function callGeminiAPI(prompt, resultEl, image) {
    if (!ai) {
        const errorMessage = "Lỗi cấu hình: Khóa API cho Gemini chưa được thiết lập. Vui lòng kiểm tra và điền khóa API vào file script.js.";
        resultEl.textContent = errorMessage;
        showToast(errorMessage, 'error');
        return null;
    }

    const spinner = `<div class="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75"><div class="spinner"></div></div>`;
    resultEl.innerHTML = spinner;
    saveItemBtn.disabled = true;
    lastGeminiResult = null;
    priceSummaryContainer.classList.add('hidden');

    try {
        const parts = [];
        if (image && image.data && image.mimeType) {
            parts.push({
                inlineData: {
                    mimeType: image.mimeType,
                    data: image.data,
                },
            });
        }
        parts.push({ text: prompt });

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-04-17',
            contents: { parts: parts },
        });

        // --- Phân tích phản hồi từ Gemini ---
        let jsonStr = response.text.trim();
        const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
        const match = jsonStr.match(fenceRegex);
        if (match && match[2]) {
            jsonStr = match[2].trim();
        }

        try {
            const parsedData = JSON.parse(jsonStr);
            return parsedData;
        } catch (parseError) {
             console.error("Lỗi phân tích JSON từ Gemini:", parseError);
             console.error("Văn bản gốc từ Gemini:", response.text);
             throw new Error(`Phản hồi của AI không phải là JSON hợp lệ. Nội dung: ${response.text}`);
        }

    } catch (error) {
        console.error("Lỗi khi gọi API Gemini:", error);
        resultEl.textContent = `Lỗi khi gọi API: ${error.message}`;
        showToast('Đã xảy ra lỗi khi phân tích. Vui lòng thử lại.', 'error');
        return null;
    }
}
