"use strict";

// ======================================================
// PRIMECORE
// Sistema de catálogo y administración
// ======================================================


// ======================================================
// 1. CATEGORÍAS
// ======================================================

const categories = [
    { id: "procesadores", name: "Procesadores", icon: "▦" },
    { id: "graficas", name: "Tarjetas gráficas", icon: "▣" },
    { id: "ram", name: "Memoria RAM", icon: "▤" },
    { id: "almacenamiento", name: "Almacenamiento", icon: "▥" },
    { id: "fuentes", name: "Fuentes de alimentación", icon: "ϟ" },
    { id: "placas", name: "Placas base", icon: "▧" },
    { id: "chasis", name: "Chasis", icon: "▢" },
    { id: "refrigeracion", name: "Refrigeración", icon: "❄" },
    { id: "perifericos", name: "Periféricos", icon: "⌨" },
    { id: "cables", name: "Cables", icon: "⌁" }
];


// ======================================================
// 2. VARIABLES GENERALES
// ======================================================

let products = [];
let productsLoaded = false;
let activeCategory = "all";

let projectDirectory = null;

let productImageFile = null;
let previewURL = null;
let currentProductImage = "";

// ACCESO DE ADMINISTRACIÓN
const ADMIN_PASSWORD = "123456789";
let adminAuthenticated = false;


// ======================================================
// 3. ELEMENTOS HTML
// ======================================================

const $ = id => document.getElementById(id);

const productGrid = $("productGrid");
const categoryFilter = $("categoryFilter");
const categoryList = $("categoryList");
const productSearch = $("productSearch");

const adminPanel = $("adminPanel");
const productForm = $("productForm");
const adminProductList = $("adminProductList");

const productModal = $("productModal");
const modalBody = $("modalBody");

const productPriceInput = $("productPrice");
const imageFileInput = $("productImageFile");
const imageUrlInput = $("productImageUrl");


