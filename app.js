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
  hideCartUI();
  if (!messages.children.length) {
    addMsg(`Cześć 👋 Jestem asystentem ${RESTAURANT_NAME}.`, "bot");
    addQuick();
    document.getElementById("chat-input").style.display = "flex";
  }
};

closeBtn.onclick = () => box.classList.remove("open");

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
  reservationStep = "date";
  addMsg("📅 Na jaki dzień chcesz zarezerwować stolik?", "bot");
}

function startCancel() {
  cancelData = {};
  cancelStep = "lastname";
  addMsg("Aby anulować rezerwację, podaj nazwisko:", "bot");
}

function handleCancel(text) {
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
    addMsg(
      "❌ Rezerwacja została anulowana. W czym mogę pomóc dalej? 🙂",
      "bot",
    );
    addQuick();
    document.getElementById("chat-input").style.display = "flex";
  }
}

function handleReservation(t) {
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

    addMsg(
      `✅ Rezerwacja przyjęta (demo):

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
  if (panel) {
    panel.style.display = "block";
    panel.classList.remove("open");
    panel.style.transform = "translateY(255px)";

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

        document.getElementById("chat-input").style.display = "flex";

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

          const form = document.createElement("div");
          form.style.background = "#fff";
          form.style.padding = "14px";
          form.style.borderRadius = "14px";
          form.style.boxShadow = "0 6px 16px rgba(0,0,0,.15)";
          form.style.display = "flex";
          form.style.flexDirection = "column";
          form.style.gap = "8px";

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

          const submit = document.createElement("button");
          submit.textContent = "Zamawiam";
          submit.style.padding = "10px";
          submit.style.border = "none";
          submit.style.borderRadius = "10px";
          submit.style.background = "#8B0000";
          submit.style.color = "#fff";
          submit.style.cursor = "pointer";

          submit.onclick = async function () {
            const now = Date.now();
            const lastOrderTime = localStorage.getItem("lastOrderTime");

            /* ===== ANTI-SPAM ===== */
            if (lastOrderTime) {
              const diff = now - parseInt(lastOrderTime);
              const minutes = diff / 1000 / 60;

              if (minutes < 0) {
                addMsg(
                  "❌ Możesz złożyć kolejne zamówienie za około " +
                    Math.ceil(15 - minutes) +
                    " min.",
                  "bot",
                );
                return;
              }
            }

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

              addMsg("❌ Nie udało się zapisać zamówienia.", "bot");

              return;
            }

            localStorage.setItem("lastOrderTime", now);

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

            clearChat();
            addMsg(msg, "bot");

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

  Object.keys(ORDER_CATEGORIES).forEach((cat) => {
    const b = document.createElement("button");
    b.textContent = cat;

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

  const items = ORDER_CATEGORIES[orderCategory];

  const container = document.createElement("div");
  container.className = "product-grid order-items";

  items.forEach((item) => {
    const name = item.split(" – ")[0];
    const price = item.split(" – ")[1];

    const card = document.createElement("div");
    card.className = "product-card";

    const n = document.createElement("div");
    n.className = "product-name";
    n.textContent = name;

    const p = document.createElement("div");
    p.className = "product-price";
    p.textContent = price;

    card.appendChild(n);
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

  if (orderStep === "items") {
    const n = parseInt(text);

    const items = ORDER_CATEGORIES[orderCategory];

    if (!n || n < 1 || n > items.length) {
      addMsg("❗ Wpisz numer dania.", "bot");
      return;
    }

    orderCart.push(items[n - 1]);

    addMsg(
      "✅ Dodano do koszyka:\n\n" +
        items[n - 1] +
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

    const q = document.createElement("div");
    q.className = "quick";

    const more = document.createElement("button");
    more.textContent = "➕ Dodaj coś jeszcze";
    more.onclick = startOrder;

    const cart = document.createElement("button");
    cart.textContent = "🛒 Koszyk";
    cart.onclick = showCart;

    q.appendChild(more);
    q.appendChild(cart);

    messages.appendChild(q);

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

    let msg = "✅ Zamówienie przyjęte (demo)\n\n";
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
  if (!bottomCartPanel.classList.contains("open")) {
    bottomCartPanel.classList.add("open");
    bottomCartPanel.style.transform = "translateY(0)";
    cartArrow.textContent = "⬇";
    renderBottomCart();
  } else {
    bottomCartPanel.classList.remove("open");
    bottomCartPanel.style.transform = "translateY(255px)";
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

  Object.keys(counts).forEach((name) => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";
    row.style.marginBottom = "6px";

    const left = document.createElement("div");
    left.textContent = name;
    left.style.flex = "1";

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.alignItems = "center";
    controls.style.gap = "6px";

    const minus = document.createElement("button");
    minus.textContent = "−";
    minus.style.padding = "2px 6px";
    minus.style.cursor = "pointer";

    const qty = document.createElement("span");
    qty.textContent = counts[name];

    const plus = document.createElement("button");
    plus.textContent = "+";
    plus.style.padding = "2px 6px";
    plus.style.cursor = "pointer";

    const remove = document.createElement("button");
    remove.textContent = "✕";
    remove.style.padding = "2px 6px";
    remove.style.cursor = "pointer";

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

    row.appendChild(left);
    row.appendChild(controls);

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

  /* start order by text */
  if (intent === "order") {
    input.value = "";
    addMsg(text, "user");
    startOrder();
    return;
  }

  /* during order only numbers go to order handler */
  if (orderStep && /^[0-9]+$/.test(text)) {
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

  fetch(`${API_BASE}/save-menu`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  }).catch(console.error);
}

async function loadMenuFromBackend() {
  try {
    const res = await fetch(`${API_BASE}/menu`);

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

  tabs.appendChild(menuTab);
  tabs.appendChild(ordersTab);

  rightCol.appendChild(tabs);

  /* containers */

  const menuContainer = document.createElement("div");
  menuContainer.id = "menu-admin-container";

  const ordersContainer = document.createElement("div");
  ordersContainer.id = "orders-admin-container";
  ordersContainer.style.maxHeight = "600px";
  ordersContainer.style.overflowY = "auto";
  ordersContainer.style.paddingRight = "6px";
  ordersContainer.style.display = "none";

  rightCol.appendChild(menuContainer);
  rightCol.appendChild(ordersContainer);

  /* tab switching */

  menuTab.onclick = function () {
    menuContainer.style.display = "block";
    ordersContainer.style.display = "none";
  };

  let ordersInterval = null;

  ordersTab.onclick = function () {
    menuContainer.style.display = "none";
    ordersContainer.style.display = "block";

    renderOrdersAdmin();

    /* usuń poprzedni interval */
    if (ordersInterval) {
      clearInterval(ordersInterval);
    }

    /* auto refresh */
    ordersInterval = setInterval(() => {
      if (ordersContainer.style.display === "block") {
        renderOrdersAdmin();
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

async function askAI(text) {
  try {
    const res = await fetch(`${API_BASE}/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });

    const data = await res.json();
    addMsg(data.reply, "bot");
  } catch (e) {
    addMsg("⚠️ Błąd AI (backend nie działa?)", "bot");
  }
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

