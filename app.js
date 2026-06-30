const RESTAURANT_NAME = "Wloska robota bistro";
const API_BASE = "https://restaurant-backend-7i1c.onrender.com";

/* ===== RESTAURANT STATUS SYSTEM ===== */
function isRestaurantOpen() {
  const status = localStorage.getItem("restaurantOpen");
  return status !== "false";
}

function isSpecialClosedDay() {
  const today = new Date().toISOString().slice(0, 10);
  const closedDays = JSON.parse(localStorage.getItem("closedDays") || "[]");
  return closedDays.includes(today);
}

function getTodayClosingHour() {
  const custom = localStorage.getItem("customClosingHour");
  if (custom) return parseInt(custom);

  const day = new Date().getDay();
  return day >= 1 && day <= 4 ? 22 : 24;
}

function pobierzKanapkeTygodnia() {
  const day = new Date().getDay();
  return KANAPKI_TYGODNIA[day];
}

const toggle = document.getElementById("chat-toggle");
const box = document.getElementById("chat-box");
const hint = document.getElementById("chat-hint");
const closeBtn = document.getElementById("chat-close");
const input = document.getElementById("input");
const send = document.getElementById("send");
const messages = document.getElementById("chat-messages");

let reservationStep = null;
let reservation = {};
let cancelStep = null;
let cancelData = {};
const OPENING_HOURS = {
  weekday: { from: 12, to: 22 },
  weekend: { from: 12, to: 23 },
};

const hintTimeout = setTimeout(() => {
  hint.classList.add("show");
  setTimeout(() => hint.classList.remove("show"), 6000);
}, 700);

toggle.onclick = () => {
  box.classList.toggle("open");
  hint.classList.remove("show");
  clearTimeout(hintTimeout);

  if (!box.classList.contains("open")) {
    return;
  }

  if (!messages.children.length) {
    addMsg(`Cześć 👋 Jestem asystentem ${RESTAURANT_NAME}.`, "bot");
    addQuick();
    document.getElementById("chat-input").style.display = "flex";
  }

  if (orderCart.length > 0 || orderStep) {
    showCartUI();
    renderBottomCart();
  }
};

closeBtn.onclick = () => {
  box.classList.remove("open");
};

function resetReservation() {
  reservationStep = null;
  reservation = {};
}

function addMsg(text, cls) {
  const d = document.createElement("div");
  d.className = "msg " + cls;
  d.textContent = text;
  messages.appendChild(d);
  messages.scrollTop = messages.scrollHeight;
}

/* ===== QUICK BUTTON HELPER ===== */
function createQuickActions(actions) {
  const box = document.createElement("div");
  box.className = "quick";
  actions.forEach((a) => {
    const b = document.createElement("button");
    b.textContent = a.text;
    b.onclick = a.onClick;
    box.appendChild(b);
  });
  return box;
}

function enableCategoryBarScroll(bar) {
  if (!bar || bar.dataset.scrollReady === "true") return;

  bar.dataset.scrollReady = "true";

  bar.addEventListener(
    "wheel",
    function (e) {
      if (bar.scrollWidth <= bar.clientWidth) return;

      const verticalScroll = Math.abs(e.deltaY) > Math.abs(e.deltaX);

      if (verticalScroll) {
        bar.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    },
    { passive: false },
  );
}

function addQuick() {
  const q = document.createElement("div");
  q.className = "quick";
  [
    "📖 Menu",
    "⏰ Godziny",
    "📅 Rezerwacja",
    "🍽 Kanapka tygodnia",
    "🛒 Zamów jedzenie",
  ].forEach((t) => {
    const b = document.createElement("button");
    b.textContent = t;
    b.onclick = () => {
      if (t.includes("Zamów")) {
        startOrder();
      } else {
        input.value = t;
        sendMsg();
      }
    };
    q.appendChild(b);
  });
  messages.appendChild(q);
}

function isSandwichCommand(text) {
  const t = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");

  const words = t.split(" ");

  const sandwichWords = [
    "kanapka",
    "kanpka",
    "knapka",
    "knpaka",
    "kanap",
    "kanp",
  ];

  const weekWords = [
    "tygodnia",
    "tygodniowa",
    "tygodniowy",
    "tygod",
    "tyg",
    "tyd",
    "tydoniowa",
  ];

  const hasSandwich = words.some((w) =>
    sandwichWords.some((k) => w.includes(k)),
  );

  const hasWeek = words.some((w) => weekWords.some((k) => w.includes(k)));

  return hasSandwich && (hasWeek || words.length === 1);
}

function detectIntent(t) {
  if (isSandwichCommand(t)) return "daily";
  if (
    /kanapka tygodnia|kanapka|specjal|promocja dnia|polecacie|co polecacie|co polecasz|co dzis polecacie/i.test(
      t,
    )
  )
    return "daily";
  if (/hej|cześć|hello|siema/i.test(t)) return "greet";
  if (/menu|pizza|dania|wega/i.test(t)) return "menu";
  if (/rezer|rezew|stolik|booking/i.test(t)) return "reserve";
  if (/anul|rezygn|cancel/i.test(t)) return "cancel";
  if (/godzin|otwar|czynne|której|kiedy|od któr|do któr/i.test(t))
    return "hours";
  if (/kontakt|telefon|adres/i.test(t)) return "contact";
  return "unknown";
}

function isValidDate(t) {
  t = t.toLowerCase();
  if (/jutro|dziś|dzisiaj/.test(t)) return true;
  const m = t.match(/(\d{1,2})[.\-/ ](\d{1,2})/);
  if (!m) return false;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  return d >= 1 && d <= 31 && mo >= 1 && mo <= 12;
}

function isValidTime(t) {
  t = t.trim();

  // format HH:MM
  if (/^([01]?\d|2[0-3]):([0-5]\d)$/.test(t)) {
    return true;
  }

  return false;
}

function isWithinOpeningHours(time) {
  const hour = parseInt(time.split(":")[0], 10);
  const day = new Date().getDay();
  const hours =
    day >= 1 && day <= 4 ? OPENING_HOURS.weekday : OPENING_HOURS.weekend;
  return hour >= hours.from && hour < hours.to;
}

/* ===== VALIDATION UTILS ===== */
const Validator = {
  phone(v) {
    const d = v.replace(/\D/g, "");
    return d.length >= 7 && d.length <= 15;
  },
  surname(v) {
    return /^[A-Za-zÀ-ž\s\-]{2,}$/.test(v.trim());
  },
  people(v) {
    const n = parseInt(v, 10);
    return !isNaN(n) && n >= 1 && n <= 20;
  },
};

function isValidPeople(t) {
  return Validator.people(t);
}

function isValidPhone(t) {
  return Validator.phone(t);
}

function isValidSurname(t) {
  return Validator.surname(t);
}

function showMenu() {
  resetReservation();
  cancelStep = null;
  addMsg("🍕 MENU", "bot");
}

function startReservation() {
  resetReservation();
  cancelStep = null;
  orderStep = null;
  orderCategory = null;
  reservationStep = "date";
  addMsg("📅 Na jaki dzień chcesz zarezerwować stolik?", "bot");
}

function startCancel() {
  resetReservation();
  orderStep = null;
  orderCategory = null;
  cancelData = {};
  cancelStep = "lastname";
  addMsg("Aby anulować rezerwację, podaj nazwisko:", "bot");
}

async function handleCancel(text) {
  if (cancelStep === "lastname") {
    if (!isValidSurname(text)) {
      addMsg(
        "❗ Podaj poprawne nazwisko (bez cyfr i znaków specjalnych).",
        "bot",
      );
      return;
    }
    cancelData.lastname = text;
    cancelStep = "phone";
    addMsg("Podaj numer telefonu:", "bot");
    return;
  }
  if (cancelStep === "phone") {
    if (!isValidPhone(text)) {
      addMsg("❗ Podaj poprawny numer telefonu.", "bot");
      return;
    }

    cancelData.phone = text;
    cancelStep = null;

    try {
      const response = await fetch(`${API_BASE}/cancel-reservation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lastname: cancelData.lastname,
          phone: cancelData.phone,
        }),
      });

      if (!response.ok) {
        throw new Error("Błąd anulowania rezerwacji");
      }

      const data = await response.json();

      if (!data.success) {
        addMsg("❗ Nie znaleziono rezerwacji dla podanych danych.", "bot");
        addQuick();
        document.getElementById("chat-input").style.display = "flex";
        return;
      }
    } catch (e) {
      console.error(e);
      addMsg("❌ Nie udało się anulować rezerwacji. Spróbuj ponownie.", "bot");
      return;
    }

    addMsg(
      "❌ Rezerwacja została anulowana. W czym mogę pomóc dalej? 🙂",
      "bot",
    );

    addQuick();
    document.getElementById("chat-input").style.display = "flex";
  }
}

async function handleReservation(t) {
  if (reservationStep === "date") {
    if (!isValidDate(t)) {
      addMsg("❗ Podaj poprawną datę (np. 12.03 lub jutro).", "bot");
      return;
    }
    reservation.date = t;
    reservationStep = "time";
    addMsg("⏰ O której godzinie? (np. 18:00)", "bot");
    return;
  }
  if (reservationStep === "time") {
    if (!isValidTime(t)) {
      addMsg("❗ Podaj poprawną godzinę (np. 18:00).", "bot");
      return;
    }
    if (!isWithinOpeningHours(t)) {
      addMsg(
        "❗ Restauracja przyjmuje rezerwacje tylko w godzinach pracy.",
        "bot",
      );
      return;
    }
    reservation.time = t;
    reservationStep = "people";
    addMsg("👥 Na ile osób?", "bot");
    return;
  }
  if (reservationStep === "people") {
    if (!isValidPeople(t)) {
      addMsg("❗ Podaj liczbę osób (1–20).", "bot");
      return;
    }
    reservation.people = t;
    reservationStep = "lastname";
    addMsg("🧾 Na jakie nazwisko?", "bot");
    return;
  }
  if (reservationStep === "lastname") {
    if (!isValidSurname(t)) {
      addMsg(
        "❗ Podaj poprawne nazwisko (bez cyfr i znaków specjalnych).",
        "bot",
      );
      return;
    }
    reservation.lastname = t;
    reservationStep = "phone";
    addMsg("📞 Numer telefonu?", "bot");
    return;
  }
  if (reservationStep === "phone") {
    if (!isValidPhone(t)) {
      addMsg("❗ Podaj poprawny numer telefonu.", "bot");
      return;
    }
    reservation.phone = t;
    reservationStep = null;

    try {
      const response = await fetch(`${API_BASE}/save-reservation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: reservation.date,
          time: reservation.time,
          people: reservation.people,
          lastname: reservation.lastname,
          phone: reservation.phone,
        }),
      });

      if (!response.ok) {
        throw new Error("Błąd zapisu rezerwacji");
      }

      const data = await response.json();
      reservation.reservationId = data.reservationId || "";
    } catch (e) {
      console.error(e);
      addMsg("❌ Nie udało się zapisać rezerwacji. Spróbuj ponownie.", "bot");
      return;
    }

    addMsg(
      `✅ Rezerwacja przyjęta:

        🔢 Numer rezerwacji: ${reservation.reservationId}
        📅 ${reservation.date}
        ⏰ ${reservation.time}
        👥 ${reservation.people} osób
        👤 ${reservation.lastname}
        📞 ${reservation.phone}

        Jeśli chcesz anulować rezerwację,
        kliknij przycisk poniżej lub napisz w czacie.`,
      "bot",
    );

    const q = document.createElement("div");
    q.className = "quick";
    const b = document.createElement("button");
    b.textContent = "❌ Anuluj rezerwację";
    b.onclick = () => {
      startCancel();
    };
    q.appendChild(b);
    messages.appendChild(q);
  }
}

