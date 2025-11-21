// --- Utility helpers ---
const rand = (a=0,b=1) => a + Math.random()*(b-a);
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
function rgbToStr(c){return `rgb(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])})`}

// Euclidean distance in RGB space (simple)
function colorDistance(a,b){
  const dx=a[0]-b[0], dy=a[1]-b[1], dz=a[2]-b[2];
  return Math.sqrt(dx*dx+dy*dy+dz*dz);
}

function hexToRgb(hex){
  const h = hex.replace('#','');
  const bigint = parseInt(h,16);
  return [(bigint>>16)&255, (bigint>>8)&255, bigint&255];
}

// Convert an RGB array to hex
function rgbToHex(c){
  return '#'+c.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
}

// Blend: result = current*(1-s) + ing*s
function blend(current, ing, s){
  return [current[0]*(1-s)+ing[0]*s, current[1]*(1-s)+ing[1]*s, current[2]*(1-s)+ing[2]*s];
}

// Simple desaturate by moving toward gray
function desaturate(rgb, amount){
  const avg = (rgb[0]+rgb[1]+rgb[2])/3;
  return [rgb[0] + (avg-rgb[0])*amount, rgb[1] + (avg-rgb[1])*amount, rgb[2] + (avg-rgb[2])*amount];
}

// brighten/darken
function adjustBrightness(rgb, factor){
  return rgb.map(v=>clamp(v*factor,0,255));
}

// --- Game state ---
let targetColor = [180,80,200];
let cauldronColor = [10,10,10];
let drops = 0;
let ingredients = [];
// Assist features
// AutoMix can be infinite by using Infinity here
let autoMixUses = Infinity; // uses per round (set to Infinity for unlimited)
let boostAvailable = true; // one-use per round
let boostActive = false; // whether next drop is boosted
const BOOST_MULTIPLIER = 1.6;

const ING_POOL = [
  {id:'dragon', name:'Dragonfruit Extract', color:[238,77,162], strength:0.45, effect:null, desc:'Bright pink, strong.'},
  {id:'moss', name:'Swamp Moss', color:[49,87,41], strength:0.18, effect:'desaturate', desc:'Dark green, weak. Slightly desaturates.'},
  {id:'sky', name:'Sky Dew', color:[142,197,255], strength:0.28, effect:null, desc:'Light blue, medium.'},
  {id:'ember', name:'Ember Spice', color:[255,132,62], strength:0.34, effect:'brighten', desc:'Warm orange, medium-strong. Brightens.'},
  {id:'moon', name:'Moonmilk', color:[240,245,255], strength:0.12, effect:'soften', desc:'Pale and softens contrast.'},
  {id:'void', name:'Void Salt', color:[24,24,30], strength:0.22, effect:'desaturate', desc:'Desaturates and darkens.'},
  {id:'sun', name:'Sunberry Juice', color:[255,225,98], strength:0.30, effect:'brighten', desc:'Makes mixtures warmer and brighter.'},
  {id:'glimmer', name:'Glimmer Dust', color:[193,128,255], strength:0.2, effect:'saturate', desc:'Adds vividness.'}
];

// --- DOM refs ---
const targetBox = document.getElementById('targetBox');
const targetRgb = document.getElementById('targetRgb');
const ingredientsGrid = document.getElementById('ingredients');
const ingredientsList = document.getElementById('ingredientsList');
const cauldronEl = document.getElementById('cauldronColor');
const currentRgb = document.getElementById('currentRgb');
const distanceTxt = document.getElementById('distanceTxt');
const matchFill = document.getElementById('matchFill');
const dropsCount = document.getElementById('dropsCount');
const starsEl = document.getElementById('stars');
const lastResult = document.getElementById('lastResult');
// assist DOM refs
const autoMixBtn = document.getElementById('autoMixBtn');
const autoMixCount = document.getElementById('autoMixCount');
const boostBtn = document.getElementById('boostBtn');
const autoMatchBtn = document.getElementById('autoMatchBtn');
const forceMatchBtn = document.getElementById('forceMatchBtn');

