'use client'

import { useRef, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────

type TerrainId = 'grass' | 'water' | 'shallow' | 'desert' | 'snow' | 'sand' | 'swamp'
type RoadSub   = 'dirt' | 'main' | 'paved'
type RiverSub  = 'stream' | 'river' | 'wide'
type IllusKind = 'mountain' | 'forest' | 'bush' | 'compass' | 'cartouche'
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
  {kind:'mountain', label:'⛰ Гора',  defaultSize:110},
  {kind:'forest',   label:'🌲 Ліс',   defaultSize:80},
  {kind:'bush',     label:'🌿 Кущ',   defaultSize:62},
  {kind:'compass',  label:'✦ Компас', defaultSize:90},
  {kind:'cartouche',label:'▭ Картуш', defaultSize:180},
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
  // 1. single sharp peak — warm limestone
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 65"><g stroke="#4a3218" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M40,4 L8,61 L72,61 Z" fill="#d4c69b" stroke-width="1.4"/><path d="M40,4 L27,24 C34,21 46,21 53,24 Z" fill="#f2ede2" stroke-width="1"/><line x1="45" y1="13" x2="55" y2="30" stroke-width="0.7" opacity="0.45"/><line x1="48" y1="20" x2="60" y2="38" stroke-width="0.7" opacity="0.4"/><line x1="51" y1="27" x2="64" y2="46" stroke-width="0.65" opacity="0.35"/><line x1="54" y1="34" x2="67" y2="53" stroke-width="0.6" opacity="0.3"/></g></svg>`,
  // 2. single peak — grey granite
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 65"><g stroke="#303038" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M40,5 L8,62 L72,62 Z" fill="#b9bcc6" stroke-width="1.4"/><path d="M40,5 L30,22 C35,19 45,19 50,22 Z" fill="#eef0f8" stroke-width="0.9"/><line x1="44" y1="13" x2="53" y2="30" stroke-width="0.7" opacity="0.45"/><line x1="47" y1="20" x2="57" y2="37" stroke-width="0.65" opacity="0.4"/><line x1="50" y1="27" x2="62" y2="44" stroke-width="0.6" opacity="0.35"/></g></svg>`,
  // 3. broad single peak — warm brown
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 65"><g stroke="#4a3a18" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M50,4 L5,62 L95,62 Z" fill="#dac69e" stroke-width="1.4"/><path d="M50,4 L39,21 C44,18 56,18 61,21 Z" fill="#f2ede2" stroke-width="1"/><line x1="54" y1="12" x2="64" y2="28" stroke-width="0.7" opacity="0.45"/><line x1="57" y1="19" x2="68" y2="36" stroke-width="0.65" opacity="0.4"/><line x1="60" y1="26" x2="72" y2="43" stroke-width="0.6" opacity="0.35"/><line x1="62" y1="33" x2="76" y2="50" stroke-width="0.55" opacity="0.3"/></g></svg>`,
  // 4. rounded volcanic hill — ochre
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 60"><g stroke="#403218" stroke-linecap="round" fill="none"><path d="M40,7 Q18,7 7,56 L73,56 Q62,7 40,7 Z" fill="#dacf9e" stroke-width="1.4" stroke-linejoin="round"/><path d="M23,30 Q40,20 57,30" stroke-width="0.85" opacity="0.35"/><path d="M15,44 Q40,30 65,44" stroke-width="0.75" opacity="0.28"/><path d="M10,54 Q40,40 70,54" stroke-width="0.65" opacity="0.22"/><path d="M36,9 Q40,7 44,9" stroke-width="0.8" opacity="0.35"/></g></svg>`,
  // 5. mesa / flat-top plateau — blue-grey
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 63"><g stroke="#303840" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M8,61 L18,34 L30,21 L60,21 L72,34 L82,61 Z" fill="#b2bcc8" stroke-width="1.4"/><path d="M30,21 L45,15 L60,21" fill="#eef2fa" stroke-width="0.9"/><line x1="18" y1="38" x2="10" y2="59" stroke-width="0.75" opacity="0.4"/><line x1="22" y1="37" x2="14" y2="59" stroke-width="0.6" opacity="0.3"/><line x1="72" y1="38" x2="80" y2="59" stroke-width="0.75" opacity="0.4"/><line x1="68" y1="37" x2="76" y2="59" stroke-width="0.6" opacity="0.3"/><line x1="32" y1="23" x2="30" y2="59" stroke-width="0.5" opacity="0.25"/><line x1="58" y1="23" x2="60" y2="59" stroke-width="0.5" opacity="0.25"/></g></svg>`,
  // 6. steep narrow cliff — red sandstone
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 68"><g stroke="#5a2a10" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M35,3 L18,65 L52,65 Z" fill="#d7b28a" stroke-width="1.5"/><path d="M35,3 L26,18 C29,15 41,15 44,18 Z" fill="#f6f0e4" stroke-width="1"/><line x1="41" y1="11" x2="50" y2="30" stroke-width="0.8" opacity="0.45"/><line x1="44" y1="18" x2="54" y2="38" stroke-width="0.7" opacity="0.4"/><line x1="46" y1="25" x2="56" y2="46" stroke-width="0.65" opacity="0.35"/><line x1="47" y1="33" x2="57" y2="54" stroke-width="0.6" opacity="0.3"/></g></svg>`,
  // 7. single peak — ivory warm
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 65"><g stroke="#3a2a10" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M40,5 L8,62 L72,62 Z" fill="#d2c49e" stroke-width="1.4"/><path d="M40,5 L30,21 C35,18 45,18 50,21 Z" fill="#f2ede2" stroke-width="0.9"/><line x1="43" y1="13" x2="52" y2="28" stroke-width="0.7" opacity="0.45"/><line x1="46" y1="20" x2="56" y2="36" stroke-width="0.65" opacity="0.38"/><line x1="49" y1="27" x2="60" y2="43" stroke-width="0.6" opacity="0.32"/></g></svg>`,
  // 8. broad ridged mountain — olive-grey
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 62"><g stroke="#3a3818" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M55,6 L5,60 L105,60 Z" fill="#c3c6a5" stroke-width="1.4"/><path d="M55,6 L43,23 C49,20 61,20 67,23 Z" fill="#f0f0e4" stroke-width="1"/><path d="M16,42 Q55,30 94,42" stroke-width="0.85" opacity="0.3" fill="none"/><path d="M10,52 Q55,38 100,52" stroke-width="0.7" opacity="0.22" fill="none"/><line x1="59" y1="14" x2="70" y2="31" stroke-width="0.7" opacity="0.45"/><line x1="63" y1="21" x2="76" y2="39" stroke-width="0.65" opacity="0.38"/><line x1="67" y1="29" x2="80" y2="47" stroke-width="0.6" opacity="0.32"/></g></svg>`,
  // 9. narrow spire — dark basalt
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 58 72"><g stroke="#2a2010" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M29,2 L11,68 L47,68 Z" fill="#a29884" stroke-width="1.4"/><path d="M29,2 L23,15 C25,13 33,13 35,15 Z" fill="#f2ede2" stroke-width="0.9"/><line x1="32" y1="8" x2="40" y2="24" stroke-width="0.8" opacity="0.48"/><line x1="34" y1="16" x2="42" y2="33" stroke-width="0.72" opacity="0.42"/><line x1="36" y1="23" x2="44" y2="41" stroke-width="0.65" opacity="0.36"/><line x1="37" y1="31" x2="44" y2="49" stroke-width="0.6" opacity="0.3"/><line x1="38" y1="39" x2="44" y2="57" stroke-width="0.55" opacity="0.25"/></g></svg>`,
  // 10. wide panoramic single peak — sandy
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 65"><g stroke="#3a2a10" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M55,5 L5,62 L105,62 Z" fill="#d4c8a2" stroke-width="1.4"/><path d="M55,5 L44,22 C49,19 61,19 66,22 Z" fill="#f2ede2" stroke-width="1"/><line x1="59" y1="13" x2="70" y2="30" stroke-width="0.7" opacity="0.45"/><line x1="62" y1="20" x2="74" y2="37" stroke-width="0.65" opacity="0.4"/><line x1="65" y1="27" x2="78" y2="44" stroke-width="0.6" opacity="0.35"/><line x1="68" y1="34" x2="82" y2="51" stroke-width="0.55" opacity="0.3"/></g></svg>`,
]