function sendMsg() {
  if (!input.value.trim()) return;
  const text = input.value;
  const lower = text.toLowerCase();
  input.value = "";
  addMsg(text, "user");

  const intent = detectIntent(lower);

  if (intent === "daily") {
    addMsg("🥪 Kanapka tygodnia:\n\n" + pobierzKanapkeTygodnia(), "bot");
    showSandwichImages();
    return;
  }
  if (intent === "menu") {
    showMenu();
    return;
  }
  if (intent === "hours") {
    resetReservation();
    addMsg("⏰ Pon–Czw 12–22\nPt–Nd 12–23", "bot");
    return;
  }
  if (intent === "reserve") {
    startReservation();
    return;
  }
  if (intent === "cancel") {
    startCancel();
    return;
  }
  if (intent === "contact") {
    resetReservation();
    addMsg("📞 123 456 789\n📍 ul. Przykładowa 10", "bot");
    return;
  }
  if (intent === "greet") {
    resetReservation();
    addMsg("Cześć 👋 Jak mogę pomóc?", "bot");
    return;
  }

  if (reservationStep) {
    handleReservation(text);
    return;
  }
  if (cancelStep) {
    handleCancel(text);
    return;
  }

  // jeśli nic nie pasuje → AI
  if (intent === "unknown") {
    askAI(text);
    return;
  }
}

send.onclick = sendMsg;
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMsg();
});

/* ===== LOGOWANIE ADMINA ===== */

const ADMIN_LOGIN = "admin";
const ADMIN_PASSWORD = "1234";

/* ===== LOGOWANIE ADMINA ===== */

/* OTWARCIE OKNA LOGOWANIA */
const adminBtn = document.getElementById("admin-open-btn");

adminBtn.addEventListener("click", function () {
  document.getElementById("admin-login").style.display = "block";
});

/* LOGOWANIE */
function loginAdmin() {
  const user = document.getElementById("admin-login-user").value;
  const pass = document.getElementById("admin-login-pass").value;

  if (user === ADMIN_LOGIN && pass === ADMIN_PASSWORD) {
    document.getElementById("admin-login").style.display = "none";
    document.getElementById("admin-panel").style.display = "block";
  } else {
    alert("Niepoprawny login lub hasło");
  }
}

/* ZAPIS DANIA DNIA */
function saveDailySpecial() {
  const name = document.getElementById("admin-name").value.trim();
  const price = document.getElementById("admin-price").value.trim();

  if (!name) {
    alert("Podaj nazwę dania");
    return;
  }

  const data = { name, price };
  localStorage.setItem("adminKanapkaTygodnia", JSON.stringify(data));
  document.getElementById("admin-panel").style.display = "none";
  alert("Zapisano kanapka tygodnia ✅");
}

/* ZAMYKANIE OKIEN */
function closeAdminLogin() {
  document.getElementById("admin-login").style.display = "none";
}

function closeAdminPanel() {
  document.getElementById("admin-panel").style.display = "none";
}

/* ===== SANDWICH IMAGE PREVIEW ===== */
const sandwichInput = document.getElementById("sandwich-images");
const sandwichPreview = document.getElementById("sandwich-preview");

function renderSandwichImages() {
  sandwichPreview.innerHTML = "";
  const data = localStorage.getItem("sandwichImages");
  if (!data) return;
  const imgs = JSON.parse(data);

  imgs.forEach((src, i) => {
    const wrap = document.createElement("div");
    wrap.style.position = "relative";

    const img = document.createElement("img");
    img.src = src;
    img.style.width = "90px";
    img.style.height = "90px";
    img.style.objectFit = "cover";
    img.style.borderRadius = "10px";

    const del = document.createElement("button");
    del.textContent = "✕";
    del.style.position = "absolute";
    del.style.top = "-6px";
    del.style.right = "-6px";
    del.style.background = "#000";
    del.style.color = "#fff";
    del.style.border = "none";
    del.style.borderRadius = "50%";
    del.style.width = "20px";
    del.style.height = "20px";
    del.style.cursor = "pointer";

    del.onclick = function () {
      imgs.splice(i, 1);

      if (imgs.length === 0) {
        localStorage.removeItem("sandwichImages");
      } else {
        localStorage.setItem("sandwichImages", JSON.stringify(imgs));
      }

      sandwichInput.value = "";
      renderSandwichImages();
    };

    wrap.appendChild(img);
    wrap.appendChild(del);
    sandwichPreview.appendChild(wrap);
  });
}

if (sandwichInput) {
  sandwichInput.addEventListener("change", function () {
    const files = this.files;
    if (!files.length) return;

    const images = [];
    Array.from(files).forEach((file) => {
      const r = new FileReader();
      r.onload = function (e) {
        images.push(e.target.result);
        if (images.length === files.length) {
          localStorage.setItem("sandwichImages", JSON.stringify(images));
          renderSandwichImages();
        }
      };
      r.readAsDataURL(file);
    });
  });
}

/* ===== SAVE ALL CHANGES ===== */

const saveAllBtn = document.getElementById("save-all");

if (saveAllBtn) {
  saveAllBtn.onclick = function () {
    const name = document.getElementById("admin-name").value.trim();
    const price = document.getElementById("admin-price").value.trim();

    /* zapis kanapki tylko jeśli coś wpisano */
    if (name) {
      const data = { name, price };
      localStorage.setItem("adminKanapkaTygodnia", JSON.stringify(data));
    }

    const files = sandwichInput.files;

    /* zapis zdjęć menu */
    if (
      typeof menuUploadInput !== "undefined" &&
      menuUploadInput.files.length
    ) {
      const menuImages = [];
      Array.from(menuUploadInput.files).forEach((file) => {
        const r = new FileReader();
        r.onload = function (e) {
          menuImages.push(e.target.result);
          if (menuImages.length === menuUploadInput.files.length) {
            localStorage.setItem("menuImages", JSON.stringify(menuImages));
          }
        };
        r.readAsDataURL(file);
      });
    }
    if (files.length) {
      const images = [];
      Array.from(files).forEach((file) => {
        const r = new FileReader();
        r.onload = function (e) {
          images.push(e.target.result);
          if (images.length === files.length) {
            localStorage.setItem("sandwichImages", JSON.stringify(images));
          }
        };
        r.readAsDataURL(file);
      });
    }

    /* okno admin zamyka się ZAWSZE */
    document.getElementById("admin-panel").style.display = "none";
    alert("Zmiany zapisane ✅");
  };
}

/* NADPISANIE DANIA DNIA */
const originalGetDailySpecial = pobierzKanapkeTygodnia;

pobierzKanapkeTygodnia = function () {
  const saved = localStorage.getItem("adminKanapkaTygodnia");
  if (saved) {
    const data = JSON.parse(saved);
    return `${data.name}${data.price ? "\nCena: " + data.price : ""}`;
  }
  return originalGetDailySpecial();
};

/* przeniesienie przycisku zapisu na sam dół panelu */
window.addEventListener("DOMContentLoaded", function () {
  const panel = document.getElementById("admin-panel");
  const btn = document.getElementById("save-all");
  if (panel && btn) {
    panel.appendChild(btn);
  }
});

function showSandwichImages() {
  const data = localStorage.getItem("sandwichImages");
  if (!data) return;

  const imgs = JSON.parse(data);
  if (!imgs.length) return;

  const container = document.createElement("div");
  container.className = "menu-images";

  imgs.forEach((src) => {
    const im = document.createElement("img");
    im.src = src;
    im.onclick = () => openMenuModal(src);
    container.appendChild(im);
  });

  messages.appendChild(container);
  messages.scrollTop = messages.scrollHeight;
}

/* ===== MENU IMAGE STORAGE ===== */
function getMenuImages() {
  const data = localStorage.getItem("menuImages");
  if (!data) return [];
  return JSON.parse(data);
}

/* ===== SHOW MENU IMAGES IN CHAT ===== */
function showMenuImages() {
  const imgs = getMenuImages();

  if (!imgs.length) {
    addMsg("Menu nie zostało jeszcze dodane przez restaurację.", "bot");
    return;
  }

  const container = document.createElement("div");
  container.className = "menu-images";

  imgs.forEach((src) => {
    const im = document.createElement("img");
    im.src = src;
    im.onclick = () => openMenuModal(src);
    container.appendChild(im);
  });

  messages.appendChild(container);
  messages.scrollTop = messages.scrollHeight;
}

/* ===== MODAL ===== */
function openMenuModal(src) {
  document.getElementById("menu-modal").style.display = "flex";
  document.getElementById("menu-modal-img").src = src;
}

function closeMenuModal() {
  document.getElementById("menu-modal").style.display = "none";
}

/* ===== DETECT MENU WORD ===== */
const originalShowMenu = showMenu;
showMenu = function () {
  originalShowMenu();
  showMenuImages();
};

/* ===== ADMIN MENU IMAGE UPLOAD ===== */
const adminPanel = document.getElementById("admin-panel");

const menuUploadTitle = document.createElement("h3");
menuUploadTitle.innerText = "Zdjęcia menu";

const menuUploadInput = document.createElement("input");
menuUploadInput.type = "file";
menuUploadInput.multiple = true;
menuUploadInput.accept = "image/*";

/* przycisk zapisu menu usunięty – zapis następuje przez "Zapisz zmiany" */

adminPanel.appendChild(menuUploadTitle);
adminPanel.appendChild(menuUploadInput);

/* natychmiastowy podgląd dodanych zdjęć menu */
menuUploadInput.addEventListener("change", function () {
  const files = this.files;
  if (!files.length) return;

  const images = [];
  Array.from(files).forEach((file) => {
    const r = new FileReader();
    r.onload = function (e) {
      images.push(e.target.result);
      if (images.length === files.length) {
        localStorage.setItem("menuImages", JSON.stringify(images));
        renderAdminMenuImages();
      }
    };
    r.readAsDataURL(file);
  });
});

/* ===== ADMIN USUWANIE ZDJĘĆ MENU ===== */
const menuAdminPreview = document.createElement("div");
menuAdminPreview.style.display = "flex";
menuAdminPreview.style.flexWrap = "wrap";
menuAdminPreview.style.gap = "8px";
menuAdminPreview.style.marginTop = "10px";
adminPanel.appendChild(menuAdminPreview);

function renderAdminMenuImages() {
  menuAdminPreview.innerHTML = "";
  const data = localStorage.getItem("menuImages");
  if (!data) return;
  const imgs = JSON.parse(data);

  imgs.forEach((src, i) => {
    const wrap = document.createElement("div");
    wrap.style.position = "relative";

    const im = document.createElement("img");
    im.src = src;
    im.style.width = "90px";
    im.style.height = "90px";
    im.style.objectFit = "cover";
    im.style.borderRadius = "10px";

    const del = document.createElement("button");
    del.textContent = "✕";
    del.style.position = "absolute";
    del.style.top = "-6px";
    del.style.right = "-6px";
    del.style.background = "#000";
    del.style.color = "#fff";
    del.style.border = "none";
    del.style.borderRadius = "50%";
    del.style.width = "20px";
    del.style.height = "20px";
    del.style.cursor = "pointer";

    del.onclick = function () {
      imgs.splice(i, 1);
      localStorage.setItem("menuImages", JSON.stringify(imgs));
      renderAdminMenuImages();
    };

    wrap.appendChild(im);
    wrap.appendChild(del);
    menuAdminPreview.appendChild(wrap);
  });
}