function updateAssistUI(){
  autoMixCount.textContent = isFinite(autoMixUses) ? autoMixUses : '∞';
  autoMixBtn.disabled = (autoMixUses === 0);
  autoMixBtn.style.opacity = autoMixBtn.disabled ? '0.5' : '1';
  boostBtn.disabled = !boostAvailable && !boostActive;
  boostBtn.style.opacity = boostBtn.disabled ? '0.5' : (boostActive ? '0.9' : '1');
  boostBtn.textContent = boostActive ? 'Boost (armed)' : (boostAvailable ? 'Boost' : 'Boost (used)');
  if(autoMatchBtn) autoMatchBtn.disabled = isAutoMatching;
  if(forceMatchBtn) forceMatchBtn.disabled = isAutoMatching;
}

// --- Setup round ---
function newRound(){
  targetColor = [Math.round(rand(20,235)), Math.round(rand(20,235)), Math.round(rand(20,235))];
  // start cauldron as near-black slightly tinted
  cauldronColor = [12,12,12];
  drops = 0;
  // pick 5 random ingredients from pool
  ingredients = shuffle(ING_POOL).slice(0,5).map(i=>Object.assign({}, i));
  // slightly randomize strengths
  ingredients.forEach(i=> i.strength = clamp(i.strength * rand(0.85,1.25), 0.09, 0.6));
  renderRound();
  updateCauldronUI();
  updateMatchUI();
  lastResult.textContent = '—';
}

function shuffle(arr){return arr.slice().sort(()=>Math.random()-0.5)}

function renderRound(){
  targetBox.style.background = rgbToStr(targetColor);
  targetRgb.textContent = rgbToStr(targetColor);

  // render ingredient cards (clickable)
  ingredientsGrid.innerHTML = '';
  ingredientsList.innerHTML = '';
  ingredients.forEach((ing, idx)=>{
    const card = document.createElement('div');
    card.className = 'ingredient';
    card.draggable = true;
    card.dataset.idx = idx;
    card.ondragstart = (e)=>{
      e.dataTransfer.setData('text/plain', idx);
    };
    card.onclick = ()=>{ addIngredient(idx); };

    const sw = document.createElement('div'); sw.className='swatch'; sw.style.background = rgbToStr(ing.color);
    const meta = document.createElement('div'); meta.className='ing-meta';
    const nm = document.createElement('div'); nm.className='ing-name'; nm.textContent = ing.name;
    const desc = document.createElement('div'); desc.className='muted small'; desc.textContent = ing.desc;
    const sbar = document.createElement('div'); sbar.className='strength-bar';
    const sfill = document.createElement('div'); sfill.className='strength-fill'; sfill.style.width = Math.round(ing.strength*100)+'%';
    sbar.appendChild(sfill);
    meta.appendChild(nm); meta.appendChild(desc); meta.appendChild(sbar);
    card.appendChild(sw); card.appendChild(meta);
    ingredientsGrid.appendChild(card);

    // right panel list
    const row = document.createElement('div'); row.className='ingredient'; row.style.cursor='default';
    const sw2 = document.createElement('div'); sw2.className='swatch'; sw2.style.background = rgbToStr(ing.color);
    const meta2 = document.createElement('div'); meta2.className='ing-meta'; meta2.innerHTML = `<div class='ing-name'>${ing.name}</div><div class='muted small'>Strength: ${Math.round(ing.strength*100)}%</div>`;
    row.appendChild(sw2); row.appendChild(meta2);
    ingredientsList.appendChild(row);
  });
}

function updateCauldronUI(){
  cauldronEl.style.background = rgbToStr(cauldronColor);
  dropsCount.textContent = drops;
  currentRgb.textContent = rgbToStr(cauldronColor);
  // small label: hex
  const label = document.getElementById('cauldronLabel');
  label.textContent = rgbToHex(cauldronColor);
}

