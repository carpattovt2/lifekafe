'use client'

import { useRef, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────

type TerrainId = 'grass' | 'water' | 'shallow' | 'desert' | 'snow' | 'sand' | 'swamp'
type RoadSub   = 'dirt' | 'main' | 'paved'
type RiverSub  = 'stream' | 'river' | 'wide'
type IllusKind = 'mountain' | 'forest' | 'compass' | 'cartouche'
type ToolId    = 'brush' | 'erase' | 'fill' | 'place' | 'select' | 'pan' | 'text' | 'road' | 'river' | 'illustrate'

interface Stroke         { id:string; kind:'road'|'river'; subtype:string; pts:[number,number][]; width:number }
interface IllustrationObj{ id:string; kind:IllusKind; variant:number; x:number; y:number; size:number; angle:number }
interface UndoEntry      { terrainData:ImageData; strokes:Stroke[]; illus:IllustrationObj[] }
interface ObjDef         { id:string; emoji:string; label:string }
interface PlacedObj      { id:string; typeId:string; emoji:string; label:string; x:number; y:number; size:number }
interface MapLabel       { id:string; text:string; x:number; y:number; fontSize:number; color:string }

// ── Constants ─────────────────────────────────────────────────────────────────

const W = 1400, H = 900, PAT = 96
const PARCHMENT = '#e8dbb0'
const MIN_STROKE_DIST = 5

const TERRAIN_COLOR: Record<TerrainId,string> = {
  grass:'#8a9e52', water:'#4a7090', shallow:'#6a98b2',
  desert:'#c8a030', snow:'#dedad0', sand:'#cca84a', swamp:'#5c6e3a',
}
const TERRAIN_DEFS: {id:TerrainId;label:string}[] = [
  {id:'grass',   label:'Поле'},   {id:'water',  label:'Море'},
  {id:'shallow', label:'Мілина'}, {id:'desert', label:'Пустеля'},
  {id:'swamp',   label:'Болото'}, {id:'sand',   label:'Пісок'},
  {id:'snow',    label:'Сніг'},
]
const ROAD_DEFS:  {id:RoadSub;label:string}[]  = [{id:'dirt',label:'Грунтова'},{id:'main',label:'Мощена'},{id:'paved',label:'Бруківка'}]
const RIVER_DEFS: {id:RiverSub;label:string}[] = [{id:'stream',label:'Струмок'},{id:'river',label:'Річка'},{id:'wide',label:'Широка'}]
const ILLUS_DEFS: {kind:IllusKind;label:string;defaultSize:number}[] = [
  {kind:'mountain',label:'⛰ Гора',  defaultSize:110},
  {kind:'forest',  label:'🌲 Ліс',  defaultSize:80},
  {kind:'compass', label:'✦ Компас',defaultSize:90},
  {kind:'cartouche',label:'▭ Картуш',defaultSize:180},
]
const OBJ_DEFS: ObjDef[] = [
  {id:'castle',emoji:'🏰',label:'Замок'},{id:'city',emoji:'🏙',label:'Місто'},
  {id:'village',emoji:'🏘',label:'Село'},{id:'ruin',emoji:'🏚',label:'Руїни'},
  {id:'tower',emoji:'🗼',label:'Вежа'},{id:'dungeon',emoji:'⚔️',label:'Підземелля'},
  {id:'camp',emoji:'⛺',label:'Табір'},{id:'mine',emoji:'⛏️',label:'Шахта'},
  {id:'bridge',emoji:'🌉',label:'Міст'},{id:'shrine',emoji:'🛕',label:'Вівтар'},
  {id:'portal',emoji:'🌀',label:'Портал'},{id:'skull',emoji:'💀',label:'Небезпека'},
  {id:'star',emoji:'⭐',label:'Ціль'},{id:'dragon',emoji:'🐉',label:'Дракон'},
  {id:'scroll',emoji:'📜',label:'Артефакт'},{id:'crown',emoji:'👑',label:'Столиця'},
]
const STORAGE_KEY = 'sacred-map-editor-v4'

// ── Seeded RNG (shared by terrain patterns and SVG generators) ────────────────

function seededRng(seed: number) {
  let s = (seed*1664525+1013904223)&0x7fffffff
  return () => { s=(s*1664525+1013904223)&0x7fffffff; return s/0x7fffffff }
}

// ── Illustration SVGs ─────────────────────────────────────────────────────────

const MOUNTAIN_SVGS = [
  // 1. single sharp peak
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 65"><g stroke="#3a2a10" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M40,4 L8,61 L72,61 Z" fill="rgba(210,195,155,0.2)" stroke-width="1.4"/><path d="M40,4 L27,24 C34,21 46,21 53,24 Z" fill="rgba(240,235,218,0.65)" stroke-width="1"/><line x1="45" y1="13" x2="55" y2="30" stroke-width="0.7" opacity="0.55"/><line x1="48" y1="20" x2="60" y2="38" stroke-width="0.7" opacity="0.5"/><line x1="51" y1="27" x2="64" y2="46" stroke-width="0.65" opacity="0.45"/><line x1="54" y1="34" x2="67" y2="53" stroke-width="0.6" opacity="0.4"/></g></svg>`,
  // 2. double peak
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 95 65"><g stroke="#3a2a10" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M62,12 L40,62 L84,62 Z" fill="rgba(200,188,148,0.18)" stroke-width="1.1" opacity="0.8"/><path d="M28,5 L2,62 L56,62 Z" fill="rgba(210,195,155,0.22)" stroke-width="1.4"/><path d="M28,5 L18,22 C24,19 32,19 38,22 Z" fill="rgba(240,235,218,0.65)" stroke-width="0.9"/><path d="M62,12 L55,25 C59,23 65,23 69,25 Z" fill="rgba(240,235,218,0.5)" stroke-width="0.8" opacity="0.85"/><line x1="31" y1="13" x2="41" y2="28" stroke-width="0.7" opacity="0.5"/><line x1="34" y1="20" x2="46" y2="36" stroke-width="0.65" opacity="0.45"/><line x1="37" y1="27" x2="50" y2="44" stroke-width="0.6" opacity="0.4"/></g></svg>`,
  // 3. mountain range (3 peaks)
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 115 65"><g stroke="#3a2a10" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M20,20 L2,62 L40,62 Z" fill="rgba(200,188,148,0.18)" stroke-width="1" opacity="0.75"/><path d="M57,4 L27,62 L87,62 Z" fill="rgba(210,195,155,0.24)" stroke-width="1.4"/><path d="M92,16 L72,62 L112,62 Z" fill="rgba(200,188,148,0.16)" stroke-width="1" opacity="0.75"/><path d="M57,4 L46,21 C52,18 62,18 68,21 Z" fill="rgba(240,235,218,0.65)" stroke-width="1"/><path d="M20,20 L14,31 C17,29 23,29 26,31 Z" fill="rgba(240,235,218,0.5)" stroke-width="0.8" opacity="0.8"/><line x1="60" y1="12" x2="70" y2="27" stroke-width="0.7" opacity="0.5"/><line x1="63" y1="19" x2="74" y2="35" stroke-width="0.65" opacity="0.45"/><line x1="66" y1="26" x2="78" y2="43" stroke-width="0.6" opacity="0.4"/><line x1="68" y1="33" x2="80" y2="50" stroke-width="0.55" opacity="0.35"/></g></svg>`,
  // 4. rounded volcanic hill
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 60"><g stroke="#3a2a10" stroke-linecap="round" fill="none"><path d="M40,7 Q18,7 7,56 L73,56 Q62,7 40,7 Z" fill="rgba(210,195,155,0.22)" stroke-width="1.4" stroke-linejoin="round"/><path d="M23,30 Q40,20 57,30" stroke-width="0.85" opacity="0.4"/><path d="M15,44 Q40,30 65,44" stroke-width="0.75" opacity="0.32"/><path d="M10,54 Q40,40 70,54" stroke-width="0.65" opacity="0.25"/><path d="M36,9 Q40,7 44,9" stroke-width="0.8" opacity="0.4"/></g></svg>`,
  // 5. mesa / flat-top plateau
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 63"><g stroke="#3a2a10" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M8,61 L18,34 L30,21 L60,21 L72,34 L82,61 Z" fill="rgba(210,195,155,0.22)" stroke-width="1.4"/><path d="M30,21 L45,15 L60,21" fill="rgba(240,235,218,0.6)" stroke-width="0.9"/><line x1="18" y1="38" x2="10" y2="59" stroke-width="0.75" opacity="0.44"/><line x1="22" y1="37" x2="14" y2="59" stroke-width="0.6" opacity="0.35"/><line x1="72" y1="38" x2="80" y2="59" stroke-width="0.75" opacity="0.44"/><line x1="68" y1="37" x2="76" y2="59" stroke-width="0.6" opacity="0.35"/><line x1="32" y1="23" x2="30" y2="59" stroke-width="0.5" opacity="0.28"/><line x1="58" y1="23" x2="60" y2="59" stroke-width="0.5" opacity="0.28"/></g></svg>`,
  // 6. steep narrow cliff
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 68"><g stroke="#3a2a10" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M35,3 L18,65 L52,65 Z" fill="rgba(210,195,155,0.2)" stroke-width="1.5"/><path d="M35,3 L26,18 C29,15 41,15 44,18 Z" fill="rgba(245,240,225,0.7)" stroke-width="1"/><line x1="41" y1="11" x2="50" y2="30" stroke-width="0.8" opacity="0.5"/><line x1="44" y1="18" x2="54" y2="38" stroke-width="0.7" opacity="0.45"/><line x1="46" y1="25" x2="56" y2="46" stroke-width="0.65" opacity="0.4"/><line x1="47" y1="33" x2="57" y2="54" stroke-width="0.6" opacity="0.35"/></g></svg>`,
  // 7. twin peaks with snow saddle
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 65"><g stroke="#3a2a10" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M30,5 L5,62 L55,62 Z" fill="rgba(210,195,155,0.22)" stroke-width="1.4"/><path d="M60,9 L38,62 L82,62 Z" fill="rgba(205,190,150,0.2)" stroke-width="1.2"/><path d="M30,5 L20,22 C25,19 35,19 39,22 Z" fill="rgba(240,235,218,0.65)" stroke-width="0.9"/><path d="M60,9 L52,24 C56,22 64,22 68,24 Z" fill="rgba(240,235,218,0.6)" stroke-width="0.9"/><path d="M39,22 Q48,30 52,24" stroke-width="0.8" fill="rgba(240,235,218,0.3)"/><line x1="34" y1="13" x2="44" y2="29" stroke-width="0.7" opacity="0.48"/><line x1="37" y1="20" x2="49" y2="37" stroke-width="0.65" opacity="0.42"/></g></svg>`,
  // 8. broad ridged mountain
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 62"><g stroke="#3a2a10" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M55,6 L5,60 L105,60 Z" fill="rgba(210,195,155,0.22)" stroke-width="1.4"/><path d="M55,6 L43,23 C49,20 61,20 67,23 Z" fill="rgba(240,235,218,0.65)" stroke-width="1"/><path d="M16,42 Q55,30 94,42" stroke-width="0.85" opacity="0.35" fill="none"/><path d="M10,52 Q55,38 100,52" stroke-width="0.7" opacity="0.28" fill="none"/><line x1="59" y1="14" x2="70" y2="31" stroke-width="0.7" opacity="0.5"/><line x1="63" y1="21" x2="76" y2="39" stroke-width="0.65" opacity="0.42"/><line x1="67" y1="29" x2="80" y2="47" stroke-width="0.6" opacity="0.36"/></g></svg>`,
  // 9. narrow spire
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 58 72"><g stroke="#3a2a10" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M29,2 L11,68 L47,68 Z" fill="rgba(210,195,155,0.2)" stroke-width="1.4"/><path d="M29,2 L23,15 C25,13 33,13 35,15 Z" fill="rgba(245,240,225,0.72)" stroke-width="0.9"/><line x1="32" y1="8" x2="40" y2="24" stroke-width="0.8" opacity="0.54"/><line x1="34" y1="16" x2="42" y2="33" stroke-width="0.72" opacity="0.47"/><line x1="36" y1="23" x2="44" y2="41" stroke-width="0.65" opacity="0.41"/><line x1="37" y1="31" x2="44" y2="49" stroke-width="0.6" opacity="0.35"/><line x1="38" y1="39" x2="44" y2="57" stroke-width="0.55" opacity="0.3"/></g></svg>`,
  // 10. four-peak panoramic range
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130 65"><g stroke="#3a2a10" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M12,18 L2,62 L24,62 Z" fill="rgba(200,188,148,0.16)" stroke-width="0.9" opacity="0.7"/><path d="M38,6 L15,62 L61,62 Z" fill="rgba(210,195,155,0.24)" stroke-width="1.3"/><path d="M82,9 L56,62 L108,62 Z" fill="rgba(210,195,155,0.22)" stroke-width="1.2"/><path d="M116,20 L104,62 L128,62 Z" fill="rgba(200,188,148,0.16)" stroke-width="0.9" opacity="0.7"/><path d="M38,6 L29,21 C33,18 43,18 47,21 Z" fill="rgba(240,235,218,0.65)" stroke-width="0.9"/><path d="M82,9 L73,23 C77,21 87,21 91,23 Z" fill="rgba(240,235,218,0.6)" stroke-width="0.9"/><line x1="41" y1="14" x2="51" y2="30" stroke-width="0.7" opacity="0.48"/><line x1="44" y1="22" x2="55" y2="38" stroke-width="0.65" opacity="0.42"/><line x1="85" y1="17" x2="93" y2="31" stroke-width="0.65" opacity="0.45"/><line x1="87" y1="24" x2="96" y2="39" stroke-width="0.6" opacity="0.38"/></g></svg>`,
]

const FOREST_SVGS = [
  // 1. single deciduous tree
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 72"><g stroke="#2a3d16" stroke-linecap="round" stroke-linejoin="round" fill="none"><line x1="30" y1="48" x2="30" y2="68" stroke-width="2.8"/><line x1="30" y1="62" x2="20" y2="70" stroke-width="1.6"/><line x1="30" y1="62" x2="40" y2="70" stroke-width="1.6"/><path d="M30,5 C12,5 5,17 5,27 C5,41 15,50 30,50 C45,50 55,41 55,27 C55,17 48,5 30,5 Z" fill="rgba(42,61,22,0.07)" stroke-width="1.4"/><line x1="30" y1="50" x2="30" y2="32" stroke-width="0.85" opacity="0.5"/><line x1="30" y1="39" x2="17" y2="28" stroke-width="0.8" opacity="0.45"/><line x1="30" y1="39" x2="43" y2="28" stroke-width="0.8" opacity="0.45"/><line x1="30" y1="31" x2="21" y2="20" stroke-width="0.7" opacity="0.4"/><line x1="30" y1="31" x2="39" y2="20" stroke-width="0.7" opacity="0.4"/></g></svg>`,
  // 2. pine / conifer
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 75"><g stroke="#2a3d16" stroke-linecap="round" stroke-linejoin="round" fill="none"><line x1="30" y1="60" x2="30" y2="73" stroke-width="2.8"/><path d="M30,5 L12,36 L48,36 Z" fill="rgba(42,61,22,0.08)" stroke-width="1.3"/><path d="M30,24 L10,52 L50,52 Z" fill="rgba(42,61,22,0.09)" stroke-width="1.3"/><path d="M30,41 L14,63 L46,63 Z" fill="rgba(42,61,22,0.09)" stroke-width="1.3"/></g></svg>`,
  // 3. two trees
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 85 72"><g stroke="#2a3d16" stroke-linecap="round" stroke-linejoin="round" fill="none"><line x1="22" y1="44" x2="22" y2="65" stroke-width="2.2"/><path d="M22,9 C11,9 5,18 5,26 C5,37 12,45 22,45 C32,45 39,37 39,26 C39,18 33,9 22,9 Z" fill="rgba(42,61,22,0.07)" stroke-width="1.2"/><line x1="22" y1="45" x2="22" y2="30" stroke-width="0.75" opacity="0.45"/><line x1="22" y1="37" x2="13" y2="27" stroke-width="0.7" opacity="0.4"/><line x1="22" y1="37" x2="31" y2="27" stroke-width="0.7" opacity="0.4"/><line x1="62" y1="49" x2="62" y2="70" stroke-width="2.8"/><path d="M62,5 C47,5 40,16 40,27 C40,41 49,51 62,51 C75,51 84,41 84,27 C84,16 77,5 62,5 Z" fill="rgba(42,61,22,0.07)" stroke-width="1.4"/><line x1="62" y1="51" x2="62" y2="33" stroke-width="0.85" opacity="0.5"/><line x1="62" y1="40" x2="49" y2="29" stroke-width="0.8" opacity="0.45"/><line x1="62" y1="40" x2="75" y2="29" stroke-width="0.8" opacity="0.45"/><line x1="62" y1="32" x2="54" y2="22" stroke-width="0.7" opacity="0.4"/><line x1="62" y1="32" x2="70" y2="22" stroke-width="0.7" opacity="0.4"/></g></svg>`,
  // 4. mixed cluster (pine + deciduous)
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 95 72"><g stroke="#2a3d16" stroke-linecap="round" stroke-linejoin="round" fill="none"><line x1="48" y1="52" x2="48" y2="64" stroke-width="2.2" opacity="0.7"/><path d="M48,8 L34,35 L62,35 Z" fill="rgba(42,61,22,0.07)" stroke-width="1.1" opacity="0.75"/><path d="M48,28 L32,54 L64,54 Z" fill="rgba(42,61,22,0.07)" stroke-width="1.1" opacity="0.75"/><line x1="18" y1="46" x2="18" y2="66" stroke-width="2.4"/><path d="M18,10 C7,10 1,20 1,28 C1,40 8,47 18,47 C28,47 35,40 35,28 C35,20 29,10 18,10 Z" fill="rgba(42,61,22,0.07)" stroke-width="1.3"/><line x1="18" y1="47" x2="18" y2="31" stroke-width="0.8" opacity="0.45"/><line x1="18" y1="38" x2="9" y2="28" stroke-width="0.72" opacity="0.4"/><line x1="18" y1="38" x2="27" y2="28" stroke-width="0.72" opacity="0.4"/><line x1="76" y1="46" x2="76" y2="66" stroke-width="2.4"/><path d="M76,12 C65,12 59,21 59,29 C59,40 66,47 76,47 C86,47 93,40 93,29 C93,21 87,12 76,12 Z" fill="rgba(42,61,22,0.07)" stroke-width="1.3"/><line x1="76" y1="47" x2="76" y2="31" stroke-width="0.8" opacity="0.45"/><line x1="76" y1="38" x2="67" y2="28" stroke-width="0.72" opacity="0.4"/><line x1="76" y1="38" x2="85" y2="28" stroke-width="0.72" opacity="0.4"/></g></svg>`,
  // 5. row of 3 pines
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 72"><g stroke="#2a3d16" stroke-linecap="round" stroke-linejoin="round" fill="none"><line x1="16" y1="58" x2="16" y2="70" stroke-width="2.2"/><path d="M16,12 L5,36 L27,36 Z" fill="rgba(42,61,22,0.08)" stroke-width="1.1"/><path d="M16,30 L5,50 L27,50 Z" fill="rgba(42,61,22,0.09)" stroke-width="1.1"/><line x1="48" y1="54" x2="48" y2="70" stroke-width="2.6"/><path d="M48,7 L33,34 L63,34 Z" fill="rgba(42,61,22,0.08)" stroke-width="1.3"/><path d="M48,26 L32,52 L64,52 Z" fill="rgba(42,61,22,0.09)" stroke-width="1.3"/><path d="M48,43 L37,62 L59,62 Z" fill="rgba(42,61,22,0.09)" stroke-width="1.2"/><line x1="80" y1="58" x2="80" y2="70" stroke-width="2.2"/><path d="M80,14 L69,37 L91,37 Z" fill="rgba(42,61,22,0.08)" stroke-width="1.1"/><path d="M80,32 L69,54 L91,54 Z" fill="rgba(42,61,22,0.09)" stroke-width="1.1"/></g></svg>`,
  // 6. ancient oak wide canopy
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 86 72"><g stroke="#2a3d16" stroke-linecap="round" stroke-linejoin="round" fill="none"><line x1="43" y1="44" x2="43" y2="68" stroke-width="4"/><line x1="43" y1="60" x2="25" y2="70" stroke-width="2.2"/><line x1="43" y1="60" x2="61" y2="70" stroke-width="2.2"/><path d="M43,5 C18,5 6,18 6,30 C6,46 22,52 43,52 C64,52 80,46 80,30 C80,18 68,5 43,5 Z" fill="rgba(42,61,22,0.07)" stroke-width="1.6"/><line x1="43" y1="52" x2="43" y2="28" stroke-width="0.9" opacity="0.5"/><line x1="43" y1="37" x2="24" y2="22" stroke-width="0.85" opacity="0.45"/><line x1="43" y1="37" x2="62" y2="22" stroke-width="0.85" opacity="0.45"/><line x1="43" y1="26" x2="30" y2="14" stroke-width="0.7" opacity="0.38"/><line x1="43" y1="26" x2="56" y2="14" stroke-width="0.7" opacity="0.38"/><line x1="24" y1="22" x2="14" y2="14" stroke-width="0.65" opacity="0.3"/><line x1="62" y1="22" x2="72" y2="14" stroke-width="0.65" opacity="0.3"/></g></svg>`,
  // 7. three deciduous trees varying heights
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 72"><g stroke="#2a3d16" stroke-linecap="round" stroke-linejoin="round" fill="none"><line x1="18" y1="50" x2="18" y2="70" stroke-width="2"/><path d="M18,13 C8,13 2,22 2,30 C2,42 9,51 18,51 C27,51 34,42 34,30 C34,22 28,13 18,13 Z" fill="rgba(42,61,22,0.07)" stroke-width="1.2"/><line x1="18" y1="51" x2="18" y2="34" stroke-width="0.75" opacity="0.44"/><line x1="18" y1="41" x2="9" y2="31" stroke-width="0.7" opacity="0.38"/><line x1="18" y1="41" x2="27" y2="31" stroke-width="0.7" opacity="0.38"/><line x1="48" y1="44" x2="48" y2="68" stroke-width="2.8"/><path d="M48,5 C30,5 22,17 22,27 C22,41 32,51 48,51 C64,51 74,41 74,27 C74,17 66,5 48,5 Z" fill="rgba(42,61,22,0.07)" stroke-width="1.4"/><line x1="48" y1="51" x2="48" y2="30" stroke-width="0.85" opacity="0.48"/><line x1="48" y1="39" x2="34" y2="26" stroke-width="0.8" opacity="0.43"/><line x1="48" y1="39" x2="62" y2="26" stroke-width="0.8" opacity="0.43"/><line x1="48" y1="28" x2="38" y2="17" stroke-width="0.7" opacity="0.38"/><line x1="48" y1="28" x2="58" y2="17" stroke-width="0.7" opacity="0.38"/><line x1="78" y1="52" x2="78" y2="70" stroke-width="2.2"/><path d="M78,18 C68,18 62,27 62,34 C62,45 69,53 78,53 C87,53 94,45 94,34 C94,27 88,18 78,18 Z" fill="rgba(42,61,22,0.07)" stroke-width="1.2"/><line x1="78" y1="53" x2="78" y2="38" stroke-width="0.75" opacity="0.44"/><line x1="78" y1="44" x2="69" y2="35" stroke-width="0.7" opacity="0.38"/><line x1="78" y1="44" x2="87" y2="35" stroke-width="0.7" opacity="0.38"/></g></svg>`,
  // 8. weeping tree
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 75"><g stroke="#2a3d16" stroke-linecap="round" stroke-linejoin="round" fill="none"><line x1="35" y1="30" x2="35" y2="70" stroke-width="3"/><line x1="35" y1="60" x2="20" y2="72" stroke-width="1.8"/><line x1="35" y1="60" x2="50" y2="72" stroke-width="1.8"/><path d="M35,5 C20,5 14,16 14,24 C14,32 20,36 35,36 C50,36 56,32 56,24 C56,16 50,5 35,5 Z" fill="rgba(42,61,22,0.07)" stroke-width="1.3"/><path d="M14,24 C10,30 8,40 13,50" stroke-width="0.9" opacity="0.38"/><path d="M56,24 C60,30 62,40 57,50" stroke-width="0.9" opacity="0.38"/><path d="M24,36 C18,44 17,54 22,62" stroke-width="0.8" opacity="0.34"/><path d="M46,36 C52,44 53,54 48,62" stroke-width="0.8" opacity="0.34"/><path d="M35,36 C33,46 32,57 35,66" stroke-width="0.75" opacity="0.32"/></g></svg>`,
  // 9. sapling cluster
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 85 65"><g stroke="#2a3d16" stroke-linecap="round" stroke-linejoin="round" fill="none"><line x1="12" y1="44" x2="12" y2="60" stroke-width="1.6"/><path d="M12,18 C6,18 2,25 2,30 C2,38 6,44 12,44 C18,44 22,38 22,30 C22,25 18,18 12,18 Z" fill="rgba(42,61,22,0.07)" stroke-width="1"/><line x1="32" y1="38" x2="32" y2="58" stroke-width="1.8"/><path d="M32,10 C24,10 18,19 18,26 C18,35 24,39 32,39 C40,39 46,35 46,26 C46,19 40,10 32,10 Z" fill="rgba(42,61,22,0.08)" stroke-width="1.1"/><line x1="32" y1="39" x2="32" y2="25" stroke-width="0.7" opacity="0.42"/><line x1="55" y1="42" x2="55" y2="60" stroke-width="1.6"/><path d="M55,16 C47,16 42,24 42,30 C42,38 47,43 55,43 C63,43 68,38 68,30 C68,24 63,16 55,16 Z" fill="rgba(42,61,22,0.07)" stroke-width="1"/><line x1="73" y1="50" x2="73" y2="62" stroke-width="1.4"/><path d="M73,30 C67,30 63,36 63,41 C63,48 67,51 73,51 C79,51 83,48 83,41 C83,36 79,30 73,30 Z" fill="rgba(42,61,22,0.06)" stroke-width="0.9"/></g></svg>`,
  // 10. dense bush / thicket
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 60"><g stroke="#2a3d16" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M14,55 C4,55 1,46 5,40 C2,34 6,28 13,28 C13,20 19,15 26,18 C29,10 39,10 41,18 C47,12 57,15 57,24 C63,20 70,25 70,32 C76,30 83,36 80,44 C84,51 78,57 71,55 Z" fill="rgba(42,61,22,0.07)" stroke-width="1.4"/><path d="M9,42 C8,36 12,32 16,34" stroke-width="0.8" opacity="0.38"/><path d="M25,20 C27,15 33,15 35,20" stroke-width="0.8" opacity="0.36"/><path d="M51,16 C55,13 61,15 60,21" stroke-width="0.8" opacity="0.36"/><path d="M66,27 C70,23 76,26 74,31" stroke-width="0.8" opacity="0.36"/><path d="M28,55 Q42,46 57,55" stroke-width="0.7" opacity="0.28"/></g></svg>`,
]

// ── Procedural SVG generators (25 extra variants each) ───────────────────────

function genMtnSVG(seed: number): string {
  const rng = seededRng(seed * 6271 + 17)
  const nP = 1 + Math.floor(rng() * 2.8)
  const VW = 60 + Math.round(rng() * 70)
  const VH = 58 + Math.round(rng() * 14)
  const bY = VH - 2
  const slot = VW / nP
  const pks: [number,number,number,number][] = []
  for (let i = 0; i < nP; i++) {
    const cx = Math.round(slot * (i + 0.35 + rng() * 0.3))
    const isMain = nP === 1 || i === Math.floor(nP / 2)
    const ty = Math.round(isMain ? 4 + rng() * 14 : 10 + rng() * 20)
    const hw = Math.round(slot * (0.32 + rng() * 0.22))
    pks.push([cx, ty, Math.max(2, cx - hw), Math.min(VW - 2, cx + Math.round(hw * (0.85 + rng() * 0.3)))])
  }
  pks.sort((a, b) => b[1] - a[1])
  let o = ''
  pks.forEach(([cx, ty, bL, bR], idx) => {
    const m = idx === pks.length - 1
    o += `<path d="M${cx},${ty} L${bL},${bY} L${bR},${bY} Z" fill="rgba(210,195,155,${m?'0.22':'0.16'})" stroke-width="${m?'1.4':'1.0'}"${m?'':' opacity="0.75"'}/>`
    const hw = Math.min(bR - cx, cx - bL) * 0.3
    const sB = (ty + hw * 1.5).toFixed(1)
    o += `<path d="M${cx},${ty} L${(cx-hw).toFixed(1)},${sB} C${(cx-hw*.5).toFixed(1)},${(ty+hw).toFixed(1)} ${(cx+hw*.5).toFixed(1)},${(ty+hw).toFixed(1)} ${(cx+hw).toFixed(1)},${sB} Z" fill="rgba(240,235,218,${m?'0.65':'0.45'})" stroke-width="${m?'0.9':'0.75'}"/>`
    const hC = 3 + Math.floor(rng() * 2)
    for (let h = 0; h < hC; h++) {
      const t = (h + 1) / (hC + 1)
      o += `<line x1="${(cx+(bR-cx)*t*.62).toFixed(1)}" y1="${(ty+(bY-ty)*t*.92).toFixed(1)}" x2="${(cx+(bR-cx)*Math.min(1,t*.62+.14)).toFixed(1)}" y2="${(ty+(bY-ty)*Math.min(1,t*.92+.12)).toFixed(1)}" stroke-width="0.7" opacity="${(0.55-t*.18).toFixed(2)}"/>`
    }
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}"><g stroke="#3a2a10" stroke-linecap="round" stroke-linejoin="round" fill="none">${o}</g></svg>`
}

function genForestSVG(seed: number): string {
  const rng = seededRng(seed * 5381 + 23)
  const n = 1 + Math.floor(rng() * 3.5)
  const VW = 45 + n * 18 + Math.round(rng() * 18)
  const VH = 62 + Math.round(rng() * 14)
  const bY = VH - 2
  const slot = VW / n
  let o = ''
  for (let i = 0; i < n; i++) {
    const cx = slot * (i + 0.3 + rng() * 0.4)
    const pine = rng() < 0.5
    const sc = 0.7 + rng() * 0.55
    const tH = Math.round(38 * sc)
    const tW = Math.round(25 * sc)
    const topY = bY - tH - Math.round(rng() * 8)
    const trTop = bY - Math.round(6 + rng() * 8)
    o += `<line x1="${cx.toFixed(1)}" y1="${trTop}" x2="${cx.toFixed(1)}" y2="${bY}" stroke-width="${(2+sc*1.2).toFixed(1)}"/>`
    if (pine) {
      const tiers = 2 + Math.round(rng())
      for (let t = 0; t < tiers; t++) {
        const py = topY + (trTop - topY) * (t / tiers)
        const pw = tW * (0.45 + (t + 1) / (tiers + 0.5) * 0.65)
        const pb = topY + (trTop - topY) * ((t + 1) / tiers)
        o += `<path d="M${cx.toFixed(1)},${py.toFixed(1)} L${(cx-pw).toFixed(1)},${pb.toFixed(1)} L${(cx+pw).toFixed(1)},${pb.toFixed(1)} Z" fill="rgba(42,61,22,0.08)" stroke-width="${(1+sc*.3).toFixed(1)}"/>`
      }
    } else {
      const r = tW * 0.54
      const cy = topY + r * 0.9
      o += `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${(r*1.25).toFixed(1)}" ry="${r.toFixed(1)}" fill="rgba(42,61,22,0.07)" stroke-width="${(1.2+sc*.2).toFixed(1)}"/>`
      o += `<line x1="${cx.toFixed(1)}" y1="${(cy+r).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${cy.toFixed(1)}" stroke-width="0.8" opacity="0.48"/>`
      o += `<line x1="${cx.toFixed(1)}" y1="${(cy+r*.3).toFixed(1)}" x2="${(cx-r*.7).toFixed(1)}" y2="${(cy-r*.3).toFixed(1)}" stroke-width="0.7" opacity="0.4"/>`
      o += `<line x1="${cx.toFixed(1)}" y1="${(cy+r*.3).toFixed(1)}" x2="${(cx+r*.7).toFixed(1)}" y2="${(cy-r*.3).toFixed(1)}" stroke-width="0.7" opacity="0.4"/>`
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}"><g stroke="#2a3d16" stroke-linecap="round" stroke-linejoin="round" fill="none">${o}</g></svg>`
}

const ALL_MOUNTAIN_SVGS = [...MOUNTAIN_SVGS, ...Array.from({length:25},(_,i)=>genMtnSVG(i+1))]
const ALL_FOREST_SVGS   = [...FOREST_SVGS,   ...Array.from({length:25},(_,i)=>genForestSVG(i+1))]

function makeCompassSVG(): string {
  const ticks = Array.from({length:32},(_,i)=>{
    if (i%4===0) return ''
    const a = i/32*Math.PI*2 - Math.PI/2
    const x1=(50+Math.cos(a)*40).toFixed(1), y1=(50+Math.sin(a)*40).toFixed(1)
    const x2=(50+Math.cos(a)*43).toFixed(1), y2=(50+Math.sin(a)*43).toFixed(1)
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="#3a2a10" fill="#3a2a10" stroke-linecap="round"><polygon points="50,6 46,44 50,50 54,44"/><polygon points="50,94 46,56 50,50 54,56" fill="#7a5a30" opacity="0.7"/><polygon points="94,50 56,46 50,50 56,54"/><polygon points="6,50 44,46 50,50 44,54" fill="#7a5a30" opacity="0.7"/><polygon points="79,21 59,46 54,41" opacity="0.6"/><polygon points="79,79 59,54 54,59" opacity="0.6"/><polygon points="21,79 41,54 46,59" opacity="0.6"/><polygon points="21,21 41,46 46,41" opacity="0.6"/><circle cx="50" cy="50" r="42" fill="none" stroke-width="1.2" opacity="0.3"/><circle cx="50" cy="50" r="8" fill="rgba(232,219,176,0.95)" stroke-width="1.4"/><circle cx="50" cy="50" r="3.5" fill="#3a2a10" stroke="none"/><text x="50" y="2" text-anchor="middle" dominant-baseline="hanging" font-family="Georgia,serif" font-size="9" font-weight="bold" stroke="none">N</text><g stroke-width="0.8" opacity="0.4">${ticks}</g></g></svg>`
}

function makeCartoucheSVG(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 100"><g stroke="#3a2a10" fill="none"><rect x="6" y="6" width="168" height="88" rx="5" fill="rgba(232,219,176,0.45)" stroke-width="1.8"/><rect x="11" y="11" width="158" height="78" rx="3" stroke-width="0.9" opacity="0.55"/><g stroke-width="1.3" opacity="0.7"><path d="M6,22 Q6,6 22,6"/><path d="M6,18 Q6,6 18,6" opacity="0.5"/><circle cx="8" cy="8" r="2.5" fill="#3a2a10" stroke="none" opacity="0.6"/><path d="M158,6 Q174,6 174,22"/><path d="M162,6 Q174,6 174,18" opacity="0.5"/><circle cx="172" cy="8" r="2.5" fill="#3a2a10" stroke="none" opacity="0.6"/><path d="M6,78 Q6,94 22,94"/><path d="M6,82 Q6,94 18,94" opacity="0.5"/><circle cx="8" cy="92" r="2.5" fill="#3a2a10" stroke="none" opacity="0.6"/><path d="M158,94 Q174,94 174,78"/><path d="M162,94 Q174,94 174,82" opacity="0.5"/><circle cx="172" cy="92" r="2.5" fill="#3a2a10" stroke="none" opacity="0.6"/></g><line x1="20" y1="26" x2="160" y2="26" stroke-width="0.7" opacity="0.4"/><line x1="20" y1="74" x2="160" y2="74" stroke-width="0.7" opacity="0.4"/><path d="M6,42 C2,42 2,58 6,58" stroke-width="1" opacity="0.45"/><path d="M174,42 C178,42 178,58 174,58" stroke-width="1" opacity="0.45"/></g></svg>`
}

function getIllusSVG(ill: IllustrationObj): string {
  if (ill.kind==='mountain') return ALL_MOUNTAIN_SVGS[ill.variant % ALL_MOUNTAIN_SVGS.length]
  if (ill.kind==='forest')   return ALL_FOREST_SVGS[ill.variant % ALL_FOREST_SVGS.length]
  if (ill.kind==='compass')  return makeCompassSVG()
  return makeCartoucheSVG()
}

// ── SVG terrain patterns ──────────────────────────────────────────────────────
function wave(y: number, A: number, S=PAT): string {
  const h=S/2
  return `M0,${y} C${S*.14},${y-A} ${S*.36},${y-A} ${h},${y} C${S*.64},${y+A} ${S*.86},${y+A} ${S},${y}`
}
function scatter(n:number,S:number,seed:number,rMin=0.5,rMax=1.5):[number,number,number][] {
  const rng=seededRng(seed)
  return Array.from({length:n},()=>[rng()*S,rng()*S,rMin+rng()*(rMax-rMin)])
}

function makeSVG(id: TerrainId|'erase'): string {
  const S=PAT
  const fill = id==='erase' ? PARCHMENT : TERRAIN_COLOR[id as TerrainId]
  const bg = `<rect width="${S}" height="${S}" fill="${fill}"/>`
  let body = ''

  if (id==='water') {
    body=`<g stroke="rgba(255,255,255,0.32)" stroke-width="1.4" fill="none">${[8,22,36,50,64,78,90].map(y=>`<path d="${wave(y,3)}"/>`).join('')}</g><g stroke="rgba(255,255,255,0.12)" stroke-width="0.7" fill="none">${[15,29,43,57,71,85].map(y=>`<path d="${wave(y,2.5)}"/>`).join('')}</g>`
  } else if (id==='shallow') {
    body=`<g stroke="rgba(255,255,255,0.4)" stroke-width="1.1" fill="none">${[6,16,26,36,46,56,66,76,86].map(y=>`<path d="${wave(y,2)}"/>`).join('')}</g>`
  } else if (id==='swamp') {
    body=`<g fill="rgba(0,0,0,0.24)"><circle cx="22" cy="20" r="9"/><circle cx="70" cy="16" r="8"/><circle cx="40" cy="56" r="11"/><circle cx="76" cy="74" r="9"/></g><g stroke="rgba(0,0,0,0.2)" stroke-width="1" fill="none">${[44,68].map(y=>`<path d="${wave(y,3.5)}"/>`).join('')}</g><g stroke="rgba(0,0,0,0.38)" stroke-width="1.3" stroke-linecap="round" fill="none"><line x1="10" y1="90" x2="10" y2="72"/><line x1="8" y1="78" x2="14" y2="73"/><line x1="52" y1="90" x2="52" y2="70"/><line x1="50" y1="76" x2="56" y2="71"/></g>`
  } else if (id==='desert') {
    const dots=scatter(70,S,33,0.5,1.6).map(([x,y,r])=>`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"/>`).join('')
    const light=scatter(28,S,34,0.4,1.0).map(([x,y,r])=>`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"/>`).join('')
    body=`<g fill="rgba(0,0,0,0.26)">${dots}</g><g fill="rgba(255,235,150,0.22)">${light}</g>`
  } else if (id==='sand') {
    const dots=scatter(30,S,55,0.4,1.2).map(([x,y,r])=>`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"/>`).join('')
    body=`<g stroke="rgba(0,0,0,0.14)" stroke-width="0.9" fill="none">${[10,24,38,52,66,80,92].map(y=>`<path d="${wave(y,2.5)}"/>`).join('')}</g><g fill="rgba(0,0,0,0.2)">${dots}</g>`
  } else if (id==='grass') {
    const rng=seededRng(19)
    const blades=Array.from({length:24},()=>{const x=rng()*S,y=rng()*S,h=3+rng()*5,lean=(rng()-.5)*5;return `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x+lean).toFixed(1)}" y2="${(y-h).toFixed(1)}"/>`}).join('')
    body=`<g stroke="rgba(0,0,0,0.2)" stroke-width="0.9" stroke-linecap="round" fill="none">${blades}</g>`
  } else if (id==='snow') {
    const dots=scatter(22,S,7,0.5,2.2).map(([x,y,r])=>`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"/>`).join('')
    const flakes=scatter(8,S,14,3,4.5).map(([cx,cy,r])=>Array.from({length:6},(_,i)=>{const a=i*Math.PI/3;return `<line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${(cx+Math.cos(a)*r).toFixed(1)}" y2="${(cy+Math.sin(a)*r).toFixed(1)}"/>`}).join('')).join('')
    body=`<g fill="rgba(140,160,210,0.3)">${dots}</g><g stroke="rgba(140,160,210,0.45)" stroke-width="0.6" stroke-linecap="round">${flakes}</g>`
  } else if (id==='erase') {
    const dots=scatter(32,S,9,0.4,1.8).map(([x,y,r])=>`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"/>`).join('')
    body=`<g fill="rgba(120,80,30,0.09)">${dots}</g>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">${bg}${body}</svg>`
}

function buildPatterns(ctx: CanvasRenderingContext2D, ref: React.MutableRefObject<Partial<Record<TerrainId|'erase', CanvasPattern>>>): Promise<void> {
  const ids: (TerrainId|'erase')[] = [...TERRAIN_DEFS.map(t=>t.id),'erase']
  return Promise.all(ids.map(id=>new Promise<void>(resolve=>{
    const blob=new Blob([makeSVG(id)],{type:'image/svg+xml'})
    const url=URL.createObjectURL(blob)
    const img=new Image()
    img.onload=()=>{const pat=ctx.createPattern(img,'repeat');if(pat)ref.current[id]=pat;URL.revokeObjectURL(url);resolve()}
    img.onerror=()=>{URL.revokeObjectURL(url);resolve()}
    img.src=url
  }))).then(()=>{})
}

// ── Flood fill ────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number,number,number] {
  return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)]
}

function floodFill(ctx: CanvasRenderingContext2D, sx: number, sy: number, hex: string) {
  sx=Math.floor(sx);sy=Math.floor(sy)
  if (sx<0||sx>=W||sy<0||sy>=H) return
  const img=ctx.getImageData(0,0,W,H),d=img.data
  const si=(sy*W+sx)*4
  const [sr,sg,sb]=[d[si],d[si+1],d[si+2]]
  const [fr,fg,fb]=hexToRgb(hex)
  if (sr===fr&&sg===fg&&sb===fb) return
  const match=(i:number)=>d[i]===sr&&d[i+1]===sg&&d[i+2]===sb
  const vis=new Uint8Array(W*H),q=[sx+sy*W];vis[sx+sy*W]=1
  while(q.length){const pos=q.pop()!,px=pos%W,py=(pos/W)|0,i=pos*4;d[i]=fr;d[i+1]=fg;d[i+2]=fb;d[i+3]=255;for(const[nx,ny]of[[px+1,py],[px-1,py],[px,py+1],[px,py-1]]as[number,number][]){if(nx>=0&&nx<W&&ny>=0&&ny<H){const np=nx+ny*W;if(!vis[np]&&match(np*4)){vis[np]=1;q.push(np)}}}}
  ctx.putImageData(img,0,0)
}

function floodFillTextured(tCtx: CanvasRenderingContext2D, sx: number, sy: number, id: TerrainId, patRef: React.MutableRefObject<Partial<Record<TerrainId|'erase', CanvasPattern>>>) {
  floodFill(tCtx,sx,sy,TERRAIN_COLOR[id])
  const pat=patRef.current[id];if(!pat)return
  const [fr,fg,fb]=hexToRgb(TERRAIN_COLOR[id])
  const mainImg=tCtx.getImageData(0,0,W,H),d=mainImg.data
  const mask=document.createElement('canvas');mask.width=W;mask.height=H
  const mc=mask.getContext('2d')!,mdata=mc.createImageData(W,H),md=mdata.data
  for(let i=0;i<W*H;i++){const idx=i*4,hit=Math.abs(d[idx]-fr)<8&&Math.abs(d[idx+1]-fg)<8&&Math.abs(d[idx+2]-fb)<8;md[idx]=md[idx+1]=md[idx+2]=255;md[idx+3]=hit?255:0}
  mc.putImageData(mdata,0,0)
  mc.globalCompositeOperation='source-in';mc.fillStyle=pat;mc.fillRect(0,0,W,H)
  tCtx.drawImage(mask,0,0)
}

// ── Catmull-Rom + stroke renderer ─────────────────────────────────────────────

function catmullRom(pts: [number,number][], steps=6): [number,number][] {
  if (pts.length<2) return pts
  const result:[number,number][]=[]
  const n=pts.length
  for(let i=0;i<n-1;i++){
    const p0=pts[Math.max(0,i-1)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(n-1,i+2)]
    for(let s=0;s<steps;s++){const t=s/steps,t2=t*t,t3=t2*t;const x=0.5*((2*p1[0])+(-p0[0]+p2[0])*t+(2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2+(-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3);const y=0.5*((2*p1[1])+(-p0[1]+p2[1])*t+(2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2+(-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3);result.push([x,y])}
  }
  result.push(pts[n-1]);return result
}

const ROAD_CFG: Record<RoadSub,{outer:string;inner:string;innerW:number;dash:[string,number,number[]]|null}> = {
  dirt: {outer:'rgba(82,50,14,0.92)', inner:'rgba(148,104,46,0.78)',innerW:0.54,dash:null},
  main: {outer:'rgba(62,40,10,0.94)', inner:'rgba(172,128,56,0.82)',innerW:0.58,dash:['rgba(230,210,155,0.2)',0.14,[0.7,0.55]]},
  paved:{outer:'rgba(70,62,50,0.92)', inner:'rgba(115,105,85,0.8)', innerW:0.58,dash:['rgba(255,255,255,0.22)',0.12,[0.5,0.5]]},
}
const RIVER_CFG: Record<RiverSub,{color:string;shadow:string;hl:string;minW:number;maxW:number;shadowR:number;hlR:number}> = {
  stream:{color:'rgba(75,115,162,0.86)',shadow:'rgba(32,60,105,0.3)', hl:'rgba(148,192,228,0.44)',minW:0.25,maxW:0.62,shadowR:1.32,hlR:0.32},
  river: {color:'rgba(55,95,150,0.9)', shadow:'rgba(28,55,105,0.36)',hl:'rgba(122,172,215,0.48)',minW:0.3, maxW:1.0, shadowR:1.38,hlR:0.28},
  wide:  {color:'rgba(44,82,140,0.92)',shadow:'rgba(22,46,100,0.42)',hl:'rgba(105,158,205,0.5)', minW:0.35,maxW:1.45,shadowR:1.44,hlR:0.24},
}

function renderStrokesTo(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
  const rivers=strokes.filter(s=>s.kind==='river'), roads=strokes.filter(s=>s.kind==='road')
  ctx.save(); ctx.lineCap='round'
  for (const pass of ['shadow','color','hl'] as const) {
    for (const r of rivers) {
      const c=RIVER_CFG[r.subtype as RiverSub],smooth=catmullRom(r.pts as [number,number][]),n=smooth.length
      ctx.strokeStyle=pass==='shadow'?c.shadow:pass==='color'?c.color:c.hl
      for(let i=0;i<n-1;i++){const t=i/(n-1),w=r.width*(c.minW+(c.maxW-c.minW)*t);ctx.lineWidth=w*(pass==='shadow'?c.shadowR:pass==='color'?1:c.hlR);ctx.beginPath();ctx.moveTo(smooth[i][0],smooth[i][1]);ctx.lineTo(smooth[i+1][0],smooth[i+1][1]);ctx.stroke()}
    }
  }
  for (const pass of ['outer','inner','dash'] as const) {
    for (const r of roads) {
      const c=ROAD_CFG[r.subtype as RoadSub];if(pass==='dash'&&!c.dash)continue
      const smooth=catmullRom(r.pts as [number,number][])
      if (pass==='dash'&&c.dash){const[color,wR,pat]=c.dash;ctx.strokeStyle=color;ctx.lineWidth=r.width*wR;ctx.lineJoin='round';ctx.setLineDash(pat.map(d=>d*r.width))}
      else{ctx.strokeStyle=pass==='outer'?c.outer:c.inner;ctx.lineWidth=r.width*(pass==='outer'?1:c.innerW);ctx.lineJoin='round'}
      ctx.beginPath();ctx.moveTo(smooth[0][0],smooth[0][1]);for(let i=1;i<smooth.length;i++)ctx.lineTo(smooth[i][0],smooth[i][1]);ctx.stroke()
      if(pass==='dash')ctx.setLineDash([])
    }
  }
  ctx.restore()
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function btnSt(active=false,rgb?:string): React.CSSProperties {
  return {padding:'5px 10px',borderRadius:6,fontSize:11,fontWeight:600,background:active?`rgba(${rgb??'212,168,90'},0.18)`:'rgba(240,232,216,0.05)',border:`1px solid ${active?`rgba(${rgb??'212,168,90'},0.45)`:'rgba(240,232,216,0.12)'}`,color:active?(rgb?`rgb(${rgb})`:'#d4a85a'):'#f0e8d8',cursor:'pointer',whiteSpace:'nowrap' as const,flexShrink:0}
}
function sideLabel(): React.CSSProperties {
  return {fontSize:9,fontWeight:700,letterSpacing:'0.1em',color:'rgba(240,232,216,0.3)',textTransform:'uppercase' as const,marginBottom:4}
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MapEditor() {
  const router = useRouter()
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const terrainRef   = useRef<HTMLCanvasElement|null>(null)
  const brushTmpRef  = useRef<HTMLCanvasElement|null>(null)
  const patternsRef  = useRef<Partial<Record<TerrainId|'erase',CanvasPattern>>>({})

  const drawingRef    = useRef(false)
  const lastRef       = useRef<{x:number;y:number}|null>(null)
  const histRef       = useRef<UndoEntry[]>([])
  const panRef        = useRef<{mx:number;my:number;px:number;py:number}|null>(null)
  const tRef          = useRef({x:20,y:20,scale:0.6})
  const objDragRef    = useRef<{id:string;sx:number;sy:number;ox:number;oy:number}|null>(null)
  const illusDragRef  = useRef<{id:string;mode:'move'|'rotate'|'resize';sx:number;sy:number;origAngle:number;origSize:number;origX:number;origY:number}|null>(null)
  const objsRef       = useRef<PlacedObj[]>([])
  const labelsRef     = useRef<MapLabel[]>([])
  const illusRef      = useRef<IllustrationObj[]>([])
  const strokesRef    = useRef<Stroke[]>([])
  const selRef        = useRef<string|null>(null)
  const currentPtsRef = useRef<[number,number][]>([])
  const illVariants   = useRef<Record<string,number>>({})

  // stable refs for event handlers
  const toolRef       = useRef<ToolId>('brush')
  const terrainIdRef  = useRef<TerrainId>('grass')
  const brushSzRef    = useRef(30)
  const roadSubRef    = useRef<RoadSub>('dirt')
  const riverSubRef   = useRef<RiverSub>('river')
  const strokeWRef    = useRef(12)
  const illusKindRef  = useRef<IllusKind>('mountain')
  const illusSzRef    = useRef(110)

  const [tool,       setTool]       = useState<ToolId>('brush')
  const [terrainId,  setTerrainId]  = useState<TerrainId>('grass')
  const [brushSize,  setBrushSize]  = useState(30)
  const [objects,    _setObjects]   = useState<PlacedObj[]>([])
  const [illus,      _setIllus]     = useState<IllustrationObj[]>([])
  const [labels,     _setLabels]    = useState<MapLabel[]>([])
  const [selObj,     _setSelObj]    = useState<string|null>(null)
  const [placeType,  setPlaceType]  = useState<ObjDef>(OBJ_DEFS[0])
  const [objSize,    setObjSize]    = useState(36)
  const [t,          setT]          = useState({x:20,y:20,scale:0.6})
  const [zoom,       setZoom]       = useState(60)
  const [textValue,  setTextValue]  = useState('')
  const [textSize,   setTextSize]   = useState(24)
  const [textColor,  setTextColor]  = useState('#3a2a10')
  const [pendingPos, setPendingPos] = useState<{x:number;y:number}|null>(null)
  const [roadSub,    setRoadSub]    = useState<RoadSub>('dirt')
  const [riverSub,   setRiverSub]   = useState<RiverSub>('river')
  const [strokeWidth,setStrokeWidth]= useState(12)
  const [illusKind,  setIllusKind]  = useState<IllusKind>('mountain')
  const [illusSize,  setIllusSize]  = useState(110)

  function setToolS(v:ToolId)        { toolRef.current=v;         setTool(v)        }
  function setTerrainS(v:TerrainId)  { terrainIdRef.current=v;    setTerrainId(v)   }
  function setBrushSz(v:number)      { brushSzRef.current=v;      setBrushSize(v)   }
  function setRoadSubS(v:RoadSub)    { roadSubRef.current=v;      setRoadSub(v)     }
  function setRiverSubS(v:RiverSub)  { riverSubRef.current=v;     setRiverSub(v)    }
  function setStrokeWidthS(v:number) { strokeWRef.current=v;      setStrokeWidth(v) }
  function setIllusKindS(v:IllusKind){ illusKindRef.current=v;    setIllusKind(v)   }
  function setIllusSzS(v:number)     { illusSzRef.current=v;      setIllusSize(v)   }

  function setObjects(n:PlacedObj[])       { objsRef.current=n;   _setObjects(n) }
  function setLabels(n:MapLabel[])         { labelsRef.current=n; _setLabels(n)  }
  function setSelObj(id:string|null)       { selRef.current=id;   _setSelObj(id) }
  function setStrokes(s:Stroke[])          { strokesRef.current=s }
  function setIllus(n:IllustrationObj[])   { illusRef.current=n;  _setIllus(n)   }

  // ── Core render ───────────────────────────────────────────────────────────
  function rerender(strokes=strokesRef.current) {
    const canvas=canvasRef.current,terrain=terrainRef.current;if(!canvas||!terrain)return
    const ctx=canvas.getContext('2d')!
    ctx.drawImage(terrain,0,0)
    if(strokes.length) renderStrokesTo(ctx,strokes)
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return
    const ctx=canvas.getContext('2d')!
    const tc=document.createElement('canvas');tc.width=W;tc.height=H;terrainRef.current=tc
    const bt=document.createElement('canvas');bt.width=W;bt.height=H;brushTmpRef.current=bt
    buildPatterns(ctx,patternsRef).then(()=>{
      try{
        const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)??'null')
        if(saved?.terrainData){
          if(saved.objs) setObjects(saved.objs)
          if(saved.labels) setLabels(saved.labels)
          const savedStrokes:Stroke[]=saved.strokes??[]
          const savedIllus:IllustrationObj[]=saved.illus??[]
          setStrokes(savedStrokes);setIllus(savedIllus)
          const img=new Image()
          img.onload=()=>{tc.getContext('2d')!.drawImage(img,0,0);rerender(savedStrokes)}
          img.src=saved.terrainData;return
        }
        if(saved?.canvasData){
          if(saved.objs) setObjects(saved.objs)
          if(saved.labels) setLabels(saved.labels)
          const img=new Image()
          img.onload=()=>{tc.getContext('2d')!.drawImage(img,0,0);rerender([])}
          img.src=saved.canvasData;return
        }
      }catch{}
      drawParchmentTo(tc.getContext('2d')!);rerender([])
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])

  function drawParchmentTo(ctx: CanvasRenderingContext2D) {
    const pat=patternsRef.current['erase']
    if(pat){ctx.fillStyle=pat;ctx.fillRect(0,0,W,H)}
    else{ctx.fillStyle=PARCHMENT;ctx.fillRect(0,0,W,H)}
    // aging: scattered spots
    const rng=seededRng(77)
    for(let i=0;i<90;i++){
      const x=rng()*W,y=rng()*H,r=2+rng()*22
      ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2)
      ctx.fillStyle=`rgba(${80+rng()*50|0},${48+rng()*32|0},${8+rng()*16|0},${(0.025+rng()*0.055).toFixed(3)})`
      ctx.fill()
    }
    // aging: water stain bands
    for(let i=0;i<5;i++){
      const y=rng()*H,h=40+rng()*60
      const g=ctx.createLinearGradient(0,y-h,0,y+h)
      g.addColorStop(0,'transparent');g.addColorStop(0.5,`rgba(110,75,18,0.04)`);g.addColorStop(1,'transparent')
      ctx.fillStyle=g;ctx.fillRect(0,y-h,W,h*2)
    }
    // vignette + corner darkening
    const vg=ctx.createRadialGradient(W/2,H/2,H*.25,W/2,H/2,H*.9)
    vg.addColorStop(0,'rgba(80,48,8,0)');vg.addColorStop(1,'rgba(55,32,4,0.38)')
    ctx.fillStyle=vg;ctx.fillRect(0,0,W,H)
    for(const[cx,cy]of[[0,0],[W,0],[0,H],[W,H]]as[number,number][]){
      const cg=ctx.createRadialGradient(cx,cy,0,cx,cy,H*.55)
      cg.addColorStop(0,'rgba(45,25,4,0.2)');cg.addColorStop(1,'rgba(45,25,4,0)')
      ctx.fillStyle=cg;ctx.fillRect(0,0,W,H)
    }
  }

  function drawDecorativeFrame(tCtx: CanvasRenderingContext2D) {
    const m=12
    tCtx.save()
    tCtx.strokeStyle='rgba(80,48,14,0.65)';tCtx.lineWidth=3;tCtx.strokeRect(m,m,W-m*2,H-m*2)
    tCtx.strokeStyle='rgba(80,48,14,0.35)';tCtx.lineWidth=1;tCtx.strokeRect(m+6,m+6,W-m*2-12,H-m*2-12)
    tCtx.strokeStyle='rgba(80,48,14,0.2)'; tCtx.lineWidth=0.5;tCtx.strokeRect(m+10,m+10,W-m*2-20,H-m*2-20)
    for(const[cx,cy]of[[m+3,m+3],[W-m-3,m+3],[m+3,H-m-3],[W-m-3,H-m-3]]as[number,number][]){
      tCtx.beginPath();tCtx.arc(cx,cy,4,0,Math.PI*2)
      tCtx.fillStyle='rgba(80,48,14,0.55)';tCtx.fill()
    }
    tCtx.restore()
  }

  // ── Undo ──────────────────────────────────────────────────────────────────
  function pushHistory() {
    const terrain=terrainRef.current;if(!terrain)return
    histRef.current=[...histRef.current.slice(-14),{terrainData:terrain.getContext('2d')!.getImageData(0,0,W,H),strokes:[...strokesRef.current],illus:[...illusRef.current]}]
  }
  function applyUndo() {
    if(!histRef.current.length)return
    const entry=histRef.current.pop()!
    const terrain=terrainRef.current;if(!terrain)return
    terrain.getContext('2d')!.putImageData(entry.terrainData,0,0)
    setStrokes(entry.strokes);setIllus(entry.illus);rerender(entry.strokes)
    doSave(objsRef.current,labelsRef.current,entry.strokes,entry.illus)
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(()=>{
    const down=(e:KeyboardEvent)=>{
      if((e.metaKey||e.ctrlKey)&&e.key==='z'){e.preventDefault();applyUndo()}
      if((e.key==='Delete'||e.key==='Backspace')&&selRef.current){
        e.preventDefault()
        const no=objsRef.current.filter(o=>o.id!==selRef.current)
        const nl=labelsRef.current.filter(l=>l.id!==selRef.current)
        const ni=illusRef.current.filter(i=>i.id!==selRef.current)
        setObjects(no);setLabels(nl);setIllus(ni);setSelObj(null);doSave(no,nl)
      }
    }
    window.addEventListener('keydown',down)
    return ()=>window.removeEventListener('keydown',down)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])

  // ── Zoom ──────────────────────────────────────────────────────────────────
  useEffect(()=>{
    const el=containerRef.current;if(!el)return
    const onW=(e:WheelEvent)=>{
      e.preventDefault()
      const rect=el.getBoundingClientRect(),mx=e.clientX-rect.left,my=e.clientY-rect.top
      const factor=e.deltaY<0?1.1:0.9,cur=tRef.current
      const ns=Math.max(0.15,Math.min(5,cur.scale*factor)),sf=ns/cur.scale
      const nt={x:mx-(mx-cur.x)*sf,y:my-(my-cur.y)*sf,scale:ns}
      tRef.current=nt;setT(nt);setZoom(Math.round(ns*100))
    }
    el.addEventListener('wheel',onW,{passive:false})
    return ()=>el.removeEventListener('wheel',onW)
  },[])

  // ── Helpers ───────────────────────────────────────────────────────────────
  function getPos(e:React.MouseEvent) {
    const canvas=canvasRef.current!,rect=canvas.getBoundingClientRect()
    return {x:(e.clientX-rect.left)*(W/rect.width),y:(e.clientY-rect.top)*(H/rect.height)}
  }
  function doSave(objs=objsRef.current,labs=labelsRef.current,strokes=strokesRef.current,il=illusRef.current) {
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify({terrainData:terrainRef.current!.toDataURL('image/jpeg',0.85),strokes,illus:il,objs,labels:labs}))}catch{}
  }
  function getPattern(id:TerrainId|'erase'): CanvasPattern|string {
    return patternsRef.current[id]??(id==='erase'?PARCHMENT:TERRAIN_COLOR[id as TerrainId])
  }

  // feathered brush: 3 alpha rings
  function paintFeatheredDot(x:number,y:number,id:TerrainId|'erase') {
    const terrain=terrainRef.current,tmp=brushTmpRef.current,canvas=canvasRef.current
    if(!terrain||!tmp)return
    const r=brushSzRef.current/2
    const sx=Math.max(0,Math.floor(x-r-1)),sy=Math.max(0,Math.floor(y-r-1))
    const sw=Math.min(W-sx,Math.ceil(r*2+2)),sh=Math.min(H-sy,Math.ceil(r*2+2))
    const tmpCtx=tmp.getContext('2d')!
    tmpCtx.clearRect(sx,sy,sw,sh)
    const pat=getPattern(id)
    // outer ring (faint)
    tmpCtx.globalAlpha=0.22;tmpCtx.fillStyle=pat
    tmpCtx.beginPath();tmpCtx.arc(x,y,r,0,Math.PI*2);tmpCtx.fill()
    // mid ring
    tmpCtx.globalAlpha=0.55;tmpCtx.fillStyle=pat
    tmpCtx.beginPath();tmpCtx.arc(x,y,r*0.68,0,Math.PI*2);tmpCtx.fill()
    // core
    tmpCtx.globalAlpha=1;tmpCtx.fillStyle=pat
    tmpCtx.beginPath();tmpCtx.arc(x,y,r*0.38,0,Math.PI*2);tmpCtx.fill()
    tmpCtx.globalAlpha=1
    terrain.getContext('2d')!.drawImage(tmp,sx,sy,sw,sh,sx,sy,sw,sh)
    canvas?.getContext('2d')?.drawImage(tmp,sx,sy,sw,sh,sx,sy,sw,sh)
  }

  function paintFeatheredLine(x1:number,y1:number,x2:number,y2:number,id:TerrainId|'erase') {
    const r=brushSzRef.current/2
    const dist=Math.sqrt((x2-x1)**2+(y2-y1)**2)
    const steps=Math.min(25,Math.max(1,Math.ceil(dist/(r*0.45))))
    for(let i=1;i<=steps;i++){const t=i/steps;paintFeatheredDot(x1+(x2-x1)*t,y1+(y2-y1)*t,id)}
  }

  // ── Mouse ─────────────────────────────────────────────────────────────────
  function onMouseDown(e:React.MouseEvent) {
    if(e.button===1||tool==='pan'){e.preventDefault();panRef.current={mx:e.clientX,my:e.clientY,px:tRef.current.x,py:tRef.current.y};return}
    if(e.button!==0)return
    const {x,y}=getPos(e)

    if(tool==='text'){setPendingPos({x,y});return}

    if(tool==='fill'){
      pushHistory()
      const tCtx=terrainRef.current?.getContext('2d');if(!tCtx)return
      floodFillTextured(tCtx,x,y,terrainIdRef.current,patternsRef)
      rerender();doSave();return
    }
    if(tool==='brush'||tool==='erase'){
      pushHistory();drawingRef.current=true;lastRef.current={x,y}
      paintFeatheredDot(x,y,tool==='erase'?'erase':terrainIdRef.current);return
    }
    if(tool==='road'||tool==='river'){
      pushHistory();currentPtsRef.current=[[x,y]];drawingRef.current=true;return
    }
    if(tool==='illustrate'){
      pushHistory()
      const kind=illusKindRef.current
      const numVariants=kind==='mountain'?ALL_MOUNTAIN_SVGS.length:kind==='forest'?ALL_FOREST_SVGS.length:1
      const v=(illVariants.current[kind]??0)%numVariants
      illVariants.current[kind]=(v+1)%numVariants
      const baseAngle=(kind==='mountain'||kind==='forest')?(Math.random()-0.5)*8:0
      const sizeVar=(0.05+Math.random()*0.10)*(Math.random()<0.5?1:-1)
      const sz=(kind==='mountain'||kind==='forest')?Math.round(illusSzRef.current*(1+sizeVar)):illusSzRef.current
      const newIll:IllustrationObj={id:crypto.randomUUID(),kind,variant:v,x,y,size:sz,angle:baseAngle}
      const next=[...illusRef.current,newIll]
      setIllus(next);doSave(objsRef.current,labelsRef.current,strokesRef.current,next);return
    }
    if(tool==='place'){
      const next=[...objsRef.current,{id:crypto.randomUUID(),typeId:placeType.id,emoji:placeType.emoji,label:placeType.label,x,y,size:objSize}]
      setObjects(next);doSave(next);return
    }
    if(tool==='select') setSelObj(null)
  }

  function onMouseMove(e:React.MouseEvent) {
    if(panRef.current){
      const nt={...tRef.current,x:panRef.current.px+e.clientX-panRef.current.mx,y:panRef.current.py+e.clientY-panRef.current.my}
      tRef.current=nt;setT(nt);return
    }
    if(illusDragRef.current){
      const d=illusDragRef.current,scale=tRef.current.scale
      if(d.mode==='move'){_setIllus(prev=>{const n=prev.map(il=>il.id===d.id?{...il,x:d.origX+(e.clientX-d.sx)/scale,y:d.origY+(e.clientY-d.sy)/scale}:il);illusRef.current=n;return n})}
      else if(d.mode==='rotate'){const dx=e.clientX-d.sx;_setIllus(prev=>{const n=prev.map(il=>il.id===d.id?{...il,angle:d.origAngle+dx*0.55}:il);illusRef.current=n;return n})}
      else{const dx=e.clientX-d.sx,dy=e.clientY-d.sy,delta=(Math.abs(dx)>Math.abs(dy)?dx:dy);_setIllus(prev=>{const n=prev.map(il=>il.id===d.id?{...il,size:Math.max(20,d.origSize+delta)}:il);illusRef.current=n;return n})}
      return
    }
    if(objDragRef.current){
      const scale=tRef.current.scale
      _setObjects(prev=>prev.map(o=>o.id===objDragRef.current!.id?{...o,x:objDragRef.current!.ox+(e.clientX-objDragRef.current!.sx)/scale,y:objDragRef.current!.oy+(e.clientY-objDragRef.current!.sy)/scale}:o))
      return
    }
    if(!drawingRef.current)return
    const {x,y}=getPos(e)
    if(tool==='brush'||tool==='erase'){
      if(lastRef.current)paintFeatheredLine(lastRef.current.x,lastRef.current.y,x,y,tool==='erase'?'erase':terrainIdRef.current)
      lastRef.current={x,y};return
    }
    if(tool==='road'||tool==='river'){
      const pts=currentPtsRef.current,last=pts[pts.length-1]
      if(last){const dx=x-last[0],dy=y-last[1];if(dx*dx+dy*dy<MIN_STROKE_DIST*MIN_STROKE_DIST)return}
      currentPtsRef.current=[...pts,[x,y]]
      rerender()
      const ctx=canvasRef.current?.getContext('2d');if(!ctx)return
      ctx.save();ctx.strokeStyle=tool==='river'?'rgba(55,95,155,0.5)':'rgba(88,55,14,0.5)';ctx.lineWidth=strokeWRef.current;ctx.lineCap='round'
      ctx.beginPath();const p=currentPtsRef.current;ctx.moveTo(p[0][0],p[0][1]);for(let i=1;i<p.length;i++)ctx.lineTo(p[i][0],p[i][1]);ctx.stroke();ctx.restore()
    }
  }

  function onMouseUp() {
    if(panRef.current){panRef.current=null;return}
    if(illusDragRef.current){illusDragRef.current=null;doSave();return}
    if(objDragRef.current){objsRef.current=objects;objDragRef.current=null;doSave();return}
    if(!drawingRef.current)return
    drawingRef.current=false
    if(tool==='brush'||tool==='erase'){lastRef.current=null;rerender();doSave();return}
    if(tool==='road'||tool==='river'){
      const pts=currentPtsRef.current
      if(pts.length>=2){
        const stroke:Stroke={id:crypto.randomUUID(),kind:tool,subtype:tool==='road'?roadSubRef.current:riverSubRef.current,pts,width:strokeWRef.current}
        const next=[...strokesRef.current,stroke];setStrokes(next);rerender(next);doSave(objsRef.current,labelsRef.current,next)
      }else rerender()
      currentPtsRef.current=[]
    }
  }

  function onIllusDown(e:React.MouseEvent,ill:IllustrationObj) {
    if(tool!=='select')return
    e.stopPropagation();setSelObj(ill.id)
    illusDragRef.current={id:ill.id,mode:'move',sx:e.clientX,sy:e.clientY,origAngle:ill.angle,origSize:ill.size,origX:ill.x,origY:ill.y}
  }
  function onRotateDown(e:React.MouseEvent,ill:IllustrationObj) {
    e.stopPropagation();setSelObj(ill.id)
    illusDragRef.current={id:ill.id,mode:'rotate',sx:e.clientX,sy:e.clientY,origAngle:ill.angle,origSize:ill.size,origX:ill.x,origY:ill.y}
  }
  function onResizeDown(e:React.MouseEvent,ill:IllustrationObj) {
    e.stopPropagation();setSelObj(ill.id)
    illusDragRef.current={id:ill.id,mode:'resize',sx:e.clientX,sy:e.clientY,origAngle:ill.angle,origSize:ill.size,origX:ill.x,origY:ill.y}
  }
  function onObjDown(e:React.MouseEvent,obj:PlacedObj) {
    if(tool!=='select')return
    e.stopPropagation();setSelObj(obj.id)
    objDragRef.current={id:obj.id,sx:e.clientX,sy:e.clientY,ox:obj.x,oy:obj.y}
  }

  function commitText() {
    if(!pendingPos||!textValue.trim()){setPendingPos(null);return}
    const next=[...labelsRef.current,{id:crypto.randomUUID(),text:textValue.trim(),x:pendingPos.x,y:pendingPos.y,fontSize:textSize,color:textColor}]
    setLabels(next);setPendingPos(null);setTextValue('');doSave(objsRef.current,next)
  }
  function clearAll() {
    if(!confirm('Очистити всю карту?'))return
    pushHistory()
    const terrain=terrainRef.current;if(!terrain)return
    drawParchmentTo(terrain.getContext('2d')!)
    setStrokes([]);setIllus([]);setObjects([]);setLabels([]);setSelObj(null)
    rerender([]);doSave([],[],[],[])
  }
  function deleteSelected() {
    if(!selRef.current)return
    const no=objsRef.current.filter(o=>o.id!==selRef.current)
    const nl=labelsRef.current.filter(l=>l.id!==selRef.current)
    const ni=illusRef.current.filter(i=>i.id!==selRef.current)
    setObjects(no);setLabels(nl);setIllus(ni);setSelObj(null);doSave(no,nl)
  }
  function fitCanvas() {
    const el=containerRef.current;if(!el)return
    const {width,height}=el.getBoundingClientRect()
    const scale=Math.min((width-40)/W,(height-40)/H)
    const nt={x:(width-W*scale)/2,y:(height-H*scale)/2,scale}
    tRef.current=nt;setT(nt);setZoom(Math.round(scale*100))
  }
  function addFrame() {
    pushHistory()
    const terrain=terrainRef.current;if(!terrain)return
    drawDecorativeFrame(terrain.getContext('2d')!)
    rerender();doSave()
  }
  async function exportPNG() {
    const exp=document.createElement('canvas');exp.width=W;exp.height=H
    const ctx=exp.getContext('2d')!
    if(terrainRef.current)ctx.drawImage(terrainRef.current,0,0)
    renderStrokesTo(ctx,strokesRef.current)
    for(const ill of illusRef.current){
      const svgStr=getIllusSVG(ill).replace('viewBox=',`width="${ill.size}" height="${ill.size}" viewBox=`)
      await new Promise<void>(resolve=>{
        const blob=new Blob([svgStr],{type:'image/svg+xml'})
        const url=URL.createObjectURL(blob)
        const img=new Image()
        img.onload=()=>{ctx.save();ctx.translate(ill.x,ill.y);ctx.rotate(ill.angle*Math.PI/180);ctx.drawImage(img,-ill.size/2,-ill.size/2,ill.size,ill.size);ctx.restore();URL.revokeObjectURL(url);resolve()}
        img.onerror=()=>{URL.revokeObjectURL(url);resolve()}
        img.src=url
      })
    }
    ctx.textAlign='center';ctx.textBaseline='middle'
    for(const l of labelsRef.current){ctx.font=`bold ${l.fontSize}px 'Palatino Linotype',Georgia,serif`;ctx.fillStyle=l.color;ctx.shadowColor='rgba(240,220,160,0.9)';ctx.shadowBlur=5;ctx.fillText(l.text,l.x,l.y);ctx.shadowBlur=0}
    for(const obj of objsRef.current){ctx.font=`${obj.size}px serif`;ctx.fillText(obj.emoji,obj.x,obj.y)}
    const a=document.createElement('a');a.href=exp.toDataURL('image/png');a.download='seraphites-map.png';a.click()
  }

  const isLineTool=tool==='road'||tool==='river'
  const cursorMap:Record<ToolId,string>={brush:'crosshair',erase:'crosshair',fill:'cell',place:'copy',select:'default',pan:'grab',text:'text',road:'crosshair',river:'crosshair',illustrate:'copy'}
  const TOOLS=[
    {id:'brush'     as ToolId,label:'🖌 Пензель'},
    {id:'erase'     as ToolId,label:'⬜ Гумка'  },
    {id:'fill'      as ToolId,label:'🪣 Заливка'},
    {id:'road'      as ToolId,label:'🛤 Дорога' },
    {id:'river'     as ToolId,label:'〜 Річка'  },
    {id:'illustrate'as ToolId,label:'⛰ Ілюстр.'},
    {id:'place'     as ToolId,label:'📍 Обʼєкт' },
    {id:'text'      as ToolId,label:'✏️ Текст'  },
    {id:'select'    as ToolId,label:'↖ Вибрати' },
    {id:'pan'       as ToolId,label:'✋ Рух'    },
  ]

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100dvh',background:'#0f0e09',color:'#f0e8d8',fontFamily:"'Inter',sans-serif",userSelect:'none',overflow:'hidden'}}>
      <svg style={{display:'none'}}><defs><filter id="pf" colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values="1.06 0.02 0 0 0.02  0 0.97 0 0 0.01  0 -0.04 0.82 0 0  0 0 0 1 0"/></filter></defs></svg>

      {/* Top bar */}
      <div style={{display:'flex',alignItems:'center',gap:6,padding:'7px 12px',background:'#17150f',borderBottom:'1px solid rgba(240,232,216,0.1)',flexShrink:0,flexWrap:'wrap'}}>
        <button onClick={()=>router.push('/sacred')} style={btnSt()}>← Назад</button>
        <div style={{width:1,height:20,background:'rgba(240,232,216,0.1)',flexShrink:0}}/>
        {TOOLS.map(({id,label})=>(
          <button key={id} onClick={()=>{setToolS(id);setPendingPos(null)}} style={btnSt(tool===id)}>{label}</button>
        ))}
        <div style={{width:1,height:20,background:'rgba(240,232,216,0.1)',flexShrink:0}}/>
        <button onClick={applyUndo} style={btnSt()}>↩ Undo</button>
        <button onClick={fitCanvas} style={btnSt()}>⊞ Fit</button>
        <button onClick={addFrame}  style={btnSt()}>▭ Рамка</button>
        <span style={{fontSize:10,color:'rgba(240,232,216,0.3)',flexShrink:0}}>{zoom}%</span>
        <div style={{flex:1}}/>
        {selObj&&tool==='select'&&<button onClick={deleteSelected} style={btnSt(false,'192,112,112')}>🗑 Видалити</button>}
        <button onClick={clearAll}    style={btnSt()}>🗑 Очистити</button>
        <button onClick={()=>doSave()} style={btnSt(false,'111,166,122')}>💾 Зберегти</button>
        <button onClick={exportPNG}   style={btnSt(false,'212,168,90')}>📤 PNG</button>
      </div>

      <div style={{display:'flex',flex:1,minHeight:0}}>
        {/* Left sidebar */}
        <div style={{width:140,background:'#13120d',borderRight:'1px solid rgba(240,232,216,0.07)',padding:'10px 8px',display:'flex',flexDirection:'column',gap:3,overflowY:'auto',flexShrink:0}}>
          {!isLineTool&&tool!=='place'&&tool!=='text'&&tool!=='select'&&tool!=='illustrate'&&<>
            <div style={sideLabel()}>Рельєф</div>
            {TERRAIN_DEFS.map(td=>{
              const active=terrainId===td.id&&(tool==='brush'||tool==='erase'||tool==='fill')
              return(
                <button key={td.id} onClick={()=>{setTerrainS(td.id);if(tool!=='fill'&&tool!=='erase')setToolS('brush')}}
                  style={{display:'flex',alignItems:'center',gap:7,padding:'5px 7px',borderRadius:6,background:active?'rgba(240,232,216,0.09)':'transparent',border:`1px solid ${active?'rgba(240,232,216,0.2)':'transparent'}`,color:'#f0e8d8',cursor:'pointer',width:'100%',fontSize:11,fontWeight:active?600:400}}>
                  <div style={{width:14,height:14,borderRadius:3,background:TERRAIN_COLOR[td.id],flexShrink:0,border:'1px solid rgba(0,0,0,0.25)'}}/>
                  {td.label}
                </button>
              )
            })}
            <div style={{...sideLabel(),marginTop:10}}>Розмір пензля</div>
            <input type="range" min={6} max={120} value={brushSize} onChange={e=>setBrushSz(Number(e.target.value))} style={{width:'100%',accentColor:'#d4a85a'}}/>
            <div style={{fontSize:10,color:'rgba(240,232,216,0.35)',textAlign:'center'}}>{brushSize}px</div>
          </>}

          {tool==='road'&&<>
            <div style={sideLabel()}>Тип дороги</div>
            {ROAD_DEFS.map(rd=><button key={rd.id} onClick={()=>setRoadSubS(rd.id)} style={{...btnSt(roadSub===rd.id),width:'100%',textAlign:'left',marginBottom:2}}>{rd.label}</button>)}
            <div style={{...sideLabel(),marginTop:10}}>Товщина</div>
            <input type="range" min={4} max={40} value={strokeWidth} onChange={e=>setStrokeWidthS(Number(e.target.value))} style={{width:'100%',accentColor:'#d4a85a'}}/>
            <div style={{fontSize:10,color:'rgba(240,232,216,0.35)',textAlign:'center'}}>{strokeWidth}px</div>
          </>}

          {tool==='river'&&<>
            <div style={sideLabel()}>Тип ріки</div>
            {RIVER_DEFS.map(rv=><button key={rv.id} onClick={()=>setRiverSubS(rv.id)} style={{...btnSt(riverSub===rv.id,'80,130,200'),width:'100%',textAlign:'left',marginBottom:2}}>{rv.label}</button>)}
            <div style={{...sideLabel(),marginTop:10}}>Товщина</div>
            <input type="range" min={6} max={60} value={strokeWidth} onChange={e=>setStrokeWidthS(Number(e.target.value))} style={{width:'100%',accentColor:'#5a8ec8'}}/>
            <div style={{fontSize:10,color:'rgba(240,232,216,0.35)',textAlign:'center'}}>{strokeWidth}px</div>
          </>}

          {tool==='illustrate'&&<>
            <div style={sideLabel()}>Тип</div>
            {ILLUS_DEFS.map(d=><button key={d.kind} onClick={()=>{setIllusKindS(d.kind);setIllusSzS(d.defaultSize)}} style={{...btnSt(illusKind===d.kind),width:'100%',textAlign:'left',marginBottom:2}}>{d.label}</button>)}
            <div style={{...sideLabel(),marginTop:10}}>Розмір</div>
            <input type="range" min={30} max={320} value={illusSize} onChange={e=>setIllusSzS(Number(e.target.value))} style={{width:'100%',accentColor:'#d4a85a'}}/>
            <div style={{fontSize:10,color:'rgba(240,232,216,0.35)',textAlign:'center'}}>{illusSize}px</div>
            <div style={{marginTop:10,fontSize:9,color:'rgba(240,232,216,0.22)',lineHeight:1.7}}>Клік = місце<br/>Варіанти чергуються<br/>Select → обертання<br/>та розмір</div>
          </>}

          {tool==='text'&&<>
            <div style={sideLabel()}>Розмір тексту</div>
            <input type="range" min={10} max={72} value={textSize} onChange={e=>setTextSize(Number(e.target.value))} style={{width:'100%',accentColor:'#d4a85a'}}/>
            <div style={{fontSize:10,color:'rgba(240,232,216,0.35)',textAlign:'center'}}>{textSize}px</div>
            <div style={{...sideLabel(),marginTop:8}}>Колір</div>
            <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
              {['#3a2a10','#1a3a1a','#1a1a3a','#3a1a1a','#1a2a3a','#5a4a30'].map(c=>(
                <div key={c} onClick={()=>setTextColor(c)} style={{width:18,height:18,borderRadius:3,background:c,cursor:'pointer',border:`2px solid ${textColor===c?'#d4a85a':'transparent'}`}}/>
              ))}
            </div>
          </>}

          {(tool==='select'||tool==='place'||tool==='pan')&&(
            <div style={{marginTop:10,fontSize:9,color:'rgba(240,232,216,0.22)',lineHeight:1.6}}>Скрол = зум<br/>Сер. кнопка = рух<br/>Ctrl+Z = undo<br/>Del = видалити</div>
          )}
        </div>

        {/* Canvas */}
        <div ref={containerRef}
          style={{flex:1,overflow:'hidden',position:'relative',background:'#1a1814',cursor:cursorMap[tool]}}
          onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
          onContextMenu={e=>e.preventDefault()}>
          <div style={{position:'absolute',inset:0,pointerEvents:'none',backgroundImage:'radial-gradient(circle, rgba(240,232,216,0.025) 1px, transparent 1px)',backgroundSize:'32px 32px'}}/>

          <div style={{position:'absolute',top:0,left:0,transform:`translate(${t.x}px,${t.y}px) scale(${t.scale})`,transformOrigin:'0 0',willChange:'transform'}}>
            <canvas ref={canvasRef} width={W} height={H} style={{display:'block',filter:'url(#pf)',boxShadow:'0 0 0 2px rgba(180,140,60,0.3),0 8px 50px rgba(0,0,0,0.7)'}}/>

            {/* SVG Illustrations */}
            {[...illus].sort((a,b)=>a.y-b.y).map(ill=>{
              const isSel=selObj===ill.id&&tool==='select'
              return(
                <div key={ill.id}
                  style={{position:'absolute',left:ill.x,top:ill.y,transform:`translate(-50%,-50%) rotate(${ill.angle}deg)`,width:ill.size,height:ill.size,cursor:tool==='select'?'grab':'default',pointerEvents:tool==='select'?'auto':'none'}}
                  onMouseDown={e=>onIllusDown(e,ill)}>
                  <div dangerouslySetInnerHTML={{__html:getIllusSVG(ill)}} style={{width:'100%',height:'100%',filter:isSel?'drop-shadow(0 0 5px rgba(212,168,90,0.8))':undefined}}/>
                  {isSel&&<>
                    {/* rotate handle */}
                    <div onMouseDown={e=>onRotateDown(e,ill)}
                      style={{position:'absolute',top:-22,left:'50%',transform:'translateX(-50%)',width:11,height:11,borderRadius:'50%',background:'#d4a85a',border:'2px solid rgba(255,255,255,0.9)',cursor:'ew-resize',boxShadow:'0 1px 4px rgba(0,0,0,0.5)'}}/>
                    {/* outline */}
                    <div style={{position:'absolute',inset:-3,border:'1px dashed rgba(212,168,90,0.6)',borderRadius:2,pointerEvents:'none'}}/>
                    {/* resize handle */}
                    <div onMouseDown={e=>onResizeDown(e,ill)}
                      style={{position:'absolute',bottom:-6,right:-6,width:11,height:11,borderRadius:'50%',background:'#d4a85a',border:'2px solid rgba(255,255,255,0.9)',cursor:'se-resize',boxShadow:'0 1px 4px rgba(0,0,0,0.5)'}}/>
                  </>}
                </div>
              )
            })}

            {labels.map(lbl=>(
              <div key={lbl.id} onMouseDown={e=>{if(tool!=='select')return;e.stopPropagation();setSelObj(lbl.id)}}
                style={{position:'absolute',left:lbl.x,top:lbl.y,transform:'translate(-50%,-50%)',fontSize:lbl.fontSize,fontFamily:"'Palatino Linotype',Georgia,'Times New Roman',serif",fontWeight:700,color:lbl.color,whiteSpace:'nowrap',pointerEvents:tool==='select'?'auto':'none',cursor:tool==='select'?'pointer':'default',textShadow:'0 0 8px rgba(240,220,160,0.8),0 1px 3px rgba(0,0,0,0.4)',outline:selObj===lbl.id?'1px dashed rgba(212,168,90,0.7)':'none',padding:'2px 4px'}}>
                {lbl.text}
              </div>
            ))}

            {objects.map(obj=>(
              <div key={obj.id} onMouseDown={e=>onObjDown(e,obj)}
                style={{position:'absolute',left:obj.x,top:obj.y,transform:'translate(-50%,-50%)',fontSize:obj.size,lineHeight:1,cursor:tool==='select'?(objDragRef.current?.id===obj.id?'grabbing':'grab'):'default',pointerEvents:tool==='select'?'auto':'none',filter:selObj===obj.id?'drop-shadow(0 0 6px rgba(212,168,90,0.9))':'drop-shadow(1px 2px 3px rgba(0,0,0,0.5))',transition:'filter 0.1s'}}
                title={obj.label}>{obj.emoji}</div>
            ))}

            {pendingPos&&<div style={{position:'absolute',left:pendingPos.x,top:pendingPos.y,transform:'translate(-50%,-50%)',pointerEvents:'none',fontSize:textSize,fontFamily:"'Palatino Linotype',Georgia,serif",fontWeight:700,color:textColor,opacity:0.4,whiteSpace:'nowrap'}}>|</div>}
          </div>

          {pendingPos&&(
            <div style={{position:'absolute',bottom:20,left:'50%',transform:'translateX(-50%)',background:'#1c1a12',border:'1px solid rgba(212,168,90,0.4)',borderRadius:10,padding:'12px 16px',display:'flex',gap:8,alignItems:'center',boxShadow:'0 4px 24px rgba(0,0,0,0.6)',zIndex:20}}>
              <input autoFocus value={textValue} onChange={e=>setTextValue(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter')commitText();if(e.key==='Escape')setPendingPos(null)}}
                placeholder="Назва..."
                style={{background:'rgba(240,232,216,0.07)',border:'1px solid rgba(240,232,216,0.2)',borderRadius:6,padding:'7px 12px',color:'#f0e8d8',fontSize:13,outline:'none',width:200,fontFamily:"'Palatino Linotype',Georgia,serif"}}/>
              <button onClick={commitText} style={btnSt(true)}>✓</button>
              <button onClick={()=>setPendingPos(null)} style={btnSt()}>✕</button>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div style={{width:140,background:'#13120d',borderLeft:'1px solid rgba(240,232,216,0.07)',padding:'10px 8px',display:'flex',flexDirection:'column',gap:3,overflowY:'auto',flexShrink:0}}>
          <div style={sideLabel()}>Обʼєкти</div>
          {OBJ_DEFS.map(od=>{
            const active=placeType.id===od.id&&tool==='place'
            return(
              <button key={od.id} onClick={()=>{setPlaceType(od);setToolS('place')}}
                style={{display:'flex',alignItems:'center',gap:6,padding:'4px 7px',borderRadius:6,background:active?'rgba(240,232,216,0.09)':'transparent',border:`1px solid ${active?'rgba(240,232,216,0.2)':'transparent'}`,color:'#f0e8d8',cursor:'pointer',width:'100%'}}>
                <span style={{fontSize:18,lineHeight:1}}>{od.emoji}</span>
                <span style={{fontSize:10,fontWeight:active?600:400}}>{od.label}</span>
              </button>
            )
          })}
          <div style={{...sideLabel(),marginTop:10}}>Розмір обʼєкта</div>
          <input type="range" min={16} max={72} value={objSize} onChange={e=>setObjSize(Number(e.target.value))} style={{width:'100%',accentColor:'#d4a85a'}}/>
          <div style={{fontSize:10,color:'rgba(240,232,216,0.35)',textAlign:'center'}}>{objSize}px</div>
        </div>
      </div>
    </div>
  )
}