adminBtn.addEventListener("click", () => {
  setTimeout(renderSandwichImages, 200);
  setTimeout(renderAdminMenuImages, 200);
});

/* ===== CART VISIBILITY CONTROL ===== */
function showCartUI() {
  const panel = document.getElementById("bottom-cart-panel");
  const arrow = document.getElementById("cart-arrow");

  if (panel) {
    panel.style.display = "block";
    panel.classList.remove("open");
    panel.style.transform = "";

    if (arrow) {
      arrow.textContent = "⬆";
    }

    if (typeof renderBottomCart === "function") {
      renderBottomCart();
    }

    /* create summary button if not exists */
    if (!document.getElementById("summary-btn")) {
      const btn = document.createElement("button");
      btn.id = "summary-btn";
      btn.textContent = "Podsumowanie";
      btn.style.width = "100%";
      btn.style.marginTop = "8px";
      btn.style.padding = "8px";
      btn.style.border = "none";
      btn.style.borderRadius = "10px";
      btn.style.background = "#222";
      btn.style.color = "#fff";
      btn.style.cursor = "pointer";

      btn.onclick = function () {
        /* clear chat */
        messages.innerHTML = "";

        /* hide cart panel */
        const p = document.getElementById("bottom-cart-panel");
        if (p) {
          p.classList.remove("open");
          p.style.display = "none";
        }

        /* remove category container */
        const cat = document.querySelector(".category-bar");
        if (cat) cat.remove();

        /* ===== CREATE SUMMARY CONTAINER ===== */

        const summary = document.createElement("div");
        summary.className = "order-summary-card";
        summary.style.background = "#fff";
        summary.style.padding = "14px";
        summary.style.borderRadius = "14px";
        summary.style.boxShadow = "0 6px 16px rgba(0,0,0,.15)";
        summary.style.marginBottom = "10px";

        const title = document.createElement("div");
        title.style.fontWeight = "600";
        title.style.marginBottom = "8px";
        title.textContent = "🧾 Podsumowanie zamówienia";

        summary.appendChild(title);

        /* lista produktów */
        const counts = {};

        orderCart.forEach((i) => {
          if (!counts[i]) counts[i] = 0;
          counts[i]++;
        });

        Object.keys(counts).forEach((name) => {
          const row = document.createElement("div");
          row.style.display = "flex";
          row.style.justifyContent = "space-between";
          row.style.marginBottom = "4px";

          const left = document.createElement("div");
          left.textContent = name + " x" + counts[name];

          let value = extractPrice(name) * counts[name];

          const right = document.createElement("div");
          right.textContent = value + " zł";

          row.appendChild(left);
          row.appendChild(right);

          summary.appendChild(row);
        });

        /* dostawa */
        const delivery = 5;

        const deliveryRow = document.createElement("div");
        deliveryRow.style.display = "flex";
        deliveryRow.style.justifyContent = "space-between";
        deliveryRow.style.marginTop = "8px";

        deliveryRow.innerHTML =
          "<div>Dostawa</div><div>" + delivery + " zł</div>";
        summary.appendChild(deliveryRow);

        /* suma końcowa */

        const totalRow = document.createElement("div");
        totalRow.style.display = "flex";
        totalRow.style.justifyContent = "space-between";
        totalRow.style.marginTop = "8px";
        totalRow.style.fontWeight = "600";

        const finalTotal = getCartTotal() + delivery;

        totalRow.innerHTML = "<div>Razem</div><div>" + finalTotal + " zł</div>";

        summary.appendChild(totalRow);

        /* dodanie do chatu */

        messages.appendChild(summary);
        messages.scrollTop = messages.scrollHeight;

        const backBtn = document.createElement("button");
        backBtn.textContent = "⬅ Wróć do zamawiania";
        backBtn.style.marginTop = "10px";
        backBtn.style.width = "100%";
        backBtn.style.padding = "8px";
        backBtn.style.border = "none";
        backBtn.style.borderRadius = "10px";
        backBtn.style.background = "#eee";
        backBtn.style.cursor = "pointer";

        backBtn.onclick = function () {
          messages.innerHTML = "";
          startOrder();
        };

        messages.appendChild(backBtn); // 🔥 KLUCZOWA LINIA

        /* ===== ORDER BUTTON AFTER SUMMARY ===== */

        document.getElementById("chat-input").style.display = "none";

        const orderNowBtn = document.createElement("button");
        orderNowBtn.textContent = "🧾 Złóż zamówienie";
        orderNowBtn.style.marginTop = "10px";
        orderNowBtn.style.width = "100%";
        orderNowBtn.style.padding = "10px";
        orderNowBtn.style.border = "none";
        orderNowBtn.style.borderRadius = "12px";
        orderNowBtn.style.background = "#8B0000";
        orderNowBtn.style.color = "#fff";
        orderNowBtn.style.fontWeight = "600";
        orderNowBtn.style.cursor = "pointer";

        orderNowBtn.onclick = function () {
          clearChat();
          document.getElementById("chat-input").style.display = "none";

          const form = document.createElement("div");
          form.className = "order-form";
          form.style.background = "#fff";
          form.style.padding = "14px";
          form.style.borderRadius = "14px";
          form.style.boxShadow = "0 6px 16px rgba(0,0,0,.15)";
          form.style.display = "flex";
          form.style.flexDirection = "column";
          form.style.gap = "8px";

          const backToSummaryBtn = document.createElement("button");
          backToSummaryBtn.textContent = "⬅ Wróć do podsumowania";
          backToSummaryBtn.type = "button";
          backToSummaryBtn.style.padding = "10px";
          backToSummaryBtn.style.border = "none";
          backToSummaryBtn.style.borderRadius = "10px";
          backToSummaryBtn.style.background = "#eee";
          backToSummaryBtn.style.color = "#143326";
          backToSummaryBtn.style.fontWeight = "700";
          backToSummaryBtn.style.cursor = "pointer";

          backToSummaryBtn.onclick = function () {
            btn.onclick();
          };

          const title = document.createElement("div");
          title.textContent = "📦 Dane do zamówienia";
          title.style.fontWeight = "600";

          const street = document.createElement("input");
          street.placeholder = "nazwa ulicy (wpisz tutaj)";

          const building = document.createElement("input");
          building.placeholder = "numer budynku (wpisz tutaj)";

          const apartment = document.createElement("input");
          apartment.placeholder = "numer mieszkania(opcjonalnie) (wpisz tutaj)";

          const phone = document.createElement("input");
          phone.placeholder = "Numer telefonu (wpisz tutaj)";

          const consentWrap = document.createElement("label");
          consentWrap.className = "order-consent";

          const consent = document.createElement("input");
          consent.type = "checkbox";

          const consentText = document.createElement("span");
          consentText.textContent =
            "Wyrażam zgodę na przetwarzanie danych w celu obsługi zamówienia.";

          consentWrap.appendChild(consent);
          consentWrap.appendChild(consentText);

          const submit = document.createElement("button");
          submit.textContent = "Zamawiam";
          submit.style.padding = "10px";
          submit.style.border = "none";
          submit.style.borderRadius = "10px";
          submit.style.background = "#8B0000";
          submit.style.color = "#fff";
          submit.style.cursor = "pointer";

          submit.onclick = async function () {
            if (orderSubmitting) return;

            const now = Date.now();
            const lastOrderTime = localStorage.getItem("lastOrderTime");

            /* ===== ANTI-SPAM ===== */
            // if (lastOrderTime) {
            //   const diff = now - parseInt(lastOrderTime);
            //   const minutes = diff / 1000 / 60;

            //   if (minutes < 15) {
            //     addMsg(
            //       "❌ Możesz złożyć kolejne zamówienie za około " +
            //         Math.ceil(15 - minutes) +
            //         " min.",
            //       "bot",
            //     );
            //     return;
            //   }
            // }

            const streetVal = street.value.trim();
            const buildingVal = building.value.trim();
            const apartmentVal = apartment.value.trim();
            const phoneVal = phone.value.trim();

            /* remove previous errors */
            form.querySelectorAll(".field-error").forEach((e) => e.remove());

            function showError(input, msg) {
              const err = document.createElement("div");
              err.className = "field-error";
              err.style.color = "red";
              err.style.fontSize = "12px";
              err.style.marginTop = "-4px";
              err.textContent = msg;
              input.after(err);
            }

            /* ===== VALIDATION ===== */

            if (streetVal.length < 3) {
              showError(street, "Podaj poprawną nazwę ulicy.");
              return;
            }

            if (!/^[A-Za-zÀ-ž ]+$/.test(streetVal)) {
              showError(street, "Ulica może zawierać tylko litery.");
              return;
            }

            if (!/^[0-9]{1,4}$/.test(buildingVal)) {
              showError(building, "Numer budynku niepoprawny.");
              return;
            }

            if (apartmentVal && !/^[0-9]{1,4}$/.test(apartmentVal)) {
              showError(apartment, "Numer mieszkania niepoprawny.");
              return;
            }

            if (!/^[0-9]{9}$/.test(phoneVal)) {
              showError(phone, "Telefon musi mieć 9 cyfr.");
              return;
            }

            if (!consent.checked) {
              showError(
                consentWrap,
                "Musisz zaakceptować zgodę, aby złożyć zamówienie.",
              );
              return;
            }

            orderSubmitting = true;
            submit.disabled = true;
            submit.textContent = "Wysyłanie zamówienia...";
            submit.style.opacity = "0.7";
            submit.style.cursor = "not-allowed";

            /* ===== SAVE DATA ===== */

            orderData.address =
              streetVal +
              " " +
              buildingVal +
              (apartmentVal ? "/" + apartmentVal : "");
            orderData.phone = phoneVal;

            let orderNumber = Math.floor(1000 + Math.random() * 9000);

            /* ===== SAVE ORDER ===== */

            try {
              const response = await fetch(`${API_BASE}/save-order`, {
                method: "POST",

                headers: {
                  "Content-Type": "application/json",
                },

                body: JSON.stringify({
                  id: orderNumber,
                  items: [...orderCart],
                  total: getCartTotal(),
                  address: orderData.address,
                  phone: orderData.phone,
                  status: "do potwierdzenia",
                  createdAt: new Date().toISOString(),
                }),
              });

              if (!response.ok) {
                throw new Error("Błąd zapisu");
              }
            } catch (e) {
              console.error(e);

              orderSubmitting = false;
              submit.disabled = false;
              submit.textContent = "Zamawiam";
              submit.style.opacity = "1";
              submit.style.cursor = "pointer";

              addMsg("❌ Nie udało się zapisać zamówienia.", "bot");

              return;
            }

            // localStorage.setItem("lastOrderTime", now);
            orderSubmitting = false;

            /* ===== MESSAGE ===== */

            let msg = "✅ Zamówienie przyjęte\n\n";
            msg += "📦 Numer zamówienia: #" + orderNumber + "\n\n";

            orderCart.forEach((i) => {
              msg += "• " + i + "\n";
            });

            msg += "\n💰 Razem: " + getCartTotal() + " zł";
            msg += "\n\n📍 " + orderData.address;
            msg += "\n📞 " + orderData.phone;
            msg += "\n\n🔔 Status: do potwierdzenia";
            msg += "\n⏳ Czas realizacji: około 30 minut";

            showOrderSuccessScreen(msg);

            /* NOTIFICATION CARD */
            const orderCard = document.createElement("div");
            orderCard.style.background = "#fff";
            orderCard.style.border = "2px solid #ff9800";
            orderCard.style.borderRadius = "12px";
            orderCard.style.padding = "12px";
            orderCard.style.marginTop = "10px";
            orderCard.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
            orderCard.style.animation = "fadeIn .4s ease";
            orderCard.style.position = "fixed";
            orderCard.style.right = "24px";
            orderCard.style.width = "350px";
            orderCard.style.top = "210px";
            orderCard.style.zIndex = "10000";

            orderCard.innerHTML = `🟡 NOWE ZAMÓWIENIE<br>📦 #${orderNumber}<br>⏳ Do potwierdzenia`;

            document.body.appendChild(orderCard);

            setTimeout(function () {
              if (orderCard && orderCard.parentNode) {
                orderCard.style.animation = "fadeOut .4s ease forwards";
                setTimeout(function () {
                  orderCard.remove();
                }, 400);
              }
            }, 3000);

            /* RESET */
            orderCart = [];
            orderData = {};
            updateCartBar();
          };

          form.appendChild(title);
          form.appendChild(street);
          form.appendChild(building);
          form.appendChild(apartment);
          form.appendChild(phone);
          form.appendChild(consentWrap);
          form.appendChild(backToSummaryBtn);
          form.appendChild(submit);

          messages.appendChild(form);
          messages.scrollTop = messages.scrollHeight;
        };

        messages.appendChild(orderNowBtn);
      };

      const cartContainer =
        document.getElementById("bottom-cart-total").parentNode;
      cartContainer.appendChild(btn);
    }
  }
}

