// dom.js
// This file centralizes all DOM element selections for the application.

// --- Global & Auth ---
export const initialLoader = document.getElementById('initial-loader');
export const logoutBtn = document.getElementById('logout-btn');
export const loggedInView = document.getElementById('logged-in-view');
export const loggedOutView = document.getElementById('logged-out-view');
export const userEmailDisplay = document.getElementById('user-email-display');

// --- Tabs ---
export const tabs = document.getElementById('tabs');
export const tabContent = document.getElementById('tab-content');

// --- Main Calculator Tab ---
// Product Info
export const itemNameInput = document.getElementById('item-name');
export const itemLengthInput = document.getElementById('item-length');
export const itemWidthInput = document.getElementById('item-width');
export const itemHeightInput = document.getElementById('item-height');
export const itemTypeSelect = document.getElementById('item-type');
export const laborCostInput = document.getElementById('labor-cost');
export const profitMarginInput = document.getElementById('profit-margin');

// Materials
export const mainMaterialWoodCombobox = document.getElementById('main-material-wood-combobox');
export const mainMaterialBackPanelCombobox = document.getElementById('main-material-back-panel-combobox');
export const edgeMaterialCombobox = document.getElementById('edge-material-combobox');

// Components
export const componentsTableBody = document.getElementById('components-table-body');
export const addCustomComponentBtn = document.getElementById('add-custom-component-btn');

// Accessories
export const mainMaterialAccessoriesCombobox = document.getElementById('main-material-accessories-combobox');
export const accessoryQuantityInput = document.getElementById('accessory-quantity');
export const addAccessoryBtn = document.getElementById('add-accessory-btn');
export const accessoriesList = document.getElementById('accessories-list');

// Description & Image
export const productDescriptionInput = document.getElementById('product-description');
export const imageUploader = document.getElementById('image-uploader');
export const imageInput = document.getElementById('image-input');
export const imageUploadPrompt = document.getElementById('image-upload-prompt');
export const imagePreviewContainer = document.getElementById('image-preview-container');
export const imagePreview = document.getElementById('image-preview');
export const removeImageBtn = document.getElementById('remove-image-btn');
export const imageAnalysisContainer = document.getElementById('image-analysis-container');
export const analyzeImageBtn = document.getElementById('analyze-image-btn');
export const analyzeStructureBtn = document.getElementById('analyze-structure-btn');

// Actions & Results
export const saveItemBtn = document.getElementById('save-item-btn');
export const analyzeBtn = document.getElementById('analyze-btn');
export const aiAnalysisSection = document.getElementById('ai-analysis-section');
export const aiLoadingPlaceholder = document.getElementById('ai-loading-placeholder');
export const aiResultsContent = document.getElementById('ai-results-content');
export const priceSummaryContainer = document.getElementById('price-summary-container');
export const totalCostValue = document.getElementById('total-cost-value');
export const suggestedPriceValue = document.getElementById('suggested-price-value');
export const estimatedProfitValue = document.getElementById('estimated-profit-value');
export const costBreakdownContainer = document.getElementById('cost-breakdown-container');
export const cuttingLayoutSection = document.getElementById('cutting-layout-section');
export const cuttingLayoutSummary = document.getElementById('cutting-layout-summary');
export const cuttingLayoutContainer = document.getElementById('cutting-layout-container');

// Product Preview
export const productPreviewContainer = document.getElementById('product-preview-container');
export const previewFront = document.getElementById('preview-front');
export const previewTop = document.getElementById('preview-top');
export const previewLeft = document.getElementById('preview-left');

// --- Quick Calculator Tab ---
export const qcAreaInput = document.getElementById('qc-area');
export const qcMaterialWoodCombobox = document.getElementById('qc-material-wood-combobox');
export const qcSheetCountDisplay = document.getElementById('qc-sheet-count-display');
export const qcArea2Input = document.getElementById('qc-area-2');
export const qcMaterialWood2Combobox = document.getElementById('qc-material-wood-2-combobox');
export const qcSheetCount2Display = document.getElementById('qc-sheet-count-display-2');
export const qcInstallCostInput = document.getElementById('qc-install-cost');
export const qcProfitMarginInput = document.getElementById('qc-profit-margin');
export const qcMaterialAccessoriesCombobox = document.getElementById('qc-material-accessories-combobox');
export const qcAccessoryQtyInput = document.getElementById('qc-accessory-quantity');
export const qcAddAccessoryBtn = document.getElementById('qc-add-accessory-btn');
export const qcAccessoriesList = document.getElementById('qc-accessories-list');
export const qcTotalCostValue = document.getElementById('qc-total-cost-value');
export const qcSuggestedPriceValue = document.getElementById('qc-suggested-price-value');
export const qcEstimatedProfitValue = document.getElementById('qc-estimated-profit-value');

// --- Materials Tab ---
export const materialForm = document.getElementById('material-form');
export const materialsTableBody = document.getElementById('materials-table-body');
export const materialFilterInput = document.getElementById('material-filter-input');
export const materialSortSelect = document.getElementById('material-sort-select');
export const paginationControls = document.getElementById('pagination-controls');
export const pageInfo = document.getElementById('page-info');
export const prevPageBtn = document.getElementById('prev-page-btn');
export const nextPageBtn = document.getElementById('next-page-btn');
export const cancelEditBtn = document.getElementById('cancel-edit-button');

// --- Configuration Tab ---
// Product Type Manager
export const productTypeForm = document.getElementById('product-type-form');
export const productTypeIdInput = document.getElementById('product-type-id');
export const productTypeNameInput = document.getElementById('product-type-name');
export const cancelProductTypeEditBtn = document.getElementById('cancel-product-type-edit-btn');
export const productTypesList = document.getElementById('product-types-list');
export const productTypeEditor = document.getElementById('product-type-editor');
export const productTypeEditorTitle = document.getElementById('product-type-editor-title');
export const ptComponentAddCombobox = document.getElementById('pt-component-add-combobox');
export const ptComponentAddQtyInput = document.getElementById('pt-component-add-qty');
export const ptComponentAddBtn = document.getElementById('pt-component-add-btn');
export const ptComponentsList = document.getElementById('pt-components-list');

// Component Name Manager
export const componentNameForm = document.getElementById('component-name-form');
export const componentNamesTableBody = document.getElementById('component-names-table-body');
export const cancelComponentNameEditBtn = document.getElementById('cancel-component-name-edit-btn');

// --- Saved Projects Tab ---
export const savedItemsTableBody = document.getElementById('saved-items-table-body');

// --- Modals ---
export const loginModal = document.getElementById('login-modal');
export const openLoginModalBtn = document.getElementById('open-login-modal-btn');
export const googleLoginBtn = document.getElementById('google-login-btn');
export const rememberMeCheckbox = document.getElementById('remember-me-checkbox');
export const loginError = document.getElementById('login-error');
export const viewItemModal = document.getElementById('view-item-modal');
export const viewItemTitle = document.getElementById('view-item-title');
export const viewItemContent = document.getElementById('view-item-content');
export const confirmModal = document.getElementById('confirm-modal');
export const confirmMessage = document.getElementById('confirm-message');
export const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
export const confirmOkBtn = document.getElementById('confirm-ok-btn');

// --- Misc ---
export const toastContainer = document.getElementById('toast-container');