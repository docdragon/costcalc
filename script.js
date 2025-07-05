// script.js

// QUAN TRỌNG: DÁN CẤU HÌNH FIREBASE CỦA BẠN VÀO ĐÂY
// Bạn có thể lấy thông tin này từ Project Settings > General trong Firebase Console
 const firebaseConfig = {
    apiKey: "AIzaSyC_8Q8Girww42mI-8uwYsJaH5Vi41FT1eA",
    authDomain: "tinh-gia-thanh-app-fbdc0.firebaseapp.com",
    projectId: "tinh-gia-thanh-app-fbdc0",
    storageBucket: "tinh-gia-thanh-app-fbdc0.firebasestorage.app",
    messagingSenderId: "306099623121",
    appId: "1:306099623121:web:157ce5827105998f3a61f0",
    measurementId: "G-D8EHTN2SWE"
  };


// QUAN TRỌNG: DÁN API KEY CỦA GEMINI VÀO ĐÂY
// Bạn có thể lấy key này từ Google AI Studio
const GEMINI_API_KEY = "AIzaSyDcjHTszyase9hG0DHikYMXY96ve7k5EfY";

// --- KHÔNG CHỈNH SỬA CODE BÊN DƯỚI TRỪ KHI BẠN BIẾT MÌNH ĐANG LÀM GÌ ---

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { 
    getAuth, signInAnonymously, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";


// Khởi tạo Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Lấy các phần tử DOM chung
const materialForm = document.getElementById('material-form');
const materialIdInput = document.getElementById('material-id');
const materialNameInput = document.getElementById('material-name');
const materialPriceInput = document.getElementById('material-price');
const materialUnitInput = document.getElementById('material-unit');
const materialNotesInput = document.getElementById('material-notes');
const materialsTableBody = document.getElementById('materials-table-body');
const submitButton = document.getElementById('submit-button');
const cancelEditButton = document.getElementById('cancel-edit-button');
const userIdDisplay = document.getElementById('user-id-display');

// DOM cho tính năng Phân tích chi phí
const calculateBtn = document.getElementById('calculate-btn');
const productDescriptionInput = document.getElementById('product-description');
const resultContainer = document.getElementById('result-content');
const loadingSpinner = document.getElementById('loading-spinner');

// DOM cho tính năng Gợi ý Tên & Mô tả
const suggestNameBtn = document.getElementById('suggest-name-btn');
const ideaKeywordsInput = document.getElementById('idea-keywords');
const suggestNameResultDiv = document.getElementById('suggest-name-result');
const suggestNameLoading = document.getElementById('suggest-name-loading');

// DOM cho tính năng Tư vấn Thiết kế
const consultDesignBtn = document.getElementById('consult-design-btn');
const designKeywordsInput = document.getElementById('design-keywords');
const consultDesignResultDiv = document.getElementById('consult-design-result');
const consultDesignLoading = document.getElementById('consult-design-loading');


let currentUserId = null;
let materialsCollectionRef = null;
let unsubscribeMaterials = null; 
let localMaterials = []; 

// Hàm xác thực người dùng
onAuthStateChanged(auth, user => {
    if (user) {
        console.log("User is signed in with UID:", user.uid);
        currentUserId = user.uid;
        userIdDisplay.textContent = currentUserId;
        materialsCollectionRef = collection(db, `users/${currentUserId}/materials`);
        listenForMaterials();
    } else {
        console.log("User is signed out. Signing in anonymously...");
        signInAnonymously(auth).catch(error => {
            console.error("Anonymous sign-in failed:", error);
            alert("Không thể kết nối đến cơ sở dữ liệu. Vui lòng kiểm tra lại cấu hình Firebase.");
        });
    }
});

// Hàm lắng nghe thay đổi dữ liệu vật tư từ Firestore
function listenForMaterials() {
    if (unsubscribeMaterials) unsubscribeMaterials(); 
    if (!materialsCollectionRef) return;

    unsubscribeMaterials = onSnapshot(materialsCollectionRef, (snapshot) => {
        localMaterials = []; 
        const materials = [];
        snapshot.forEach(doc => {
            const materialData = { id: doc.id, ...doc.data() };
            materials.push(materialData);
            localMaterials.push(materialData); 
        });
        renderMaterials(materials);
    }, error => {
        console.error("Error fetching materials: ", error);
        alert("Lỗi khi tải danh sách vật tư.");
    });
}

// Hàm hiển thị vật tư ra bảng
function renderMaterials(materials) {
    materialsTableBody.innerHTML = '';
    if (materials.length === 0) {
        materialsTableBody.innerHTML = `<tr><td colspan="4" class="text-center p-4 text-gray-500">Chưa có vật tư nào. Hãy thêm mới.</td></tr>`;
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

// Xử lý form thêm/sửa vật tư
materialForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUserId) {
        alert("Chưa xác thực người dùng. Vui lòng chờ giây lát.");
        return;
    }
    const materialData = {
        name: materialNameInput.value,
        price: Number(materialPriceInput.value),
        unit: materialUnitInput.value,
        notes: materialNotesInput.value
    };
    const id = materialIdInput.value;
    try {
        if (id) {
            const materialDocRef = doc(db, `users/${currentUserId}/materials`, id);
            await updateDoc(materialDocRef, materialData);
        } else {
            await addDoc(materialsCollectionRef, materialData);
        }
        resetForm();
    } catch (error) {
        console.error("Error saving material: ", error);
        alert("Lỗi khi lưu vật tư.");
    }
});