function hideCartUI() {
  const panel = document.getElementById("bottom-cart-panel");
  if (panel) {
    panel.classList.remove("open");
    panel.style.display = "none";
  }
}

/* ================= ORDER SYSTEM DEMO ================= */

let orderStep = null;
let orderCategory = null;
let orderCart = [];
let orderData = {};
let orderSubmitting = false;

function clearChat() {
  const firstMsg = messages.querySelector(".msg");
  const firstQuick = messages.querySelector(".quick");

  messages.innerHTML = "";

  if (firstMsg) messages.appendChild(firstMsg);
  if (firstQuick) messages.appendChild(firstQuick);
}

function updateCartBar() {
  const bar = document.getElementById("cart-bar");
  const info = document.getElementById("cart-info");

  if (orderCart.length === 0) {
    bar.style.display = "none";
    document.getElementById("chat-messages").style.marginTop = "0px";
    return;
  }

  bar.style.display = "flex";
  document.getElementById("chat-messages").style.marginTop = "30px";
  info.textContent =
    "🛒 Koszyk (" + orderCart.length + ") – " + getCartTotal() + " zł";
}

/* ===== PRICE UTILITY ===== */
function extractPrice(text) {
  const m = text.match(/(\d+)\s*zł/);
  if (!m) return 0;
  return parseInt(m[1], 10);
}

function getCartTotal() {
  let total = 0;
  orderCart.forEach((item) => {
    const price = item.match(/(\d+)\s*zł/);
    if (price) total += parseInt(price[1]);
  });
  return total;
}

const ORDER_CATEGORIES = {};

function startOrder() {
  document.getElementById("chat-input").style.display = "none";

  messages.innerHTML = "";

  orderStep = "category";

  addMsg("🛒 Składanie zamówienia online\nProszę wybrać kategorię:", "bot");

  // style the container wider and center text
  const orderMsg = messages.lastChild;
  orderMsg.style.maxWidth = "100%";
  orderMsg.style.textAlign = "center";
  orderMsg.style.position = "relative";
  orderMsg.style.paddingLeft = "40px";

  const back = document.createElement("button");
  back.textContent = "⬅ Powrót";
  back.className = "back-btn";
  back.style.position = "absolute";
  back.style.left = "6px";
  back.style.top = "50%";
  back.style.transform = "translateY(-50%)";

  back.onclick = function () {
    messages.innerHTML = "";
    addMsg(`Cześć 👋 Jestem asystentem ${RESTAURANT_NAME}.`, "bot");
    addQuick();
    document.getElementById("chat-input").style.display = "flex";
    hideCartUI();
  };
  messages.lastChild.appendChild(back);

  const bar = document.createElement("div");
  bar.className = "category-bar";

  const categories = Object.keys(ORDER_CATEGORIES);

  if (!categories.length) {
    addMsg("Menu zamówień jest chwilowo puste.", "bot");
    return;
  }

  categories.forEach((cat, index) => {
    const b = document.createElement("button");
    b.textContent = cat;

    if (index === 0) {
      orderCategory = cat;
      b.classList.add("active");
    }

    b.onclick = () => {
      orderCategory = cat;

      const btns = document.querySelectorAll(".category-bar button");
      btns.forEach((x) => x.classList.remove("active"));
      b.classList.add("active");

      showOrderItems();
    };

    bar.appendChild(b);
  });

  messages.appendChild(bar);
  enableCategoryBarScroll(bar);
  showOrderItems();
}

function parseOrderItemDisplay(item) {
  const parts = item.split(" – ");
  const rawName = parts[0] || item;
  const price = parts[1] || "";

  const sizeMatch = rawName.match(/\((mały|duży)\)$/i);

  if (!sizeMatch) {
    return {
      name: rawName,
      size: "",
      price,
    };
  }

  return {
    name: rawName.replace(/\s*\((mały|duży)\)$/i, "").trim(),
    size: sizeMatch[1],
    price,
  };
}

function parseOrderItemDisplay(item) {
  const parts = item.split(" – ");
  let rawName = parts[0] || item;
  const price = parts[1] || "";

  let size = "";

  const sizeMatch = rawName.match(/\(([^)]+)\)\s*$/);

  if (sizeMatch) {
    size = sizeMatch[1].trim();
    rawName = rawName.replace(/\s*\([^)]+\)\s*$/, "").trim();
  }

  return {
    name: rawName,
    size,
    price,
  };
}

function showOrderItems() {
  orderStep = "items";

  /* remove previous category items so new category replaces them */
  const oldList = document.querySelector(".order-items");
  if (oldList) oldList.remove();

  const oldMsg = document.querySelector(".order-items-msg");
  if (oldMsg) oldMsg.remove();

  const msg = document.createElement("div");
  msg.className = "msg bot order-items-msg";
  msg.textContent = "";

  const items = ORDER_CATEGORIES[orderCategory] || [];

  const container = document.createElement("div");
  container.className = "product-grid order-items";

  items.forEach((item) => {
    const itemDisplay = parseOrderItemDisplay(item);

    const card = document.createElement("div");
    card.className = "product-card";

    const n = document.createElement("div");
    n.className = "product-name";
    n.textContent = itemDisplay.name;

    card.appendChild(n);

    if (itemDisplay.size) {
      const s = document.createElement("div");
      s.className = "product-size";
      s.textContent = "rozmiar: " + itemDisplay.size;
      card.appendChild(s);
    }

    const p = document.createElement("div");
    p.className = "product-price";
    p.textContent = itemDisplay.price;

    card.appendChild(p);

    card.onclick = function () {
      clearChat();

      addMsg("🍕 Ile porcji chcesz zamówić?", "bot");

      const qty = document.createElement("div");
      qty.className = "quick";

      [1, 2, 3, 4].forEach((n) => {
        const b = document.createElement("button");
        b.textContent = n;

        b.onclick = function () {
          qty.remove();

          clearChat();

          for (let i = 0; i < n; i++) {
            orderCart.push(item);
          }

          addMsg(
            "✅ Dodano do koszyka:\n\n" +
              item +
              " x" +
              n +
              "\n\n💰 Aktualna suma: " +
              getCartTotal() +
              " zł",
            "bot",
          );

          const addMoreBtn = document.createElement("button");
          addMoreBtn.textContent = "➕ Dodaj kolejny produkt";
          addMoreBtn.style.marginTop = "6px";
          addMoreBtn.style.padding = "6px 10px";
          addMoreBtn.style.border = "none";
          addMoreBtn.style.borderRadius = "10px";
          addMoreBtn.style.cursor = "pointer";
          addMoreBtn.onclick = startOrder;
          messages.appendChild(addMoreBtn);

          updateCartBar();

          const actions = document.createElement("div");
          actions.className = "quick";

          const more = document.createElement("button");
          more.textContent = "➕ Dodaj coś jeszcze";
          more.onclick = startOrder;

          const cart = document.createElement("button");
          cart.textContent = "🛒 Koszyk";
          cart.onclick = showCart;

          actions.appendChild(more);
          actions.appendChild(cart);

          messages.appendChild(actions);
        };

        qty.appendChild(b);
      });

      const moreBtn = document.createElement("button");
      moreBtn.textContent = "więcej";

      moreBtn.onclick = function () {
        qty.remove();
        addMsg("✏️ Wpisz ilość porcji:", "bot");
        orderStep = "customQty";
        orderData.selectedItem = item;
      };

      qty.appendChild(moreBtn);

      messages.appendChild(qty);
    };

    container.appendChild(card);
  });

  messages.appendChild(container);
}

function handleOrder(text) {
  if (orderStep === "customQty") {
    const n = parseInt(text);

    if (!n || n < 1) {
      addMsg("❗ Podaj poprawną ilość.", "bot");
      return;
    }

    clearChat();

    for (let i = 0; i < n; i++) {
      orderCart.push(orderData.selectedItem);
    }

    addMsg(
      "✅ Dodano do koszyka:\n\n" +
        orderData.selectedItem +
        " x" +
        n +
        "\n\n💰 Aktualna suma: " +
        getCartTotal() +
        " zł",
      "bot",
    );

    const addMoreBtn = document.createElement("button");
    addMoreBtn.textContent = "➕ Dodaj kolejny produkt";
    addMoreBtn.style.marginTop = "6px";
    addMoreBtn.style.padding = "6px 10px";
    addMoreBtn.style.border = "none";
    addMoreBtn.style.borderRadius = "10px";
    addMoreBtn.style.cursor = "pointer";
    addMoreBtn.onclick = startOrder;
    messages.appendChild(addMoreBtn);

    orderStep = null;
    updateCartBar();

    const actions = document.createElement("div");
    actions.className = "quick";

    const more = document.createElement("button");
    more.textContent = "➕ Dodaj coś jeszcze";
    more.onclick = startOrder;

    const cart = document.createElement("button");
    cart.textContent = "🛒 Koszyk";
    cart.onclick = showCart;

    actions.appendChild(more);
    actions.appendChild(cart);

    messages.appendChild(actions);

    return;
  }

  if (orderStep === "address") {
    orderData.address = text;
    orderStep = "phone";

    addMsg("📞 Podaj numer telefonu:", "bot");
    return;
  }

  if (orderStep === "phone") {
    orderData.phone = text;
    orderStep = null;

    let orderNumber = Math.floor(1000 + Math.random() * 9000);

    let msg = "✅ Zamówienie przyjęte\n\n";
    msg += "📦 Numer zamówienia: #" + orderNumber + "\n\n";

    orderCart.forEach((i) => {
      msg += "• " + i + "\n";
    });

    msg += "\n💰 Razem: " + getCartTotal() + " zł";
    msg += "\n\n📍 " + orderData.address;
    msg += "\n📞 " + orderData.phone;
    msg += "\n⏳ Czas realizacji: około 30 minut";

    addMsg(msg, "bot");

    const actions = document.createElement("div");
    actions.className = "quick";

    const backBtn = document.createElement("button");
    backBtn.textContent = "Wróć do czatu";
    backBtn.onclick = function () {
      messages.innerHTML = "";
      addMsg(`Cześć 👋 Jestem asystentem ${RESTAURANT_NAME}.`, "bot");
      addQuick();
      document.getElementById("chat-input").style.display = "flex";
    };

    const contactBtn = document.createElement("button");
    contactBtn.textContent = "Kontakt";
    contactBtn.onclick = function () {
      addMsg("📞 123 456 789", "bot");
    };

    actions.appendChild(backBtn);
    actions.appendChild(contactBtn);
    messages.appendChild(actions);

    orderCart = [];
    orderData = {};
    updateCartBar();
  }
}

