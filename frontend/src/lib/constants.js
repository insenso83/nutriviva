export const SEXES = ["Uomo", "Donna", "Altro"];

export const JOB_TYPES = ["Sedentario", "In piedi leggero", "Attivo", "Molto pesante"];

export const TRAINING_TYPES = [
  "Sala pesi / Bodybuilding", "Powerlifting", "Streetlifting", "Calisthenics", "Crossfit", "Hyrox",
  "Allenamento funzionale", "Allenamento ibrido", "Pesistica olimpica", "Corsa / Running", "Trail running",
  "Nuoto", "Ciclismo", "Triathlon", "Camminata", "HIIT", "Yoga", "Pilates",
  "Calcio", "Calcetto", "Basket", "Pallavolo", "Tennis", "Padel", "Rugby",
  "Boxe", "Kickboxing / Muay Thai", "MMA", "Judo / Jiu-Jitsu", "Karate / Taekwondo",
  "Arrampicata", "Sci / Snowboard", "Canottaggio / Canoa", "Danza", "Equitazione", "Golf", "Nessuno",
];

export const TRAINING_FREQ = ["1-2 volte/sett", "3-4 volte/sett", "5-6 volte/sett", "Tutti i giorni"];

export const GOALS = [
  { id: "massa", label: "Mettere massa muscolare", tag: "Ipertrofia" },
  { id: "perdere_peso", label: "Perdere peso", tag: "Deficit" },
  { id: "asciugarsi", label: "Asciugarsi / Definizione", tag: "Cut" },
  { id: "mantenere", label: "Mantenere peso", tag: "Normocalorica" },
  { id: "perdere_cm", label: "Perdere centimetri", tag: "Body-comp" },
  { id: "patologie", label: "Gestire patologie", tag: "Clinico" },
  { id: "intolleranze", label: "Gestione intolleranze", tag: "Salute" },
  { id: "digestione", label: "Migliorare digestione", tag: "Microbiota" },
  { id: "longevita", label: "Longevità", tag: "Anti-aging" },
  { id: "prevenzione", label: "Prevenzione", tag: "Benessere" },
  { id: "energia", label: "Aumentare energia", tag: "Vitalità" },
  { id: "recupero", label: "Migliorare recupero", tag: "Sport" },
  { id: "etica", label: "Scelta etica", tag: "Etica" },
  { id: "sostenibilita", label: "Sostenibilità", tag: "Eco" },
  { id: "religione", label: "Norme religiose", tag: "Tradizione" },
  { id: "sonno_umore", label: "Sonno & Umore", tag: "Circadiano" },
];

export const DIETS = [
  { name: "Chetogenica", desc: "Pochissimi carboidrati, alti grassi. Ricarica carbo ogni ~21 giorni." },
  { name: "Mediterranea", desc: "Equilibrata, cereali integrali, olio EVO, pesce, verdure." },
  { name: "DASH", desc: "Contro l'ipertensione, povera di sodio, ricca di frutta e verdura." },
  { name: "Flexitariana", desc: "Prevalentemente vegetale con carne occasionale." },
  { name: "MIND", desc: "Salute del cervello, mix di Mediterranea e DASH." },
  { name: "Low Carb", desc: "Carboidrati ridotti ma non estrema come la keto." },
  { name: "Dukan", desc: "Iperproteica a fasi. Giorno proteico puro periodico." },
  { name: "A Zona", desc: "Rapporto 40/30/30 tra carbo, proteine e grassi." },
  { name: "Digiuno Intermittente (16/8)", desc: "Finestra alimentare di 8 ore." },
  { name: "Vegetariana", desc: "Senza carne e pesce." },
  { name: "Vegana", desc: "100% vegetale." },
  { name: "Paleo", desc: "Cibi non processati, no cereali e legumi." },
  { name: "Bulking Tradizionale", desc: "Ipercalorica per aumento massa." },
  { name: "Ipercalorica", desc: "Surplus calorico marcato." },
  { name: "Clean Bulking", desc: "Surplus pulito e controllato." },
];