const FOREST_SVGS = [
  // 1. single deciduous — classic green
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 72"><g stroke="#1e3812" stroke-linecap="round" stroke-linejoin="round" fill="none"><line x1="30" y1="48" x2="30" y2="68" stroke-width="2.8"/><line x1="30" y1="62" x2="20" y2="70" stroke-width="1.6"/><line x1="30" y1="62" x2="40" y2="70" stroke-width="1.6"/><path d="M30,5 C12,5 5,17 5,27 C5,41 15,50 30,50 C45,50 55,41 55,27 C55,17 48,5 30,5 Z" fill="#415f20" stroke-width="1.4"/><line x1="30" y1="50" x2="30" y2="32" stroke-width="0.85" opacity="0.45"/><line x1="30" y1="39" x2="17" y2="28" stroke-width="0.8" opacity="0.4"/><line x1="30" y1="39" x2="43" y2="28" stroke-width="0.8" opacity="0.4"/><line x1="30" y1="31" x2="21" y2="20" stroke-width="0.7" opacity="0.35"/><line x1="30" y1="31" x2="39" y2="20" stroke-width="0.7" opacity="0.35"/></g></svg>`,
  // 2. pine / conifer — deep pine
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 75"><g stroke="#0e2818" stroke-linecap="round" stroke-linejoin="round" fill="none"><line x1="30" y1="60" x2="30" y2="73" stroke-width="2.8"/><path d="M30,5 L12,36 L48,36 Z" fill="#1c4123" stroke-width="1.3"/><path d="M30,24 L10,52 L50,52 Z" fill="#1c4123" stroke-width="1.3"/><path d="M30,41 L14,63 L46,63 Z" fill="#1c4123" stroke-width="1.3"/></g></svg>`,
  // 3. single deciduous — medium green
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 72"><g stroke="#1e3518" stroke-linecap="round" stroke-linejoin="round" fill="none"><line x1="30" y1="46" x2="30" y2="68" stroke-width="3"/><line x1="30" y1="62" x2="18" y2="70" stroke-width="1.8"/><line x1="30" y1="62" x2="42" y2="70" stroke-width="1.8"/><path d="M30,5 C12,5 4,17 4,27 C4,42 14,48 30,48 C46,48 56,42 56,27 C56,17 48,5 30,5 Z" fill="#375520" stroke-width="1.4"/><line x1="30" y1="48" x2="30" y2="30" stroke-width="0.8" opacity="0.42"/><line x1="30" y1="38" x2="17" y2="26" stroke-width="0.75" opacity="0.37"/><line x1="30" y1="38" x2="43" y2="26" stroke-width="0.75" opacity="0.37"/></g></svg>`,
  // 4. single wide deciduous — deep forest
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 65 72"><g stroke="#1a3210" stroke-linecap="round" stroke-linejoin="round" fill="none"><line x1="32" y1="50" x2="32" y2="68" stroke-width="3.2"/><line x1="32" y1="62" x2="20" y2="70" stroke-width="2"/><line x1="32" y1="62" x2="44" y2="70" stroke-width="2"/><path d="M32,5 C10,5 3,18 3,30 C3,46 14,52 32,52 C50,52 61,46 61,30 C61,18 54,5 32,5 Z" fill="#23441c" stroke-width="1.4"/><line x1="32" y1="52" x2="32" y2="30" stroke-width="0.85" opacity="0.42"/><line x1="32" y1="40" x2="17" y2="26" stroke-width="0.8" opacity="0.37"/><line x1="32" y1="40" x2="47" y2="26" stroke-width="0.8" opacity="0.37"/></g></svg>`,
  // 5. single tall pine — dark pine
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 76"><g stroke="#0c2015" stroke-linecap="round" stroke-linejoin="round" fill="none"><line x1="30" y1="60" x2="30" y2="74" stroke-width="2.8"/><path d="M30,5 L13,34 L47,34 Z" fill="#193720" stroke-width="1.3"/><path d="M30,22 L11,50 L49,50 Z" fill="#193720" stroke-width="1.3"/><path d="M30,39 L16,62 L44,62 Z" fill="#193720" stroke-width="1.2"/></g></svg>`,
  // 6. ancient oak wide canopy — rich green
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 86 72"><g stroke="#182e0e" stroke-linecap="round" stroke-linejoin="round" fill="none"><line x1="43" y1="44" x2="43" y2="68" stroke-width="4"/><line x1="43" y1="60" x2="25" y2="70" stroke-width="2.2"/><line x1="43" y1="60" x2="61" y2="70" stroke-width="2.2"/><path d="M43,5 C18,5 6,18 6,30 C6,46 22,52 43,52 C64,52 80,46 80,30 C80,18 68,5 43,5 Z" fill="#304e19" stroke-width="1.6"/><line x1="43" y1="52" x2="43" y2="28" stroke-width="0.9" opacity="0.45"/><line x1="43" y1="37" x2="24" y2="22" stroke-width="0.85" opacity="0.4"/><line x1="43" y1="37" x2="62" y2="22" stroke-width="0.85" opacity="0.4"/><line x1="43" y1="26" x2="30" y2="14" stroke-width="0.7" opacity="0.33"/><line x1="43" y1="26" x2="56" y2="14" stroke-width="0.7" opacity="0.33"/><line x1="24" y1="22" x2="14" y2="14" stroke-width="0.65" opacity="0.28"/><line x1="62" y1="22" x2="72" y2="14" stroke-width="0.65" opacity="0.28"/></g></svg>`,
  // 7. single deciduous — golden autumn yellow
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 72"><g stroke="#4a3a0e" stroke-linecap="round" stroke-linejoin="round" fill="none"><line x1="30" y1="48" x2="30" y2="68" stroke-width="2.8"/><line x1="30" y1="62" x2="19" y2="70" stroke-width="1.6"/><line x1="30" y1="62" x2="41" y2="70" stroke-width="1.6"/><path d="M30,6 C13,6 5,18 5,28 C5,42 15,50 30,50 C45,50 55,42 55,28 C55,18 47,6 30,6 Z" fill="#8a7a1e" stroke-width="1.4"/><line x1="30" y1="50" x2="30" y2="32" stroke-width="0.8" opacity="0.4"/><line x1="30" y1="40" x2="18" y2="29" stroke-width="0.75" opacity="0.35"/><line x1="30" y1="40" x2="42" y2="29" stroke-width="0.75" opacity="0.35"/></g></svg>`,
  // 8. weeping tree — sage green
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 75"><g stroke="#1a2e15" stroke-linecap="round" stroke-linejoin="round" fill="none"><line x1="35" y1="30" x2="35" y2="70" stroke-width="3"/><line x1="35" y1="60" x2="20" y2="72" stroke-width="1.8"/><line x1="35" y1="60" x2="50" y2="72" stroke-width="1.8"/><path d="M35,5 C20,5 14,16 14,24 C14,32 20,36 35,36 C50,36 56,32 56,24 C56,16 50,5 35,5 Z" fill="#344e26" stroke-width="1.3"/><path d="M14,24 C10,30 8,40 13,50" stroke-width="0.9" opacity="0.35"/><path d="M56,24 C60,30 62,40 57,50" stroke-width="0.9" opacity="0.35"/><path d="M24,36 C18,44 17,54 22,62" stroke-width="0.8" opacity="0.3"/><path d="M46,36 C52,44 53,54 48,62" stroke-width="0.8" opacity="0.3"/><path d="M35,36 C33,46 32,57 35,66" stroke-width="0.75" opacity="0.28"/></g></svg>`,
  // 9. single sapling — spring green
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 68"><g stroke="#2a4818" stroke-linecap="round" stroke-linejoin="round" fill="none"><line x1="25" y1="42" x2="25" y2="62" stroke-width="1.8"/><line x1="25" y1="56" x2="15" y2="65" stroke-width="1.2"/><line x1="25" y1="56" x2="35" y2="65" stroke-width="1.2"/><path d="M25,8 C14,8 8,18 8,25 C8,35 15,43 25,43 C35,43 42,35 42,25 C42,18 36,8 25,8 Z" fill="#486928" stroke-width="1.1"/><line x1="25" y1="43" x2="25" y2="27" stroke-width="0.72" opacity="0.38"/></g></svg>`,
  // 10. dense bush / thicket — dark
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 60"><g stroke="#152210" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M14,55 C4,55 1,46 5,40 C2,34 6,28 13,28 C13,20 19,15 26,18 C29,10 39,10 41,18 C47,12 57,15 57,24 C63,20 70,25 70,32 C76,30 83,36 80,44 C84,51 78,57 71,55 Z" fill="#263e16" stroke-width="1.4"/><path d="M9,42 C8,36 12,32 16,34" stroke-width="0.8" opacity="0.35"/><path d="M25,20 C27,15 33,15 35,20" stroke-width="0.8" opacity="0.32"/><path d="M51,16 C55,13 61,15 60,21" stroke-width="0.8" opacity="0.32"/><path d="M66,27 C70,23 76,26 74,31" stroke-width="0.8" opacity="0.32"/><path d="M28,55 Q42,46 57,55" stroke-width="0.7" opacity="0.25"/></g></svg>`,
]

