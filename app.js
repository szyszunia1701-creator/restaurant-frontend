const API_BASE = "https://restaurant-backend-7i1c.onrender.com";

function applyRestaurantBranding() {
  document.title = RESTAURANT_CONFIG.name;
  document.getElementById("restaurant-name").textContent = RESTAURANT_CONFIG.name;
  document.getElementById("assistant-name").textContent = RESTAURANT_CONFIG.assistantName;
  document.getElementById("restaurant-favicon").href =
    RESTAURANT_CONFIG.branding.chatbotLogo;

  document
    .querySelectorAll("#chat-toggle img, .chat-header-logo")
    .forEach((image) => {
      image.src = RESTAURANT_CONFIG.branding.chatbotLogo;
      image.alt = RESTAURANT_CONFIG.assistantName;
      image.addEventListener("error", () =>
        image.classList.add("logo-unavailable"),
      );
    });

  document
    .getElementById("chat-toggle")
    .setAttribute("aria-label", `Otwórz ${RESTAURANT_CONFIG.assistantName}`);
}

function getOpeningHoursMessage() {
  const hours = RESTAURANT_CONFIG.openingHours;
  return `⏰ Godziny otwarcia:\n${hours.weekday.label}\n${hours.weekend.label}`;
}

function getContactMessage() {
  const { phone, address } = RESTAURANT_CONFIG.contact;
  const details = [];
  if (phone) details.push(`📞 Telefon: ${phone}`);
  if (address) details.push(`📍 Adres: ${address}`);
  return details.length
    ? details.join("\n")
    : "Dane kontaktowe restauracji nie zostały jeszcze uzupełnione.";
}

function getEstimatedDeliveryTimeText() {
  return `około ${RESTAURANT_CONFIG.delivery.estimatedTime} minut`;
}

function showWelcomeMessage() {
  return botReply(renderWelcomeMessage, BOT_WELCOME_TYPING_DELAY);
}

function renderWelcomeMessage() {
  addMsg("Cześć! 👋\nW czym mogę Ci pomóc?", "bot");
  addQuick();
}
let menuImages = [];
let sandwichImages = [];
let mediaLoadState = "loading";
let menuLoadState = "loading";
let mediaLoadPromise;
let menuLoadPromise;

function normalizeMediaUrls(value) {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        return String(item.url || item.secure_url || item.src || "").trim();
      }
      return "";
    })
    .filter(Boolean);
}

async function saveMedia(key, urls) {
  const response = await fetch(`${API_BASE}/save-media`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ key, urls }),
  });

  if (!response.ok) {
    throw new Error(`Nie udało się zapisać listy ${key}.`);
  }
}