let lastOrdersJSON = "";
let previousOrdersCount = 0;
async function renderOrdersAdmin() {
  const container = document.getElementById("orders-admin-container");

  if (!container) return;

  let orders = [];

  try {
    const res = await fetch(`${API_BASE}/orders`);

    orders = await res.json();
    const currentJSON = JSON.stringify(orders);

    if (currentJSON === lastOrdersJSON) {
      return;
    }

    lastOrdersJSON = currentJSON;

    if (orders.length > previousOrdersCount && previousOrdersCount !== 0) {
      const audio = new Audio(
        "https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg",
      );

      audio.volume = 0.6;

      audio.play();
    }

    previousOrdersCount = orders.length;

    container.innerHTML = "<h3>📦 Zamówienia</h3>";
  } catch (e) {
    console.error(e);

    container.innerHTML += `
    <div style="color:red;margin-top:10px;">
    Błąd połączenia z backendem
    </div>
    `;

    return;
  }

  if (!orders.length) {
    const empty = document.createElement("div");
    empty.textContent = "Brak zamówień";
    empty.style.color = "#666";

    container.appendChild(empty);

    return;
  }

  orders
    .slice()
    .reverse()
    .forEach((order) => {
      const card = document.createElement("div");

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

      header.innerHTML = `
    <div style="font-weight:600;">
    📦 #${order.id}
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

          updateOrderStatus(order.id, "❌ ANULOWANE");
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

          updateOrderStatus(order.id, "🍕 GOTOWE DO ODBIORU");
        };

        actions.appendChild(done);
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

async function updateOrderStatus(orderId, newStatus) {
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

    renderOrdersAdmin();
  } catch (e) {
    console.error(e);

    alert("Błąd zmiany statusu");
  }
}