// Xử lý nút Sửa và Xóa
materialsTableBody.addEventListener('click', async (e) => {
    if (!currentUserId) return;
    const target = e.target.closest('button');
    if (!target) return;
    const id = target.dataset.id;
    const materialDocRef = doc(db, `users/${currentUserId}/materials`, id);
    if (target.classList.contains('delete-btn')) {
        if (confirm('Bạn có chắc chắn muốn xóa vật tư này?')) {
            try {
                await deleteDoc(materialDocRef);
            } catch (error) {
                console.error("Error deleting material: ", error);
                alert("Lỗi khi xóa vật tư.");
            }
        }
    } else if (target.classList.contains('edit-btn')) {
        const materialToEdit = localMaterials.find(m => m.id === id);
        if (materialToEdit) {
            materialIdInput.value = materialToEdit.id;
            materialNameInput.value = materialToEdit.name;
            materialPriceInput.value = materialToEdit.price;
            materialUnitInput.value = materialToEdit.unit;
            materialNotesInput.value = materialToEdit.notes;
            submitButton.innerHTML = '<i class="fas fa-save mr-2"></i> Cập nhật Vật tư';
            submitButton.classList.replace('bg-indigo-600', 'bg-yellow-500');
            submitButton.classList.replace('hover:bg-indigo-700', 'hover:bg-yellow-600');
            cancelEditButton.classList.remove('hidden');
            window.scrollTo(0, 0);
        }
    }
});

// Nút hủy chỉnh sửa
cancelEditButton.addEventListener('click', resetForm);

// Hàm reset form
function resetForm() {
    materialForm.reset();
    materialIdInput.value = '';
    submitButton.innerHTML = '<i class="fas fa-plus mr-2"></i> Thêm Vật tư';
    submitButton.classList.replace('bg-yellow-500', 'bg-indigo-600');
    submitButton.classList.replace('hover:bg-yellow-600', 'hover:bg-indigo-700');
    cancelEditButton.classList.add('hidden');
}

// --- HÀM GỌI API GEMINI CHUNG ---
async function callGeminiAPI(prompt, loadingElement, resultElement) {
    if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_GEMINI_API_KEY") {
        resultElement.textContent = "Lỗi: Vui lòng cấu hình API Key của Gemini trong file script.js.";
        return;
    }

    loadingElement.classList.remove('hidden');
    resultElement.parentElement.classList.add('hidden');

    try {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`API Error: ${errorData.error.message}`);
        }

        const data = await response.json();
        const resultText = data.candidates[0].content.parts[0].text;
        resultElement.textContent = resultText;

    } catch (error) {
        console.error('Error calling Gemini API:', error);
        resultElement.textContent = `Đã xảy ra lỗi khi kết nối với Gemini. Vui lòng kiểm tra lại API Key và thử lại.\nChi tiết lỗi: ${error.message}`;
    } finally {
        loadingElement.classList.add('hidden');
        resultElement.parentElement.classList.remove('hidden');
    }
}


// --- XỬ LÝ CÁC TÍNH NĂNG ---