async function uploadMediaFiles(files, folder) {
  const urls = [];

  for (const file of files) {
    const formData = new FormData();
    formData.append("image", file);
    formData.append("folder", folder);

    const response = await fetch(`${API_BASE}/upload-image`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Nie udało się przesłać pliku ${file.name}.`);
    }

    const data = await response.json();

    if (!data.url) {
      throw new Error(`Backend nie zwrócił URL dla pliku ${file.name}.`);
    }

    urls.push(data.url);
  }

  return urls;
}

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
  const hours =
    day >= 1 && day <= 4
      ? RESTAURANT_CONFIG.openingHours.weekday
      : RESTAURANT_CONFIG.openingHours.weekend;
  return hours.to;
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
let orderFlowActive = false;
let pendingConversationAction = null;
const OPENING_HOURS = RESTAURANT_CONFIG.openingHours;

applyRestaurantBranding();

let hintHideTimeout;
const hintTimeout = setTimeout(() => {
  hint.classList.add("show");
  hintHideTimeout = setTimeout(() => hint.classList.remove("show"), 10000);
}, 700);

hint.replaceChildren();
const hintTitle = document.createElement("strong");
hintTitle.textContent = "👋 Potrzebujesz pomocy?";
const hintDescription = document.createElement("span");
hintDescription.textContent =
  "Zamów jedzenie, sprawdź menu lub zarezerwuj stolik";
hint.append(hintTitle, hintDescription);

toggle.onclick = () => {
  box.classList.toggle("open");
  hint.classList.remove("show");
  clearTimeout(hintTimeout);
  clearTimeout(hintHideTimeout);

  if (!box.classList.contains("open")) {
    cancelPendingBotReplies();
    orderFlowActive = false;
    orderStep = null;
    pendingConversationAction = null;
    messages.innerHTML = "";
    hideCartUI();
    return;
  }

  if (!messages.children.length) {
    showWelcomeMessage();
    document.getElementById("chat-input").style.display = "flex";
  }
};

closeBtn.onclick = () => {
  cancelPendingBotReplies();
  box.classList.remove("open");
  orderFlowActive = false;
  orderStep = null;
  pendingConversationAction = null;
  messages.innerHTML = "";
  hideCartUI();
};

function resetReservation() {
  reservationStep = null;
  reservation = {};
}

function cancelReservation() {
  resetReservation();
  botReply(() => {
    addMsg("Rezerwacja została przerwana. W czym mogę pomóc?", "bot");
    addQuick();
  });
}

function addMsg(text, cls) {
  const d = document.createElement("div");
  d.className = "msg " + cls;
  d.textContent = text;
  messages.appendChild(d);
  scrollToBottom();
  return d;
}

function botMessage(text) {
  return botReply(() => addMsg(text, "bot"));
}

function userMessage(text) {
  cancelPendingBotReplies();
  return addMsg(text, "user");
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    messages.scrollTop = messages.scrollHeight;
  });
}

const BOT_WELCOME_TYPING_DELAY = 750;
const BOT_TYPING_DELAY = 1500;
let typingIndicator = null;
let botReplyGeneration = 0;
let botReplyQueue = Promise.resolve();

function removeTypingIndicator() {
  if (typingIndicator) {
    typingIndicator.remove();
    typingIndicator = null;
  }
}

function cancelPendingBotReplies() {
  botReplyGeneration += 1;
  removeTypingIndicator();
  botReplyQueue = Promise.resolve();
}

function showTypingIndicator(duration = BOT_TYPING_DELAY, generation = botReplyGeneration) {
  removeTypingIndicator();

  const indicator = document.createElement("div");
  indicator.className = "msg bot typing-indicator";
  indicator.setAttribute("role", "status");
  indicator.setAttribute("aria-label", "Asystent przygotowuje odpowiedź");

  for (let index = 0; index < 3; index += 1) {
    const dot = document.createElement("span");
    dot.className = "typing-dot";
    dot.setAttribute("aria-hidden", "true");
    indicator.appendChild(dot);
  }

  typingIndicator = indicator;
  messages.appendChild(indicator);
  scrollToBottom();

  return new Promise((resolve) => {
    setTimeout(() => {
      if (generation === botReplyGeneration && typingIndicator === indicator) {
        removeTypingIndicator();
      } else {
        indicator.remove();
      }
      resolve(generation === botReplyGeneration);
    }, duration);
  });
}

function botReply(renderResponse, typingDelay = BOT_TYPING_DELAY) {
  const generation = botReplyGeneration;
  const queuedReply = botReplyQueue.then(async () => {
    if (generation !== botReplyGeneration) return false;

    const isCurrent = await showTypingIndicator(typingDelay, generation);
    if (!isCurrent) return false;

    renderResponse();
    scrollToBottom();
    return true;
  });

  botReplyQueue = queuedReply.catch(() => {});
  return queuedReply;
}

new MutationObserver(scrollToBottom).observe(messages, { childList: true });

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

function revealCategoryButton(bar, button, behavior = "smooth") {
  if (!bar || !button) return;

  const targetLeft =
    button.offsetLeft - (bar.clientWidth - button.offsetWidth) / 2;

  bar.scrollTo({
    left: Math.max(0, targetLeft),
    behavior,
  });
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
    if (t === "🛒 Zamów jedzenie") {
      b.classList.add("quick-order-main");
    }
    b.onclick = () => {
      input.value = t;
      sendMsg();
    };
    q.appendChild(b);
  });
  messages.appendChild(q);
  scrollToBottom();
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
  if (isRecommendationIntent(t)) return "recommendation";
  if (isMenuBrowsingIntent(t)) return "menu";
  if (isSandwichCommand(t)) return "daily";
  if (
    /kanapka tygodnia|specjal|promocja dnia/i.test(
      t,
    )
  )
    return "daily";
  if (/hej|cześć|hello|siema/i.test(t)) return "greet";
  if (/rezer|rezew|stolik|booking/i.test(t)) return "reserve";
  if (/anul|rezygn|cancel|przerwij|stop|wyjdź|wyjdz|wróć|wroc/i.test(t))
    return "cancel";
  if (/godzin|otwar|czynne|której|kiedy|od któr|do któr/i.test(t))
    return "hours";
  if (/kontakt|telefon|adres/i.test(t)) return "contact";
  return "unknown";
}

function isValidDate(t) {
  return getReservationDate(t) !== null;
}

function isValidTime(t) {
  t = t.trim();

  // format HH:MM
  if (/^([01]?\d|2[0-3]):([0-5]\d)$/.test(t)) {
    return true;
  }

  return false;
}

function getReservationDate(dateText, now = new Date()) {
  const value = String(dateText || "").trim().toLocaleLowerCase("pl");
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const relativeDateMatch = value.match(
    /(?:^|[^\p{L}])(pojutrze|jutro|dzisiaj|dziś|dzis)(?=$|[^\p{L}])/u,
  );

  if (relativeDateMatch) {
    const dayOffset = relativeDateMatch[1] === "jutro"
      ? 1
      : relativeDateMatch[1] === "pojutrze"
        ? 2
        : 0;
    today.setDate(today.getDate() + dayOffset);
    return today;
  }

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const shortMatch = value.match(/^(\d{1,2})[.\-/ ](\d{1,2})(?:[.\-/ ](\d{4}))?$/);

  if (isoMatch) {
    return new Date(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3]),
    );
  }

  if (shortMatch) {
    return new Date(
      Number(shortMatch[3]) || now.getFullYear(),
      Number(shortMatch[2]) - 1,
      Number(shortMatch[1]),
    );
  }

  return null;
}

function isWithinOpeningHours(time, reservationDate) {
  const hour = parseInt(time.split(":")[0], 10);
  const selectedDate = getReservationDate(reservationDate);
  if (!selectedDate || Number.isNaN(selectedDate.getTime())) return false;
  const day = selectedDate.getDay();
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

async function showMenu() {
  const generation = botReplyGeneration;
  resetReservation();
  cancelStep = null;

  if (mediaLoadState === "loading") {
    await mediaLoadPromise;
  }

  if (generation !== botReplyGeneration) return false;
  return botReply(showMenuCard);
}

function startReservation() {
  orderFlowActive = false;
  hideCartUI();
  resetReservation();
  cancelStep = null;
  orderStep = null;
  orderCategory = null;
  reservationStep = "date";
  botMessage("📅 Na jaki dzień chcesz zarezerwować stolik?");
}

function startCancel() {
  resetReservation();
  orderStep = null;
  orderCategory = null;
  cancelData = {};
  cancelStep = "lastname";
  botMessage("Aby anulować rezerwację, podaj nazwisko:");
}

async function handleCancel(text) {
  if (cancelStep === "lastname") {
    if (!isValidSurname(text)) {
      botMessage(
        "❗ Podaj poprawne nazwisko (bez cyfr i znaków specjalnych).");
      return;
    }
    cancelData.lastname = text;
    cancelStep = "phone";
    botMessage("Podaj numer telefonu:");
    return;
  }
  if (cancelStep === "phone") {
    if (!isValidPhone(text)) {
      botMessage("❗ Podaj poprawny numer telefonu.");
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
        await botReply(() => {
          addMsg("❗ Nie znaleziono rezerwacji dla podanych danych.", "bot");
          addQuick();
        });
        document.getElementById("chat-input").style.display = "flex";
        return;
      }
    } catch (e) {
      console.error(e);
      botMessage("❌ Nie udało się anulować rezerwacji. Spróbuj ponownie.");
      return;
    }

    await botReply(() => {
      addMsg(
        "❌ Rezerwacja została anulowana. W czym mogę pomóc dalej? 🙂",
        "bot",
      );
      addQuick();
    });
    document.getElementById("chat-input").style.display = "flex";
  }
}

async function handleReservation(t) {
  if (reservationStep === "date") {
    const selectedDate = getReservationDate(t);
    if (!selectedDate) {
      botMessage("❗ Podaj poprawną datę (np. 12.03 lub jutro).");
      return;
    }
    reservation.date = getLocalDateKey(selectedDate);
    reservationStep = "time";
    botMessage("⏰ O której godzinie? (np. 18:00)");
    return;
  }
  if (reservationStep === "time") {
    if (!isValidTime(t)) {
      botMessage("❗ Podaj poprawną godzinę (np. 18:00).");
      return;
    }
    if (!isWithinOpeningHours(t, reservation.date)) {
      botMessage(
        "❗ Restauracja przyjmuje rezerwacje tylko w godzinach pracy.");
      return;
    }
    reservation.time = t;
    reservationStep = "people";
    botMessage("👥 Na ile osób?");
    return;
  }
  if (reservationStep === "people") {
    if (!isValidPeople(t)) {
      botMessage("❗ Podaj liczbę osób (1–20).");
      return;
    }
    reservation.people = t;
    reservationStep = "lastname";
    botMessage("🧾 Na jakie nazwisko?");
    return;
  }
  if (reservationStep === "lastname") {
    if (!isValidSurname(t)) {
      botMessage(
        "❗ Podaj poprawne nazwisko (bez cyfr i znaków specjalnych).");
      return;
    }
    reservation.lastname = t;
    reservationStep = "phone";
    botMessage("📞 Numer telefonu?");
    return;
  }
  if (reservationStep === "phone") {
    if (!isValidPhone(t)) {
      botMessage("❗ Podaj poprawny numer telefonu.");
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
      botMessage("❌ Nie udało się zapisać rezerwacji. Spróbuj ponownie.");
      return;
    }

    await botReply(() => {
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
    });
  }
}

function sendMsg() {
  if (!input.value.trim()) return;
  const text = input.value;
  const lower = text.toLowerCase();
  input.value = "";
  userMessage(text);

  const intent = detectIntent(lower);

  if (intent === "daily") {
    showSandwich();
    return;
  }
  if (intent === "menu") {
    showMenu();
    return;
  }
  if (intent === "recommendation") {
    showMenuRecommendations(text);
    return;
  }
  if (intent === "hours") {
    resetReservation();
    botMessage(getOpeningHoursMessage());
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
    botMessage(getContactMessage());
    return;
  }
  if (intent === "greet") {
    resetReservation();
    botMessage("Cześć 👋 Jak mogę pomóc?");
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

  sandwichImages.forEach((src, i) => {
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

    del.onclick = async function () {
      const previousImages = [...sandwichImages];
      sandwichImages.splice(i, 1);
      renderSandwichImages();

      try {
        await saveMedia("sandwichImages", sandwichImages);
        sandwichInput.value = "";
      } catch (error) {
        sandwichImages = previousImages;
        renderSandwichImages();
        console.error(error);
        alert("Nie udało się usunąć zdjęcia kanapki.");
      }
    };

    wrap.appendChild(img);
    wrap.appendChild(del);
    sandwichPreview.appendChild(wrap);
  });
}

if (sandwichInput) {
  sandwichInput.addEventListener("change", async function () {
    const files = Array.from(this.files);
    if (!files.length) return;

    const previousImages = [...sandwichImages];
    this.disabled = true;

    try {
      const urls = await uploadMediaFiles(files, "sandwichImages");
      sandwichImages.push(...urls);
      await saveMedia("sandwichImages", sandwichImages);
      renderSandwichImages();
      this.value = "";
    } catch (error) {
      sandwichImages = previousImages;
      renderSandwichImages();
      console.error(error);
      alert("Nie udało się przesłać zdjęć kanapki.");
    } finally {
      this.disabled = false;
    }
  });
}

/* ===== SAVE ALL CHANGES ===== */

const saveAllBtn = document.getElementById("save-all");

if (saveAllBtn) {
  saveAllBtn.onclick = async function () {
    const name = document.getElementById("admin-name").value.trim();
    const price = document.getElementById("admin-price").value.trim();
    const openToggle = document.getElementById("restaurant-open-toggle");
    const feedback = document.getElementById("admin-save-feedback");

    saveAllBtn.disabled = true;
    if (feedback) {
      feedback.className = "admin-save-feedback";
      feedback.textContent = "Zapisywanie…";
    }

    try {
      const previous = getSavedWeeklySandwich();
      const data = {
        name: name || previous?.name || "",
        price: price || previous?.price || "",
      };
      localStorage.setItem("adminKanapkaTygodnia", JSON.stringify(data));
      if (openToggle) {
        localStorage.setItem("restaurantOpen", String(openToggle.checked));
      }

      const sandwichUrls = normalizeMediaUrls(sandwichImages);
      const menuUrls = normalizeMediaUrls(menuImages);
      const mediaSaves = [];
      // Puste pole plikowe nie oznacza usunięcia zapisanych mediów. Jawne
      // usuwanie miniaturek nadal zapisuje pustą listę w swoim handlerze.
      if (sandwichUrls.length) {
        mediaSaves.push(saveMedia("sandwichImages", sandwichUrls));
      }
      if (menuUrls.length) {
        mediaSaves.push(saveMedia("menuImages", menuUrls));
      }
      await Promise.all(mediaSaves);

      if (feedback) {
        feedback.className = "admin-save-feedback success";
        feedback.textContent = "Zapisano zmiany";
      }
    } catch (error) {
      console.error(error);
      if (feedback) {
        feedback.className = "admin-save-feedback error";
        feedback.textContent = "Nie udało się zapisać zmian";
      }
    } finally {
      saveAllBtn.disabled = false;
    }
  };
}

/* NADPISANIE DANIA DNIA */
const originalGetDailySpecial = pobierzKanapkeTygodnia;

function getSavedWeeklySandwich() {
  try {
    const saved = JSON.parse(
      localStorage.getItem("adminKanapkaTygodnia") || "null",
    );
    if (!saved || typeof saved !== "object") return null;
    return {
      name: String(saved.name || "").trim(),
      price: String(saved.price || "").trim(),
    };
  } catch (error) {
    console.error("Nieprawidłowe dane kanapki tygodnia", error);
    return null;
  }
}

pobierzKanapkeTygodnia = function () {
  const data = getSavedWeeklySandwich();
  if (data?.name) {
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

    const saved = getSavedWeeklySandwich();
    if (saved) {
      document.getElementById("admin-name").value = saved.name;
      document.getElementById("admin-price").value = saved.price;
    }

    const feedback = document.createElement("div");
    feedback.id = "admin-save-feedback";
    feedback.className = "admin-save-feedback";
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "polite");
    btn.insertAdjacentElement("afterend", feedback);
  }
});

function showSandwich() {
  // Never gate the whole card on the media endpoint: its text must render even
  // when the image request is slow or fails.
  return botReply(renderSandwichCard);
}

function renderSandwichCard() {
  const card = document.createElement("div");
  card.className = "msg bot sandwich-card";

  const text = document.createElement("div");
  text.className = "sandwich-card-text";

  const title = document.createElement("strong");
  title.textContent = "🥪 Kanapka tygodnia";

  const details = document.createElement("div");
  details.className = "sandwich-card-details";
  details.textContent = pobierzKanapkeTygodnia();
  text.append(title, details);
  card.appendChild(text);

  function appendImage() {
    const imageUrl = normalizeMediaUrls(sandwichImages)[0];
    if (!imageUrl || !card.isConnected || card.querySelector("img")) return;

    const image = document.createElement("img");
    image.className = "sandwich-card-image";
    image.src = imageUrl;
    image.alt = "Kanapka tygodnia";
    image.onerror = () => image.remove();
    image.onclick = () => openMenuModal(image.src);
    card.appendChild(image);
    scrollToBottom();
  }

  messages.appendChild(card);
  appendImage();
  if (mediaLoadState === "loading") {
    mediaLoadPromise.then(appendImage);
  }
  scrollToBottom();
}

/* ===== SHOW MENU IMAGES IN CHAT ===== */
function showMenuCard() {
  const card = document.createElement("div");
  card.className = "msg bot menu-card";

  const text = document.createElement("div");
  text.className = "menu-card-text";
  text.textContent = menuImages.length
    ? "Proszę, oto nasze menu 🍽️"
    : "Aktualnie nie dodano zdjęcia menu. Mogę sprawdzić konkretne danie albo pomóc z zamówieniem.";
  card.appendChild(text);

  if (menuImages.length) {
    const images = document.createElement("div");
    images.className = "menu-card-images";
    menuImages.slice(0, 3).forEach((src) => {
      const im = document.createElement("img");
      im.src = src;
      im.alt = "Aktualne menu restauracji";
      im.onclick = () => openMenuModal(src);
      images.appendChild(im);
    });
    card.appendChild(images);
  }

  messages.appendChild(card);
  scrollToBottom();
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
menuUploadInput.addEventListener("change", async function () {
  const files = Array.from(this.files);
  if (!files.length) return;

  const previousImages = [...menuImages];
  this.disabled = true;

  try {
    const urls = await uploadMediaFiles(files, "menuImages");
    menuImages.push(...urls);
    await saveMedia("menuImages", menuImages);
    renderAdminMenuImages();
    this.value = "";
  } catch (error) {
    menuImages = previousImages;
    renderAdminMenuImages();
    console.error(error);
    alert("Nie udało się przesłać zdjęć menu.");
  } finally {
    this.disabled = false;
  }
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

  menuImages.forEach((src, i) => {
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

    del.onclick = async function () {
      const previousImages = [...menuImages];
      menuImages.splice(i, 1);
      renderAdminMenuImages();

      try {
        await saveMedia("menuImages", menuImages);
        menuUploadInput.value = "";
      } catch (error) {
        menuImages = previousImages;
        renderAdminMenuImages();
        console.error(error);
        alert("Nie udało się usunąć zdjęcia menu.");
      }
    };

    wrap.appendChild(im);
    wrap.appendChild(del);
    menuAdminPreview.appendChild(wrap);
  });
}

async function loadMedia() {
  try {
    const response = await fetch(`${API_BASE}/media`);

    if (!response.ok) {
      throw new Error("Nie udało się pobrać zdjęć.");
    }

    const data = await response.json();
    menuImages = normalizeMediaUrls(data.menuImages);
    sandwichImages = normalizeMediaUrls(data.sandwichImages);
    renderAdminMenuImages();
    renderSandwichImages();
  } catch (error) {
    console.error(error);
  } finally {
    mediaLoadState = "ready";
  }
}

mediaLoadPromise = loadMedia();

adminBtn.addEventListener("click", () => {
  setTimeout(renderSandwichImages, 200);
  setTimeout(renderAdminMenuImages, 200);
});

/* ===== CART VISIBILITY CONTROL ===== */
function showCartUI() {
  const panel = document.getElementById("bottom-cart-panel");

  if (panel) {
    panel.style.display = "block";
    panel.style.transform = "";

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
        const delivery = getDeliveryCost();

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

        const finalTotal = getFinalOrderTotal();

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
                  total: getFinalOrderTotal(),
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

              botMessage("❌ Nie udało się zapisać zamówienia.");

              return;
            }

            // localStorage.setItem("lastOrderTime", now);
            orderSubmitting = false;

            /* ===== MESSAGE ===== */

            let msg = "✅ Zamówienie przyjęte\n\n";
            msg += "📦 Numer: #" + orderNumber + "\n";
            msg += "💰 Razem: " + getFinalOrderTotal() + " zł\n";
            msg +=
              "⏳ Szacowany czas: " +
              getEstimatedDeliveryTimeText() +
              "\n\n";
            msg += "🔔 Status: do potwierdzenia\n";
            msg +=
              "📩 Gdy restauracja potwierdzi i zacznie przygotowywać zamówienie, otrzymasz SMS.";

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
            updateCart();
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
  const bar = document.getElementById("cart-bar");

  if (panel) {
    panel.classList.remove("open");
    panel.style.display = "none";
  }

  if (bar) {
    bar.style.display = "none";
    messages.style.marginTop = "0px";
  }
}

/* ================= ORDER SYSTEM ================= */

let orderStep = null;
let orderCategory = null;
let orderCart = [];
let orderData = {};
let orderSubmitting = false;

function clearChat() {
  messages.innerHTML = "";
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

function getDeliveryCost() {
  return RESTAURANT_CONFIG.delivery.fee;
}

function getFinalOrderTotal() {
  return getCartTotal() + getDeliveryCost();
}

const ORDER_CATEGORIES = {};

function startOrder() {
  renderOrderFlow();
  return true;
}

function renderOrderFlow() {
  resetReservation();
  cancelStep = null;
  orderFlowActive = true;
  document.getElementById("chat-input").style.display = "none";

  messages.innerHTML = "";

  orderStep = "category";

  addMsg(
    "🛒 Składanie zamówienia online\nProszę wybrać kategorię:",
    "bot",
  );

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
    orderFlowActive = false;
    orderStep = null;
    messages.innerHTML = "";
    renderWelcomeMessage();
    document.getElementById("chat-input").style.display = "flex";
    hideCartUI();
  };
  messages.lastChild.appendChild(back);

  const bar = document.createElement("div");
  bar.className = "category-bar";

  const categories = Object.keys(ORDER_CATEGORIES).filter(
    (category) =>
      Array.isArray(ORDER_CATEGORIES[category]) &&
      ORDER_CATEGORIES[category].length > 0,
  );

  if (!categories.length) {
    addMsg("Menu zamówień jest chwilowo puste.", "bot");
    return;
  }

  if (!categories.includes(orderCategory)) {
    orderCategory = categories[0];
  }

  categories.forEach((cat) => {
    const b = document.createElement("button");
    b.textContent = cat;

    if (cat === orderCategory) {
      b.classList.add("active");
    }

    b.onclick = () => {
      orderCategory = cat;

      const btns = document.querySelectorAll(".category-bar button");
      btns.forEach((x) => x.classList.remove("active"));
      b.classList.add("active");

      revealCategoryButton(bar, b);

      showOrderItems();
    };

    bar.appendChild(b);
  });

  messages.appendChild(bar);
  enableCategoryBarScroll(bar);
  const activeCategoryButton = bar.querySelector("button.active");
  requestAnimationFrame(() =>
    revealCategoryButton(bar, activeCategoryButton, "auto"),
  );
  showOrderItems();
  if (orderCart.length > 0) showCartUI();
  scrollToBottom();
}

function parseOrderItemDisplay(item) {
  if (item && typeof item === "object") {
    return {
      name: item.name || "",
      size: item.size || "",
      price: item.price || "",
      ingredients: item.ingredients || "",
    };
  }

  const parts = item.split(" – ");
  let rawName = parts[0] || item;
  const price = parts[1] || "";

  const sizeMatch = rawName.match(/\((mały|duży)\)\s*$/i);
  const size = sizeMatch ? sizeMatch[1].toLowerCase() : "";

  if (sizeMatch) {
    rawName = rawName.replace(/\s*\((mały|duży)\)\s*$/i, "").trim();
  }

  return {
    name: rawName,
    size,
    price,
    ingredients: "",
  };
}

function groupOrderItems(items) {
  const grouped = new Map();

  items.forEach((item) => {
    if (item && typeof item === "object" && !item.size) {
      const variants = [];

      if (item.sizes) {
        variants.push(
          {
            item: item.name + " (mały) – " + item.sizes.small + " zł",
            name: item.name,
            size: "mały",
            price: item.sizes.small + " zł",
            ingredients: item.ingredients || "",
          },
          {
            item: item.name + " (duży) – " + item.sizes.large + " zł",
            name: item.name,
            size: "duży",
            price: item.sizes.large + " zł",
            ingredients: item.ingredients || "",
          },
        );
      }

      grouped.set(item.name.toLocaleLowerCase("pl"), {
        name: item.name,
        ingredients: item.ingredients || "",
        variants,
        item: item.sizes ? null : item.name + " – " + item.price + " zł",
      });
      return;
    }

    const display = parseOrderItemDisplay(item);
    const key = display.name.toLocaleLowerCase("pl");

    if (!grouped.has(key)) {
      grouped.set(key, {
        name: display.name,
        ingredients: display.ingredients || "",
        variants: [],
        item: null,
      });
    }

    const product = grouped.get(key);
    if (display.size) {
      product.variants.push({ item, ...display });
    } else if (!product.item) {
      product.item = item;
    }
  });

  return Array.from(grouped.values());
}

function showSizeSelector(product) {
  return renderSizeSelector(product);
}

function renderSizeSelector(product) {
  clearChat();

  const card = document.createElement("div");
  card.className = "quantity-card size-card";

  const title = document.createElement("div");
  title.className = "quantity-title";
  title.textContent = "Wybierz rozmiar";

  const name = document.createElement("div");
  name.className = "quantity-product";
  name.textContent = product.name;

  const ingredients = createProductIngredients(product.ingredients);

  const options = document.createElement("div");
  options.className = "size-options";

  product.variants.forEach((variant) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "size-option";
    button.textContent =
      (variant.size === "mały" ? "Mała" : "Duża") + " — " + variant.price;
    button.onclick = () =>
      showQuantitySelector(variant.item, product.ingredients);
    options.appendChild(button);
  });

  const back = document.createElement("button");
  back.type = "button";
  back.className = "quantity-more-back";
  back.textContent = "⬅ Wróć";
  back.onclick = startOrder;

  card.append(name);
  if (ingredients) card.append(ingredients);
  card.append(title, options, back);
  messages.appendChild(card);
  scrollToBottom();
}

function addProductToCart(item, quantity) {
  // Jedno miejsce mutacji przy dodawaniu produktu; updateCart odświeża widoczny panel.
  for (let i = 0; i < quantity; i++) {
    orderCart.push(item);
  }

  updateCart({ open: true });
  startOrder();
  showCartToast();
}

function showCartToast() {
  const previousToast = document.querySelector(".cart-toast");
  if (previousToast) previousToast.remove();

  const toast = document.createElement("div");
  toast.className = "cart-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.textContent = "✅ Dodano do koszyka";
  box.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("visible"));
  setTimeout(() => toast.classList.remove("visible"), 1400);
  setTimeout(() => toast.remove(), 1750);
}

function createProductIngredients(ingredientsText) {
  if (!String(ingredientsText || "").trim()) return null;

  const ingredients = document.createElement("div");
  ingredients.className = "product-ingredients-full";
  ingredients.textContent = ingredientsText;
  return ingredients;
}

function showQuantitySelector(item, ingredientsText) {
  return renderQuantitySelector(item, ingredientsText);
}

function renderQuantitySelector(item, ingredientsText) {
  clearChat();

  const itemDisplay = parseOrderItemDisplay(item);

  const card = document.createElement("div");
  card.className = "quantity-card";

  const title = document.createElement("div");
  title.className = "quantity-title";
  title.textContent = "Wybierz ilość";

  const product = document.createElement("div");
  product.className = "quantity-product";
  product.textContent =
    itemDisplay.name + (itemDisplay.size ? " (" + itemDisplay.size + ")" : "");

  const ingredients = createProductIngredients(
    ingredientsText || itemDisplay.ingredients,
  );

  const qty = document.createElement("div");
  qty.className = "quantity-options";

  [1, 2, 3, 4].forEach((quantity) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quantity-option";
    button.textContent = quantity;
    button.onclick = function () {
      addProductToCart(item, quantity);
    };
    qty.appendChild(button);
  });

  const moreBtn = document.createElement("button");
  moreBtn.type = "button";
  moreBtn.className = "quantity-option more";
  moreBtn.textContent = "więcej";
  moreBtn.onclick = function () {
    showMoreQuantitySelector(item, ingredientsText);
  };
  qty.appendChild(moreBtn);

  const back = document.createElement("button");
  back.type = "button";
  back.className = "quantity-more-back";
  back.textContent = "⬅ Wróć";
  back.onclick = function () {
    startOrder();
  };

  card.appendChild(product);
  if (ingredients) card.appendChild(ingredients);
  card.appendChild(title);
  card.appendChild(qty);
  card.appendChild(back);
  messages.appendChild(card);
  scrollToBottom();
}

function showMoreQuantitySelector(item, ingredientsText) {
  clearChat();

  const itemDisplay = parseOrderItemDisplay(item);

  const card = document.createElement("div");
  card.className = "quantity-more-card";

  const title = document.createElement("div");
  title.className = "quantity-more-title";
  title.textContent = "Wybierz ilość porcji";

  const product = document.createElement("div");
  product.className = "quantity-more-product";
  product.textContent =
    itemDisplay.name + (itemDisplay.size ? " (" + itemDisplay.size + ")" : "");

  const ingredients = createProductIngredients(
    ingredientsText || itemDisplay.ingredients,
  );

  const select = document.createElement("select");
  select.className = "quantity-more-select";

  for (let i = 5; i <= 99; i++) {
    const option = document.createElement("option");
    option.value = i;
    option.textContent = i + " porcji";
    select.appendChild(option);
  }

  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = "quantity-more-confirm";
  confirm.textContent = "Dodaj do koszyka";

  confirm.onclick = function () {
    addProductToCart(item, parseInt(select.value, 10));
  };

  const back = document.createElement("button");
  back.type = "button";
  back.className = "quantity-more-back";
  back.textContent = "⬅ Wróć";
  back.onclick = function () {
    startOrder();
  };

  card.appendChild(product);
  if (ingredients) card.appendChild(ingredients);
  card.appendChild(title);
  card.appendChild(select);
  card.appendChild(confirm);
  card.appendChild(back);

  messages.appendChild(card);
  scrollToBottom();
}

function showOrderItems() {
  orderStep = "items";

  /* remove previous category items so new category replaces them */
  const oldList = document.querySelector(".order-items");
  if (oldList) oldList.remove();

  const oldMsg = document.querySelector(".order-items-msg");
  if (oldMsg) oldMsg.remove();

  const products = groupOrderItems(ORDER_CATEGORIES[orderCategory] || []);
  const container = document.createElement("div");
  container.className = "product-grid order-items";

  products.forEach((product) => {
    const card = document.createElement("div");
    card.className = "product-card";

    const name = document.createElement("div");
    name.className = "product-name";
    name.textContent = product.name;
    card.appendChild(name);

    if (product.ingredients) {
      const ingredients = document.createElement("div");
      ingredients.className = "product-ingredients";
      ingredients.textContent = product.ingredients;
      card.appendChild(ingredients);
    }

    const price = document.createElement("div");
    price.className = "product-price";

    if (product.variants.length) {
      const small = product.variants.find((variant) => variant.size === "mały");
      const large = product.variants.find((variant) => variant.size === "duży");
      price.textContent = [
        small && "mały " + small.price,
        large && "duży " + large.price,
      ]
        .filter(Boolean)
        .join(" / ");
      card.onclick = () => showSizeSelector(product);
    } else {
      const display = parseOrderItemDisplay(product.item);
      price.textContent = display.price;
      card.onclick = () =>
        showQuantitySelector(product.item, product.ingredients);
    }

    card.appendChild(price);
    container.appendChild(card);
  });

  messages.appendChild(container);
  scrollToBottom();
}

function handleOrder(text) {
  if (orderStep === "customQty") {
    const n = parseInt(text);

    if (!n || n < 1) {
      botMessage("❗ Podaj poprawną ilość.");
      return;
    }

    orderStep = null;
    addProductToCart(orderData.selectedItem, n);
    return;
  }

  if (orderStep === "address") {
    orderData.address = text;
    orderStep = "phone";

    botMessage("📞 Podaj numer telefonu:");
    return;
  }

  if (orderStep === "phone") {
    orderData.phone = text;
    orderStep = null;

    let orderNumber = Math.floor(1000 + Math.random() * 9000);

    let msg = "✅ Zamówienie przyjęte\n\n";
    msg += "📦 Numer: #" + orderNumber + "\n";
    msg += "💰 Razem: " + getCartTotal() + " zł\n";
    msg +=
      "⏳ Szacowany czas: " +
      getEstimatedDeliveryTimeText() +
      "\n\n";
    msg += "🔔 Status: do potwierdzenia\n";
    msg +=
      "📩 Gdy restauracja potwierdzi i zacznie przygotowywać zamówienie, otrzymasz SMS.";

    botMessage(msg);

    const actions = document.createElement("div");
    actions.className = "quick";

    const backBtn = document.createElement("button");
    backBtn.textContent = "Wróć do czatu";
    backBtn.onclick = function () {
      orderFlowActive = false;
      orderStep = null;
      messages.innerHTML = "";
      renderWelcomeMessage();
      document.getElementById("chat-input").style.display = "flex";
    };

    const contactBtn = document.createElement("button");
    contactBtn.textContent = "Kontakt";
    contactBtn.onclick = function () {
      botMessage(getContactMessage());
    };

    actions.appendChild(backBtn);
    actions.appendChild(contactBtn);
    messages.appendChild(actions);

    orderCart = [];
    orderData = {};
    updateCart();
  }
}

function showOrderSuccessScreen(msg) {
  return renderOrderSuccessScreen(msg);
}

function renderOrderSuccessScreen(msg) {
  messages.innerHTML = "";

  orderFlowActive = false;
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
    renderWelcomeMessage();

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
    orderFlowActive = false;
    orderStep = null;
    messages.innerHTML = "";
    renderWelcomeMessage();
    document.getElementById("chat-input").style.display = "flex";
  };

  const contactBtn = document.createElement("button");
  contactBtn.textContent = "Kontakt";
  contactBtn.onclick = function () {
    botMessage(getContactMessage());
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
    renderCart();
  } else {
    bottomCartPanel.classList.remove("open");
    cartArrow.textContent = "⬆";
  }
};

function updateCart(options = {}) {
  // Jedyny wspólny update po każdej mutacji danych koszyka.
  renderCart();

  if (!orderCart.length) {
    hideCartUI();
    return;
  }

  if (orderFlowActive) {
    showCartUI();
    if (options.open) bottomCartPanel.classList.add("open");
  }

  cartArrow.textContent = bottomCartPanel.classList.contains("open")
    ? "⬇"
    : "⬆";
}

function increaseCartItem(item) {
  orderCart.push(item);
  updateCart();
}

function decreaseCartItem(item) {
  const index = orderCart.indexOf(item);

  if (index > -1) {
    orderCart.splice(index, 1);
  }

  updateCart();
}

function removeFromCart(item) {
  orderCart = orderCart.filter((cartItem) => cartItem !== item);
  updateCart();
}

// Jedyne źródło prawdy dla zawartości i sumy widocznego koszyka.
function renderCart() {
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

    minus.onclick = () => decreaseCartItem(name);
    plus.onclick = () => increaseCartItem(name);
    remove.onclick = () => removeFromCart(name);

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
  resetReservation();
  cancelStep = null;

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
        botMessage("❌ Restauracja jest już zamknięta na dziś.");
        return;
        }
        */
  const rendered = originalStartOrder();
  if (rendered && orderCart.length > 0) showCartUI();
  scrollToBottom();
  return rendered;
};

/* detect order intent */
const oldDetectIntent = detectIntent;

detectIntent = function (t) {
  if (isOrderIntent(t)) return "order";
  if (isDeliveryTimeIntent(t)) return "delivery_time";
  if (isDietaryIntent(t)) return "dietary";
  if (isIngredientsIntent(t)) return "ingredients";
  if (isPortionSizeIntent(t)) return "portion_size";
  if (isCategoryDefinitionIntent(t)) return "category_definition";
  if (isCategoryListingIntent(t)) return "category_listing";
  if (isMenuBrowsingIntent(t)) return "menu";

  return oldDetectIntent(t);
};

function isOrderIntent(text) {
  const query = normalizeChatText(text);

  return (
    /^(zamow|zamow jedzenie|zamowienie)$/.test(query) ||
    /\b(chce|chcialbym|chcialabym)\b.*\b(zamowic|zlozyc zamowienie)\b/.test(
      query,
    ) ||
    /\bzamawiam\b/.test(query) ||
    /\b(poprosze|wezme)\b\s+\S+/.test(query)
  );
}

function isDeliveryTimeIntent(text) {
  const query = normalizeChatText(text);
  return (
    /\b(ile|jak dlugo)\b.*\b(czeka|dostaw|jedzeni)\w*\b/.test(query) ||
    /\b(jaki|jaka)\b.*\bczas\b.*\b(dostaw|realizac)\w*\b/.test(query) ||
    /\bile\b.*\btrwa\b.*\b(realizac|dostaw)\w*\b/.test(query) ||
    /\bkiedy\b.*\b(zamowieni|jedzeni)\w*\b/.test(query)
  );
}

function isDietaryIntent(text) {
  return /\b(bez laktoz|bez gluten|wegetarian|wegansk|wegan|bez miesa)\w*\b/.test(
    normalizeChatText(text),
  );
}

function isIngredientsIntent(text) {
  const query = normalizeChatText(text);
  return (
    /\b(skladnik|sklad|zawiera)\w*\b/.test(query) ||
    /\bco jest (na|w)\b/.test(query) ||
    /\bz czym jest\b/.test(query)
  );
}

function isPortionSizeIntent(text) {
  const query = normalizeChatText(text);
  return (
    /\b(wielkosc|wielkosci|wymiar|wymiary)\w*\b/.test(query) ||
    /\bjak (duza|duzy|duze)\b.*\b(porcj|pizza|kanapk)\w*\b/.test(query) ||
    /\bile\b.*\bcm\b/.test(query)
  );
}

function isCategoryDefinitionIntent(text) {
  return /\b(czym jest|co to jest|co oznacza)\b/.test(normalizeChatText(text));
}

function isCategoryListingIntent(text) {
  const query = normalizeChatText(text);
  return /\b(co macie|co jest|pokaz)\b.*\b(w|z kategorii)\b/.test(query);
}

function isPendingActionResponse(text, type) {
  const query = normalizeChatText(text);
  if (type === "accept") {
    return /^(tak|tak chce|jasne|poprosze|dobra|okej|ok|chce)(\b|$)/.test(query) ||
      /\b(pomoz|pomoc)\b.*\b(zamowic|zlozyc zamowienie)\b/.test(query);
  }
  return /^(nie|nie dzieki|nie teraz|pozniej)(\b|$)/.test(query);
}

/* hook into sendMsg */

const oldSendMsg = sendMsg;

sendMsg = function () {
  if (!input.value.trim()) return;

  const text = input.value;
  const lower = text.toLowerCase();

  if (pendingConversationAction === "order_confirmation") {
    pendingConversationAction = null;

    if (isPendingActionResponse(text, "accept")) {
      input.value = "";
      userMessage(text);
      startOrder();
      return;
    }

    if (isPendingActionResponse(text, "reject")) {
      input.value = "";
      userMessage(text);
      botMessage("Jasne. W czym jeszcze mogę pomóc?");
      return;
    }
  }

  const intent = detectIntent(lower);

  /* Global actions always interrupt an active conversational flow. */
  if (reservationStep && intent === "cancel") {
    input.value = "";
    userMessage(text);
    cancelReservation();
    return;
  }

  if (["menu", "daily", "hours", "contact", "reserve"].includes(intent)) {
    oldSendMsg();
    return;
  }

  if (intent === "order") {
    input.value = "";
    userMessage(text);
    startOrder();
    return;
  }

  if (
    [
      "delivery_time",
      "dietary",
      "ingredients",
      "portion_size",
      "category_definition",
      "category_listing",
    ].includes(intent)
  ) {
    input.value = "";
    userMessage(text);
    askAI(text);
    return;
  }

  /* Only non-global input is interpreted as the current flow's next step. */
  if (reservationStep) {
    input.value = "";
    userMessage(text);
    handleReservation(text);
    return;
  }

  if (cancelStep) {
    input.value = "";
    userMessage(text);
    handleCancel(text);
    return;
  }

  /* only custom amount of poriotns uses type amount option */
  if (orderStep === "customQty" && /^[0-9]+$/.test(text)) {
    input.value = "";
    userMessage(text);
    handleOrder(text);
    return;
  }

  /* otherwise normal chatbot */
  oldSendMsg();
};

/* Keep click and Enter on the same, final sendMsg implementation. */
send.onclick = sendMsg;

/* === BUILD SECOND EMPTY ADMIN COLUMN === */
window.addEventListener("DOMContentLoaded", function () {
  const panel = document.getElementById("admin-panel");
  if (!panel) return;

  /* skip if already applied */
  if (panel.querySelector(".admin-columns")) return;

  const children = [...panel.children];

  /* #admin-close stays in its original top-level DOM position. Moving it into a
     column makes that column its containing block and is intentionally avoided. */
  const closeBtn = document.getElementById("admin-close");

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

function normalizeMenuIngredients(data) {
  const menu = data && typeof data === "object" ? data : {};

  Object.keys(menu).forEach((category) => {
    if (!Array.isArray(menu[category])) return;
    menu[category] = menu[category].map((product) => ({
      ...product,
      ingredients: product.ingredients || "",
    }));
  });

  return menu;
}

function getAdminMenu() {
  const data = localStorage.getItem("adminMenuData");
  if (!data) return {};
  try {
    return normalizeMenuIngredients(JSON.parse(data));
  } catch (e) {
    return {};
  }
}

function saveAdminMenu(data) {
  data = normalizeMenuIngredients(data);
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

    const data = normalizeMenuIngredients(await res.json());

    localStorage.setItem("adminMenuData", JSON.stringify(data));

    syncMenuWithOrderSystem();

    if (typeof renderAdminTable === "function") {
      renderAdminTable();
    }
  } catch (e) {
    console.error(e);
  } finally {
    menuLoadState = "ready";
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
      ORDER_CATEGORIES[cat].push({
        ...p,
        ingredients: p.ingredients || "",
      });
    });
  });
}

syncMenuWithOrderSystem();
menuLoadPromise = loadMenuFromBackend();

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
    reservationsContainer.style.display = "flex";

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
      if (reservationsContainer.style.display === "flex") {
        renderReservationsAdmin();
      }
    }, 5000);
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;

    if (ordersContainer.style.display === "block") {
      lastOrdersJSON = "";
      renderOrdersAdmin();
    }

    if (reservationsContainer.style.display === "flex") {
      lastReservationsJSON = "";
      renderReservationsAdmin();
    }
  });

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

  function showProductEditor(container, product, productIndex) {
    const wrap = document.createElement("div");
    wrap.className = "admin-product-editor";

    const name = document.createElement("input");
    name.placeholder = "Nazwa produktu";
    name.value = product.name || "";

    const ingredients = document.createElement("textarea");
    ingredients.placeholder =
      "np. sos pomidorowy, mozzarella, szynka, pieczarki";
    ingredients.setAttribute("aria-label", "Składniki / opis");
    ingredients.rows = 2;
    ingredients.value = product.ingredients || "";

    const ingredientsLabel = document.createElement("label");
    ingredientsLabel.textContent = "Składniki / opis";
    ingredientsLabel.appendChild(ingredients);

    const priceRow = document.createElement("div");
    priceRow.className = "admin-product-price-row";

    const sizeToggle = document.createElement("input");
    sizeToggle.type = "checkbox";
    sizeToggle.title = "produkt ma rozmiary";
    sizeToggle.checked = Boolean(product.sizes);

    const label = document.createElement("span");
    label.textContent = "rozmiary";

    const price = document.createElement("input");
    price.placeholder = "cena";
    price.value = product.price || "";

    const small = document.createElement("input");
    small.placeholder = "mały";
    small.value = product.sizes ? product.sizes.small : "";

    const large = document.createElement("input");
    large.placeholder = "duży";
    large.value = product.sizes ? product.sizes.large : "";

    function updatePriceFields() {
      price.style.display = sizeToggle.checked ? "none" : "block";
      small.style.display = sizeToggle.checked ? "block" : "none";
      large.style.display = sizeToggle.checked ? "block" : "none";
    }

    sizeToggle.onchange = updatePriceFields;
    updatePriceFields();

    const save = document.createElement("button");
    save.textContent = "OK";
    save.onclick = function () {
      const productName = name.value.trim();
      if (!productName) return;

      const updatedProduct = {
        name: productName,
        ingredients: ingredients.value.trim(),
      };

      if (sizeToggle.checked) {
        const smallPrice = small.value.trim();
        const largePrice = large.value.trim();
        if (!smallPrice || !largePrice) return;
        updatedProduct.sizes = { small: smallPrice, large: largePrice };
      } else {
        const productPrice = price.value.trim();
        if (!productPrice) return;
        updatedProduct.price = productPrice;
      }

      const currentData = getAdminMenu();
      if (productIndex === null) {
        currentData[selectedCategory].push(updatedProduct);
      } else {
        currentData[selectedCategory][productIndex] = updatedProduct;
      }
      saveAdminMenu(currentData);
      renderAdminTable();
      syncMenuWithOrderSystem();
    };

    priceRow.append(sizeToggle, label, price, small, large, save);
    wrap.append(name, ingredientsLabel, priceRow);
    container.appendChild(wrap);
  }

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

    const edit = document.createElement("button");
    edit.textContent = "Edytuj";
    edit.style.marginLeft = "auto";
    edit.style.marginRight = "4px";
    edit.onclick = function () {
      row.innerHTML = "";
      showProductEditor(row, p, i);
    };

    row.appendChild(name);
    row.appendChild(edit);
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
    showProductEditor(prodCol, {}, null);
  };

  prodCol.appendChild(plus);
}

function normalizeChatText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isMenuQuestion(text) {
  const query = normalizeChatText(text);

  if (
    /\b(menu|karta|jedzenie|dani|potraw|produkt|cen|koszt|wege|wega|bez miesa)\w*\b/.test(
      query,
    ) ||
    /\b(czy (macie|jest)|macie cos|jakie macie|co macie)\b/.test(query) ||
    /\bco (moge|mozna) (u was )?(zamowic|zjesc)\b/.test(query) ||
    /\b(co macie do zamowienia|jakie jedzenie macie|pokaz menu)\b/.test(query) ||
    /\bco polecacie\b.*\bmenu\b/.test(query)
  ) {
    return true;
  }

  return findMenuMatches(text).length > 0;
}

function isMenuBrowsingIntent(text) {
  const query = normalizeChatText(text);

  return (
    /^(menu|karta)$/i.test(query) ||
    /\bco (moge|mozna) (u was )?(zamowic|zjesc|dostac)\b/.test(query) ||
    /\bco u was (dostane|zjem)\b/.test(query) ||
    /\bco macie\b/.test(query) ||
    /\bco oferujecie\b/.test(query) ||
    /\bjaka jest oferta\b/.test(query) ||
    /\bjakie macie (dania|jedzenie)\b/.test(query) ||
    /\bjakie\b.*\bmacie\b/.test(query) ||
    /\bpokaz\b.*\b(menu|karte)\b/.test(query)
  );
}

function isRecommendationIntent(text) {
  const query = normalizeChatText(text);

  return (
    /\bco polecacie\b/.test(query) ||
    /\bco polecasz\b/.test(query) ||
    /\bco warto zamowic\b/.test(query) ||
    /\bco jest dobre\b/.test(query) ||
    /\bco najlepiej wybrac\b/.test(query) ||
    /\bpolec cos\b/.test(query) ||
    /\bco bys polecil\b/.test(query) ||
    /\bco najczesciej wybieraja klienci\b/.test(query)
  );
}

function getMenuRecommendations() {
  const items = getMenuItemsForSearch();
  const recommendations = [];
  const selectedCategories = new Set();

  items.forEach((item) => {
    if (recommendations.length >= 4 || selectedCategories.has(item.category)) {
      return;
    }

    recommendations.push(item);
    selectedCategories.add(item.category);
  });

  items.forEach((item) => {
    if (recommendations.length >= Math.min(4, items.length)) return;
    if (!recommendations.includes(item)) recommendations.push(item);
  });

  return recommendations.slice(0, 4);
}

function showMenuRecommendations(text) {
  const recommendations = getMenuRecommendations();

  if (!recommendations.length) {
    botMessage("Aktualnie nie ma danych menu, na podstawie których mogę coś polecić.");
    return;
  }

  const popularityNote = /najczesciej|popular/.test(normalizeChatText(text))
    ? "Nie mam danych o popularności, ale mogę polecić pozycje z aktualnego menu:\n"
    : "Mogę polecić kilka pozycji z aktualnego menu:\n";
  const products = recommendations
    .map((item) => `• ${item.name}${item.priceText ? ` — ${item.priceText}` : ""}`)
    .join("\n");

  botMessage(
    `${popularityNote}${products}\n\nChcesz, żebym od razu pomógł złożyć zamówienie?`);
  pendingConversationAction = "order_confirmation";
}

function formatCurrentMenu() {
  const menu = getAdminMenu();

  if (!menu || !getMenuItemsForSearch().length) {
    return "Menu nie zostało jeszcze uzupełnione przez restaurację.";
  }

  let msg = "📖 Aktualne menu:\n";

  Object.keys(menu).forEach((category) => {
    msg += "\n" + category.toUpperCase() + ":\n";

    const products = Array.isArray(menu[category]) ? menu[category] : [];

    products.forEach((product) => {
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
    const products = Array.isArray(menu[category]) ? menu[category] : [];

    products.forEach((product) => {
      let priceText = "";

      if (product.sizes) {
        priceText =
          "mały " +
          product.sizes.small +
          " zł / duży " +
          product.sizes.large +
          " zł";
      } else if (product.price !== undefined && product.price !== null) {
        priceText = product.price + " zł";
      }

      items.push({
        category,
        name: product.name,
        ingredients: product.ingredients || "",
        sizes: product.sizes || null,
        dietaryTags: Array.isArray(product.dietaryTags)
          ? product.dietaryTags.map(normalizeChatText)
          : [],
        priceText,
        searchText: normalizeChatText(category + " " + product.name),
      });
    });
  });

  return items;
}

function findMentionedCategory(text) {
  const query = normalizeChatText(text);
  return Object.keys(getAdminMenu()).find((category) =>
    query.includes(normalizeChatText(category)),
  );
}

function getCategoryDescription(category) {
  const descriptions = RESTAURANT_CONFIG.categoryDescriptions || {};
  const matchingKey = Object.keys(descriptions).find(
    (key) => normalizeChatText(key) === normalizeChatText(category),
  );
  return matchingKey ? descriptions[matchingKey] : "";
}

function formatCategoryProducts(category) {
  const products = getMenuItemsForSearch().filter(
    (item) => item.category === category,
  );

  if (!products.length) {
    return `Kategoria ${category} nie ma obecnie dostępnych pozycji.`;
  }

  return (
    `W kategorii ${category} są dostępne:\n` +
    products
      .map((item) => `• ${item.name}${item.priceText ? ` — ${item.priceText}` : ""}`)
      .join("\n")
  );
}

function getRequestedDietaryFeature(text) {
  const query = normalizeChatText(text);
  if (/bez laktoz/.test(query)) return { tag: "bez laktozy", label: "bez laktozy" };
  if (/bez gluten/.test(query)) return { tag: "bez glutenu", label: "bez glutenu" };
  if (/wegetarian|bez miesa/.test(query)) {
    return { tag: "wegetariańskie", label: "wegetariańskie" };
  }
  return { tag: "wegańskie", label: "wegańskie" };
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
    "cos",
    "co",
    "mnie",
    "interesuje",
    "prosze",
  ];

  const words = query
    .split(" ")
    .filter((word) => word.length >= 3 && !stopWords.includes(word));

  if (!words.length) return [];

  return getMenuItemsForSearch()
    .map((item) => {
      let score = 0;

      words.forEach((word) => {
        const stem = word.length > 4 ? word.slice(0, -1) : word;
        const searchWords = item.searchText.split(" ");
        const inflectedNameMatch =
          word.length >= 5 &&
          searchWords.some(
            (searchWord) =>
              searchWord.length >= 5 &&
              searchWord.slice(0, 5) === word.slice(0, 5),
          );

        if (
          item.searchText.includes(word) ||
          item.searchText.includes(stem) ||
          inflectedNameMatch
        ) {
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
  const menuItems = getMenuItemsForSearch();

  if (/godzin|otwar|czynne|zamkn|ktorej|kiedy/.test(query)) {
    return getOpeningHoursMessage();
  }

  if (/kontakt|telefon|adres|gdzie|lokalizacja/.test(query)) {
    return getContactMessage();
  }

  if (/rezerw|stolik|booking/.test(query)) {
    return "📅 Mogę pomóc w rezerwacji stolika. Kliknij „📅 Rezerwacja” albo napisz, na jaki dzień chcesz zarezerwować stolik.";
  }

  if (isDeliveryTimeIntent(text)) {
    return `Szacowany czas realizacji zamówienia to ${getEstimatedDeliveryTimeText()}.`;
  }

  if (isDietaryIntent(text)) {
    const feature = getRequestedDietaryFeature(text);
    const confirmedItems = menuItems.filter((item) =>
      item.dietaryTags.some((tag) => tag === normalizeChatText(feature.tag)),
    );

    if (!confirmedItems.length) {
      return `Nie mam w menu zapisanej informacji, które pozycje są ${feature.label}. Mogę pokazać składniki konkretnych produktów.`;
    }

    return (
      `Pozycje oznaczone w menu jako ${feature.label}:\n` +
      confirmedItems.map((item) => `• ${item.name}`).join("\n")
    );
  }

  if (isIngredientsIntent(text)) {
    const matches = findMenuMatches(text);
    const bestMatches = matches.length
      ? matches.filter((item) => item.score === matches[0].score)
      : [];

    if (bestMatches.length !== 1) {
      return "Nie znalazłem tego produktu w aktualnym menu restauracji.";
    }

    const product = bestMatches[0];
    if (!product.ingredients) {
      return "Nie mam jeszcze zapisanych składników tego produktu.";
    }

    return product.name + ": " + product.ingredients + ".";
  }

  if (isPortionSizeIntent(text)) {
    const matches = findMenuMatches(text);
    const productsWithSizes = matches.filter((item) => item.sizes);

    if (productsWithSizes.length) {
      const variants = new Set();
      productsWithSizes.forEach((item) =>
        Object.keys(item.sizes).forEach((size) => variants.add(size)),
      );
      const variantLabels = [...variants].map((size) => {
        if (size === "small") return "małym";
        if (size === "large") return "dużym";
        return size;
      });
      return `Ten produkt jest dostępny w wariancie ${variantLabels.join(" i ")}, ale nie mam zapisanych dokładnych wymiarów.`;
    }

    if (/\bpizz\w*\b/.test(query)) {
      return "Nie mam w systemie dokładnych wymiarów tej pizzy.";
    }

    return "Nie mam jeszcze zapisanej informacji o wielkości tej porcji.";
  }

  if (isCategoryDefinitionIntent(text)) {
    const category = findMentionedCategory(text);
    if (!category) {
      return "Nie mam jeszcze zapisanego opisu tego pojęcia.";
    }

    const description = getCategoryDescription(category);
    return description
      ? `${category}: ${description}`
      : `Nie mam jeszcze zapisanego opisu tej kategorii, ale mogę pokazać dostępne pozycje ${category}.`;
  }

  if (isCategoryListingIntent(text)) {
    const category = findMentionedCategory(text);
    return category
      ? formatCategoryProducts(category)
      : "Nie rozpoznałem kategorii. Mogę pokazać całe aktualne menu.";
  }

  // Pytanie o ofertę ma pierwszeństwo przed wyszukiwaniem nazwy produktu.
  // Dzięki temu słowa z całego zdania nie są traktowane jak nazwa dania.
  if (isMenuBrowsingIntent(text)) {
    return null;
  }

  if (isMenuQuestion(text)) {
    if (!menuItems.length) {
      return "Menu nie zostało jeszcze uzupełnione przez restaurację.";
    }

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

    if (/\b(menu|karta|jedzenie)\b|\b(co|jakie) macie\b/.test(query)) {
      return "Aktualnie nie dodano zdjęcia menu. Mogę sprawdzić konkretne danie albo pomóc z zamówieniem.";
    }

    return "Nie znalazłem tego w aktualnym menu restauracji. Mogę pokazać całe menu albo pomóc z rezerwacją.";
  }

  return null;
}

async function askAI(text) {
  const safeAnswer = answerFromRestaurantData(text);

  if (safeAnswer) {
    botMessage(safeAnswer);
    return;
  }

  botMessage(
    "Mogę pomóc w sprawie menu, godzin otwarcia, kontaktu, rezerwacji albo zamówienia. Nie mam tej informacji w systemie restauracji.");
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
  openToggle.id = "restaurant-open-toggle";

  openToggle.checked = localStorage.getItem("restaurantOpen") !== "false";

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
let completedOrderFilter = "all";
let adminOrdersCache = [];
let adminOrdersLoaded = false;
let pendingMovingOrders = new Set();

function getLocalDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateValue(value) {
  if (!value) return null;
  const dateOnly = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    return new Date(+dateOnly[1], +dateOnly[2] - 1, +dateOnly[3]);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function createFilterMenu({ label, value, options, onChange }) {
  const wrapper = document.createElement("div");
  wrapper.className = "admin-filter";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "admin-filter-button";
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");
  button.innerHTML =
    '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 5h18l-7 8v5l-4 2v-7L3 5z"/></svg><span class="admin-filter-name"></span>';
  button.querySelector(".admin-filter-name").textContent = "Filtruj";

  const menu = document.createElement("div");
  menu.className = "admin-filter-menu";
  menu.setAttribute("role", "menu");
  menu.hidden = true;

  const close = () => {
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", onDocumentClick);
  };
  const onDocumentClick = (event) => {
    if (!wrapper.contains(event.target)) close();
  };
  const onKeydown = (event) => {
    if (event.key === "Escape") {
      close();
      button.focus();
    }
  };
  wrapper.addEventListener("keydown", onKeydown);

  options.forEach((option) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "admin-filter-option";
    item.setAttribute("role", "menuitemradio");
    item.setAttribute("aria-checked", String(option.value === value));
    item.textContent = `${option.value === value ? "✓ " : ""}${option.label}`;
    item.onclick = () => {
      close();
      onChange(option.value);
    };
    menu.appendChild(item);
  });

  button.onclick = (event) => {
    event.stopPropagation();
    const willOpen = menu.hidden;
    menu.hidden = !willOpen;
    button.setAttribute("aria-expanded", String(willOpen));
    if (willOpen) {
      document.addEventListener("click", onDocumentClick);
      menu.querySelector('[aria-checked="true"]')?.focus();
    } else {
      document.removeEventListener("click", onDocumentClick);
    }
  };
  wrapper.append(button, menu);
  return wrapper;
}

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

  if (adminOrderView === "completed") {
    const filterRow = document.createElement("div");
    filterRow.className = "orders-filter-row";
    filterRow.appendChild(
      createFilterMenu({
        label: "Filtruj zrealizowane zamówienia",
        value: completedOrderFilter,
        options: [
          { value: "all", label: "Wszystkie" },
          { value: "today", label: "Dzisiaj" },
          { value: "archive", label: "Archiwalne" },
        ],
        onChange(value) {
          completedOrderFilter = value;
          lastOrdersJSON = "";
          renderOrdersAdmin({ useCache: true });
        },
      }),
    );
    container.appendChild(filterRow);
  }
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
    const filterLabel =
      completedOrderFilter === "today"
        ? "dzisiaj"
        : completedOrderFilter === "archive"
          ? "w archiwum"
          : "";
    empty.innerHTML = `
      <div class="admin-empty-icon">✅</div>
      <strong>Brak zrealizowanych zamówień</strong>
      <span>${filterLabel ? `Brak zamówień ${filterLabel}.` : "Zrealizowane i anulowane zamówienia trafią tutaj."}</span>
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
      completedFilter: completedOrderFilter,
      pending: Array.from(pendingMovingOrders),
      localDate: getLocalDateKey(new Date()),
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

  const todayKey = getLocalDateKey(new Date());
  const visibleOrders = orders.filter((order) => {
    if (pendingMovingOrders.has(String(order.id))) {
      return false;
    }

    if (getOrderBucket(order) !== adminOrderView) return false;
    if (adminOrderView !== "completed" || completedOrderFilter === "all") {
      return true;
    }

    const completedKey = getLocalDateKey(parseDateValue(order.completedAt));
    if (!completedKey) return false;
    return completedOrderFilter === "today"
      ? completedKey === todayKey
      : completedKey < todayKey;
  });

  if (
    adminOrderView === "completed" &&
    completedOrderFilter === "all" &&
    visibleOrders.some((order) => !parseDateValue(order.completedAt))
  ) {
    const notice = document.createElement("p");
    notice.className = "admin-filter-notice";
    notice.textContent =
      "Część rekordów nie ma daty realizacji (completedAt), dlatego nie można przypisać ich do „Dzisiaj” ani „Archiwalne”.";
    container.appendChild(notice);
  }

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
let reservationFilter = "all";

function getReservationEnd(reservation) {
  const explicitEnd =
    reservation.endAt || reservation.endsAt || reservation.endDateTime;
  if (explicitEnd) return parseDateValue(explicitEnd);
  if (!reservation.date) return null;

  const dateMatch = String(reservation.date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) return parseDateValue(reservation.date);
  const timeMatch = String(reservation.time || "").match(/^(\d{1,2}):(\d{2})/);
  return new Date(
    +dateMatch[1],
    +dateMatch[2] - 1,
    +dateMatch[3],
    timeMatch ? +timeMatch[1] : 23,
    timeMatch ? +timeMatch[2] : 59,
    timeMatch ? 0 : 59,
  );
}

function isReservationInactive(reservation, now = new Date()) {
  const status = String(reservation.status || "").toLocaleLowerCase("pl");
  if (
    status.includes("anul") ||
    status.includes("cancel") ||
    status.includes("zakończ") ||
    status.includes("completed") ||
    status.includes("zrealiz")
  ) {
    return true;
  }
  const end = getReservationEnd(reservation);
  return end ? end.getTime() < now.getTime() : false;
}

async function renderReservationsAdmin() {
  const container = document.getElementById("reservations-admin-container");

  if (!container) return;

  let reservations = [];

  try {
    reservations = await fetchJSONWithTimeout(`${API_BASE}/reservations`);

    const currentJSON = JSON.stringify({
      reservations,
      filter: reservationFilter,
      minute: Math.floor(Date.now() / 60000),
    });

    if (currentJSON === lastReservationsJSON) {
      return;
    }

    lastReservationsJSON = currentJSON;

    container.innerHTML = "";
    const staticArea = document.createElement("div");
    staticArea.className = "admin-list-static-header";
    staticArea.innerHTML = "<h3>📅 Rezerwacje</h3>";
    staticArea.appendChild(
      createFilterMenu({
        label: "Filtruj rezerwacje",
        value: reservationFilter,
        options: [
          { value: "all", label: "Wszystkie" },
          { value: "current", label: "Aktualne" },
          { value: "inactive", label: "Nieaktywne" },
        ],
        onChange(value) {
          reservationFilter = value;
          lastReservationsJSON = "";
          renderReservationsAdmin();
        },
      }),
    );
    const list = document.createElement("div");
    list.className = "admin-dynamic-list reservation-list";
    container.append(staticArea, list);
  } catch (e) {
    console.error(e);

    showAdminBackendError(container, "📅 Rezerwacje");
    return;
  }

  const visibleReservations = reservations.filter((reservation) => {
    if (reservationFilter === "all") return true;
    const inactive = isReservationInactive(reservation);
    return reservationFilter === "inactive" ? inactive : !inactive;
  });

  if (!visibleReservations.length) {
    const empty = document.createElement("div");
    empty.textContent =
      reservationFilter === "current"
        ? "Brak aktualnych rezerwacji"
        : reservationFilter === "inactive"
          ? "Brak nieaktywnych rezerwacji"
          : "Brak rezerwacji";
    empty.style.color = "#666";

    container.querySelector(".reservation-list").appendChild(empty);

    return;
  }

  visibleReservations
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

      container.querySelector(".reservation-list").appendChild(card);
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