// ======================================================
// 4. FUNCIONES GENERALES
// ======================================================

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function roundPrice(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function formatPrice(value) {
    return Number(value).toLocaleString("es-ES", {
        style: "currency",
        currency: "EUR"
    });
}

function getCategoryName(id) {
    const category = categories.find(item => item.id === id);
    return category ? category.name : "Sin categoría";
}

function updateStorageStatus(message) {
    const element = $("storageStatus");

    if (element) {
        element.textContent = message;
    }
}


// ======================================================
// 5. VALIDAR URL DE IMAGEN
// ======================================================

function isValidImageURL(value) {
    if (!value) return true;

    try {
        const url = new URL(value);

        return (
            url.protocol === "https:" ||
            url.protocol === "http:"
        );

    } catch {
        return false;
    }
}


// ======================================================
// 6. SISTEMA DE PRECIOS
// ======================================================

// Precio mayorista: precio base + 55 %
// Precio minorista: precio base + 75 %

function calculateWholesalePrice(price) {
    return roundPrice(Number(price) * 1.55);
}

function calculateRetailPrice(price) {
    return roundPrice(Number(price) * 1.75);
}

function updatePricePreview() {
    const value = productPriceInput.value.trim();
    const price = Number(value);

    if (
        value === "" ||
        !Number.isFinite(price) ||
        price < 0
    ) {
        $("wholesalePreview").textContent = "—";
        $("retailPreview").textContent = "—";
        return;
    }

    $("wholesalePreview").textContent =
        formatPrice(calculateWholesalePrice(price));

    $("retailPreview").textContent =
        formatPrice(calculateRetailPrice(price));
}


// ======================================================
// 7. NORMALIZACIÓN DE PRODUCTOS
// ======================================================

function normalizeProducts(data) {
    if (!Array.isArray(data)) {
        throw new Error("Los datos de productos no son válidos.");
    }

    return data.map((product, index) => {
        const stock = Math.max(0, Number(product.stock) || 0);

        let status = product.status || "Disponible";

        if (status !== "Próximamente") {
            status = stock <= 0 ? "Agotado" : "Disponible";
        }

        return {
            id: Number(product.id) || index + 1,
            name: String(product.name || ""),
            brand: String(product.brand || ""),
            category: String(product.category || ""),
            model: String(product.model || ""),
            price: Math.max(0, Number(product.price) || 0),
            stock,
            status,
            image: String(product.image || ""),
            description: String(product.description || ""),
            specs: Array.isArray(product.specs)
                ? product.specs
                : []
        };
    });
}


// ======================================================
// 8. CARGA AUTOMÁTICA DE PRODUCTOS.JS
// ======================================================

async function loadProductsOnStartup() {
    try {
        if (!Array.isArray(window.PRIMECORE_PRODUCTS)) {
            throw new Error(
                "No se encuentra window.PRIMECORE_PRODUCTS."
            );
        }

        products = normalizeProducts(window.PRIMECORE_PRODUCTS);

        productsLoaded = true;

        console.log(
            "PRIMECORE: productos cargados correctamente:",
            products
        );

        updateStorageStatus(
            "Catálogo cargado correctamente."
        );

        return true;

    } catch (error) {
        console.error(
            "PRIMECORE - Error cargando productos:",
            error
        );

        products = [];
        productsLoaded = false;

        productGrid.innerHTML = `
            <p class="empty-message">
                No se han podido cargar los productos.
                Comprueba que productos.js está junto a Index.html
                y que está incluido antes de script.js.
            </p>
        `;

        updateStorageStatus("Error al cargar el catálogo.");

        return false;
    }
}


// ======================================================
// 9. CONEXIÓN CON LA CARPETA DEL PROYECTO
// ======================================================

async function selectProjectFolder() {
    try {
        if (!window.showDirectoryPicker) {
            alert(
                "Tu navegador no permite conectar directamente la carpeta. " +
                "Utiliza una versión actualizada de Chrome o Edge."
            );
            return;
        }

        const directory = await window.showDirectoryPicker({
            mode: "readwrite"
        });

        const permission = await directory.requestPermission({
            mode: "readwrite"
        });

        if (permission !== "granted") {
            alert("No se han concedido permisos de escritura.");
            return;
        }

        const fileHandle = await directory.getFileHandle("productos.js");
        const file = await fileHandle.getFile();
        const content = await file.text();

        const loadProducts = new Function(
            content +
            "\nreturn window.PRIMECORE_PRODUCTS;"
        );

        const data = loadProducts();

        if (!Array.isArray(data)) {
            throw new Error(
                "productos.js no contiene una lista válida de productos."
            );
        }

        projectDirectory = directory;
        products = normalizeProducts(data);
        productsLoaded = true;

        await ensureProductImageFolder();

        refreshAll();

        updateStorageStatus(
            "Carpeta conectada: " + directory.name
        );

        alert("Carpeta PRIMECORE conectada correctamente.");

    } catch (error) {
        if (error.name !== "AbortError") {
            console.error("Error al conectar la carpeta:", error);

            alert(
                "No se pudo conectar la carpeta.\n\n" +
                "Motivo: " + error.message
            );
        }
    }
}


// ======================================================
// 10. GUARDAR PRODUCTOS.JS
// ======================================================

async function saveProductsToFile() {
    if (!projectDirectory) {
        throw new Error(
            "Primero debes conectar la carpeta PRIMECORE."
        );
    }

    const handle = await projectDirectory.getFileHandle(
        "productos.js",
        { create: true }
    );

    const writable = await handle.createWritable();

    const content =
        '"use strict";\n\n' +
        "window.PRIMECORE_PRODUCTS = " +
        JSON.stringify(products, null, 4) +
        ";\n";

    try {
        await writable.write(content);
        await writable.close();

    } catch (error) {
        await writable.abort();
        throw error;
    }
}


// ======================================================
// 11. CARPETA DE IMÁGENES
// ======================================================

async function ensureProductImageFolder() {
    const imgFolder = await projectDirectory.getDirectoryHandle(
        "img",
        { create: true }
    );

    return imgFolder.getDirectoryHandle(
        "productos",
        { create: true }
    );
}

async function getProductImageFolder() {
    const imgFolder = await projectDirectory.getDirectoryHandle("img");

    return imgFolder.getDirectoryHandle("productos");
}


// ======================================================
// 12. VISTA PREVIA DE IMÁGENES
// ======================================================

function clearPreviewURL() {
    if (previewURL) {
        URL.revokeObjectURL(previewURL);
        previewURL = null;
    }
}

function showImagePreview(source, altText = "Vista previa del producto") {
    const preview = $("imagePreview");

    preview.innerHTML = "";

    if (!source) return;

    const image = document.createElement("img");

    image.src = source;
    image.alt = altText;

    image.onerror = () => {
        preview.innerHTML = "";

        const message = document.createElement("p");

        message.textContent =
            "No se ha podido cargar la imagen. Comprueba el enlace.";

        preview.appendChild(message);
    };

    preview.appendChild(image);
}

function updateImagePreview() {
    const url = imageUrlInput.value.trim();

    clearPreviewURL();

    if (url) {
        if (!isValidImageURL(url)) {
            $("imagePreview").textContent =
                "Introduce una URL válida que comience por http:// o https://.";

            return;
        }

        showImagePreview(url);
        return;
    }

    if (productImageFile) {
        previewURL = URL.createObjectURL(productImageFile);

        showImagePreview(previewURL);
        return;
    }

    if (currentProductImage) {
        showImagePreview(currentProductImage, "Imagen actual del producto");
        return;
    }

    $("imagePreview").innerHTML = "";
}


// ======================================================
// 13. EVENTOS DE LAS IMÁGENES
// ======================================================

imageUrlInput.addEventListener("input", () => {
    if (imageUrlInput.value.trim()) {
        productImageFile = null;
        imageFileInput.value = "";
    }

    updateImagePreview();
});

imageFileInput.addEventListener("change", event => {
    const file = event.target.files[0];

    productImageFile = null;

    if (!file) {
        updateImagePreview();
        return;
    }

    if (!file.type.startsWith("image/")) {
        alert("Selecciona un archivo de imagen válido.");

        imageFileInput.value = "";
        updateImagePreview();

        return;
    }

    imageUrlInput.value = "";

    productImageFile = file;

    updateImagePreview();
});


// ======================================================
// 14. GUARDAR IMÁGENES LOCALES
// ======================================================

async function saveProductImage(file, id) {
    const folder = await ensureProductImageFolder();

    const extension = file.name.split(".").pop().toLowerCase();

    const safeExtension = /^[a-z0-9]{1,8}$/.test(extension)
        ? extension
        : "jpg";

    const fileName = `producto-${id}.${safeExtension}`;

    const handle = await folder.getFileHandle(fileName, {
        create: true
    });

    const writable = await handle.createWritable();

    try {
        await writable.write(file);
        await writable.close();

    } catch (error) {
        await writable.abort();
        throw error;
    }

    return `img/productos/${fileName}`;
}


// ======================================================
// 15. ELIMINAR IMÁGENES LOCALES
// ======================================================

async function deleteProductImage(path) {
    if (!path || !projectDirectory) return;

    const prefix = "img/productos/";

    if (!path.startsWith(prefix)) return;

    const fileName = path.slice(prefix.length);

    if (
        !fileName ||
        fileName.includes("/") ||
        fileName.includes("\\") ||
        fileName.includes("..")
    ) {
        return;
    }

    try {
        const folder = await getProductImageFolder();

        await folder.removeEntry(fileName);

    } catch (error) {
        if (error.name !== "NotFoundError") {
            console.warn(
                "No se pudo eliminar la imagen:",
                error
            );
        }
    }
}


// ======================================================
// 16. MOSTRAR CATEGORÍAS
// ======================================================

function renderCategories() {
    categoryFilter.innerHTML = `
        <option value="all">Todas las categorías</option>
    `;

    $("productCategory").innerHTML = "";

    categories.forEach(category => {
        const option = document.createElement("option");

        option.value = category.id;
        option.textContent = category.name;

        categoryFilter.appendChild(option);

        $("productCategory").appendChild(
            option.cloneNode(true)
        );
    });

    categoryList.innerHTML = `
        <button
            class="category-btn active"
            data-category="all"
        >
            Todas
        </button>

        ${categories.map(category => `
            <button
                class="category-btn"
                data-category="${category.id}"
            >
                ${category.icon}
                ${escapeHTML(category.name)}
            </button>
        `).join("")}
    `;

    categoryList.querySelectorAll(".category-btn").forEach(button => {
        button.addEventListener("click", () => {
            activeCategory = button.dataset.category;

            categoryFilter.value = activeCategory;

            updateCategoryButtons();
            renderProducts();
        });
    });
}

function updateCategoryButtons() {
    categoryList.querySelectorAll(".category-btn").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.category === activeCategory
        );
    });
}