const BUSH_SVGS = [
  // 1. three-lobe round shrub — dark green
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 44"><g stroke="#152a0e" fill="none"><ellipse cx="20" cy="28" rx="19" ry="14" fill="#2a4415"/><ellipse cx="52" cy="28" rx="19" ry="14" fill="#2a4415"/><ellipse cx="36" cy="20" rx="21" ry="16" fill="#344e18"/><path d="M8,36 Q36,30 64,36" stroke-width="0.7" opacity="0.28"/></g></svg>`,
  // 2. wide flat shrub — medium green
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 82 40"><g stroke="#1a3210" fill="none"><path d="M6,36 C2,28 10,18 20,20 C18,12 28,7 36,11 C38,5 48,5 52,11 C60,7 70,14 68,22 C76,26 76,36 66,38 C54,42 28,42 14,38 C8,40 4,40 6,36 Z" fill="#375520" stroke-width="1.2"/><path d="M14,35 Q41,29 66,35" stroke-width="0.65" opacity="0.25"/></g></svg>`,
  // 3. thorny compact shrub — grey-green
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 68 46"><g stroke="#2a3820" stroke-linecap="round" fill="none"><path d="M34,6 C22,6 12,12 9,20 C6,28 9,38 20,41 C26,44 42,44 48,41 C58,38 62,28 60,20 C57,12 46,6 34,6 Z" fill="#3c5028" stroke-width="1.2"/><line x1="34" y1="6" x2="30" y2="1"/><line x1="34" y1="6" x2="38" y2="1"/><line x1="34" y1="6" x2="25" y2="2"/><line x1="34" y1="6" x2="43" y2="2"/><line x1="9" y1="20" x2="4" y2="16"/><line x1="9" y1="20" x2="4" y2="22"/><line x1="60" y1="20" x2="65" y2="16"/><line x1="60" y1="20" x2="65" y2="22"/><path d="M11,30 Q34,24 58,30" stroke-width="0.7" opacity="0.28"/></g></svg>`,
  // 4. berry bush — dark green + red berries
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 68 44"><g stroke="#152010" fill="none"><path d="M34,5 C16,5 5,14 5,24 C5,35 16,42 34,42 C52,42 63,35 63,24 C63,14 52,5 34,5 Z" fill="#2a441a" stroke-width="1.2"/><g fill="#c23020"><circle cx="20" cy="16" r="2.5"/><circle cx="34" cy="12" r="2.5"/><circle cx="48" cy="16" r="2.5"/><circle cx="16" cy="26" r="2.5"/><circle cx="30" cy="22" r="2.5"/><circle cx="46" cy="23" r="2.5"/><circle cx="58" cy="22" r="2.5"/></g><path d="M8,32 Q34,26 60,32" stroke-width="0.65" opacity="0.25"/></g></svg>`,
  // 5. autumn bush — golden amber
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 44"><g stroke="#4a3010" fill="none"><ellipse cx="21" cy="26" rx="19" ry="14" fill="#8a6a18"/><ellipse cx="51" cy="26" rx="19" ry="14" fill="#8a6a18"/><ellipse cx="36" cy="18" rx="21" ry="15" fill="#a07820"/><path d="M9,35 Q36,27 63,35" stroke-width="0.7" opacity="0.28"/></g></svg>`,
  // 6. desert scrub — dry brown-grey
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 46"><g stroke="#5a4828" stroke-linecap="round" fill="none"><line x1="35" y1="38" x2="35" y2="28" stroke-width="2.2"/><line x1="35" y1="36" x2="20" y2="44" stroke-width="1.5"/><line x1="35" y1="36" x2="50" y2="44" stroke-width="1.5"/><line x1="35" y1="32" x2="14" y2="22" stroke-width="1.5"/><line x1="35" y1="32" x2="56" y2="22" stroke-width="1.5"/><line x1="35" y1="28" x2="22" y2="12" stroke-width="1.2"/><line x1="35" y1="28" x2="48" y2="12" stroke-width="1.2"/><line x1="35" y1="28" x2="35" y2="10" stroke-width="1.2"/><line x1="14" y1="22" x2="6" y2="14" stroke-width="1" opacity="0.7"/><line x1="56" y1="22" x2="64" y2="14" stroke-width="1" opacity="0.7"/><ellipse cx="35" cy="9" rx="5" ry="4" fill="#9a8a68" stroke-width="0.8"/><ellipse cx="22" cy="11" rx="4" ry="3" fill="#9a8a68" stroke-width="0.8"/><ellipse cx="48" cy="11" rx="4" ry="3" fill="#9a8a68" stroke-width="0.8"/></g></svg>`,
  // 7. flowering bush — spring green + white flowers
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 44"><g stroke="#1a3410" fill="none"><path d="M35,5 C18,5 7,14 7,24 C7,34 17,42 35,42 C53,42 63,34 63,24 C63,14 52,5 35,5 Z" fill="#3a6020" stroke-width="1.2"/><g fill="#f8f4e8" stroke="#e8e0b0" stroke-width="0.5"><circle cx="22" cy="14" r="3"/><circle cx="35" cy="10" r="3.5"/><circle cx="48" cy="14" r="3"/><circle cx="16" cy="24" r="2.8"/><circle cx="30" cy="20" r="3"/><circle cx="44" cy="20" r="3"/><circle cx="58" cy="24" r="2.8"/></g><path d="M10,34 Q35,26 60,34" stroke-width="0.65" opacity="0.25"/></g></svg>`,
  // 8. dense low thicket — very dark green
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 84 38"><g stroke="#0e2010" fill="none"><path d="M7,34 C2,26 8,18 18,18 C16,12 24,7 32,10 C32,4 44,4 48,10 C56,6 66,12 64,20 C72,22 78,30 72,36 C60,40 24,40 12,36 C7,38 4,38 7,34 Z" fill="#1c3410" stroke-width="1.2"/><path d="M14,18 Q42,12 66,20" stroke-width="0.7" opacity="0.3"/><path d="M8,28 Q42,20 76,28" stroke-width="0.65" opacity="0.25"/></g></svg>`,
  // 9. sage/silver shrub — grey-blue
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 68 44"><g stroke="#2a3840" fill="none"><ellipse cx="20" cy="26" rx="18" ry="14" fill="#5a7880"/><ellipse cx="48" cy="26" rx="18" ry="14" fill="#5a7880"/><ellipse cx="34" cy="18" rx="20" ry="15" fill="#6a8890"/><path d="M8,34 Q34,26 60,34" stroke-width="0.7" opacity="0.3"/></g></svg>`,
  // 10. olive/mediterranean shrub — dark olive
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 44"><g stroke="#2a3418" fill="none"><path d="M35,6 C20,6 8,14 6,24 C5,32 14,40 28,42 C32,44 38,44 42,42 C56,40 65,32 64,24 C62,14 50,6 35,6 Z" fill="#4a5c28" stroke-width="1.2"/><g stroke="#6a7c38" stroke-width="0.7" fill="none" opacity="0.55"><ellipse cx="22" cy="20" rx="5" ry="3" transform="rotate(-20 22 20)"/><ellipse cx="35" cy="14" rx="5" ry="3" transform="rotate(10 35 14)"/><ellipse cx="48" cy="20" rx="5" ry="3" transform="rotate(25 48 20)"/><ellipse cx="18" cy="30" rx="5" ry="3" transform="rotate(-15 18 30)"/><ellipse cx="35" cy="28" rx="5" ry="3"/><ellipse cx="52" cy="30" rx="5" ry="3" transform="rotate(20 52 30)"/></g><path d="M10,36 Q35,28 60,36" stroke-width="0.65" opacity="0.25"/></g></svg>`,
]