export const SUPPLEMENTS = [
  { id: "whey", label: "Proteine in polvere", timing: "Post-allenamento o a colazione, 25-30g",
    variants: ["Whey concentrate (siero del latte)", "Whey isolate", "Whey idrolizzate", "Caseine (rilascio lento)", "Proteine della carne (beef)", "Proteine dell'uovo", "Proteine vegetali (pisello/riso/soia)", "Blend multi-proteico"] },
  { id: "creatina", label: "Creatina", timing: "3-5g/die; eventuale carico 20g/5gg, poi a colazione o post-workout",
    variants: ["Monoidrato", "Monoidrato Creapure", "Cloridrato (HCL)", "Idrolizzata / micronizzata", "Kre-Alkalyn (tamponata)", "Creatina malato", "Etil estere"] },
  { id: "bcaa", label: "Aminoacidi / BCAA / EAA", timing: "Intra-workout o nei digiuni prolungati",
    variants: ["BCAA 2:1:1", "BCAA 4:1:1", "BCAA 8:1:1", "EAA (essenziali)", "Glutammina", "Citrullina / Arginina"] },
  { id: "gainer", label: "Mass Gainer", timing: "Post-workout con whey e creatina (fasi di massa)",
    variants: ["Gainer 1:1 (carbo:proteine)", "Gainer 3:1", "Gainer 5:1", "Gainer clean (avena/patata dolce)"] },
  { id: "preworkout", label: "Pre-workout", timing: "20-30 minuti prima dell'allenamento",
    variants: ["Con caffeina", "Senza caffeina (stim-free)", "Con beta-alanina"] },
  { id: "omega3", label: "Omega 3", timing: "Ai pasti principali", variants: ["Olio di pesce", "Olio di krill", "Vegetale (alghe)"] },
  { id: "vitd", label: "Vitamina D3", timing: "Al mattino con un pasto con grassi", variants: ["D3", "D3 + K2"] },
  { id: "magnesio", label: "Magnesio", timing: "La sera prima di dormire", variants: ["Bisglicinato", "Citrato", "Pidolato", "Ossido"] },
  { id: "multivit", label: "Multivitaminico", timing: "A colazione", variants: ["Uomo", "Donna", "Sportivo"] },
];

export const VARIANT_TIPS = {
  "Caseine (rilascio lento)": "Ideali prima di dormire (spuntino pre-nanna).",
  "Whey isolate": "Quasi senza lattosio, assorbimento rapido: perfette post-workout.",
  "Whey idrolizzate": "Assorbimento rapidissimo, digeribili: post-workout.",
  "Proteine della carne (beef)": "Senza lattosio: ottime per intolleranti.",
  "Proteine vegetali (pisello/riso/soia)": "Adatte a vegani e intolleranti al lattosio.",
  "Cloridrato (HCL)": "Più solubile: dosi più basse (1-2 g), niente fase di carico.",
  "Monoidrato": "La più studiata: 3-5 g/die, carico facoltativo 20 g/die per 5-7 giorni.",
  "Monoidrato Creapure": "Monoidrato di purezza certificata: 3-5 g/die.",
};

export const MEALS = [
  { key: "colazione", name: "Colazione", time: "07:30 - 08:30" },
  { key: "spuntino_mattina", name: "Spuntino Mattina", time: "10:30 - 11:00" },
  { key: "pranzo", name: "Pranzo", time: "13:00 - 14:00" },
  { key: "spuntino_pomeriggio", name: "Spuntino Pomeriggio", time: "16:30 - 17:30" },
  { key: "cena", name: "Cena", time: "20:00 - 21:00" },
  { key: "pre_nanna", name: "Spuntino Pre-Nanna", time: "22:30 - 23:00" },
];

export const DAYS = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