// ======================================================
// 17. MOSTRAR PRODUCTOS
// ======================================================

function renderProducts() {
    if (!productsLoaded) return;

    const search = productSearch.value.toLowerCase().trim();

    const filteredProducts = products.filter(product => {
        const matchesCategory =
            activeCategory === "all" ||
            product.category === activeCategory;

        const searchableText = [
            product.name,
            product.brand,
            product.model,
            getCategoryName(product.category)
        ].join(" ").toLowerCase();

        return (
            matchesCategory &&
            searchableText.includes(search)
        );
    });

    if (filteredProducts.length === 0) {
        productGrid.innerHTML = `
            <p class="empty-message">
                No se han encontrado productos.
            </p>
        `;

        return;
    }

    productGrid.innerHTML = filteredProducts.map(product => {
        const statusClass =
            product.status === "Agotado"
                ? "out"
                : product.status === "Próximamente"
                    ? "soon"
                    : "";

        const image = product.image
            ? `
                <img
                    src="${escapeHTML(product.image)}"
                    alt="${escapeHTML(product.name)}"
                    onerror="this.style.display='none'"
                >
            `
            : `
                <div class="product-placeholder">
                    PRIMECORE
                </div>
            `;

        const stockText =
            product.status === "Próximamente"
                ? "Próximamente"
                : `${product.stock} unidades disponibles`;

        return `
            <article class="product-card">

                <div class="product-image">
                    ${image}
                </div>

                <div class="product-info">

                    <span class="product-category">
                        ${escapeHTML(
                            getCategoryName(product.category)
                        )}
                    </span>

                    <h3>
                        ${escapeHTML(product.name)}
                    </h3>

                    <p class="product-brand">
                        ${escapeHTML(product.brand)}
                        ·
                        ${escapeHTML(product.model)}
                    </p>

                    <div class="product-bottom">

                        <div class="product-prices">

                            <div class="product-price-line">
                                <span class="product-price-label">
                                    Mayorista
                                </span>

                                <strong class="product-price">
                                    ${formatPrice(
                                        calculateWholesalePrice(product.price)
                                    )}
                                </strong>
                            </div>

                            <div class="product-price-line minorista">
                                <span class="product-price-label">
                                    Minorista
                                </span>

                                <strong class="product-price">
                                    ${formatPrice(
                                        calculateRetailPrice(product.price)
                                    )}
                                </strong>
                            </div>

                        </div>

                        <span class="product-status ${statusClass}">
                            ${escapeHTML(product.status)}
                        </span>

                    </div>

                    <p class="product-stock">
                        ${escapeHTML(stockText)}
                    </p>

                    <button
                        class="product-detail-btn"
                        data-id="${product.id}"
                    >
                        Ver detalles
                    </button>

                </div>

            </article>
        `;
    }).join("");

    productGrid.querySelectorAll(".product-detail-btn").forEach(button => {
        button.addEventListener("click", () => {
            openProductModal(Number(button.dataset.id));
        });
    });
}


