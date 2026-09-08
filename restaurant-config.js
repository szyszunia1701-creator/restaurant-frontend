const RESTAURANT_CONFIG = {
  name: "Twoja Restauracja",
  assistantName: "Asystent Restauracji",
  contact: {
    phone: "",
    address: "",
  },
  delivery: {
    fee: 5,
    estimatedTime: 30,
  },
  openingHours: {
    weekday: { from: 12, to: 22, label: "Pon–Czw 12–22" },
    weekend: { from: 12, to: 23, label: "Pt–Nd 12–23" },
  },
  branding: {
    chatbotLogo: "assets/chatbot-logo.png",
    mascot: {
      idle1: "assets/mascot/mascot-idle-1.png",
      idle2: "assets/mascot/mascot-idle-2.png",
      wink1: "assets/mascot/mascot-wink-1.png",
      wave1: "assets/mascot/mascot-wave-1.png",
      wave2: "assets/mascot/mascot-wave-2.png",
    },
  },
};