function showOrderSuccessScreen(msg) {
  messages.innerHTML = "";

  orderStep = null;
  orderCategory = null;

  hideCartUI();
  document.getElementById("chat-input").style.display = "none";

  const card = document.createElement("div");
  card.className = "order-success-card";

  const title = document.createElement("div");
  title.className = "order-success-title";
  title.textContent = "✅ Zamówienie przyjęte";

  const body = document.createElement("div");
  body.className = "order-success-body";
  body.textContent = msg.replace("✅ Zamówienie przyjęte\n\n", "");

  const info = document.createElement("div");
  info.className = "order-success-info";
  info.textContent = "Za chwilę wrócisz do ekranu startowego.";

  const progress = document.createElement("div");
  progress.className = "order-success-progress";

  const progressBar = document.createElement("div");
  progressBar.className = "order-success-progress-bar";

  progress.appendChild(progressBar);

  card.appendChild(title);
  card.appendChild(body);
  card.appendChild(info);
  card.appendChild(progress);

  messages.appendChild(card);
  messages.scrollTop = 0;

  setTimeout(function () {
    card.classList.add("hide");
  }, 6000);

  setTimeout(function () {
    messages.innerHTML = "";
    addMsg(`Cześć 👋 Jestem asystentem ${RESTAURANT_NAME}.`, "bot");
    addQuick();

    document.getElementById("chat-input").style.display = "flex";
  }, 6500);
}

function showCart() {
  clearChat();

  if (!orderCart.length) {
    addMsg("Koszyk jest pusty.", "bot");
    return;
  }

  let msg = "🛒 Twój koszyk:\n\n";

  orderCart.forEach((i) => {
    msg += "• " + i + "\n";
  });

  msg += "\n💰 Razem: " + getCartTotal() + " zł";

  addMsg(msg, "bot");

  const actions = document.createElement("div");
  actions.className = "quick";

  const backBtn = document.createElement("button");
  backBtn.textContent = "Wróć do czatu";
  backBtn.onclick = function () {
    messages.innerHTML = "";
    addMsg(`Cześć 👋 Jestem asystentem ${RESTAURANT_NAME}.`, "bot");
    addQuick();
    document.getElementById("chat-input").style.display = "flex";
  };

  const contactBtn = document.createElement("button");
  contactBtn.textContent = "Kontakt";
  contactBtn.onclick = function () {
    addMsg("📞 123 456 789", "bot");
  };

  actions.appendChild(backBtn);
  actions.appendChild(contactBtn);
  messages.appendChild(actions);

  orderStep = "address";

  addMsg("📍 Podaj adres dostawy:", "bot");
}

/* ===== BOTTOM CART ===== */

const bottomCartBar = document.getElementById("bottom-cart-bar");
const bottomCartPanel = document.getElementById("bottom-cart-panel");
const bottomCartItems = document.getElementById("bottom-cart-items");
const bottomCartTotal = document.getElementById("bottom-cart-total");

const orderBtn = document.createElement("button");
orderBtn.textContent = "Zamów";
orderBtn.style.marginTop = "10px";
orderBtn.style.width = "100%";
orderBtn.style.padding = "8px";
orderBtn.style.background = "#8B0000";
orderBtn.style.color = "#fff";
orderBtn.style.border = "none";
orderBtn.style.borderRadius = "10px";
orderBtn.style.cursor = "pointer";

orderBtn.onclick = function () {
  showCart();
};

const cartArrow = document.getElementById("cart-arrow");

bottomCartBar.onclick = function () {
  bottomCartPanel.style.transform = "";

  if (!bottomCartPanel.classList.contains("open")) {
    bottomCartPanel.classList.add("open");
    cartArrow.textContent = "⬇";
    renderBottomCart();
  } else {
    bottomCartPanel.classList.remove("open");
    cartArrow.textContent = "⬆";
  }
};

function renderBottomCart() {
  const counts = {};

  orderCart.forEach((i) => {
    if (!counts[i]) counts[i] = 0;
    counts[i]++;
  });

  bottomCartItems.innerHTML = "";

  const items = Object.keys(counts);

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "bottom-cart-empty";
    empty.textContent = "Koszyk jest pusty.";
    bottomCartItems.appendChild(empty);

    bottomCartTotal.textContent = "Razem: 0 zł";
    return;
  }

  items.forEach((name) => {
    const itemDisplay = parseOrderItemDisplay(name);
    const quantity = counts[name];
    const unitPrice = extractPrice(name);
    const subtotal = unitPrice * quantity;

    const row = document.createElement("div");
    row.className = "bottom-cart-item";

    const info = document.createElement("div");
    info.className = "bottom-cart-item-info";

    const itemName = document.createElement("div");
    itemName.className = "bottom-cart-item-name";
    itemName.textContent = itemDisplay.name;

    const meta = document.createElement("div");
    meta.className = "bottom-cart-item-meta";

    const metaParts = [];

    if (itemDisplay.size) {
      metaParts.push("rozmiar: " + itemDisplay.size);
    }

    if (unitPrice) {
      metaParts.push(unitPrice + " zł / szt.");
    }

    meta.textContent = metaParts.join(" • ");

    info.appendChild(itemName);

    if (meta.textContent) {
      info.appendChild(meta);
    }

    const right = document.createElement("div");
    right.className = "bottom-cart-item-right";

    const price = document.createElement("div");
    price.className = "bottom-cart-item-price";
    price.textContent = subtotal + " zł";

    const controls = document.createElement("div");
    controls.className = "bottom-cart-controls";

    const minus = document.createElement("button");
    minus.type = "button";
    minus.className = "bottom-cart-qty-btn";
    minus.textContent = "−";

    const qty = document.createElement("span");
    qty.className = "bottom-cart-qty";
    qty.textContent = quantity;

    const plus = document.createElement("button");
    plus.type = "button";
    plus.className = "bottom-cart-qty-btn";
    plus.textContent = "+";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "bottom-cart-remove-btn";
    remove.textContent = "×";

    minus.onclick = function () {
      const index = orderCart.indexOf(name);

      if (index > -1) {
        orderCart.splice(index, 1);
      }

      renderBottomCart();
    };

    plus.onclick = function () {
      orderCart.push(name);
      renderBottomCart();
    };

    remove.onclick = function () {
      orderCart = orderCart.filter((i) => i !== name);
      renderBottomCart();
    };

    controls.appendChild(minus);
    controls.appendChild(qty);
    controls.appendChild(plus);
    controls.appendChild(remove);

    right.appendChild(price);
    right.appendChild(controls);

    row.appendChild(info);
    row.appendChild(right);

    bottomCartItems.appendChild(row);
  });

  bottomCartTotal.textContent = "Razem: " + getCartTotal() + " zł";

  if (!bottomCartTotal.nextSibling) {
    bottomCartTotal.parentNode.appendChild(orderBtn);
  }
}

const originalStartOrder = startOrder;
startOrder = function () {
  if (!isRestaurantOpen()) {
    addMsg("❌ Restauracja jest obecnie zamknięta.", "bot");
    return;
  }

  if (isSpecialClosedDay()) {
    addMsg("❌ Dziś restauracja jest zamknięta.", "bot");
    return;
  }

  const now = new Date();
  const hour = now.getHours();
  /*
        if(hour >= getTodayClosingHour()){
        addMsg("❌ Restauracja jest już zamknięta na dziś.","bot");
        return;
        }
        */
  originalStartOrder();
  showCartUI();
};

/* update cart panel when items added */
const originalUpdateCartBar = updateCartBar;
updateCartBar = function () {
  originalUpdateCartBar();
  renderBottomCart();
};

/* detect order intent */
const oldDetectIntent = detectIntent;

detectIntent = function (t) {
  if (/zamow|zamów|order|zamowienie|zamówienie/i.test(t)) return "order";

  return oldDetectIntent(t);
};

/* hook into sendMsg */

const oldSendMsg = sendMsg;

sendMsg = function () {
  if (!input.value.trim()) return;

  const text = input.value;
  const lower = text.toLowerCase();
  const intent = detectIntent(lower);

  /* rezerwacja i anulowanie mają pierwszeństwo przed zamówieniami */
  if (reservationStep) {
    input.value = "";
    addMsg(text, "user");
    handleReservation(text);
    return;
  }

  if (cancelStep) {
    input.value = "";
    addMsg(text, "user");
    handleCancel(text);
    return;
  }

  /* start order by text */
  if (intent === "order") {
    input.value = "";
    addMsg(text, "user");
    startOrder();
    return;
  }

  /* only custom amount of poriotns uses type amount option */
  if (orderStep === "customQty" && /^[0-9]+$/.test(text)) {
    input.value = "";
    addMsg(text, "user");
    handleOrder(text);
    return;
  }

  /* otherwise normal chatbot */
  oldSendMsg();
};

/* === BUILD SECOND EMPTY ADMIN COLUMN === */
window.addEventListener("DOMContentLoaded", function () {
  const panel = document.getElementById("admin-panel");
  if (!panel) return;

  /* skip if already applied */
  if (panel.querySelector(".admin-columns")) return;

  const children = [...panel.children];

  /* keep close button outside layout */
  let closeBtn = null;
  children.forEach((el) => {
    if (el.tagName === "BUTTON" && el.innerText === "✕") closeBtn = el;
  });

  const container = document.createElement("div");
  container.className = "admin-columns";

  const left = document.createElement("div");
  left.className = "admin-col-left";

  const right = document.createElement("div");
  right.className = "admin-col-right";
  right.innerHTML = ""; // empty column

  children.forEach((el) => {
    if (el !== closeBtn) {
      left.appendChild(el);
    }
  });

  container.appendChild(left);
  container.appendChild(right);

  panel.appendChild(container);
});

function getAdminMenu() {
  const data = localStorage.getItem("adminMenuData");
  if (!data) return {};
  try {
    return JSON.parse(data);
  } catch (e) {
    return {};
  }
}