// ======================================================
// 18. FICHA DEL PRODUCTO
// ======================================================

function openProductModal(id) {
    const product = products.find(item => item.id === id);

    if (!product) return;

    const image = product.image
        ? `
            <img
                src="${escapeHTML(product.image)}"
                alt="${escapeHTML(product.name)}"
            >
        `
        : `
            <div class="product-placeholder">
                PRIMECORE
            </div>
        `;

    modalBody.innerHTML = `
        <div class="modal-product-image">
            ${image}
        </div>

        <span class="product-category">
            ${escapeHTML(getCategoryName(product.category))}
        </span>

        <h2>${escapeHTML(product.name)}</h2>

        <p>
            ${escapeHTML(product.brand)}
            ·
            ${escapeHTML(product.model)}
        </p>

        <div class="modal-price-box">

            <div class="modal-price-item">
                <span>Precio mayorista</span>

                <strong>
                    ${formatPrice(
                        calculateWholesalePrice(product.price)
                    )}
                </strong>
            </div>

            <div class="modal-price-item">
                <span>Precio minorista</span>

                <strong>
                    ${formatPrice(
                        calculateRetailPrice(product.price)
                    )}
                </strong>
            </div>

        </div>

        <p style="margin-top:20px">
            ${escapeHTML(
                product.description || "Sin descripción disponible."
            )}
        </p>

        <h3 style="margin-top:20px">
            Características
        </h3>

        <ul class="modal-specs">
            ${product.specs.map(spec => `
                <li>${escapeHTML(spec)}</li>
            `).join("")}
        </ul>

        <p>
            Disponibilidad:
            <strong>${escapeHTML(product.status)}</strong>
        </p>

        <p>
            Stock:
            <strong>${product.stock} unidades</strong>
        </p>
    `;

    productModal.classList.add("open");
    productModal.setAttribute("aria-hidden", "false");
}