// ── Procedural SVG generators (25 extra variants each) ───────────────────────

function genMtnSVG(seed: number): string {
  const rng = seededRng(seed * 6271 + 17)
  const MTN_PALS: [string,string,string,string][] = [
    ['#d4c69b','#c3b58a','#f2ede2','#4a3218'],
    ['#b9bcc6','#acafb9','#eef0f8','#303038'],
    ['#d7b28a','#c8a57d','#f6f0e4','#5a2a10'],
    ['#b2bcc8','#a5afbb','#eef2fa','#303840'],
    ['#a29884','#948c7a','#eee9e1','#2a2010'],
    ['#dacf9e','#cabd8e','#f2ede2','#403218'],
    ['#c3c6a5','#b4b796','#f0f0e4','#3a3818'],
  ]
  const [mF, bF, sF, stk] = MTN_PALS[Math.floor(rng() * MTN_PALS.length)]
  const nP = 1
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
    o += `<path d="M${cx},${ty} L${bL},${bY} L${bR},${bY} Z" fill="${m?mF:bF}" stroke-width="${m?'1.4':'1.0'}"/>`
    const hw = Math.min(bR - cx, cx - bL) * 0.3
    const sB = (ty + hw * 1.5).toFixed(1)
    o += `<path d="M${cx},${ty} L${(cx-hw).toFixed(1)},${sB} C${(cx-hw*.5).toFixed(1)},${(ty+hw).toFixed(1)} ${(cx+hw*.5).toFixed(1)},${(ty+hw).toFixed(1)} ${(cx+hw).toFixed(1)},${sB} Z" fill="${sF}" stroke-width="${m?'0.9':'0.75'}"/>`
    const hC = 3 + Math.floor(rng() * 2)
    for (let h = 0; h < hC; h++) {
      const t = (h + 1) / (hC + 1)
      o += `<line x1="${(cx+(bR-cx)*t*.62).toFixed(1)}" y1="${(ty+(bY-ty)*t*.92).toFixed(1)}" x2="${(cx+(bR-cx)*Math.min(1,t*.62+.14)).toFixed(1)}" y2="${(ty+(bY-ty)*Math.min(1,t*.92+.12)).toFixed(1)}" stroke-width="0.7" opacity="${(0.55-t*.18).toFixed(2)}"/>`
    }
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}"><g stroke="${stk}" stroke-linecap="round" stroke-linejoin="round" fill="none">${o}</g></svg>`
}