function saveAdminMenu(data) {
  localStorage.setItem("adminMenuData", JSON.stringify(data));

  /* główny zapis - Google Sheets */
  fetch(`${API_BASE}/save-menu-sheets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  }).catch(console.error);
}

async function loadMenuFromBackend() {
  try {
    const res = await fetch(`${API_BASE}/menu-sheets`);

    if (!res.ok) return;

    const data = await res.json();

    localStorage.setItem("adminMenuData", JSON.stringify(data));

    syncMenuWithOrderSystem();

    if (typeof renderAdminTable === "function") {
      renderAdminTable();
    }
  } catch (e) {
    console.error(e);
  }
}

function syncMenuWithOrderSystem() {
  const data = getAdminMenu();

  /* clear all existing categories in order system */
  for (const k in ORDER_CATEGORIES) {
    delete ORDER_CATEGORIES[k];
  }

  /* if admin removed all categories -> leave system empty */
  if (!Object.keys(data).length) {
    return;
  }

  /* rebuild categories from admin storage */
  Object.keys(data).forEach((cat) => {
    ORDER_CATEGORIES[cat] = [];
    data[cat].forEach((p) => {
      if (p.sizes) {
        ORDER_CATEGORIES[cat].push(
          p.name + " (mały) – " + p.sizes.small + " zł",
        );
        ORDER_CATEGORIES[cat].push(
          p.name + " (duży) – " + p.sizes.large + " zł",
        );
      } else {
        ORDER_CATEGORIES[cat].push(p.name + " – " + p.price + " zł");
      }
    });
  });
}

syncMenuWithOrderSystem();
loadMenuFromBackend();

let selectedCategory = null;

window.addEventListener("DOMContentLoaded", function () {
  const rightCol = document.querySelector(".admin-col-right");
  if (!rightCol) return;

  /* ===== ADMIN TABS ===== */

  const tabs = document.createElement("div");
  tabs.style.display = "flex";
  tabs.style.gap = "10px";
  tabs.style.marginBottom = "16px";

  const menuTab = document.createElement("button");
  menuTab.textContent = "🍔 Menu";

  const ordersTab = document.createElement("button");
  ordersTab.textContent = "📦 Zamówienia";

  const reservationsTab = document.createElement("button");
  reservationsTab.textContent = "📅 Rezerwacje";

  tabs.appendChild(menuTab);
  tabs.appendChild(ordersTab);
  tabs.appendChild(reservationsTab);

  rightCol.appendChild(tabs);

  function setActiveAdminTab(activeTab) {
    [menuTab, ordersTab, reservationsTab].forEach((tab) => {
      tab.classList.remove("active");
    });

    activeTab.classList.add("active");
  }

  setActiveAdminTab(menuTab);

  /* containers */

  const menuContainer = document.createElement("div");
  menuContainer.id = "menu-admin-container";

  const ordersContainer = document.createElement("div");
  ordersContainer.id = "orders-admin-container";
  ordersContainer.style.maxHeight = "600px";
  ordersContainer.style.overflowY = "auto";
  ordersContainer.style.paddingRight = "6px";
  ordersContainer.style.display = "none";

  const reservationsContainer = document.createElement("div");
  reservationsContainer.id = "reservations-admin-container";
  reservationsContainer.style.maxHeight = "600px";
  reservationsContainer.style.overflowY = "auto";
  reservationsContainer.style.paddingRight = "6px";
  reservationsContainer.style.display = "none";

  rightCol.appendChild(menuContainer);
  rightCol.appendChild(ordersContainer);
  rightCol.appendChild(reservationsContainer);

  /* tab switching */

  menuTab.onclick = function () {
    setActiveAdminTab(menuTab);

    menuContainer.style.display = "block";
    ordersContainer.style.display = "none";
    reservationsContainer.style.display = "none";
  };

  let ordersInterval = null;
  let reservationsInterval = null;

  function showAdminLoading(container, title, text) {
    container.innerHTML = `
    <h3>${title}</h3>
    <div class="admin-loading">
      <div class="admin-loading-spinner"></div>
      <div>${text}</div>
    </div>
  `;
  }

  ordersTab.onclick = function () {
    setActiveAdminTab(ordersTab);

    menuContainer.style.display = "none";
    ordersContainer.style.display = "block";
    reservationsContainer.style.display = "none";

    showAdminLoading(ordersContainer, "📦 Zamówienia", "Ładowanie zamówień...");

    lastOrdersJSON = "";
    renderOrdersAdmin();

    if (ordersInterval) {
      clearInterval(ordersInterval);
    }

    ordersInterval = setInterval(() => {
      if (ordersContainer.style.display === "block") {
        renderOrdersAdmin();
      }
    }, 5000);
  };

  reservationsTab.onclick = function () {
    setActiveAdminTab(reservationsTab);

    menuContainer.style.display = "none";
    ordersContainer.style.display = "none";
    reservationsContainer.style.display = "block";

    showAdminLoading(
      reservationsContainer,
      "📅 Rezerwacje",
      "Ładowanie rezerwacji...",
    );

    lastReservationsJSON = "";
    renderReservationsAdmin();

    if (reservationsInterval) {
      clearInterval(reservationsInterval);
    }

    reservationsInterval = setInterval(() => {
      if (reservationsContainer.style.display === "block") {
        renderReservationsAdmin();
      }
    }, 5000);
  };

  const wrapper = document.createElement("div");

  const title = document.createElement("h3");
  title.textContent = "Zarządzanie menu";
  wrapper.appendChild(title);

  /* add category */
  const addRow = document.createElement("div");
  addRow.style.display = "flex";
  addRow.style.gap = "6px";
  addRow.style.marginBottom = "10px";

  const catInput = document.createElement("input");
  catInput.placeholder = "Nowa kategoria";
  catInput.style.width = "180px";
  catInput.style.flex = "0 0 180px";

  const addBtn = document.createElement("button");
  addBtn.textContent = "Dodaj";
  addBtn.style.width = "70px";
  addBtn.style.flex = "0 0 70px";
  addBtn.style.padding = "6px 8px";

  addBtn.onclick = function () {
    const name = catInput.value.trim().toLowerCase();
    if (!name) return;

    const data = getAdminMenu();
    if (!data[name]) {
      data[name] = [];
      saveAdminMenu(data);
    }
    catInput.value = "";
    renderAdminTable();
    syncMenuWithOrderSystem();
  };

  addRow.appendChild(catInput);
  addRow.appendChild(addBtn);
  wrapper.appendChild(addRow);

  /* main table */
  const table = document.createElement("div");
  table.id = "admin-table";
  table.style.display = "grid";
  table.style.gridTemplateColumns = "35% 65%";
  table.style.border = "1px solid #ddd";
  table.style.borderRadius = "8px";
  table.style.overflow = "hidden";

  const col1 = document.createElement("div");
  col1.id = "cat-col";
  col1.style.borderRight = "1px solid #ddd";
  col1.style.padding = "6px";

  const col2 = document.createElement("div");
  col2.id = "prod-col";
  col2.style.padding = "6px";

  table.appendChild(col1);
  table.appendChild(col2);

  wrapper.appendChild(table);
  menuContainer.appendChild(wrapper);

  renderAdminTable();
});

function renderAdminTable() {
  const data = getAdminMenu();

  const catCol = document.getElementById("cat-col");
  const prodCol = document.getElementById("prod-col");

  if (!catCol || !prodCol) return;

  catCol.innerHTML = "<strong>Kategorie</strong>";
  prodCol.innerHTML = "<strong>Produkty</strong>";

  /* categories */
  Object.keys(data).forEach((cat) => {
    const row = document.createElement("div");
    row.textContent = cat;
    row.style.padding = "6px";
    row.style.cursor = "pointer";
    row.style.borderBottom = "1px solid #eee";

    if (selectedCategory === cat) {
      row.style.background = "#f3f3f3";
    }

    row.onclick = function () {
      selectedCategory = cat;
      renderAdminTable();
    };

    const del = document.createElement("span");
    del.textContent = " ✕";
    del.style.float = "right";
    del.style.cursor = "pointer";

    del.onclick = function (e) {
      e.stopPropagation();
      const d = getAdminMenu();
      delete d[cat];
      saveAdminMenu(d);
      if (selectedCategory === cat) selectedCategory = null;
      renderAdminTable();
      syncMenuWithOrderSystem();
    };

    row.appendChild(del);

    catCol.appendChild(row);
  });

  /* products */
  if (!selectedCategory) {
    prodCol.appendChild(document.createTextNode("Wybierz kategorię"));
    return;
  }

  const products = data[selectedCategory];

  /* product rows */
  products.forEach((p, i) => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.borderBottom = "1px solid #eee";
    row.style.padding = "6px";

    const name = document.createElement("span");
    if (p.sizes) {
      name.textContent =
        p.name +
        " (mały " +
        p.sizes.small +
        " zł / duży " +
        p.sizes.large +
        " zł)";
    } else {
      name.textContent = p.name + " – " + p.price + " zł";
    }

    const del = document.createElement("button");
    del.textContent = "✕";
    del.style.padding = "2px 6px";

    del.onclick = function () {
      const d = getAdminMenu();
      d[selectedCategory].splice(i, 1);
      saveAdminMenu(d);
      renderAdminTable();
      syncMenuWithOrderSystem();
    };

    row.appendChild(name);
    row.appendChild(del);
    prodCol.appendChild(row);
  });

  /* add product plus button */
  const plus = document.createElement("button");
  plus.textContent = "+";
  plus.style.marginTop = "6px";
  plus.style.width = "30px";
  plus.style.height = "30px";
  plus.style.borderRadius = "6px";

  plus.onclick = function () {
    plus.remove();

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.gap = "4px";
    wrap.style.marginTop = "6px";

    const name = document.createElement("input");
    name.placeholder = "nazwa";
    name.style.width = "200px";
    name.style.flex = "0 0 200px";

    const sizeToggle = document.createElement("input");
    sizeToggle.type = "checkbox";
    sizeToggle.title = "produkt ma rozmiary";

    const label = document.createElement("span");
    label.textContent = "rozmiary";

    const price = document.createElement("input");
    price.placeholder = "cena";
    price.style.width = "80px";
    price.style.flex = "0 0 80px";

    const small = document.createElement("input");
    small.placeholder = "mały";
    small.style.width = "70px";
    small.style.display = "none";

    const large = document.createElement("input");
    large.placeholder = "duży";
    large.style.width = "70px";
    large.style.display = "none";

    sizeToggle.onchange = function () {
      if (sizeToggle.checked) {
        price.style.display = "none";
        small.style.display = "block";
        large.style.display = "block";
      } else {
        price.style.display = "block";
        small.style.display = "none";
        large.style.display = "none";
      }
    };

    const save = document.createElement("button");
    save.textContent = "OK";
    save.style.width = "50px";
    save.style.flex = "0 0 50px";
    save.style.padding = "6px 8px";

    save.onclick = function () {
      const n = name.value.trim();
      if (!n) return;

      const d = getAdminMenu();

      if (sizeToggle.checked) {
        const s = small.value.trim();
        const l = large.value.trim();
        if (!s || !l) return;

        d[selectedCategory].push({
          name: n,
          sizes: { small: s, large: l },
        });
      } else {
        const pr = price.value.trim();
        if (!pr) return;

        d[selectedCategory].push({ name: n, price: pr });
      }

      saveAdminMenu(d);
      renderAdminTable();
      syncMenuWithOrderSystem();
    };

    wrap.appendChild(name);
    wrap.appendChild(sizeToggle);
    wrap.appendChild(label);
    wrap.appendChild(price);
    wrap.appendChild(small);
    wrap.appendChild(large);
    wrap.appendChild(save);

    prodCol.appendChild(wrap);
  };

  prodCol.appendChild(plus);
}

function normalizeChatText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatCurrentMenu() {
  const menu = getAdminMenu();

  if (!menu || !Object.keys(menu).length) {
    return "Menu nie zostało jeszcze uzupełnione przez restaurację.";
  }

  let msg = "📖 Aktualne menu:\n";

  Object.keys(menu).forEach((category) => {
    msg += "\n" + category.toUpperCase() + ":\n";

    menu[category].forEach((product) => {
      if (product.sizes) {
        msg +=
          "• " +
          product.name +
          " — mały " +
          product.sizes.small +
          " zł / duży " +
          product.sizes.large +
          " zł\n";
      } else {
        msg += "• " + product.name + " — " + product.price + " zł\n";
      }
    });
  });

  return msg.trim();
}

function getMenuItemsForSearch() {
  const menu = getAdminMenu();
  const items = [];

  Object.keys(menu).forEach((category) => {
    menu[category].forEach((product) => {
      let priceText = "";

      if (product.sizes) {
        priceText =
          "mały " +
          product.sizes.small +
          " zł / duży " +
          product.sizes.large +
          " zł";
      } else {
        priceText = product.price + " zł";
      }

      items.push({
        category,
        name: product.name,
        priceText,
        searchText: normalizeChatText(category + " " + product.name),
      });
    });
  });

  return items;
}

function findMenuMatches(text) {
  const query = normalizeChatText(text);

  const stopWords = [
    "czy",
    "macie",
    "jest",
    "sa",
    "są",
    "ile",
    "kosztuje",
    "kosztuja",
    "kosztują",
    "jaka",
    "jaki",
    "jakie",
    "poprosze",
    "proszę",
    "menu",
    "danie",
    "dania",
  ];

  const words = query
    .split(" ")
    .filter((word) => word.length >= 3 && !stopWords.includes(word));

  if (!words.length) return [];

  return getMenuItemsForSearch()
    .map((item) => {
      let score = 0;

      words.forEach((word) => {
        if (item.searchText.includes(word)) {
          score++;
        }
      });

      return {
        ...item,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function answerFromRestaurantData(text) {
  const query = normalizeChatText(text);

  if (/godzin|otwar|czynne|zamkn|ktorej|kiedy/.test(query)) {
    return "⏰ Godziny otwarcia:\nPon–Czw 12–22\nPt–Nd 12–23";
  }

  if (/kontakt|telefon|adres|gdzie|lokalizacja/.test(query)) {
    return "📞 Telefon: 123 456 789\n📍 Adres: ul. Przykładowa 10";
  }

  if (/rezerw|stolik|booking/.test(query)) {
    return "📅 Mogę pomóc w rezerwacji stolika. Kliknij „📅 Rezerwacja” albo napisz, na jaki dzień chcesz zarezerwować stolik.";
  }

  if (
    /menu|karta|jedzenie|dania|pizza|makaron|burger|kanap|cena|koszt|macie|wege|wega|bez miesa|bez mięsa/.test(
      query,
    )
  ) {
    const matches = findMenuMatches(text);

    if (matches.length) {
      let msg = "Znalazłem w aktualnym menu:\n\n";

      matches.forEach((item) => {
        msg +=
          "• " +
          item.name +
          " — " +
          item.priceText +
          " (" +
          item.category +
          ")\n";
      });

      msg +=
        "\nMożesz kliknąć „🛒 Zamów jedzenie”, żeby przejść do zamówienia.";

      return msg.trim();
    }

    if (/menu|karta|dania|jedzenie/.test(query)) {
      return formatCurrentMenu();
    }

    return "Nie znalazłem tego w aktualnym menu restauracji. Mogę pokazać całe menu albo pomóc z rezerwacją.";
  }

  return null;
}

async function askAI(text) {
  const safeAnswer = answerFromRestaurantData(text);

  if (safeAnswer) {
    addMsg(safeAnswer, "bot");
    return;
  }

  addMsg(
    "Mogę pomóc w sprawie menu, godzin otwarcia, kontaktu, rezerwacji albo zamówienia. Nie mam tej informacji w systemie restauracji.",
    "bot",
  );
}

/* ===== ADMIN OPEN/CLOSE TOGGLE ===== */
window.addEventListener("DOMContentLoaded", function () {
  const leftCol = document.querySelector(".admin-col-left");
  if (!leftCol) return;

  const openToggleLabel = document.createElement("label");
  openToggleLabel.style.display = "flex";
  openToggleLabel.style.gap = "6px";
  openToggleLabel.style.marginTop = "10px";
  openToggleLabel.style.fontSize = "13px";

  const openToggle = document.createElement("input");
  openToggle.type = "checkbox";

  openToggle.checked = localStorage.getItem("restaurantOpen") !== "false";

  openToggle.onchange = function () {
    localStorage.setItem("restaurantOpen", openToggle.checked);
  };

  openToggleLabel.appendChild(openToggle);
  openToggleLabel.appendChild(document.createTextNode(" Restauracja otwarta"));

  leftCol.appendChild(openToggleLabel);
});

/* ===== ADMIN LIVE ORDERS ===== */

async function fetchJSONWithTimeout(url, timeoutMs = 7000) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function showAdminBackendError(container, title) {
  container.innerHTML = `
    <h3>${title}</h3>

    <div style="
      background:#fff3f3;
      border:1px solid #ef4444;
      color:#991b1b;
      border-radius:12px;
      padding:14px;
      line-height:1.5;
      margin-top:10px;
    ">
      <strong>⚠️ Backend / Render nie odpowiada.</strong><br>
      Dane nie mogły zostać pobrane. Sprawdź, czy backend działa albo zrób redeploy Rendera.

      <div style="margin-top:10px;font-size:13px;color:#7f1d1d;">
        Test backendu: ${API_BASE}/health
      </div>

      <button
        onclick="window.open('${API_BASE}/health', '_blank')"
        style="
          margin-top:10px;
          padding:8px 12px;
          border:none;
          border-radius:10px;
          background:#991b1b;
          color:white;
          cursor:pointer;
        "
      >
        Sprawdź backend
      </button>
    </div>
  `;
}

let lastOrdersJSON = "";
let previousOrdersCount = 0;
let adminOrderView = "active";
let adminOrdersCache = [];
let adminOrdersLoaded = false;
let pendingMovingOrders = new Set();

function getSeenOrderIds() {
  try {
    return JSON.parse(localStorage.getItem("seenOrderIds") || "[]");
  } catch (e) {
    return [];
  }
}

function isOrderSeen(orderId) {
  return getSeenOrderIds().includes(String(orderId));
}

function markOrderSeen(orderId) {
  const ids = new Set(getSeenOrderIds());
  ids.add(String(orderId));
  localStorage.setItem("seenOrderIds", JSON.stringify([...ids]));
}

function getOrderBucket(order) {
  const status = order.status || "";

  if (status === "🍕 GOTOWE DO ODBIORU") {
    return "ready";
  }

  if (status === "✅ ZREALIZOWANE" || status === "❌ ANULOWANE") {
    return "completed";
  }

  return "active";
}

function renderOrderViewTabs(container) {
  const tabs = document.createElement("div");
  tabs.className = "order-view-tabs";

  const label = document.createElement("span");
  label.className = "order-view-label";
  label.textContent = "Widok:";
  tabs.appendChild(label);

  const views = [
    { id: "active", text: "Aktywne" },
    { id: "ready", text: "Gotowe" },
    { id: "completed", text: "Zrealizowane" },
  ];

  views.forEach((view) => {
    const btn = document.createElement("button");
    btn.textContent = view.text;
    btn.className =
      "order-view-tab" + (adminOrderView === view.id ? " active" : "");

    btn.onclick = function () {
      adminOrderView = view.id;
      lastOrdersJSON = "";

      renderOrdersAdmin({
        useCache: adminOrdersLoaded,
      });
    };

    tabs.appendChild(btn);
  });

  container.appendChild(tabs);
}

function showOrderEmptyState(container) {
  const empty = document.createElement("div");
  empty.className = "admin-empty-state";

  if (adminOrderView === "active") {
    empty.innerHTML = `
      <div class="admin-empty-icon">📦</div>
      <strong>Brak aktywnych zamówień</strong>
      <span>Nowe zamówienia i zamówienia w przygotowaniu pojawią się tutaj.</span>
    `;
  }

  if (adminOrderView === "ready") {
    empty.innerHTML = `
      <div class="admin-empty-icon">🍕</div>
      <strong>Brak gotowych zamówień</strong>
      <span>Zamówienia oznaczone jako gotowe do odbioru pojawią się tutaj.</span>
    `;
  }

  if (adminOrderView === "completed") {
    empty.innerHTML = `
      <div class="admin-empty-icon">✅</div>
      <strong>Brak zrealizowanych zamówień</strong>
      <span>Zrealizowane i anulowane zamówienia trafią tutaj.</span>
    `;
  }

  container.appendChild(empty);
}

function moveOrderWithFade(card, orderId, newStatus) {
  const id = String(orderId);

  if (pendingMovingOrders.has(id)) return;

  pendingMovingOrders.add(id);
  card.classList.add("order-card-fade-out");

  setTimeout(async function () {
    await updateOrderStatus(orderId, newStatus, true);

    pendingMovingOrders.delete(id);
    lastOrdersJSON = "";
    adminOrdersLoaded = false;

    renderOrdersAdmin();
  }, 2000);
}

function completeOrderWithFade(card, orderId) {
  moveOrderWithFade(card, orderId, "✅ ZREALIZOWANE");
}

function completeAllReadyOrdersWithFade(orderIds) {
  const ids = orderIds.map(String).filter((id) => !pendingMovingOrders.has(id));

  if (!ids.length) return;

  ids.forEach((id) => {
    pendingMovingOrders.add(id);

    const card = document.querySelector(
      '.admin-order-card[data-order-id="' + id + '"]',
    );

    if (card) {
      card.classList.add("order-card-fade-out");
    }
  });

  setTimeout(async function () {
    await Promise.all(
      ids.map((id) => updateOrderStatus(id, "✅ ZREALIZOWANE", true)),
    );

    ids.forEach((id) => pendingMovingOrders.delete(id));

    lastOrdersJSON = "";
    adminOrdersLoaded = false;
    renderOrdersAdmin();
  }, 2000);
}

async function renderOrdersAdmin(options = {}) {
  const container = document.getElementById("orders-admin-container");

  if (!container) return;

  let orders = [];

  try {
    if (options.useCache) {
      orders = adminOrdersCache;
    } else {
      orders = await fetchJSONWithTimeout(`${API_BASE}/orders`);
      adminOrdersCache = orders;
      adminOrdersLoaded = true;
    }

    const currentJSON = JSON.stringify({
      orders,
      view: adminOrderView,
      pending: Array.from(pendingMovingOrders),
    });

    if (currentJSON === lastOrdersJSON) {
      return;
    }

    lastOrdersJSON = currentJSON;

    if (
      !options.useCache &&
      orders.length > previousOrdersCount &&
      previousOrdersCount !== 0
    ) {
      const audio = new Audio(
        "https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg",
      );

      audio.volume = 0.6;

      audio.play();
    }

    if (!options.useCache) {
      previousOrdersCount = orders.length;
    }

    container.innerHTML = "<h3>📦 Zamówienia</h3>";
    renderOrderViewTabs(container);
  } catch (e) {
    console.error(e);

    showAdminBackendError(container, "📦 Zamówienia");
    return;
  }

  const visibleOrders = orders.filter((order) => {
    if (pendingMovingOrders.has(String(order.id))) {
      return false;
    }

    return getOrderBucket(order) === adminOrderView;
  });

  if (!visibleOrders.length) {
    showOrderEmptyState(container);
    return;
  }

  if (adminOrderView === "ready") {
    const bulkBar = document.createElement("div");
    bulkBar.className = "order-bulk-actions";

    const count = visibleOrders.length;

    const bulkBtn = document.createElement("button");
    bulkBtn.className = "complete-all-ready-btn";
    bulkBtn.textContent = "✅ Zrealizuj wszystko (" + count + ")";

    bulkBtn.onclick = function () {
      completeAllReadyOrdersWithFade(visibleOrders.map((order) => order.id));
    };

    bulkBar.appendChild(bulkBtn);
    container.appendChild(bulkBar);
  }

  visibleOrders
    .slice()
    .reverse()
    .forEach((order) => {
      const card = document.createElement("div");

      card.className = "admin-order-card";
      card.dataset.orderId = String(order.id);

      card.style.background = "#fff";
      card.style.border = "1px solid #ddd";
      card.style.borderRadius = "12px";
      card.style.marginBottom = "12px";
      card.style.overflow = "hidden";

      /* ===== HEADER ===== */

      const header = document.createElement("div");

      header.style.display = "flex";
      header.style.justifyContent = "space-between";
      header.style.alignItems = "center";
      header.style.padding = "14px";
      header.style.cursor = "pointer";
      header.style.background = "#fafafa";

      const isNewOrder =
        adminOrderView === "active" &&
        order.status === "do potwierdzenia" &&
        !isOrderSeen(order.id);

      header.innerHTML = `
    <div style="
      display:flex;
      align-items:center;
      gap:8px;
      font-weight:600;
    ">
      📦 #${order.id}
      ${isNewOrder ? '<span class="new-order-badge">NOWE!</span>' : ""}
    </div>

    <div style="
    display:flex;
    align-items:center;
    gap:8px;
    flex-wrap:nowrap;
    white-space:nowrap;
    ">

    <div style="
    font-size:13px;
    padding:4px 10px;
    border-radius:999px;
    background:#eee;
    white-space:nowrap;
    ">
    ${order.status}
    </div>

    <div class="header-actions"></div>

    </div>
    `;

      const actions = header.querySelector(".header-actions");

      actions.style.display = "flex";
      actions.style.gap = "6px";
      actions.style.alignItems = "center";

      /* ===== NEW ORDER ===== */

      if (order.status === "do potwierdzenia") {
        const confirm = document.createElement("button");
        confirm.textContent = "✓";

        confirm.style.background = "#22c55e";
        confirm.style.color = "#fff";

        const cancel = document.createElement("button");
        cancel.textContent = "✕";

        cancel.style.background = "#ef4444";
        cancel.style.color = "#fff";

        [confirm, cancel].forEach((btn) => {
          btn.style.width = "30px";
          btn.style.height = "30px";

          btn.style.display = "flex";
          btn.style.alignItems = "center";
          btn.style.justifyContent = "center";

          btn.style.border = "none";
          btn.style.borderRadius = "8px";

          btn.style.cursor = "pointer";

          btn.style.fontSize = "16px";
          btn.style.fontWeight = "600";

          btn.style.padding = "0";
        });

        confirm.onclick = function (e) {
          e.stopPropagation();

          updateOrderStatus(
            order.id,
            "🟢 PRZYJĘTO — w trakcie przygotowywania",
          );
        };

        cancel.onclick = function (e) {
          e.stopPropagation();

          moveOrderWithFade(card, order.id, "❌ ANULOWANE");
        };

        actions.appendChild(confirm);
        actions.appendChild(cancel);
      }

      /* ===== ACCEPTED ===== */

      if (order.status === "🟢 PRZYJĘTO — w trakcie przygotowywania") {
        const done = document.createElement("button");

        done.textContent = "🍕 Gotowe";

        done.style.border = "none";
        done.style.padding = "6px 10px";
        done.style.borderRadius = "10px";
        done.style.cursor = "pointer";
        done.style.fontSize = "12px";

        done.onclick = function (e) {
          e.stopPropagation();

          moveOrderWithFade(card, order.id, "🍕 GOTOWE DO ODBIORU");
        };

        actions.appendChild(done);
      }

      if (order.status === "🍕 GOTOWE DO ODBIORU") {
        const complete = document.createElement("button");

        complete.textContent = "✅ Zrealizuj";

        complete.style.border = "none";
        complete.style.padding = "6px 10px";
        complete.style.borderRadius = "10px";
        complete.style.cursor = "pointer";
        complete.style.fontSize = "12px";
        complete.style.background = "#16a34a";
        complete.style.color = "#fff";
        complete.style.fontWeight = "700";

        complete.onclick = function (e) {
          e.stopPropagation();

          completeOrderWithFade(card, order.id);
        };

        actions.appendChild(complete);
      }

      /* ===== DETAILS ===== */

      const details = document.createElement("div");

      details.style.maxHeight = "0px";
      details.style.overflow = "hidden";
      details.style.transition = "all .25s ease";
      details.style.paddingTop = "0";
      details.style.paddingBottom = "0";
      details.style.borderTop = "1px solid #eee";

      let itemsHtml = "";

      order.items.forEach((i) => {
        itemsHtml += "• " + i + "<br>";
      });

      details.innerHTML = `
    <div style="margin-bottom:10px;">
    ${itemsHtml}
    </div>

    <div style="margin-bottom:6px;">
    💰 ${order.total} zł
    </div>

    <div style="margin-bottom:6px;">
    📍 ${order.address}
    </div>

    <div style="margin-bottom:6px;">
    📞 ${order.phone}
    </div>

    <div style="color:#777;font-size:12px;margin-top:10px;">
    ${new Date(order.createdAt).toLocaleString()}
    </div>

  
    `;

      /* ===== TOGGLE ===== */

      header.onclick = function () {
        markOrderSeen(order.id);

        const badge = header.querySelector(".new-order-badge");
        if (badge) {
          badge.classList.add("hide");
          setTimeout(() => badge.remove(), 250);
        }
        const isOpen = details.style.maxHeight !== "0px";

        if (isOpen) {
          details.style.maxHeight = "0px";
          details.style.boxSizing = "border-box";
          details.style.paddingTop = "0";
          details.style.paddingBottom = "0";
        } else {
          details.style.maxHeight = details.scrollHeight + "px";
          details.style.paddingTop = "14px";
          details.style.paddingBottom = "14px";
        }
      };

      card.appendChild(header);
      card.appendChild(details);

      container.appendChild(card);
    });
}

let lastReservationsJSON = "";

async function renderReservationsAdmin() {
  const container = document.getElementById("reservations-admin-container");

  if (!container) return;

  let reservations = [];

  try {
    reservations = await fetchJSONWithTimeout(`${API_BASE}/reservations`);

    const currentJSON = JSON.stringify(reservations);

    if (currentJSON === lastReservationsJSON) {
      return;
    }

    lastReservationsJSON = currentJSON;

    container.innerHTML = "<h3>📅 Rezerwacje</h3>";
  } catch (e) {
    console.error(e);

    showAdminBackendError(container, "📅 Rezerwacje");
    return;
  }

  if (!reservations.length) {
    const empty = document.createElement("div");
    empty.textContent = "Brak rezerwacji";
    empty.style.color = "#666";

    container.appendChild(empty);

    return;
  }

  reservations
    .slice()
    .reverse()
    .forEach((reservation) => {
      const card = document.createElement("div");

      card.style.background = "#fff";
      card.style.border = "1px solid #ddd";
      card.style.borderRadius = "12px";
      card.style.marginBottom = "12px";
      card.style.padding = "14px";

      const statusColor =
        reservation.status === "anulowana" ? "#fee2e2" : "#dcfce7";

      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
          <div style="font-weight:600;">
            📅 ${reservation.date} — ${reservation.time}
          </div>

          <div style="
            font-size:13px;
            padding:4px 10px;
            border-radius:999px;
            background:${statusColor};
            white-space:nowrap;
          ">
            ${reservation.status}
          </div>
        </div>

        <div style="margin-top:10px;font-weight:600;">
          🔢 ${reservation.reservationId || "Brak numeru"}
        </div>

        <div style="margin-top:10px;">
          👥 ${reservation.people} osób
        </div>

        <div style="margin-top:6px;">
          👤 ${reservation.lastname}
        </div>

        <div style="margin-top:6px;">
          📞 ${reservation.phone}
        </div>

        <div style="color:#777;font-size:12px;margin-top:10px;">
          ${reservation.createdAt ? new Date(reservation.createdAt).toLocaleString() : ""}
        </div>
      `;

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "8px";
      actions.style.marginTop = "12px";

      if (reservation.status === "do potwierdzenia") {
        const confirmBtn = document.createElement("button");
        confirmBtn.textContent = "✓ Potwierdź";
        confirmBtn.style.background = "#22c55e";
        confirmBtn.style.color = "#fff";
        confirmBtn.style.border = "none";
        confirmBtn.style.borderRadius = "10px";
        confirmBtn.style.padding = "8px 10px";
        confirmBtn.style.cursor = "pointer";

        confirmBtn.onclick = function () {
          updateReservationStatus(reservation, "potwierdzona");
        };

        actions.appendChild(confirmBtn);
      }

      if (reservation.status !== "anulowana") {
        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = "✕ Anuluj";
        cancelBtn.style.background = "#ef4444";
        cancelBtn.style.color = "#fff";
        cancelBtn.style.border = "none";
        cancelBtn.style.borderRadius = "10px";
        cancelBtn.style.padding = "8px 10px";
        cancelBtn.style.cursor = "pointer";

        cancelBtn.onclick = function () {
          updateReservationStatus(reservation, "anulowana");
        };

        actions.appendChild(cancelBtn);
      }

      if (actions.children.length) {
        card.appendChild(actions);
      }

      container.appendChild(card);
    });
}

async function updateReservationStatus(reservation, newStatus) {
  try {
    if (!reservation.reservationId) {
      alert(
        "Ta rezerwacja nie ma numeru ID. Utwórz nową rezerwację albo zostaw ją bez zmiany statusu.",
      );
      return;
    }

    const response = await fetch(`${API_BASE}/update-reservation-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reservationId: reservation.reservationId,
        newStatus,
      }),
    });

    if (!response.ok) {
      throw new Error("Błąd zmiany statusu rezerwacji");
    }

    lastReservationsJSON = "";
    renderReservationsAdmin();
  } catch (e) {
    console.error(e);
    alert("Błąd zmiany statusu rezerwacji");
  }
}

async function updateOrderStatus(orderId, newStatus, skipRender = false) {
  try {
    await fetch(`${API_BASE}/update-order-status`, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        orderId,
        newStatus,
      }),
    });

    adminOrdersLoaded = false;

    if (!skipRender) {
      lastOrdersJSON = "";
      renderOrdersAdmin();
    }
  } catch (e) {
    console.error(e);

    alert("Błąd zmiany statusu");
  }
}