function closeProductModal() {
    productModal.classList.remove("open");
    productModal.setAttribute("aria-hidden", "true");
}


// ======================================================
// 19. DASHBOARD
// ======================================================

function renderDashboard() {
    const total = products.length;

    const available = products.filter(product =>
        product.stock > 0 &&
        product.status === "Disponible"
    ).length;

    const out = products.filter(product =>
        product.stock === 0 &&
        product.status !== "Próximamente"
    ).length;

    const totalStock = products.reduce(
        (sum, product) => sum + product.stock,
        0
    );

    $("totalProducts").textContent = total;
    $("availableProducts").textContent = available;
    $("outProducts").textContent = out;
    $("totalStock").textContent = totalStock;

    const lowStock = products.filter(product =>
        product.stock > 0 &&
        product.stock <= 2
    );

    const alertBox = $("inventoryAlert");
    const alertText = $("inventoryAlertText");

    alertBox.classList.toggle(
        "good",
        out === 0 && lowStock.length === 0
    );

    const messages = [];

    if (out > 0) {
        messages.push(`${out} producto(s) agotado(s)`);
    }

    if (lowStock.length > 0) {
        messages.push(
            `${lowStock.length} producto(s) con stock bajo`
        );
    }

    alertText.textContent = messages.length > 0
        ? messages.join(" · ") + "."
        : "Todos los productos tienen existencias suficientes.";
}


// ======================================================
// 20. LISTADO DE ADMINISTRACIÓN
// ======================================================