function updateMatchUI(){
  const dist = colorDistance(cauldronColor, targetColor);
  // map distance (0..441) to match percent
  const maxDist = Math.sqrt(255*255*3);
  const match = Math.max(0, 100 - (dist / maxDist * 100));
  matchFill.style.width = match+'%';
  distanceTxt.textContent = dist.toFixed(1);
  starsEl.textContent = scoreStars(dist);
}

// --- Assist logic: AutoMix & Boost ---
// Choose the ingredient that, if added, would minimize distance to target
function findBestIngredientIndex(){
  if(!ingredients || ingredients.length === 0) return -1;
  let bestIdx = -1;
  let bestDist = Infinity;
  for(let i=0;i<ingredients.length;i++){
    const ing = ingredients[i];
    // simulate strength (do not consume boost here)
    const candidate = blend(cauldronColor, ing.color, ing.strength);
    // approximate effects that change values (only desaturate/brighten/saturate/soften)
    let sim = candidate.slice();
    if(ing.effect === 'desaturate') sim = desaturate(sim, 0.12);
    else if(ing.effect === 'brighten') sim = adjustBrightness(sim, 1.06);
    else if(ing.effect === 'saturate'){ const avg=(sim[0]+sim[1]+sim[2])/3; sim = sim.map(v=>v + (v-avg)*0.08); }
    else if(ing.effect === 'soften') sim = sim.map(v=>v*0.98);
    sim = sim.map(v=>clamp(v,0,255));
    const d = colorDistance(sim, targetColor);
    if(d < bestDist){ bestDist = d; bestIdx = i; }
  }
  return bestIdx;
}

function autoMix(){
  if(autoMixUses <= 0) return;
  const idx = findBestIngredientIndex();
  if(idx === -1) return;
  // use AutoMix to add that ingredient
  addIngredient(idx);
  // decrement only if finite (Infinity - 1 stays Infinity in JS but keep safe semantics)
  if(isFinite(autoMixUses)) autoMixUses = Math.max(0, autoMixUses-1);
  updateAssistUI();
}

function armBoost(){
  if(!boostAvailable) return;
  boostActive = true;
  // keep boostAvailable true until consumed
  updateAssistUI();
}

// AutoMatch: attempt to reach target by repeatedly using AutoMix (greedy)
let isAutoMatching = false;
async function autoMatch(){
  if(isAutoMatching) return;
  isAutoMatching = true;
  updateAssistUI();
  const maxSteps = 40; // safety cap
  const threshold = 4.0; // consider matched when distance < threshold
  for(let step=0; step<maxSteps; step++){
    const dist = colorDistance(cauldronColor, targetColor);
    if(dist <= threshold) break;
    const idx = findBestIngredientIndex();
    if(idx === -1) break;
    addIngredient(idx);
    // small visual pause so the player sees progress
    await new Promise(r=>setTimeout(r, 160));
  }
  const finalDist = colorDistance(cauldronColor, targetColor);
  lastResult.textContent = `AutoMatch finished — distance ${finalDist.toFixed(2)}`;
  isAutoMatching = false;
  updateAssistUI();
}

function forceMatch(){
  // directly set the cauldron to the target color
  cauldronColor = targetColor.slice();
  updateCauldronUI();
  updateMatchUI();
  lastResult.textContent = 'Force match applied.';
}

function scoreStars(dist){
  if(dist < 10) return '⭐⭐⭐';
  if(dist < 30) return '⭐⭐';
  if(dist < 60) return '⭐';
  return '—';
}