function genForestSVG(seed: number): string {
  const rng = seededRng(seed * 5381 + 23)
  const FST_PALS: [string,string][] = [
    ['#415f20','#1e3812'],
    ['#1c4123','#0e2818'],
    ['#375520','#1e3518'],
    ['#2d4816','#1a3210'],
    ['#486928','#2a4818'],
    ['#263e16','#152210'],
    ['#344e26','#1a2e15'],
    ['#23441c','#102010'],
    ['#8a7a1e','#4a3a0e'],
    ['#a07820','#503808'],
    ['#7a8018','#3a4010'],
  ]
  const [fill, stk] = FST_PALS[Math.floor(rng() * FST_PALS.length)]
  const n = 1
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
        o += `<path d="M${cx.toFixed(1)},${py.toFixed(1)} L${(cx-pw).toFixed(1)},${pb.toFixed(1)} L${(cx+pw).toFixed(1)},${pb.toFixed(1)} Z" fill="${fill}" stroke-width="${(1+sc*.3).toFixed(1)}"/>`
      }
    } else {
      const r = tW * 0.54
      const cy = topY + r * 0.9
      o += `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${(r*1.25).toFixed(1)}" ry="${r.toFixed(1)}" fill="${fill}" stroke-width="${(1.2+sc*.2).toFixed(1)}"/>`
      o += `<line x1="${cx.toFixed(1)}" y1="${(cy+r).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${cy.toFixed(1)}" stroke-width="0.8" opacity="0.4"/>`
      o += `<line x1="${cx.toFixed(1)}" y1="${(cy+r*.3).toFixed(1)}" x2="${(cx-r*.7).toFixed(1)}" y2="${(cy-r*.3).toFixed(1)}" stroke-width="0.7" opacity="0.33"/>`
      o += `<line x1="${cx.toFixed(1)}" y1="${(cy+r*.3).toFixed(1)}" x2="${(cx+r*.7).toFixed(1)}" y2="${(cy-r*.3).toFixed(1)}" stroke-width="0.7" opacity="0.33"/>`
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}"><g stroke="${stk}" stroke-linecap="round" stroke-linejoin="round" fill="none">${o}</g></svg>`
}