function renderAdminProducts() {
    $("adminProductCount").textContent =
        `${products.length} productos`;

    if (products.length === 0) {
        adminProductList.innerHTML = `
            <p class="empty-message">
                No hay productos registrados.
            </p>
        `;

        return;
    }

    adminProductList.innerHTML = products.map(product => {
        const stockClass =
            product.stock === 0
                ? "none"
                : product.stock <= 2
                    ? "low"
                    : "";

        return `
            <div class="admin-product-item">

                <div>

                    <h4>
                        ${escapeHTML(product.name)}
                    </h4>

                    <p>
                        ${escapeHTML(
                            getCategoryName(product.category)
                        )}

                        · Base:
                        ${formatPrice(product.price)}
                    </p>

                    <div class="admin-prices">

                        <span>
                            Mayorista:
                            <strong>
                                ${formatPrice(
                                    calculateWholesalePrice(product.price)
                                )}
                            </strong>
                        </span>

                        <span>
                            Minorista:
                            <strong>
                                ${formatPrice(
                                    calculateRetailPrice(product.price)
                                )}
                            </strong>
                        </span>

                    </div>

                    <span class="stock-indicator ${stockClass}">
                        ${product.stock} unidades ·
                        ${escapeHTML(product.status)}
                    </span>

                </div>

                <div class="admin-actions">

                    <button
                        data-action="edit"
                        data-id="${product.id}"
                    >
                        Editar
                    </button>

                    <button
                        data-action="delete"
                        data-id="${product.id}"
                        class="delete-btn"
                    >
                        Eliminar
                    </button>

                </div>

            </div>
        `;
    }).join("");

    adminProductList.querySelectorAll("button").forEach(button => {
        button.addEventListener("click", () => {
            const id = Number(button.dataset.id);

            if (button.dataset.action === "edit") {
                editProduct(id);
            }

            if (button.dataset.action === "delete") {
                deleteProduct(id);
            }
        });
    });
}


// ======================================================
// 21. ACTUALIZAR TODA LA INTERFAZ
// ======================================================

function refreshAll() {
    renderProducts();
    renderAdminProducts();
    renderDashboard();
}


// ======================================================
// 22. PANEL DE ADMINISTRACIÓN
// ======================================================

function openAdmin() {
    // Comprobación adicional por si se intenta abrir
    // el panel sin haber iniciado sesión.

    if (!adminAuthenticated) {
        openLoginModal();
        return;
    }

    adminPanel.classList.add("visible");

    refreshAll();

    adminPanel.scrollIntoView({
        behavior: "smooth"
    });
}

function closeAdminPanel() {
    adminPanel.classList.remove("visible");
}


// ======================================================
// 23. SISTEMA DE INICIO Y CIERRE DE SESIÓN
// ======================================================

function openLoginModal() {
    const loginModal = $("loginModal");

    loginModal.classList.add("open");
    loginModal.setAttribute("aria-hidden", "false");

    $("loginError").textContent = "";
    $("adminPassword").value = "";

    setTimeout(() => {
        $("adminPassword").focus();
    }, 100);
}

function closeLoginModal() {
    const loginModal = $("loginModal");

    loginModal.classList.remove("open");
    loginModal.setAttribute("aria-hidden", "true");
}

function loginAdmin(event) {
    event.preventDefault();

    const password = $("adminPassword").value;

    if (password !== ADMIN_PASSWORD) {
        $("loginError").textContent =
            "Contraseña incorrecta. Inténtalo de nuevo.";

        $("adminPassword").value = "";
        $("adminPassword").focus();

        return;
    }

    adminAuthenticated = true;

    // Ocultar inicio de sesión.
    $("loginAccess").hidden = true;

    // Mostrar administración.
    $("adminAccess").hidden = false;

    closeLoginModal();

    alert("Sesión iniciada correctamente.");
}

