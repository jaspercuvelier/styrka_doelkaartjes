"use strict";
/* Rapport-app Styrka @waterkant
   Voegt drie bestanden samen tot één rapport (PDF):
     A  doelenfiche leerling (PDF uit de doelkaartjes-tool): de kaartjes zelf
     B  individueel handelingsplan (Word uit Smartschool): ontwikkelingsdoel, doelstellingen, beginsituatie, aanpak
     C  eindrapport (Word uit Smartschool): evaluatie (gekleurd bolletje) en commentaar per doel
   Alles gebeurt in de browser; er wordt niets verstuurd. */

/* ================= instellingen (later te koppelen aan Smartschool) ================= */
const KLASSEN = {
  OV1: ["Anker", "Duikboot", "Ferry", "Gondel", "Klipper", "OV1 POAH", "Overzet", "Pedalo", "Raft", "Sloep",
        "Speedboot", "Stoomboot", "Vlot", "Vuurtoren", "Zeilboot"],
  OV2: ["Aanvangsjaar fase 1 – A1", "Vormingsjaar fase 1 – V1", "Oriëntatiejaar fase 1 – O1",
        "Arbeidstraining fase 2 – A2", "Prestatietraining fase 2 – P2", "Finaliteitstraining fase 2 – F2"]
};
const LEERLINGEN_TEST = ["A", "B", "C"];               // testfase: fictieve namen per klas
const SCHOOLJAREN = ["2026-2027", "2027-2028", "2028-2029", "2029-2030", "2030-2031"];
const RAPPORTEN = {
  jan: {label: "Rapport januari", titel: "RAPPORT JANUARI", cyclus: 1},
  jun: {label: "Rapport juni", titel: "RAPPORT JUNI", cyclus: 2}
};
// kleuren van de evaluatie-bolletjes (zoals in het eindrapport van Smartschool)
const EVAL = {
  groen:  {kleur: "#4caf3a", naam: "groen"},
  blauw:  {kleur: "#2589e8", naam: "blauw"},
  geel:   {kleur: "#f5c400", naam: "geel"},
  oranje: {kleur: "#f08a24", naam: "oranje"}
};
// uitleg op het voorblad: nog fictief, wordt later uitgeschreven
const PARAMETERS = [
  {naam: "Z", eval: "groen",  uitleg: "Uitleg volgt."},
  {naam: "Y", eval: "blauw",  uitleg: "Uitleg volgt."},
  {naam: "X", eval: "geel",   uitleg: "Uitleg volgt."},
  {naam: "W", eval: "oranje", uitleg: "Uitleg volgt."}
];
const VOETNOOT_STYRKA = [
  "Sint-Juliaanstraat 7 – 9000 Gent  ·  09 222 15 84",
  "ssw.school@styrka.evara.be  ·  styrka.be/styrkasow",
  "Onze school maakt deel uit van vzw Evara, Stropkaai 38 E, 9000 Gent"
];
// kleuren van de doelkaartjes (gelijk aan de doelkaartjes-tool)
const PAL = {
  "WONEN":         {c: "#f4c430", t: "#fcefc0", i: "#8a6700"},
  "WERKEN":        {c: "#7dcb86", t: "#ddf3df", i: "#2f7f3c"},
  "VRIJE TIJD":    {c: "#86afcf", t: "#dce9f4", i: "#2e6a9e"},
  "OVERKOEPELEND": {c: "#f59b57", t: "#fde2cc", i: "#b4520f"},
  "TALENT":        {c: "#a98bd6", t: "#ebe2f7", i: "#6b3fa8"}
};