function genBushSVG(seed: number): string {
  const rng = seededRng(seed * 4337 + 31)
  const BUSH_PALS: [string,string][] = [
    ['#2a4415','#152a0e'],['#375520','#1a3210'],['#3c5028','#1e2810'],
    ['#344e18','#182a0c'],['#486928','#243410'],['#8a6a18','#4a3010'],
    ['#3a6020','#1a3010'],['#4a5c28','#242e10'],['#5a7880','#2a3840'],
    ['#263e16','#122010'],
  ]
  const [fill, stk] = BUSH_PALS[Math.floor(rng() * BUSH_PALS.length)]
  const n = 2 + Math.floor(rng() * 3)
  const VW = 55 + Math.round(rng() * 30)
  const VH = 36 + Math.round(rng() * 12)
  const bY = VH - 3
  const slot = VW / n
  let o = ''
  for (let i = 0; i < n; i++) {
    const cx = slot * (i + 0.2 + rng() * 0.6)
    const rx = slot * (0.42 + rng() * 0.18)
    const ry = (VH - 4) * (0.5 + rng() * 0.25)
    const cy = bY - ry
    o += `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${fill}"/>`
  }
  o += `<path d="M${(VW*.14).toFixed(1)},${(bY-3).toFixed(1)} Q${(VW*.5).toFixed(1)},${(bY-9).toFixed(1)} ${(VW*.86).toFixed(1)},${(bY-3).toFixed(1)}" stroke-width="0.7" opacity="0.25"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}"><g stroke="${stk}" fill="none">${o}</g></svg>`
}