// 1. Phân tích chi phí
calculateBtn.addEventListener('click', () => {
    const productDescription = productDescriptionInput.value;
    if (!productDescription) {
        alert('Vui lòng nhập mô tả sản phẩm.');
        return;
    }
    if (localMaterials.length === 0) {
        alert('Vui lòng thêm ít nhất một vật tư vào danh sách.');
        return;
    }
    const materialsListString = localMaterials.map(m => 
        `- ${m.name}: ${Number(m.price).toLocaleString('vi-VN')}đ / ${m.unit} (Ghi chú: ${m.notes || 'không có'})`
    ).join('\n');
    const prompt = `
        Bạn là một chuyên gia dự toán chi phí cho ngành sản xuất nội thất gỗ công nghiệp và quảng cáo.
        Dựa vào danh sách vật tư có sẵn dưới đây và mô tả sản phẩm, hãy thực hiện các yêu cầu sau.

        **Danh sách vật tư hiện có:**
        ${materialsListString}

        **Mô tả sản phẩm cần tính giá:**
        "${productDescription}"

        **Yêu cầu:**
        1.  **Phân tích vật tư:** Liệt kê các vật tư cần thiết từ danh sách trên để sản xuất sản phẩm này. Ước tính số lượng cho từng loại.
        2.  **Tối ưu hóa cắt ván (nếu có):** Nếu sản phẩm liên quan đến ván gỗ, hãy đưa ra gợi ý về cách sắp xếp, cắt ván sao cho tiết kiệm nhất.
        3.  **Bảng kê chi phí:** Tạo một bảng chi tiết gồm các cột: Tên vật tư, Số lượng, Đơn giá, Thành tiền. Tính tổng chi phí vật tư ở cuối bảng.
        4.  **Gợi ý lợi nhuận:** Dựa trên tổng chi phí vật tư, hãy đề xuất một vài mức lợi nhuận (ví dụ: 30%, 40%, 50%) và tính giá bán gợi ý tương ứng.

        Hãy trình bày kết quả một cách rõ ràng, có cấu trúc, sử dụng định dạng Markdown để dễ đọc.
    `;
    callGeminiAPI(prompt, loadingSpinner, resultContainer);
});

// 2. Gợi ý Tên & Mô tả
suggestNameBtn.addEventListener('click', () => {
    const keywords = ideaKeywordsInput.value;
    if (!keywords) {
        alert('Vui lòng nhập một vài từ khóa về sản phẩm.');
        return;
    }
    const prompt = `
        Bạn là một chuyên gia marketing và copywriter trong lĩnh vực nội thất và quảng cáo.
        Dựa trên các từ khóa sau: "${keywords}", hãy thực hiện:
        1.  **Gợi ý 5 tên sản phẩm** thật hấp dẫn, sáng tạo và có tính thương mại.
        2.  **Viết một đoạn mô tả sản phẩm** (khoảng 50-70 từ) thật lôi cuốn, nêu bật được giá trị và phong cách của sản phẩm.

        Hãy trình bày kết quả một cách chuyên nghiệp, rõ ràng.
    `;
    callGeminiAPI(prompt, suggestNameLoading, suggestNameResultDiv);
});

// 3. Tư vấn Thiết kế
consultDesignBtn.addEventListener('click', () => {
    const keywords = designKeywordsInput.value;
    if (!keywords) {
        alert('Vui lòng nhập yêu cầu tư vấn thiết kế.');
        return;
    }
    const prompt = `
        Bạn là một nhà tư vấn thiết kế nội thất chuyên nghiệp, luôn cập nhật các xu hướng mới nhất.
        Dựa trên yêu cầu sau: "${keywords}", hãy đưa ra những gợi ý chi tiết về:
        1.  **Phong cách thiết kế phù hợp:** (Vd: Tối giản, Hiện đại, Scandinavian, Industrial...) Giải thích ngắn gọn tại sao.
        2.  **Màu sắc chủ đạo:** Đề xuất một bảng màu (3-4 màu) và ý nghĩa của chúng.
        3.  **Vật liệu nên dùng:** Gợi ý các loại vật liệu phù hợp với phong cách và yêu cầu.
        4.  **Mẹo trang trí (Decor tips):** Đưa ra một vài mẹo nhỏ để không gian trở nên ấn tượng hơn.

        Hãy trình bày các gợi ý một cách trực quan và dễ áp dụng.
    `;
    callGeminiAPI(prompt, consultDesignLoading, consultDesignResultDiv);
});