/* ================= hulpjes ================= */
const D = window.RAPPORT_DATA;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const b64bytes = b => { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lum = ([r, g, b]) => .299 * r + .587 * g + .114 * b;
let tt; function toast(t){ const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(tt); tt = setTimeout(() => el.hidden = true, 3500); }
const byNr = Object.fromEntries(D.doelen.map(d => [d.nr, d]));
const palVan = (nr, talent) => talent ? PAL.TALENT : PAL[(byNr[nr] || {}).domein] || PAL.WONEN;
const FAM = "Atkinson Hyperlegible";

$("#logoStyrka").src = D.logos.styrka;
$("#logoKoers").src = D.logos.koers;

// lettertype voor de pagina en om de kaartnummers te herkennen
const fontsKlaar = (async () => {
  try {
    for (const [k, desc] of [["regular", {weight: "400"}], ["bold", {weight: "700"}], ["italic", {weight: "400", style: "italic"}]]){
      const f = new FontFace(FAM, b64bytes(D.fonts[k]).buffer, desc);
      await f.load(); document.fonts.add(f);
    }
  } catch (e){ console.warn("Lettertype niet geladen", e); }
})();

// tekst uit Smartschool opkuisen
function kuis(s){
  return String(s || "").replace(/\\(['"])/g, "$1").replace(/ /g, " ")
    .replace(/((?:[A-Z]\.){2,})(?=[a-zà-ÿ])/g, "$1 ")   // "J.A.echt" -> "J.A. echt"
    .replace(/[ \t]+/g, " ").trim();
}
// officieel doel vergelijken: zonder "De jongere", hoofdletters, accenten en leestekens
const normDoel = s => kuis(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[‘’`´]/g, "'").replace(/^(de jongere|de leerling)\s+/, "").replace(/[.\s]+$/, "").replace(/\s+/g, " ").trim();
const normTekst = s => kuis(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const perOfficieel = new Map(D.doelen.map(d => [normDoel(d.officieel), d.nr]));
function zoekDoel(t){
  const n = normDoel(t);
  if (perOfficieel.has(n)) return perOfficieel.get(n);
  const a = new Set(n.split(" ")); let best = null, bs = 0;
  for (const d of D.doelen){
    const b = new Set(normDoel(d.officieel).split(" ")); let i = 0;
    for (const w of a) if (b.has(w)) i++;
    const sc = 2 * i / (a.size + b.size);
    if (sc > bs){ bs = sc; best = d.nr; }
  }
  return bs >= .8 ? best : null;
}

/* ================= toestand ================= */
function huidigSchooljaar(){ const n = new Date(), y = n.getFullYear(); const j = n.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`; return SCHOOLJAREN.includes(j) ? j : SCHOOLJAREN[0]; }
const st = {
  ov: null, klas: null, leerling: null, jaar: huidigSchooljaar(),
  rapport: (m => (m >= 7 || m === 0) ? "jan" : "jun")(new Date().getMonth()),
  A: null, B: null, C: null,
  kaarten: []          // {id, nr, talent, img:{bytes,url}|null, score, auto, weg}
};
let kaartId = 0;

/* ================= stap 1: keuzes ================= */
function knop(label, gekozen, data, extra = ""){
  return `<button type="button" class="choice ${extra}" aria-pressed="${gekozen}" ${data}>${label}</button>`;
}
function renderKeuzes(){
  $("#ovKeuze").innerHTML = Object.keys(KLASSEN).map(o => knop(o, st.ov === o, `data-ov="${o}"`, "big")).join("");
  $("#klasBlok").hidden = !st.ov;
  if (st.ov) $("#klasKeuze").innerHTML = KLASSEN[st.ov].map(k => knop(esc(k), st.klas === k, `data-klas="${esc(k)}"`)).join("");
  $("#llBlok").hidden = !st.klas;
  if (st.klas){
    const namen = [...LEERLINGEN_TEST];
    if (st.B && st.B.naam && !namen.includes(st.B.naam)) namen.push(st.B.naam);
    if (st.leerling && !namen.includes(st.leerling)) namen.push(st.leerling);
    $("#llKeuze").innerHTML = namen.map(n => knop(esc(n) + (st.B && n === st.B.naam ? ` <small>(uit handelingsplan)</small>` : ""),
      st.leerling === n, `data-ll="${esc(n)}"`)).join("");
  }
  $("#jaar").innerHTML = SCHOOLJAREN.map(j => `<option ${j === st.jaar ? "selected" : ""}>${j}</option>`).join("");
  $("#cyclusKeuze").innerHTML = Object.entries(RAPPORTEN).map(([k, r]) => knop(r.label, st.rapport === k, `data-rap="${k}"`)).join("");
  $("#n1").classList.toggle("ok", !!(st.klas && st.leerling));
}
document.addEventListener("click", e => {
  const b = e.target.closest("button.choice"); if (!b) return;
  if (b.dataset.ov){ if (st.ov !== b.dataset.ov){ st.ov = b.dataset.ov; st.klas = null; st.leerling = null; } }
  else if (b.dataset.klas){ if (st.klas !== b.dataset.klas){ st.klas = b.dataset.klas; st.leerling = null; } }
  else if (b.dataset.ll) st.leerling = b.dataset.ll;
  else if (b.dataset.rap) st.rapport = b.dataset.rap;
  else return;
  laadConcept(); alles();
});
$("#jaar").addEventListener("change", e => { st.jaar = e.target.value; laadConcept(); alles(); });

/* ================= stap 2: bestanden ================= */
document.querySelectorAll(".up input").forEach(inp => {
  const up = inp.closest(".up");
  inp.addEventListener("change", () => { const f = inp.files[0]; if (f) laad(inp.dataset.soort, f); inp.value = ""; });
  inp.addEventListener("dragenter", () => up.classList.add("drag"));
  inp.addEventListener("dragleave", () => up.classList.remove("drag"));
  inp.addEventListener("drop", () => up.classList.remove("drag"));
});
// alle bestanden tegelijk: de app zoekt zelf uit welk bestand wat is
const dropAlles = $("#dropAlles"), dropInp = dropAlles.querySelector("input");
dropInp.addEventListener("change", () => { const fs = [...dropInp.files]; dropInp.value = ""; if (fs.length) laadAlles(fs); });
dropInp.addEventListener("dragenter", () => dropAlles.classList.add("drag"));
dropInp.addEventListener("dragleave", () => dropAlles.classList.remove("drag"));
dropInp.addEventListener("drop", () => dropAlles.classList.remove("drag"));
async function soortVan(file){
  const buf = await file.arrayBuffer(), u8 = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
  if (u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46) return "A";
  if (u8[0] !== 0x50 || u8[1] !== 0x4b) return null;
  let doc;
  try { ({doc} = await leesDocx(buf)); } catch { return null; }
  const tekst = blokken(doc).flat().map(x => x.t).join("\n");
  if (/individueel handelingsplan/i.test(tekst) || /^doelen, aanpak en planning$/im.test(tekst)) return "B";
  if (/^(de jongere|de leerling)\b/im.test(tekst)) return "C";
  return null;
}
async function laadAlles(files){
  const melding = $("#dropSt"), fouten = [], gekozen = {};
  melding.textContent = "";
  for (const f of files){
    let s = null;
    try { s = await soortVan(f); } catch {}
    if (!s){
      fouten.push(/\.doc$/i.test(f.name) ? `${f.name}: oud Word-bestand (.doc), bewaar het eerst als .docx` : `${f.name}: niet herkend`);
      continue;
    }
    if (gekozen[s]) fouten.push(`${f.name} en ${gekozen[s].name} lijken hetzelfde soort bestand; enkel ${f.name} wordt gebruikt`);
    gekozen[s] = f;
  }
  // volgorde A, B, C: het handelingsplan levert de naam, het eindrapport de klas
  for (const s of ["A", "B", "C"]) if (gekozen[s]) await laad(s, gekozen[s]);
  melding.textContent = fouten.join(" · ");
}
function zetStatus(soort, ok, tekst){
  const up = $("#up" + soort);
  up.classList.toggle("done", ok === true); up.classList.toggle("err", ok === false);
  up.querySelector(".st").textContent = tekst;
}
async function laad(soort, file){
  zetStatus(soort, null, "Bezig met lezen…");
  try {
    const buf = await file.arrayBuffer(), u8 = new Uint8Array(buf, 0, 4);
    const isPdf = u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46;
    const isZip = u8[0] === 0x50 && u8[1] === 0x4b;
    if (soort === "A"){
      if (!isPdf) throw new Error("Dit is geen PDF-bestand. Kies de PDF uit de doelkaartjes-tool.");
      st.A = await leesDoelenfiche(buf);
      st.A.bestand = file.name;
      zetStatus("A", true, `✓ ${file.name}: ${st.A.kaarten.length} kaartje${st.A.kaarten.length === 1 ? "" : "s"}`);
    } else {
      if (!isZip) throw new Error(/\.doc$/i.test(file.name) ? "Dit is een oud Word-bestand (.doc). Open het in Word en bewaar het als .docx." : "Dit is geen Word-bestand (.docx).");
      const docx = await leesDocx(buf);
      if (soort === "B"){
        st.B = leesHandelingsplan(docx);
        if (!st.B.doelen.length) throw new Error("Geen doelen gevonden. Is dit wel een individueel handelingsplan?");
        zetStatus("B", true, `✓ ${file.name}: ${st.B.doelen.length} doelen${st.B.naam ? " voor " + st.B.naam : ""}`);
        if (st.klas && !st.leerling && st.B.naam){ st.leerling = st.B.naam; laadConcept(); }
      } else {
        st.C = await leesEindrapport(docx);
        if (!st.C.doelen.length) throw new Error("Geen doelen met evaluatie gevonden. Is dit wel het eindrapport?");
        zetStatus("C", true, `✓ ${file.name}: ${st.C.doelen.length} doelen met evaluatie`);
        if (st.C.klas && !st.klas){ st.ov = st.C.ov; st.klas = st.C.klas; if (st.B && st.B.naam) st.leerling = st.B.naam; laadConcept(); }
      }
    }
    bouwKaarten(soort);
  } catch (err){
    console.error(err);
    zetStatus(soort, false, err.message || "Dit bestand kon niet gelezen worden.");
    if (soort === "A") st.A = null; else if (soort === "B") st.B = null; else st.C = null;
    bouwKaarten(soort);
  }
  alles();
}

/* ---------- A: doelenfiche (PDF) ---------- */
// de doelkaartjes-tool zet elk kaartje als aparte JPEG in de PDF: die halen we eruit
function latin1(u8){ let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return s; }
function pdfJpegs(buf){
  const u8 = new Uint8Array(buf), s = latin1(u8), uit = [];
  const re = /(\d+)\s+\d+\s+obj\s*<<((?:(?!endobj)[\s\S])*?)>>\s*stream(\r\n|\n|\r)/g;
  let m;
  while ((m = re.exec(s))){
    const dict = m[2], start = m.index + m[0].length;
    if (!/\/Subtype\s*\/Image/.test(dict) || !/\/DCTDecode/.test(dict)) continue;
    const w = +(dict.match(/\/Width\s+(\d+)/) || [])[1], h = +(dict.match(/\/Height\s+(\d+)/) || [])[1];
    let len = 0;
    const lm = dict.match(/\/Length\s+(\d+)(\s+\d+\s+R)?/);
    if (lm && !lm[2]) len = +lm[1];
    else if (lm){ const r = new RegExp(`(?:^|\\s)${lm[1]}\\s+\\d+\\s+obj\\s*(\\d+)\\s*endobj`).exec(s); if (r) len = +r[1]; }
    if (!len || u8[start + len - 2] !== 0xFF){
      const e = s.indexOf("endstream", start); if (e < 0) continue;
      len = e - start; while (len > 0 && (u8[start + len - 1] === 10 || u8[start + len - 1] === 13)) len--;
    }
    if (u8[start] === 0xFF && u8[start + 1] === 0xD8) uit.push({bytes: u8.slice(start, start + len), w, h});
    re.lastIndex = start + len;
  }
  return uit;
}
const CW = 186, CH = 82, RAND = 4.2;      // kaartje in mm (zoals in de doelkaartjes-tool)
async function leesDoelenfiche(buf){
  const jpgs = pdfJpegs(buf).filter(j => j.w && j.h && Math.abs(j.w / j.h - CW / CH) < .12);
  if (!jpgs.length) throw new Error("Geen kaartjes gevonden. Gebruik de PDF zoals ze uit de doelkaartjes-tool komt.");
  await fontsKlaar; await document.fonts.load(`700 40px "${FAM}"`);
  const kaarten = [];
  for (const j of jpgs) kaarten.push(await herkenKaart(j));
  return {kaarten};
}
// kleur van de rand -> domein of talent; het nummer rechtsboven vergelijken met zelf getekende nummers
async function herkenKaart(j){
  const blob = new Blob([j.bytes], {type: "image/jpeg"});
  const bmp = await createImageBitmap(blob);
  const cv = document.createElement("canvas"); cv.width = bmp.width; cv.height = bmp.height;
  const ctx = cv.getContext("2d", {willReadFrequently: true}); ctx.drawImage(bmp, 0, 0);
  const sx = cv.width / CW, sy = cv.height / CH;
  const gem = (xm, ym) => { const r = 3, d = ctx.getImageData(Math.round(xm * sx) - r, Math.round(ym * sy) - r, 2 * r + 1, 2 * r + 1).data; const c = [0, 0, 0]; for (let i = 0; i < d.length; i += 4){ c[0] += d[i]; c[1] += d[i + 1]; c[2] += d[i + 2]; } return c.map(v => v / (d.length / 4)); };
  const st3 = [gem(RAND / 2, 30), gem(CW / 2, RAND / 2), gem(CW - RAND / 2, 40)];
  const kleur = [0, 1, 2].map(i => (st3[0][i] + st3[1][i] + st3[2][i]) / 3);
  let soort = "WONEN", bd = Infinity;
  for (const [naam, p] of Object.entries(PAL)){ const c = hexRgb(p.c), dd = c.reduce((a, v, i) => a + (v - kleur[i]) ** 2, 0); if (dd < bd){ bd = dd; soort = naam; } }
  const talent = soort === "TALENT", p = PAL[soort];
  // uitsnede rond het nummer
  const R = CW - RAND, T = RAND, X0 = R - 34, X1 = R - .6, Y0 = T + 10.5, Y1 = T + 22.5;
  const px = Math.round(X0 * sx), py = Math.round(Y0 * sy), pw = Math.round((X1 - X0) * sx), ph = Math.round((Y1 - Y0) * sy);
  const crop = ctx.getImageData(px, py, pw, ph).data;
  const drempel = (lum(hexRgb(p.i)) + lum(hexRgb(p.t))) / 2;
  const masker = new Uint8Array(pw * ph);
  for (let i = 0; i < masker.length; i++) masker[i] = lum([crop[4 * i], crop[4 * i + 1], crop[4 * i + 2]]) < drempel ? 1 : 0;
  const tc = document.createElement("canvas"); tc.width = pw; tc.height = ph;
  const tx = tc.getContext("2d", {willReadFrequently: true});
  const vergelijk = nrs => {
    let best = null, bs = -1;
    for (const nr of nrs){
      tx.fillStyle = "#fff"; tx.fillRect(0, 0, pw, ph);
      tx.fillStyle = "#000"; tx.font = `700 ${12 * sy}px "${FAM}"`; tx.textAlign = "right"; tx.textBaseline = "alphabetic";
      tx.fillText(String(nr), (R - 4.5 - X0) * sx, (T + 21 - Y0) * sy);
      const d = tx.getImageData(0, 0, pw, ph).data; let doors = 0, unie = 0;
      for (let i = 0; i < masker.length; i++){ const a = d[4 * i] < 128 ? 1 : 0, b = masker[i]; if (a & b) doors++; if (a | b) unie++; }
      const sc = unie ? doors / unie : 0;
      if (sc > bs){ bs = sc; best = nr; }
    }
    return [best, bs];
  };
  let [nr, score] = vergelijk(D.doelen.filter(d => talent || d.domein === soort).map(d => d.nr));
  if (score < .5){ const [n2, s2] = vergelijk(D.doelen.map(d => d.nr)); if (s2 > score){ nr = n2; score = s2; } }
  return {nr, talent, score, bytes: j.bytes, url: URL.createObjectURL(blob)};
}

/* ---------- Word-bestanden ---------- */
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const RNS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
async function leesDocx(buf){
  const zip = await JSZip.loadAsync(buf);
  const f = zip.file("word/document.xml"); if (!f) throw new Error("Dit Word-bestand kon niet gelezen worden.");
  const doc = new DOMParser().parseFromString(await f.async("string"), "application/xml");
  return {zip, doc};
}
function alineaTekst(p){
  let s = "";
  for (const n of p.getElementsByTagNameNS(W, "*")){
    if (n.localName === "t") s += n.textContent;
    else if (n.localName === "tab") s += " ";
    else if (n.localName === "br" || n.localName === "cr") s += "\n";
  }
  return kuis(s);
}
// blokken op het hoogste niveau (alinea of tabel), elk met de alinea's in volgorde
function blokken(doc){
  const body = doc.getElementsByTagNameNS(W, "body")[0], uit = [];
  for (const el of body.children){
    if (el.localName === "p") uit.push([{t: alineaTekst(el), p: el}]);
    else if (el.localName === "tbl" || el.localName === "sdt") uit.push([...el.getElementsByTagNameNS(W, "p")].map(p => ({t: alineaTekst(p), p})));
  }
  return uit.map(b => b.filter(x => x.t));
}

/* ---------- B: individueel handelingsplan ---------- */
function leesHandelingsplan({doc}){
  let naam = "";
  const doelen = [];
  for (const blok of blokken(doc)){
    for (const {t} of blok){ const m = t.match(/^Individueel handelingsplan\s+(.+)$/i); if (m && !naam) naam = m[1].trim(); }
    const tx = blok.map(x => x.t);
    const iDoel = tx.findIndex(t => /^doelen, aanpak en planning$/i.test(t));
    if (iDoel < 0) continue;
    const iBegin = tx.findIndex(t => /^beginsituatie$/i.test(t));
    const begin = iBegin >= 0 && iBegin < iDoel ? tx.slice(iBegin + 1, iDoel).join("\n") : "";
    let k = iDoel + 1;
    const pad = tx[k] && tx[k].includes(">") ? tx[k++] : "";
    const doel = tx[k++] || "";
    const delen = {doelstellingen: [], aanpak: [], planning: []};
    let huidig = null;
    for (; k < tx.length; k++){
      const m = tx[k].match(/^(doelstellingen|doelstelling|aanpak|planning)\s*:?$/i);
      if (m){ huidig = m[1].toLowerCase().startsWith("doelstelling") ? "doelstellingen" : m[1].toLowerCase(); continue; }
      if (huidig) delen[huidig].push(tx[k]);
    }
    const nr = zoekDoel(doel);
    doelen.push({nr, doel, pad: pad.replace(/\s*>\s*/g, " · "), begin, doelstellingen: delen.doelstellingen,
                 aanpak: delen.aanpak.join("\n"), planning: delen.planning,
                 talent: /^talent\b/i.test(begin) || /^dit is een talent\.?$/i.test(delen.aanpak.join(" ").trim())});
  }
  const perNr = {};
  for (const d of doelen) if (d.nr && !perNr[d.nr]) perNr[d.nr] = d;
  return {naam, doelen, perNr};
}

/* ---------- C: eindrapport ---------- */
const STATUS_RE = /^(doel voldoende beheerst|doel (niet )?bereikt|goede voortgang|in ontwikkeling|onvoldoende( voortgang)?|beperkte voortgang|geen voortgang|nog niet bereikt|niet bereikt|bereikt|beheerst)\b/i;
function statusKleur(label){
  const l = label.toLowerCase();
  if (/niet|onvoldoende|geen|beperkt/.test(l)) return "oranje";
  if (/beheerst|bereikt/.test(l)) return "groen";
  if (/goede voortgang/.test(l)) return "blauw";
  if (/in ontwikkeling/.test(l)) return "geel";
  return null;
}
async function kleurUitAfbeelding(zip, p){
  try {
    const blip = p.getElementsByTagNameNS("*", "blip")[0]; if (!blip) return null;
    const id = blip.getAttributeNS(RNS, "embed"); if (!id) return null;
    const rels = new DOMParser().parseFromString(await zip.file("word/_rels/document.xml.rels").async("string"), "application/xml");
    const rel = [...rels.getElementsByTagName("Relationship")].find(r => r.getAttribute("Id") === id); if (!rel) return null;
    const f = zip.file("word/" + rel.getAttribute("Target").replace(/^\/?word\//, "")); if (!f) return null;
    const bmp = await createImageBitmap(await f.async("blob"));
    const cv = document.createElement("canvas"); cv.width = bmp.width; cv.height = bmp.height;
    const ctx = cv.getContext("2d"); ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(Math.floor(bmp.width / 2), Math.floor(bmp.height / 2), 1, 1).data;
    let best = null, bd = Infinity;
    for (const [k, rgb] of Object.entries({groen: [81, 195, 39], blauw: [35, 140, 241], geel: [246, 195, 0], oranje: [240, 130, 20]})){
      const dd = rgb.reduce((a, v, i) => a + (v - d[i]) ** 2, 0); if (dd < bd){ bd = dd; best = k; }
    }
    return best;
  } catch { return null; }
}
async function leesEindrapport({zip, doc}){
  const doelen = [];
  let klas = null, ov = null;
  for (const blok of blokken(doc)){
    let cur = null;
    for (const {t, p} of blok){
      for (const [o, ks] of Object.entries(KLASSEN)) if (!klas && ks.includes(t)){ klas = t; ov = o; }
      if (/^(de jongere|de leerling)\b/i.test(t) && !/\(\d\)\s*$/.test(t)){
        const nr = zoekDoel(t);
        if (nr){ cur = {nr, doel: t, doelstellingen: [], status: null, commentaar: [], naStatus: false}; doelen.push(cur); continue; }
      }
      if (!cur) continue;
      const kort = t.length < 70;
      if (kort && (STATUS_RE.test(t) || /,\s*(ASV|BGV)\s*$/i.test(t))){
        const m = t.match(/^(.*?)(?:,\s*(ASV|BGV))?\s*$/i);
        cur.status = {label: m[1].trim(), vak: (m[2] || "").toUpperCase(), kleur: statusKleur(m[1]) || await kleurUitAfbeelding(zip, p) || "oranje"};
        cur.naStatus = true; continue;
      }
      if (/\(\d\)\s*$/.test(t) || !cur.naStatus){ cur.doelstellingen.push(t); cur.naStatus = false; cur.commentaar = []; }
      else cur.commentaar.push(t);
    }
  }
  const perNr = {};
  for (const d of doelen) if (!perNr[d.nr]) perNr[d.nr] = d;
  return {doelen, perNr, klas, ov};
}

/* ================= stap 3: koppelen en controleren ================= */
function bouwKaarten(soort){
  const oud = st.kaarten;
  if (st.A) {
    if (soort === "A" || !oud.some(k => k.img)) st.kaarten = st.A.kaarten.map(k => ({id: ++kaartId, nr: k.nr, talent: k.talent, score: k.score, auto: true, img: {bytes: k.bytes, url: k.url}}));
  } else if (st.B){
    if (soort !== "C" || !oud.length)
      st.kaarten = st.B.doelen.filter(d => d.nr).map(d => ({id: ++kaartId, nr: d.nr, talent: d.talent, score: 1, auto: false, img: null}));
  } else st.kaarten = [];
}
function lijst(){
  return st.kaarten.filter(k => !k.weg && byNr[k.nr])
    .sort((a, b) => (b.talent - a.talent) || (a.nr - b.nr))
    .map(k => ({k, d: byNr[k.nr], ihp: st.B && st.B.perNr[k.nr], er: st.C && st.C.perNr[k.nr]}));
}
const zelfdeTekst = (a, b) => normTekst(a) === normTekst(b);
function renderControle(){
  const sec = $("#controle");
  sec.hidden = !(st.A || st.B || st.C);
  if (sec.hidden) return;
  const items = lijst(), notes = [];
  const metKaart = new Set(items.map(x => x.k.nr));
  if (!st.A && st.B) notes.push({t: "Nog geen doelenfiche: de kaartjes worden zonder prent getekend."});
  if (st.B){
    for (const d of st.B.doelen){
      if (!d.nr) notes.push({bad: true, t: `Doel uit het handelingsplan niet herkend: "${d.doel}". Het staat niet in de lijst van ontwikkelingsdoelen.`});
      else if (!metKaart.has(d.nr)) notes.push({t: `Doel ${d.nr} (${d.doel}) staat in het handelingsplan, maar heeft geen kaartje.`, add: d.nr});
    }
  }
  if (st.C) for (const d of st.C.doelen) if (!metKaart.has(d.nr) && !(st.B && st.B.perNr[d.nr]))
    notes.push({t: `Doel ${d.nr} (${d.doel}) staat in het eindrapport, maar niet in het handelingsplan en heeft geen kaartje.`, add: d.nr});
  if (items.length && !items.some(x => x.k.talent)) notes.push({t: "Er is geen talentkaartje. Duid er hieronder een aan als dat nodig is."});
  const dubbel = items.map(x => x.k.nr).filter((n, i, a) => a.indexOf(n) !== i);
  if (dubbel.length) notes.push({bad: true, t: `Doel ${[...new Set(dubbel)].join(", ")} komt meer dan één keer voor.`});
  $("#notes").innerHTML = notes.map(n => `<div class="note ${n.bad ? "bad" : ""}">${esc(n.t)}${n.add ? ` <button type="button" class="btn ghost" style="padding:2px 10px;margin-left:6px" data-add="${n.add}">Toevoegen</button>` : ""}</div>`).join("");

  $("#check").innerHTML = items.map(({k, d, ihp, er}) => {
    const p = palVan(k.nr, k.talent), tags = [];
    if (k.talent) tags.push(`<span class="tag tal">★ talent</span>`);
    if (k.auto && k.score < .55) tags.push(`<span class="tag wn">nummer nakijken</span>`);
    if (st.B) tags.push(ihp ? `<span class="tag ok">handelingsplan ✓</span>` : `<span class="tag no">niet in handelingsplan</span>`);
    if (st.C){
      if (er && er.status) tags.push(`<span class="tag ok"><span class="dot" style="background:${EVAL[er.status.kleur].kleur}"></span>${esc(er.status.label)}</span>`);
      else tags.push(`<span class="tag no">${er ? "geen evaluatie" : "niet in eindrapport"}</span>`);
    }
    if (ihp && !ihp.doelstellingen.length) tags.push(`<span class="tag wn">geen doelstelling in handelingsplan</span>`);
    if (ihp && er && ihp.doelstellingen.length && er.doelstellingen.length && !zelfdeTekst(ihp.doelstellingen.join(" "), er.doelstellingen.join(" ")))
      tags.push(`<span class="tag wn">doelstelling verschilt met eindrapport</span>`);
    return `<div class="goal" style="--c:${p.c}">
      ${k.img ? `<img src="${k.img.url}" alt="Kaartje ${k.nr}">` : `<div class="noimg">geen kaartje uit de doelenfiche</div>`}
      <div class="t">
        <div class="top">
          <label>Doel <input class="nr" type="number" min="1" max="${D.doelen.length}" value="${k.nr}" data-nr="${k.id}" aria-label="Nummer van het doel"></label>
          <label style="font-size:.9rem"><input type="checkbox" data-tal="${k.id}" ${k.talent ? "checked" : ""}> talent</label>
          <button type="button" class="del" data-weg="${k.id}">weglaten</button>
        </div>
        <div class="ik">${esc(d.ik_doel)}</div>
        <div class="off">${esc(d.domein.toLowerCase())} · ${esc(d.officieel)}</div>
        <div class="tags">${tags.join("")}</div>
      </div></div>`;
  }).join("") || `<p class="hint">Nog geen doelen.</p>`;
  $("#n3").classList.toggle("ok", !!(items.length && notes.every(n => !n.bad)));
}
$("#check").addEventListener("change", e => {
  const id = +(e.target.dataset.nr || e.target.dataset.tal); const k = st.kaarten.find(x => x.id === id); if (!k) return;
  if (e.target.dataset.nr){
    const n = +e.target.value;
    if (!byNr[n]){ toast(`Doel ${e.target.value} bestaat niet (1 tot ${D.doelen.length}).`); e.target.value = k.nr; return; }
    k.nr = n; k.auto = false;
  } else k.talent = e.target.checked;
  alles();
});
document.addEventListener("click", e => {
  const w = e.target.closest("[data-weg]"), a = e.target.closest("[data-add]");
  if (w){ const k = st.kaarten.find(x => x.id === +w.dataset.weg); if (k){ k.weg = true; alles(); } }
  if (a){ const nr = +a.dataset.add; const ihp = st.B && st.B.perNr[nr];
    st.kaarten.push({id: ++kaartId, nr, talent: !!(ihp && ihp.talent), score: 1, auto: false, img: null}); alles(); }
});

/* ================= stap 4: bevindingen en besluit (concept bewaren in deze browser) ================= */
const conceptKey = () => `rapport-concept|${st.klas}|${st.leerling}|${st.jaar}|${st.rapport}`;
function laadConcept(){
  let c = {};
  try { c = JSON.parse(localStorage.getItem(conceptKey()) || "{}"); } catch {}
  $("#asvAan").checked = !!c.asvAan; $("#bgvAan").checked = !!c.bgvAan;
  $("#asv").value = c.asv || ""; $("#bgv").value = c.bgv || ""; $("#besluit").value = c.besluit || "";
  toonBevindingen();
}
function bewaarConcept(){
  if (!st.klas || !st.leerling) return;
  try { localStorage.setItem(conceptKey(), JSON.stringify({asvAan: $("#asvAan").checked, bgvAan: $("#bgvAan").checked,
    asv: $("#asv").value, bgv: $("#bgv").value, besluit: $("#besluit").value})); } catch {}
}
function toonBevindingen(){
  $("#asvBlok").hidden = !$("#asvAan").checked; $("#bgvBlok").hidden = !$("#bgvAan").checked;
  $("#n4").classList.toggle("ok", !!$("#besluit").value.trim());
}
for (const id of ["asvAan", "bgvAan", "asv", "bgv", "besluit"])
  $("#" + id).addEventListener("input", () => {
    if (id === "besluit" && $("#besluit").value.trim()){ $("#besluitFout").hidden = true; $("#besluit").classList.remove("bad"); }
    toonBevindingen(); bewaarConcept(); planVoorbeeld();
  });

/* ================= PDF ================= */
const PW = 210, PH = 297, M = 16, PT = 0.3528;
const INK = "#26303a", MUTED = "#5d6874", SKY = "#86afcf", LINE = "#d9dfe5";
const BOVEN = 36, ONDER = PH - 22;
const info = () => ({
  naam: st.leerling || "", klas: st.klas || "", jaar: st.jaar, rap: RAPPORTEN[st.rapport],
});
function bestandsnaam(){
  const i = info();
  return `${i.naam || "leerling"}_${i.klas || "klas"}_rapport cyclus${i.rap.cyclus}_${i.jaar}.pdf`.replace(/[\\/:*?"<>|]+/g, "-");
}
function logoMaat(dataUrl){ return new Promise(r => { const im = new Image(); im.onload = () => r(im.width / im.height); im.onerror = () => r(3); im.src = dataUrl; }); }
let VERHOUDING = null;
const verhoudingenKlaar = (async () => {
  VERHOUDING = {};
  for (const [k, v] of Object.entries(D.logos)) VERHOUDING[k] = await logoMaat(v);
})();
const imgType = u => u.startsWith("data:image/png") ? "PNG" : "JPEG";
function logo(doc, k, x, y, h, rechts = false){
  const w = h * VERHOUDING[k];
  doc.addImage(D.logos[k], imgType(D.logos[k]), rechts ? x - w : x, y, w, h, "logo-" + k, "FAST");
  return w;
}

function nieuweDoc(){
  const {jsPDF} = window.jspdf;
  const doc = new jsPDF({unit: "mm", format: "a4", compress: true});
  doc.addFileToVFS("AH-R.ttf", D.fonts.regular); doc.addFont("AH-R.ttf", "AH", "normal");
  doc.addFileToVFS("AH-B.ttf", D.fonts.bold); doc.addFont("AH-B.ttf", "AH", "bold");
  doc.addFileToVFS("AH-I.ttf", D.fonts.italic); doc.addFont("AH-I.ttf", "AH", "italic");
  doc.setFont("AH", "normal");
  return doc;
}
const font = (doc, stijl, size, kleur = INK) => { doc.setFont("AH", stijl); doc.setFontSize(size); doc.setTextColor(kleur); };
const lh = size => size * PT * 1.42;
const asc = size => size * PT * .78;

function voorblad(doc, i, voorbeeld){
  logo(doc, "koers", M, 14, 15);
  logo(doc, "styrka", PW - M, 12, 19, true);
  // titel
  font(doc, "bold", 34, INK);
  doc.text(i.rap.titel, PW / 2, 108, {align: "center"});
  const kl = ["WONEN", "WERKEN", "VRIJE TIJD", "OVERKOEPELEND", "TALENT"].map(k => PAL[k].c), bw = 16, gap = 2.5;
  let x = PW / 2 - (kl.length * bw + (kl.length - 1) * gap) / 2;
  for (const c of kl){ doc.setFillColor(c); doc.roundedRect(x, 116, bw, 2.4, 1.2, 1.2, "F"); x += bw + gap; }
  font(doc, "bold", 22, i.naam ? INK : "#9aa3ac");
  doc.text(i.naam || (voorbeeld ? "Naam leerling" : ""), PW / 2, 134, {align: "center"});
  font(doc, "normal", 14, MUTED);
  doc.text([i.klas || (voorbeeld ? "Klas" : ""), `schooljaar ${i.jaar}`].filter(Boolean).join("  ·  "), PW / 2, 144, {align: "center"});
  // evaluatieparameters
  const bx = M + 8, by = 170, bwid = PW - 2 * (M + 8), rij = 10.5, bh = 20 + PARAMETERS.length * rij;
  doc.setDrawColor(SKY); doc.setLineWidth(.6); doc.setFillColor("#f7fafc");
  doc.roundedRect(bx, by, bwid, bh, 4, 4, "FD");
  font(doc, "bold", 13, INK);
  doc.text("Uitleg evaluatieparameters", bx + 9, by + 11);
  PARAMETERS.forEach((p, k) => {
    const y = by + 20 + k * rij;
    doc.setFillColor(EVAL[p.eval].kleur); doc.circle(bx + 12, y, 2.6, "F");
    font(doc, "bold", 11, INK); doc.text(p.naam, bx + 19, y + 1.4);
    font(doc, "normal", 10.5, MUTED); doc.text(p.uitleg, bx + 28, y + 1.4, {maxWidth: bwid - 36});
  });
  // voetnoot Styrka
  const fy = PH - 27;
  doc.setDrawColor(SKY); doc.setLineWidth(.4); doc.line(M, fy, PW - M, fy);
  logo(doc, "evara", M, fy + 4, 11);
  logo(doc, "styrkaOC", PW - M, fy + 5, 9, true);
  font(doc, "normal", 8, INK);
  VOETNOOT_STYRKA.forEach((r, k) => doc.text(r, PW / 2 + 2, fy + 7 + k * 4, {align: "center"}));
}
function koptekst(doc){
  logo(doc, "koers", M, 11, 11);
  logo(doc, "styrka", PW - M, 9.5, 14.5, true);
  doc.setDrawColor(SKY); doc.setLineWidth(.4); doc.line(M, 28, PW - M, 28);
}
function voettekst(doc, i){
  const y = PH - 12;
  doc.setDrawColor(LINE); doc.setLineWidth(.3); doc.line(M, y - 5, PW - M, y - 5);
  font(doc, "normal", 8.5, MUTED);
  doc.text([i.naam, i.klas].filter(Boolean).join("  ·  "), M, y);
  doc.text(`${i.rap.label}  ·  ${i.jaar}`, PW - M, y, {align: "right"});
}
function nieuwePagina(c){ c.doc.addPage(); koptekst(c.doc); c.y = BOVEN; }
function ruimte(c, mm){ if (c.y + mm > ONDER) nieuwePagina(c); }
// tekst met automatische paginaovergang (per regel)
function alinea(c, tekst, {x = M, w = PW - 2 * M, size = 9.5, stijl = "normal", kleur = INK, na = 0} = {}){
  const {doc} = c; font(doc, stijl, size, kleur);
  const regels = doc.splitTextToSize(String(tekst), w), h = lh(size);
  for (const r of regels){
    if (c.y + h > ONDER){ nieuwePagina(c); font(doc, stijl, size, kleur); }
    doc.text(r, x, c.y + asc(size)); c.y += h;
  }
  c.y += na;
}
function kop(c, tekst, {x = M, size = 10.5, nodig = 14} = {}){
  ruimte(c, lh(size) + nodig);
  const {doc} = c; font(doc, "bold", size, INK);
  const by = c.y + asc(size); doc.text(tekst, x, by);
  doc.setDrawColor(INK); doc.setLineWidth(.3); doc.line(x, by + .9, x + doc.getTextWidth(tekst), by + .9);
  c.y += lh(size) + 1.2;
}

// gekleurd kader met dikke rand (zoals een doelkaartje)
function kader(doc, x, y, w, h, kleur){
  const b = w * RAND / CW, r = w * 8 / CW;
  doc.setFillColor(kleur); doc.roundedRect(x, y, w, h, r, r, "F");
  doc.setFillColor("#ffffff"); doc.roundedRect(x + b, y + b, w - 2 * b, h - 2 * b, Math.max(.5, r - b * .8), Math.max(.5, r - b * .8), "F");
  return b;
}
// kaartje zonder prent (als er geen doelenfiche is)
function kaartZonderPrent(doc, x, y, w, h, d, talent){
  const p = palVan(d.nr, talent), b = kader(doc, x, y, w, h, p.c);
  font(doc, "bold", 6, INK); doc.text(talent ? "MIJN TALENT" : d.domein, x + w - b - 3, y + b + 5, {align: "right"});
  font(doc, "bold", 18, p.i); doc.text(String(d.nr), x + w - b - 3, y + b + 13, {align: "right"});
  const wds = d.ik_doel.split(/\s+/), zin = [...wds.slice(0, 2).map(s => s.toUpperCase()), ...wds.slice(2)].join(" ");
  font(doc, "normal", 9, INK);
  const r = doc.splitTextToSize(zin, w - 2 * b - 16);
  r.forEach((l, k) => doc.text(l, x + w / 2, y + h / 2 + 3 + (k - (r.length - 1) / 2) * lh(9), {align: "center"}));
  logo(doc, "koers", x + b + 2.5, y + b + 2.5, 5);
}
// dikke pijl van links naar rechts
function pijl(doc, x1, x2, ym, kleur){
  const sh = 3.6, hh = 9, hl = 4.6;
  doc.setFillColor(kleur);
  doc.rect(x1, ym - sh / 2, x2 - x1 - hl, sh, "F");
  doc.triangle(x2 - hl - .2, ym - hh / 2, x2, ym, x2 - hl - .2, ym + hh / 2, "F");
}

function doelBlok(c, {k, d, ihp, er}, eerste){
  const {doc} = c, p = palVan(k.nr, k.talent);
  const GAP = 14, bw = (PW - 2 * M - GAP) / 2, ch = bw * CH / CW;
  // inhoud van het rechtervak, kleiner zetten tot het past
  const doelTekst = (ihp && ihp.doel) || (er && er.doel) || ("De jongere " + d.officieel);
  const dst = (ihp && ihp.doelstellingen.length ? ihp.doelstellingen : (er && er.doelstellingen) || []).join("\n");
  const pad = (ihp && ihp.pad) || [d.domein.charAt(0) + d.domein.slice(1).toLowerCase(), d.subdomein, d.aspect].filter(Boolean).join(" · ");
  const b = bw * RAND / CW, binW = bw - 2 * b - 8;
  let f = 1, plan;
  const meet = f => {
    const s = {lab: 6.2 * f, doel: 9.6 * f, dst: 8.6 * f};
    font(doc, "bold", s.lab); const padR = doc.splitTextToSize(pad.toUpperCase(), binW);
    font(doc, "bold", s.doel); const doelR = doc.splitTextToSize(doelTekst, binW);
    font(doc, "normal", s.dst); const dstR = dst ? doc.splitTextToSize(dst, binW) : [];
    const h = padR.length * lh(s.lab) + 1.2 + doelR.length * lh(s.doel) + (dst ? 2.2 + lh(s.lab) + dstR.length * lh(s.dst) : 0);
    return {s, padR, doelR, dstR, h};
  };
  do { plan = meet(f); f -= .04; } while (plan.h > ch - 2 * b - 5 && f > .66);
  const rh = Math.max(ch, plan.h + 2 * b + 5);

  // het hele blok samenhouden als het op een lege pagina past; anders loopt de tekst door
  const IN = 16, tw = PW - 2 * M - IN, x = M + IN;
  const tekstH = (t, size) => { font(doc, "normal", size); return doc.splitTextToSize(String(t), tw).length * lh(size); };
  const kopH = lh(10.5) + 1.2;
  const blokH = rh + 7 + 3 * kopH + 3 * 3.5 + 3
    + tekstH((ihp && ihp.begin) || "-", 9.5) + tekstH((ihp && ihp.aanpak) || "-", 9.5)
    + (er && er.status ? lh(9.5) + .8 : 0) + tekstH((er && er.commentaar.join("\n")) || "-", 9.5);
  const scheiding = eerste || c.y <= BOVEN ? 0 : 7;
  if (c.y + scheiding + blokH > ONDER && blokH <= ONDER - BOVEN) nieuwePagina(c);
  else ruimte(c, scheiding + rh + 30);
  if (c.y > BOVEN){ doc.setDrawColor(LINE); doc.setLineWidth(.3); doc.setLineDashPattern([1, 1.2], 0); doc.line(M, c.y, PW - M, c.y); doc.setLineDashPattern([], 0); c.y += 7; }
  const y0 = c.y;
  // links: het kaartje
  if (k.img) doc.addImage(k.img.bytes, "JPEG", M, y0, bw, ch, "kaart-" + k.id, "NONE");
  else kaartZonderPrent(doc, M, y0, bw, ch, d, k.talent);
  // pijl
  pijl(doc, M + bw + 2.4, M + bw + GAP - 2.4, y0 + ch / 2, p.c);
  // rechts: ontwikkelingsdoel en doelstelling
  const rx = M + bw + GAP;
  kader(doc, rx, y0, bw, rh, p.c);
  const tx = rx + b + 4; let ty = y0 + b + 2.5 + Math.max(0, (rh - 2 * b - 5 - plan.h) / 2);
  const {s} = plan;
  font(doc, "bold", s.lab, p.i); for (const r of plan.padR){ doc.text(r, tx, ty + asc(s.lab)); ty += lh(s.lab); }
  ty += 1.2;
  font(doc, "bold", s.doel, INK); for (const r of plan.doelR){ doc.text(r, tx, ty + asc(s.doel)); ty += lh(s.doel); }
  if (dst){
    ty += 2.2;
    font(doc, "bold", s.lab, p.i); doc.text("DOELSTELLING", tx, ty + asc(s.lab), {charSpace: .15}); ty += lh(s.lab);
    font(doc, "normal", s.dst, INK); for (const r of plan.dstR){ doc.text(r, tx, ty + asc(s.dst)); ty += lh(s.dst); }
  }
  c.y = y0 + rh + 7;

  // onder de kaders: bolletje links, tekst ingesprongen
  const kleur = er && er.status ? EVAL[er.status.kleur].kleur : null;
  if (kleur){ doc.setFillColor(kleur); doc.circle(M + 6, c.y + 3.2, 3.4, "F"); }
  else { doc.setDrawColor("#b9c0c7"); doc.setLineWidth(.5); doc.setLineDashPattern([.8, .8], 0); doc.circle(M + 6, c.y + 3.2, 3.2, "S"); doc.setLineDashPattern([], 0); }
  const leeg = t => alinea(c, t, {x, w: tw, stijl: "italic", kleur: "#8a939c", na: 3.5});
  kop(c, "Beginsituatie", {x});
  if (ihp && ihp.begin) alinea(c, ihp.begin, {x, w: tw, na: 3.5}); else leeg("Geen beginsituatie in het handelingsplan.");
  kop(c, "Aanpak", {x});
  if (ihp && ihp.aanpak) alinea(c, ihp.aanpak, {x, w: tw, na: 3.5}); else leeg("Geen aanpak in het handelingsplan.");
  kop(c, "Evaluatie", {x});
  if (er && er.status){
    alinea(c, er.status.label + (er.status.vak ? ` (${er.status.vak})` : ""), {x, w: tw, stijl: "bold", kleur: INK, na: .8});
  }
  if (er && er.commentaar.length) alinea(c, er.commentaar.join("\n"), {x, w: tw, na: 3.5});
  else if (!er || !er.status) leeg("Nog geen evaluatie in het eindrapport.");
  else c.y += 3;
  c.y += 3;
}

function slot(c, voorbeeld){
  const {doc} = c;
  nieuwePagina(c);
  const asv = $("#asvAan").checked, bgv = $("#bgvAan").checked;
  const plaats = (t, w = "Nog in te vullen.") => t.trim() ? alinea(c, t.trim(), {na: 5}) : alinea(c, voorbeeld ? w : "", {stijl: "italic", kleur: "#8a939c", na: 5});
  if (asv || bgv){
    kop(c, "Algemene bevindingen", {size: 13, nodig: 20}); c.y += 2;
    if (asv){ ruimte(c, 16); alinea(c, "ASV", {size: 11, stijl: "bold", na: 1}); plaats($("#asv").value); }
    if (bgv){ ruimte(c, 16); alinea(c, "BGV", {size: 11, stijl: "bold", na: 1}); plaats($("#bgv").value); }
    c.y += 3;
  }
  kop(c, "Besluit", {size: 13, nodig: 16}); c.y += 2;
  plaats($("#besluit").value, "Het besluit is nog niet ingevuld (verplicht).");
  c.y += 4;
  // ondertekenen: vier vakken
  const zones = ["Directie", "Klastitularissen", "Ouder(s) / Voogd / Opvoeders", "Leerling zelf"];
  const gap = 8, zw = (PW - 2 * M - gap) / 2, zh = 34;
  ruimte(c, 14 + 2 * zh + gap);
  kop(c, "Ondertekenen", {size: 13, nodig: 2 * zh + gap}); c.y += 3;
  zones.forEach((z, k) => {
    const x = M + (k % 2) * (zw + gap), y = c.y + Math.floor(k / 2) * (zh + gap);
    doc.setDrawColor(LINE); doc.setLineWidth(.4); doc.roundedRect(x, y, zw, zh, 3, 3, "S");
    font(doc, "bold", 10.5, INK); doc.text(z, x + 5, y + 8);
    doc.setDrawColor("#b9c0c7"); doc.setLineWidth(.3); doc.line(x + 5, y + zh - 9, x + zw - 5, y + zh - 9);
    font(doc, "normal", 7.5, MUTED); doc.text("Datum en handtekening", x + 5, y + zh - 4.5);
  });
  c.y += 2 * zh + gap;
}

async function maakPdf(voorbeeld){
  await verhoudingenKlaar;
  const i = info(), doc = nieuweDoc();
  doc.setProperties({title: `${i.rap.label} ${i.naam} ${i.jaar}`.trim(), subject: "Rapport", creator: "Styrka @waterkant - rapport-app"});
  voorblad(doc, i, voorbeeld);
  doc.addPage();                                   // pagina 2 blijft leeg
  const c = {doc, y: 0};
  nieuwePagina(c);
  lijst().forEach((g, n) => doelBlok(c, g, n === 0));
  slot(c, voorbeeld);
  const n = doc.getNumberOfPages();
  for (let p = 3; p <= n; p++){ doc.setPage(p); voettekst(doc, i); }
  return doc;
}

/* ================= voorbeeld en export ================= */
let pvTimer, pvUrl, pvBezig = false, pvOpnieuw = false;
function planVoorbeeld(){ clearTimeout(pvTimer); pvTimer = setTimeout(maakVoorbeeld, 600); }
async function maakVoorbeeld(){
  if (pvBezig){ pvOpnieuw = true; return; }
  pvBezig = true; $("#pvState").textContent = "bijwerken…";
  try {
    const doc = await maakPdf(true);
    const url = URL.createObjectURL(doc.output("blob"));
    let fr = $("#frame iframe");
    if (!fr){ $("#frame").innerHTML = ""; fr = document.createElement("iframe"); fr.title = "Voorbeeld van het rapport"; $("#frame").appendChild(fr); }
    fr.src = url + "#view=FitH";
    if (pvUrl) setTimeout((u => () => URL.revokeObjectURL(u))(pvUrl), 4000);
    pvUrl = url;
    $("#pvState").textContent = `${doc.getNumberOfPages()} pagina's`;
  } catch (e){ console.error(e); $("#pvState").textContent = "voorbeeld mislukt"; }
  pvBezig = false;
  if (pvOpnieuw){ pvOpnieuw = false; planVoorbeeld(); }
}
$("#pdfBtn").addEventListener("click", async () => {
  const fouten = [];
  if (!st.klas) fouten.push("kies een klas");
  if (!st.leerling) fouten.push("kies een leerling");
  if (!lijst().length) fouten.push("laad de doelenfiche en het handelingsplan");
  const besluitLeeg = !$("#besluit").value.trim();
  $("#besluitFout").hidden = !besluitLeeg; $("#besluit").classList.toggle("bad", besluitLeeg);
  if (besluitLeeg) fouten.push("vul het besluit in");
  if (fouten.length){
    $("#pdfFout").hidden = false; $("#pdfFout").textContent = "Nog niet klaar: " + fouten.join(", ") + ".";
    if (besluitLeeg) $("#besluit").focus();
    return;
  }
  $("#pdfFout").hidden = true;
  const btn = $("#pdfBtn"); btn.disabled = true; btn.textContent = "PDF wordt gemaakt…";
  try { (await maakPdf(false)).save(bestandsnaam()); }
  catch (e){ console.error(e); toast("Er ging iets mis bij het maken van de PDF."); }
  finally { btn.disabled = false; btn.textContent = "Download PDF"; }
});

function alles(){
  renderKeuzes();
  renderControle();
  $("#n2").classList.toggle("ok", !!(st.A && st.B && st.C));
  $("#fname").textContent = st.klas && st.leerling ? bestandsnaam() : "";
  planVoorbeeld();
}
laadConcept();
alles();