const ALL_MOUNTAIN_SVGS = [...MOUNTAIN_SVGS, ...Array.from({length:25},(_,i)=>genMtnSVG(i+1))]
const ALL_FOREST_SVGS   = [...FOREST_SVGS,   ...Array.from({length:25},(_,i)=>genForestSVG(i+1))]
const ALL_BUSH_SVGS     = [...BUSH_SVGS,     ...Array.from({length:10},(_,i)=>genBushSVG(i+1))]

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
  if (ill.kind==='bush')     return ALL_BUSH_SVGS[ill.variant % ALL_BUSH_SVGS.length]
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
      const FADE_HEAD=0.10, FADE_TAIL=0.18
      for(let i=0;i<n-1;i++){
        const t=i/(n-1)
        const fa=t<FADE_HEAD?t/FADE_HEAD:t>(1-FADE_TAIL)?(1-t)/FADE_TAIL:1
        const w=r.width*(c.minW+(c.maxW-c.minW)*t)
        ctx.globalAlpha=fa;ctx.lineWidth=w*(pass==='shadow'?c.shadowR:pass==='color'?1:c.hlR)
        ctx.beginPath();ctx.moveTo(smooth[i][0],smooth[i][1]);ctx.lineTo(smooth[i+1][0],smooth[i+1][1]);ctx.stroke()
      }
      ctx.globalAlpha=1
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

// ── Terrain boundary smoothing (12px Gaussian blend at terrain edges) ─────────