// --- Adding ingredients ---
function addIngredient(idx){
  const ing = ingredients[idx];
  if(!ing) return;

  // determine strength (apply boost if active)
  let appliedStrength = ing.strength;
  if(boostActive){
    appliedStrength = clamp(ing.strength * BOOST_MULTIPLIER, 0, 0.95);
  }

  // blend
  cauldronColor = blend(cauldronColor, ing.color, appliedStrength);
  // apply special effects
  if(ing.effect === 'desaturate'){
    cauldronColor = desaturate(cauldronColor, 0.12);
  } else if(ing.effect === 'brighten'){
    cauldronColor = adjustBrightness(cauldronColor, 1.06);
  } else if(ing.effect === 'saturate'){
    // naive saturate: push away from gray
    const avg=(cauldronColor[0]+cauldronColor[1]+cauldronColor[2])/3;
    cauldronColor = cauldronColor.map(v=>v + (v-avg)*0.08);
  } else if(ing.effect === 'soften'){
    // tone down contrast a bit
    cauldronColor = cauldronColor.map(v=>v*0.98);
  }

  cauldronColor = cauldronColor.map(v=>clamp(v,0,255));
  drops++;
  updateCauldronUI();
  updateMatchUI();

  // if boost was active, consume it now
  if(boostActive){ boostActive = false; boostAvailable = false; updateAssistUI(); }

  // animate a small flash on the cauldron
  flashCauldron(ing.color);
}

function onDrop(e){
  e.preventDefault();
  const idx = parseInt(e.dataTransfer.getData('text/plain'));
  addIngredient(idx);
}

function flashCauldron(color){
  const overlay = document.createElement('div');
  overlay.style.position='absolute'; overlay.style.inset='0'; overlay.style.borderRadius='inherit'; overlay.style.pointerEvents='none';
  overlay.style.background = 'radial-gradient(circle at 40% 30%,'+rgbToStr(color)+', transparent 40%)';
  cauldronEl.parentElement.appendChild(overlay);
  setTimeout(()=>{overlay.style.transition='opacity 500ms';overlay.style.opacity='0';},40);
  setTimeout(()=>overlay.remove(),560);
}

// Controls
document.getElementById('resetBtn').addEventListener('click', ()=>{
  cauldronColor = [12,12,12]; drops=0; updateCauldronUI(); updateMatchUI(); lastResult.textContent='Reset.';
});
document.getElementById('newRoundBtn').addEventListener('click', ()=>{ newRound();});

// initial
newRound();

// hook assist buttons
if(autoMixBtn) autoMixBtn.addEventListener('click', ()=>{ autoMix(); });
if(boostBtn) boostBtn.addEventListener('click', ()=>{ armBoost(); });
updateAssistUI();
if(autoMatchBtn) autoMatchBtn.addEventListener('click', ()=>{ autoMatch(); });
if(forceMatchBtn) forceMatchBtn.addEventListener('click', ()=>{ forceMatch(); });

// save last result when user wants to evaluate
// Add a keyboard shortcut: Enter to evaluate
window.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter') evaluateResult();
  if(e.key === ' ') {
    // space quickly add random ingredient
    addIngredient(Math.floor(Math.random()*ingredients.length));
  }
});

function evaluateResult(){
  const dist = colorDistance(cauldronColor, targetColor);
  const s = scoreStars(dist);
  lastResult.textContent = `Distance ${dist.toFixed(2)} — ${s}`;
  // small confetti-like pulse
  const el = document.createElement('div');
  el.style.position='fixed'; el.style.left='50%'; el.style.top='10%'; el.style.transform='translateX(-50%)';
  el.style.padding='10px 14px'; el.style.background='rgba(255,255,255,0.06)'; el.style.borderRadius='10px';
  el.style.fontWeight='700'; el.style.zIndex=9999; el.textContent = `Result: ${s} (dist ${dist.toFixed(1)})`;
  document.body.appendChild(el);
  setTimeout(()=>{el.style.transition='opacity 500ms';el.style.opacity='0'},700);
  setTimeout(()=>el.remove(),1200);
}

// small helper: automatically evaluate when close enough
setInterval(()=>{
  const d = colorDistance(cauldronColor, targetColor);
  if(d < 6){ lastResult.textContent = `Automatic perfect match! (${d.toFixed(2)})` }
},600);