function logoutAdmin() {
    adminAuthenticated = false;

    // Cerrar el panel.
    closeAdminPanel();

    // Ocultar el botón de administración.
    $("adminAccess").hidden = true;

    // Volver a mostrar el botón de inicio de sesión.
    $("loginAccess").hidden = false;

    // Limpiar el formulario.
    resetForm();

    // Volver al inicio de la página.
    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


// ======================================================
// 24. REINICIAR FORMULARIO
// ======================================================

function resetForm() {
    productForm.reset();

    $("productId").value = "";
    $("productStock").value = 0;

    $("formTitle").textContent = "Añadir producto";
    $("saveProduct").textContent = "Añadir producto";

    productImageFile = null;
    currentProductImage = "";

    imageFileInput.value = "";
    imageUrlInput.value = "";

    clearPreviewURL();

    $("imagePreview").innerHTML = "";

    updatePricePreview();
}


// ======================================================
// 25. EDITAR PRODUCTO
// ======================================================

function editProduct(id) {
    const product = products.find(item => item.id === id);

    if (!product) return;

    $("productId").value = product.id;
    $("productName").value = product.name;
    $("productBrand").value = product.brand;
    $("productCategory").value = product.category;
    $("productModel").value = product.model;
    $("productPrice").value = product.price;
    $("productStock").value = product.stock;
    $("productStatus").value = product.status;

    $("productDescription").value = product.description;

    $("productSpecs").value = product.specs.join("\n");

    productImageFile = null;
    imageFileInput.value = "";

    clearPreviewURL();

    currentProductImage = product.image || "";

    if (
        currentProductImage.startsWith("http://") ||
        currentProductImage.startsWith("https://")
    ) {
        imageUrlInput.value = currentProductImage;
    } else {
        imageUrlInput.value = "";
    }

    updateImagePreview();

    $("formTitle").textContent = "Editar producto";
    $("saveProduct").textContent = "Guardar cambios";

    updatePricePreview();

    document.querySelector(".admin-form-card").scrollIntoView({
        behavior: "smooth"
    });
}


// ======================================================
// 26. ELIMINAR PRODUCTO
// ======================================================

async function deleteProduct(id) {
    if (!adminAuthenticated) {
        alert("Debes iniciar sesión para realizar esta acción.");
        return;
    }

    if (!projectDirectory) {
        alert(
            "Para eliminar productos debes conectar primero " +
            "la carpeta PRIMECORE."
        );

        return;
    }

    const product = products.find(item => item.id === id);

    if (!product) return;

    const confirmation = confirm(
        `¿Estás seguro de eliminar "${product.name}"?`
    );

    if (!confirmation) return;

    const previousProducts = products;

    products = products.filter(item => item.id !== id);

    try {
        await saveProductsToFile();

        await deleteProductImage(product.image);

        refreshAll();

        if ($("productId").value === String(id)) {
            resetForm();
        }

        alert("Producto eliminado correctamente.");

    } catch (error) {
        products = previousProducts;

        console.error(error);

        alert("No se pudo eliminar el producto.");
    }
}


// ======================================================
// 27. GUARDAR PRODUCTO
// ======================================================

productForm.addEventListener("submit", async event => {
    event.preventDefault();

    if (!adminAuthenticated) {
        alert("Debes iniciar sesión para realizar esta acción.");
        return;
    }

    if (!productsLoaded) {
        alert("No se ha cargado el catálogo.");
        return;
    }

    if (!projectDirectory) {
        alert(
            "Primero conecta la carpeta PRIMECORE " +
            "para poder guardar los cambios."
        );

        return;
    }

    const idValue = $("productId").value;

    const priceText = productPriceInput.value.trim();
    const price = Number(priceText);

    const stock = Number($("productStock").value);

    const imageURL = imageUrlInput.value.trim();

    if (
        imageURL &&
        !isValidImageURL(imageURL)
    ) {
        alert(
            "La URL de la imagen no es válida. " +
            "Debe comenzar por http:// o https://."
        );

        return;
    }

    if (
        priceText === "" ||
        !Number.isFinite(price) ||
        price < 0 ||
        !Number.isInteger(stock) ||
        stock < 0
    ) {
        alert("Comprueba el precio y el stock.");
        return;
    }

    const id = idValue
        ? Number(idValue)
        : Math.max(0, ...products.map(p => p.id)) + 1;

    const existing = products.find(item => item.id === id);

    let status = $("productStatus").value || "Disponible";

    if (status !== "Próximamente") {
        status = stock <= 0 ? "Agotado" : "Disponible";
    }

    const data = {
        id,
        name: $("productName").value.trim(),
        brand: $("productBrand").value.trim(),
        category: $("productCategory").value,
        model: $("productModel").value.trim(),
        price: roundPrice(price),
        stock,
        status,

        image: existing ? existing.image : "",

        description: $("productDescription").value.trim(),

        specs: $("productSpecs").value
            .split("\n")
            .map(item => item.trim())
            .filter(Boolean)
    };

    if (
        !data.name ||
        !data.brand ||
        !data.category
    ) {
        alert("Completa los campos obligatorios.");
        return;
    }

    const previousProducts = products;
    const previousImage = existing ? existing.image : "";

    const button = $("saveProduct");

    button.disabled = true;
    button.textContent = "Guardando...";

    try {
        if (imageURL) {
            data.image = imageURL;
        }

        else if (productImageFile) {
            data.image = await saveProductImage(
                productImageFile,
                id
            );
        }

        if (idValue) {
            products = products.map(item =>
                item.id === id ? data : item
            );
        } else {
            products.push(data);
        }

        await saveProductsToFile();

        if (
            previousImage &&
            previousImage !== data.image &&
            previousImage.startsWith("img/productos/")
        ) {
            await deleteProductImage(previousImage);
        }

        refreshAll();
        resetForm();

        alert(
            idValue
                ? "Producto actualizado correctamente."
                : "Producto añadido correctamente."
        );

    } catch (error) {
        products = previousProducts;

        console.error(error);

        alert(
            "No se pudo guardar el producto. " +
            "Comprueba los permisos de la carpeta."
        );

    } finally {
        button.disabled = false;

        button.textContent = $("productId").value
            ? "Guardar cambios"
            : "Añadir producto";
    }
});


// ======================================================
// 28. EVENTOS DE LA INTERFAZ
// ======================================================

$("selectProjectFolder").addEventListener(
    "click",
    selectProjectFolder
);


// ACCESO Y AUTENTICACIÓN

$("loginAccess").addEventListener(
    "click",
    openLoginModal
);

$("adminAccess").addEventListener(
    "click",
    openAdmin
);

$("loginForm").addEventListener(
    "submit",
    loginAdmin
);

$("loginClose").addEventListener(
    "click",
    closeLoginModal
);

$("loginBackdrop").addEventListener(
    "click",
    closeLoginModal
);

$("logoutAdmin").addEventListener(
    "click",
    logoutAdmin
);


// PANEL DE ADMINISTRACIÓN

$("closeAdmin").addEventListener(
    "click",
    closeAdminPanel
);

$("cancelEdit").addEventListener(
    "click",
    resetForm
);

$("newProductBtn").addEventListener("click", () => {
    if (!adminAuthenticated) return;

    resetForm();

    document.querySelector(".admin-form-card").scrollIntoView({
        behavior: "smooth"
    });
});


// PRECIOS Y BÚSQUEDA

productPriceInput.addEventListener(
    "input",
    updatePricePreview
);

productSearch.addEventListener(
    "input",
    renderProducts
);

categoryFilter.addEventListener("change", () => {
    activeCategory = categoryFilter.value;

    updateCategoryButtons();
    renderProducts();
});


// MODAL DE PRODUCTOS

$("modalClose").addEventListener(
    "click",
    closeProductModal
);

$("modalBackdrop").addEventListener(
    "click",
    closeProductModal
);


// TECLA ESCAPE

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        closeProductModal();
        closeLoginModal();
    }
});


// MENÚ MÓVIL

$("menuToggle").addEventListener("click", () => {
    $("mainNav").classList.toggle("open");
});

$("mainNav").querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
        $("mainNav").classList.remove("open");
    });
});


// ======================================================
// 29. INICIALIZACIÓN
// ======================================================

async function initializePrimecore() {
    console.log("Iniciando PRIMECORE...");

    // La sesión siempre comienza cerrada al recargar.
    adminAuthenticated = false;

    $("loginAccess").hidden = false;
    $("adminAccess").hidden = true;

    renderCategories();

    const loaded = await loadProductsOnStartup();

    if (loaded) {
        refreshAll();

        console.log(
            `PRIMECORE listo. ${products.length} productos disponibles.`
        );
    }
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializePrimecore,
        { once: true }
    );
} else {
    initializePrimecore();
}