function smoothTerrainBoundaries(ctx: CanvasRenderingContext2D, bounds?: {x:number;y:number;w:number;h:number}) {
  const R = 12
  const px0 = Math.max(0, bounds ? bounds.x - R : 0)
  const py0 = Math.max(0, bounds ? bounds.y - R : 0)
  const px1 = Math.min(W, bounds ? bounds.x + bounds.w + R : W)
  const py1 = Math.min(H, bounds ? bounds.y + bounds.h + R : H)
  const rw = px1 - px0, rh = py1 - py0
  if (rw <= 0 || rh <= 0) return

  const src = ctx.getImageData(px0, py0, rw, rh)
  const sd = src.data

  // Step 1: detect boundary pixels (any 4-neighbour differs by >30)
  const boundary = new Uint8Array(rw * rh)
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const i = (y*rw+x)*4, r0=sd[i], g0=sd[i+1], b0=sd[i+2]
      for (const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]] as [number,number][]) {
        const nx=x+dx, ny=y+dy
        if (nx<0||nx>=rw||ny<0||ny>=rh) continue
        const ni=(ny*rw+nx)*4
        if (Math.abs(sd[ni]-r0)+Math.abs(sd[ni+1]-g0)+Math.abs(sd[ni+2]-b0)>30) { boundary[y*rw+x]=1; break }
      }
    }
  }

  // Step 2: Manhattan distance transform from boundary pixels
  const dist = new Float32Array(rw*rh).fill(R+1)
  for (let i=0;i<rw*rh;i++) if (boundary[i]) dist[i]=0
  for (let y=0;y<rh;y++) for (let x=0;x<rw;x++) {
    const i=y*rw+x
    if (x>0 && dist[i-1]+1<dist[i]) dist[i]=dist[i-1]+1
    if (y>0 && dist[i-rw]+1<dist[i]) dist[i]=dist[i-rw]+1
  }
  for (let y=rh-1;y>=0;y--) for (let x=rw-1;x>=0;x--) {
    const i=y*rw+x
    if (x<rw-1 && dist[i+1]+1<dist[i]) dist[i]=dist[i+1]+1
    if (y<rh-1 && dist[i+rw]+1<dist[i]) dist[i]=dist[i+rw]+1
  }

  // Step 3: separable Gaussian blur — horizontal pass
  const tmp = new Float32Array(rw*rh*3)
  const sig2 = R*R*0.5
  for (let y=0;y<rh;y++) {
    for (let x=0;x<rw;x++) {
      const idx=y*rw+x, i=idx*4
      if (dist[idx]>R) { tmp[idx*3]=sd[i]; tmp[idx*3+1]=sd[i+1]; tmp[idx*3+2]=sd[i+2]; continue }
      let rS=0,gS=0,bS=0,wS=0
      for (let dx=-R;dx<=R;dx++) {
        const nx=x+dx; if(nx<0||nx>=rw) continue
        const w=Math.exp(-dx*dx/sig2), ni=(y*rw+nx)*4
        rS+=sd[ni]*w; gS+=sd[ni+1]*w; bS+=sd[ni+2]*w; wS+=w
      }
      tmp[idx*3]=rS/wS; tmp[idx*3+1]=gS/wS; tmp[idx*3+2]=bS/wS
    }
  }

  // Step 4: vertical pass + alpha-blend by distance
  const out = new ImageData(rw, rh)
  const od = out.data
  for (let y=0;y<rh;y++) {
    for (let x=0;x<rw;x++) {
      const idx=y*rw+x, i=idx*4
      od[i+3]=255
      const d=dist[idx]
      if (d>R) { od[i]=sd[i]; od[i+1]=sd[i+1]; od[i+2]=sd[i+2]; continue }
      let rS=0,gS=0,bS=0,wS=0
      for (let dy=-R;dy<=R;dy++) {
        const ny=y+dy; if(ny<0||ny>=rh) continue
        const w=Math.exp(-dy*dy/sig2), ti=(ny*rw+x)*3
        rS+=tmp[ti]*w; gS+=tmp[ti+1]*w; bS+=tmp[ti+2]*w; wS+=w
      }
      const a=Math.max(0,1-d/R)
      od[i]  =Math.round(sd[i]  *(1-a)+rS/wS*a)
      od[i+1]=Math.round(sd[i+1]*(1-a)+gS/wS*a)
      od[i+2]=Math.round(sd[i+2]*(1-a)+bS/wS*a)
    }
  }
  ctx.putImageData(out, px0, py0)
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
  const currentPtsRef   = useRef<[number,number][]>([])
  const illVariants     = useRef<Record<string,number>>({})
  const strokeBoundsRef = useRef<{x0:number;y0:number;x1:number;y1:number}|null>(null)

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
    if (strokeBoundsRef.current) {
      strokeBoundsRef.current.x0=Math.min(strokeBoundsRef.current.x0,x-r)
      strokeBoundsRef.current.y0=Math.min(strokeBoundsRef.current.y0,y-r)
      strokeBoundsRef.current.x1=Math.max(strokeBoundsRef.current.x1,x+r)
      strokeBoundsRef.current.y1=Math.max(strokeBoundsRef.current.y1,y+r)
    }
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
      smoothTerrainBoundaries(tCtx)
      rerender();doSave();return
    }
    if(tool==='brush'||tool==='erase'){
      pushHistory();drawingRef.current=true;lastRef.current={x,y}
      const r=brushSzRef.current/2
      strokeBoundsRef.current={x0:x-r,y0:y-r,x1:x+r,y1:y+r}
      paintFeatheredDot(x,y,tool==='erase'?'erase':terrainIdRef.current);return
    }
    if(tool==='road'||tool==='river'){
      pushHistory();currentPtsRef.current=[[x,y]];drawingRef.current=true;return
    }
    if(tool==='illustrate'){
      pushHistory()
      const kind=illusKindRef.current
      const numVariants=kind==='mountain'?ALL_MOUNTAIN_SVGS.length:kind==='forest'?ALL_FOREST_SVGS.length:kind==='bush'?ALL_BUSH_SVGS.length:1
      const v=(illVariants.current[kind]??0)%numVariants
      illVariants.current[kind]=(v+1)%numVariants
      const baseAngle=(kind==='forest'||kind==='bush')?(Math.random()<0.05?(Math.random()-0.5)*8:0):0
      const sizeVar=(0.05+Math.random()*0.10)*(Math.random()<0.5?1:-1)
      const sz=(kind==='mountain'||kind==='forest'||kind==='bush')?Math.round(illusSzRef.current*(1+sizeVar)):illusSzRef.current
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
    if(tool==='brush'||tool==='erase'){
      lastRef.current=null
      if(strokeBoundsRef.current){
        const b=strokeBoundsRef.current,terrain=terrainRef.current
        if(terrain) smoothTerrainBoundaries(terrain.getContext('2d')!,{x:Math.floor(b.x0),y:Math.floor(b.y0),w:Math.ceil(b.x1-b.x0),h:Math.ceil(b.y1-b.y0)})
        strokeBoundsRef.current=null
      }
      rerender();doSave();return
    }
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
