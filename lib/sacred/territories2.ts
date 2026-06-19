import type { UnitClass, MagePath, WarriorPath, CatapultPath, Side } from './types'
import { buildFreeUnit } from './game'
import type { GameUnit } from './types'
import { HIRE_COSTS, FORTRESS_UPGRADE_COST, SLOT_COSTS, FORTRESS_NAMES, getReviveCost as _getReviveCost } from './territories'
export { HIRE_COSTS, FORTRESS_UPGRADE_COST, SLOT_COSTS, FORTRESS_NAMES }
export { getReviveCost } from './territories'
export { isSlotUnlocked } from './territories'

export interface UnitSpec2 {
  class: UnitClass
  level: number
  magePath?: MagePath
  warriorPath?: WarriorPath
  catapultPath?: CatapultPath
}

export interface District {
  id: string
  name: string
  regionId: string
  isCapital?: boolean
  isStart?: boolean
  adjacentTo: string[]
  polygon: [number, number][]
  army: UnitSpec2[]
  goldPerDay: number
}

export interface Region2 {
  id: string
  name: string
  adjacentRegions: string[]
  districts: string[]
  finalBattleArmy: UnitSpec2[]
  isBoss?: boolean
}

export interface TerritoryMap2State {
  ownership:           Record<string, 'player' | 'enemy' | 'bot'>
  conqueredRegions:    string[]
  botConqueredRegions: string[]
  activeRegionId:      string
  pendingFinalBattle:  string | null
  gold:                number
  turn:                number
  ap:                  number
  armyNodeId:          string
  maxArmySlots:        number
  fortressLevel:       1 | 2 | 3 | 4 | 5
  restedThisTurn:      boolean
  botUnits:            number   // bot army size (unit count)
  botGold:             number   // bot accumulated gold
  botRestTurns:        number   // turns until bot can act again
}

export const MAP2_WIDTH  = 1796
export const MAP2_HEIGHT = 1336

// ── Regions ───────────────────────────────────────────────────────────────────
export const REGIONS_2: Region2[] = [
  {
    id: 'terr_218', name: 'Ерідія',
    adjacentRegions: ['terr_225', 'terr_237'],
    districts: ['terr_221', 'terr_222', 'terr_219', 'terr_220'],
    finalBattleArmy: [
      { class: 'warrior', level: 2 },
      { class: 'warrior', level: 2 },
      { class: 'warrior', level: 2 },
      { class: 'archer',  level: 1 },
      { class: 'archer',  level: 1 },
      { class: 'mage',    level: 1 },
    ],
  },
  {
    id: 'terr_225', name: 'Сілонія',
    adjacentRegions: ['terr_218', 'terr_237'],
    districts: ['terr_204', 'terr_202', 'terr_203', 'terr_205'],
    finalBattleArmy: [
      { class: 'warrior', level: 2 },
      { class: 'warrior', level: 2 },
      { class: 'warrior', level: 2 },
      { class: 'warrior', level: 2 },
      { class: 'archer',  level: 2 },
      { class: 'archer',  level: 2 },
      { class: 'mage',    level: 2, magePath: 'fire' },
    ],
  },
  {
    id: 'terr_237', name: 'Фаленор',
    adjacentRegions: ['terr_218', 'terr_225', 'terr_206', 'terr_230'],
    districts: ['terr_238', 'terr_239', 'terr_240', 'terr_241'],
    finalBattleArmy: [
      { class: 'warrior', level: 2 },
      { class: 'warrior', level: 2 },
      { class: 'warrior', level: 2 },
      { class: 'warrior', level: 2 },
      { class: 'archer',  level: 2 },
      { class: 'archer',  level: 2 },
      { class: 'mage',    level: 2, magePath: 'water' },
      { class: 'mage',    level: 2, magePath: 'earth' },
    ],
  },
  {
    id: 'terr_206', name: 'Паліндор',
    adjacentRegions: ['terr_237', 'terr_230', 'terr_242'],
    districts: ['terr_209', 'terr_210', 'terr_211', 'terr_215', 'terr_214', 'terr_208', 'terr_207', 'terr_213', 'terr_212', 'terr_217'],
    finalBattleArmy: [
      { class: 'warrior',  level: 3, warriorPath: 'paladin' },
      { class: 'warrior',  level: 3, warriorPath: 'paladin' },
      { class: 'warrior',  level: 3, warriorPath: 'paladin' },
      { class: 'archer',   level: 3 },
      { class: 'archer',   level: 3 },
      { class: 'mage',     level: 3, magePath: 'water' },
      { class: 'catapult', level: 2, catapultPath: 'ballista' },
    ],
  },
  {
    id: 'terr_230', name: 'Калідонія',
    adjacentRegions: ['terr_237', 'terr_206', 'terr_223', 'terr_242'],
    districts: ['terr_234', 'terr_231', 'terr_232', 'terr_233', 'terr_235', 'terr_236'],
    finalBattleArmy: [
      { class: 'warrior',  level: 3, warriorPath: 'paladin' },
      { class: 'warrior',  level: 3, warriorPath: 'paladin' },
      { class: 'warrior',  level: 3, warriorPath: 'paladin' },
      { class: 'archer',   level: 3 },
      { class: 'archer',   level: 3 },
      { class: 'mage',     level: 4, magePath: 'fire' },
      { class: 'catapult', level: 2, catapultPath: 'ballista' },
    ],
  },
  {
    id: 'terr_223', name: 'Тетрарія',
    adjacentRegions: ['terr_230', 'terr_242'],
    districts: ['terr_229', 'terr_227', 'terr_226'],
    finalBattleArmy: [
      { class: 'warrior',  level: 4, warriorPath: 'paladin' },
      { class: 'warrior',  level: 4, warriorPath: 'paladin' },
      { class: 'warrior',  level: 4, warriorPath: 'paladin' },
      { class: 'archer',   level: 3 },
      { class: 'archer',   level: 3 },
      { class: 'mage',     level: 4, magePath: 'fire' },
      { class: 'catapult', level: 3, catapultPath: 'trebuchet' },
    ],
  },
  {
    id: 'terr_242', name: 'Болсовер',
    adjacentRegions: ['terr_206', 'terr_230', 'terr_223'],
    districts: [],
    isBoss: true,
    finalBattleArmy: [
      { class: 'warrior',  level: 4, warriorPath: 'paladin' },
      { class: 'warrior',  level: 4, warriorPath: 'paladin' },
      { class: 'warrior',  level: 4, warriorPath: 'champion' },
      { class: 'archer',   level: 3 },
      { class: 'archer',   level: 3 },
      { class: 'mage',     level: 4, magePath: 'fire' },
      { class: 'catapult', level: 3, catapultPath: 'trebuchet' },
    ],
  },
]

// ── Districts ─────────────────────────────────────────────────────────────────
export const DISTRICTS_2: District[] = [
  // ── Ерідія ──────────────────────────────────────────────────────────────────
  {
    id: 'terr_221', name: 'Геллеспорт', regionId: 'terr_218', isStart: true,
    goldPerDay: 1,
    adjacentTo: ['terr_219', 'terr_220', 'terr_222'],
    army: [],
    polygon: [[107,203.1],[114.6,254.6],[139.4,262.3],[179.5,280.2],[214.8,292.3],[229.6,278],[237.2,242.8],[205.4,186.3],[169.7,168.4],[151.9,180.3],[139,171.4],[119.2,190.2]],
  },
  {
    id: 'terr_222', name: 'Ллінс Енд', regionId: 'terr_218',
    goldPerDay: 1,
    adjacentTo: ['terr_219', 'terr_221'],
    army: [{ class: 'warrior', level: 1 }, { class: 'warrior', level: 1 }],
    polygon: [[114.1,254.4],[86.5,254.6],[63.6,255.7],[60.6,216],[2.1,214],[1.1,144.6],[34.8,132.7],[61.6,111.9],[95.3,118.8],[105.3,153.5],[105.3,175.3],[107.2,203.1]],
  },
  {
    id: 'terr_219', name: 'Вестайд', regionId: 'terr_218',
    goldPerDay: 1,
    adjacentTo: ['terr_204', 'terr_205', 'terr_220', 'terr_221', 'terr_222', 'terr_238'],
    army: [{ class: 'warrior', level: 1 }, { class: 'warrior', level: 1 }, { class: 'warrior', level: 1 }],
    polygon: [[114.6,254.6],[139.4,262.3],[179.5,280.2],[248.6,305.8],[298.1,300.7],[356.1,327.1],[419.2,356.1],[476.4,370.6],[540.4,388.5],[589.3,437.2],[549.6,489.8],[505.6,521.4],[473.9,511.9],[432.9,511.4],[402,507],[390.9,492.6],[377.6,491.5],[363.8,483.7],[351.1,467.1],[331.1,466.6],[320.6,457.7],[300.7,452.8],[263.1,459.9],[271.9,443.5],[291.6,427],[268.1,392.1],[243.3,362.3],[222.4,376.9],[204,365.4],[203.3,345.8],[184.3,342],[179.9,356.6],[157.6,357.2],[153.2,338.8],[137,307.3],[131.1,290.4],[121.1,291.4],[121.1,310.2],[109.2,323.1],[84.4,330.1],[67.6,352.9],[38.8,348.9],[13,327.1],[15,300.3],[32.9,278.5],[63.6,255.7],[86.5,254.6]],
  },
  {
    id: 'terr_220', name: 'Дун Морган', regionId: 'terr_218', isCapital: true,
    goldPerDay: 3,
    adjacentTo: ['terr_219', 'terr_221', 'terr_239'],
    army: [{ class: 'warrior', level: 1 }, { class: 'warrior', level: 1 }, { class: 'warrior', level: 1 }, { class: 'archer', level: 1 }],
    polygon: [[676.3,356.8],[620,417.4],[589.3,437.2],[540.4,388.5],[476.4,370.6],[419.2,356.1],[356.1,327.1],[298.1,300.7],[248.6,305.8],[214.8,292.3],[229.6,278],[237.2,242.8],[273.9,230.9],[321.5,210.1],[358.2,241.8],[382,213],[439.5,235.9],[453.4,226.9],[483.2,235.9],[507,265.6],[537.7,288.4],[568.5,288.4],[591.3,263.6],[610.1,240.8],[633.9,245.8],[648.8,260.6],[647.8,287.4],[647.8,316.2],[652.8,346.9]],
  },

  // ── Сілонія ─────────────────────────────────────────────────────────────────
  {
    id: 'terr_204', name: 'Валінстор', regionId: 'terr_225',
    goldPerDay: 1,
    adjacentTo: ['terr_202', 'terr_203', 'terr_205', 'terr_219'],
    army: [{ class: 'warrior', level: 1 }, { class: 'warrior', level: 1 }, { class: 'archer', level: 1 }],
    polygon: [[362.6,559.8],[377.9,534],[402,507],[390.9,492.6],[377.6,491.5],[363.8,483.7],[351.1,467.1],[331.1,466.6],[320.6,457.7],[300.7,452.8],[263.1,459.9],[264.2,487.1],[254.8,505.9],[249.3,526.3],[237.8,529.3],[219.2,553.1],[203.7,559.3],[195.3,545.2],[180.7,554.9],[188.7,572.2],[178,592.1],[190.4,593.4],[189.5,601.8],[214.1,598.7],[239.3,605],[277.4,613],[304.8,633.7],[329.5,658.4],[361.8,684.4],[376.4,676.1],[384.3,663],[371.9,624.4],[355.5,605.2],[341.8,591],[372.4,594.8],[374.1,576.7]],
  },
  {
    id: 'terr_202', name: 'Форт Ант', regionId: 'terr_225',
    goldPerDay: 1,
    adjacentTo: ['terr_203', 'terr_204'],
    army: [{ class: 'warrior', level: 1 }, { class: 'warrior', level: 1 }, { class: 'warrior', level: 1 }, { class: 'archer', level: 1 }],
    polygon: [[239.3,605],[277.4,613],[304.8,633.7],[329.5,658.4],[361.8,684.4],[353.2,689.8],[353.2,700.6],[345.2,709.1],[332.6,711.8],[323.6,716.7],[311.1,723],[294,724.3],[290,739.2],[253.3,747.4],[249.7,733.7],[233.4,747.4],[203.3,739.5],[176.3,723.1],[163.9,698.8],[147.5,692.1],[143.1,674.9],[154.6,647.4],[168.7,645.6],[168.3,626.2],[178.5,616.9],[189.5,601.8],[214.1,598.7]],
  },
  {
    id: 'terr_203', name: 'Тейлондейл', regionId: 'terr_225',
    goldPerDay: 1,
    adjacentTo: ['terr_202', 'terr_204', 'terr_205', 'terr_209', 'terr_238'],
    army: [{ class: 'warrior', level: 2 }, { class: 'warrior', level: 2 }, { class: 'archer', level: 1 }],
    polygon: [[399.6,659.6],[415.5,673.8],[438.7,677.2],[460.8,681.2],[486.3,690.8],[501.3,712.7],[439.7,752.7],[401.9,794.8],[402,805.9],[385.2,817.4],[379,812],[374.5,819.6],[365.7,820.5],[354.6,811.2],[346.7,812.9],[332.1,816],[328.5,806.7],[316.6,795.7],[310.4,810.3],[302.4,814.3],[275,803.6],[285.1,776.6],[253.3,747.4],[290,739.2],[294,724.3],[311.1,723],[323.6,716.7],[332.6,711.8],[345.2,709.1],[353.2,700.6],[353.2,689.8],[361.8,684.4],[376.4,676.1],[384.3,663]],
  },
  {
    id: 'terr_205', name: 'Самбрейва', regionId: 'terr_225', isCapital: true,
    goldPerDay: 3,
    adjacentTo: ['terr_203', 'terr_204', 'terr_219', 'terr_238'],
    army: [
      { class: 'warrior', level: 2 }, { class: 'warrior', level: 2 }, { class: 'warrior', level: 2 },
      { class: 'archer',  level: 2 }, { class: 'mage',    level: 1 },
    ],
    polygon: [[373.6,576.5],[372.4,594.8],[341.8,591],[355.5,605.2],[371.9,624.4],[384.3,663],[396.4,660.2],[399.6,659.6],[415.5,673.8],[438.7,677.2],[460.8,681.2],[486.3,690.8],[501.3,712.7],[519.7,686.8],[549.9,643.5],[552.1,594.9],[533.7,550.6],[505.6,521.4],[473.9,511.9],[432.9,511.4],[402,507],[377.9,534],[362.6,559.8]],
  },

  // ── Фаленор ─────────────────────────────────────────────────────────────────
  {
    id: 'terr_238', name: 'Елденвард', regionId: 'terr_237', isCapital: true,
    goldPerDay: 3,
    adjacentTo: ['terr_203', 'terr_205', 'terr_209', 'terr_210', 'terr_211', 'terr_219', 'terr_239'],
    army: [
      { class: 'warrior', level: 2 }, { class: 'warrior', level: 2 }, { class: 'warrior', level: 2 },
      { class: 'archer',  level: 2 }, { class: 'mage',    level: 1 },
    ],
    polygon: [[625.8,489.9],[689.4,502.9],[723.7,515.2],[776.8,556],[851,604.1],[880.4,629.4],[894.2,671.1],[865.6,693.6],[816.4,705.7],[787.3,716.6],[753.9,703.3],[737.5,693],[713.2,696.6],[685.2,694.2],[654.3,694.2],[639.7,722.7],[605,723.9],[574.7,736.7],[554,751.3],[537,757.9],[501.8,747],[439.7,752.7],[501.3,712.7],[519.7,686.8],[549.9,643.5],[552.1,594.9],[533.7,550.6],[505.6,521.4],[549.6,489.8],[573.5,458]],
  },
  {
    id: 'terr_239', name: 'Мідлок', regionId: 'terr_237',
    goldPerDay: 1,
    adjacentTo: ['terr_211', 'terr_220', 'terr_231', 'terr_234', 'terr_238', 'terr_240'],
    army: [
      { class: 'warrior', level: 2 }, { class: 'warrior', level: 2 }, { class: 'warrior', level: 2 },
      { class: 'archer',  level: 2 }, { class: 'archer',  level: 2 },
    ],
    polygon: [[945.7,347.8],[965.3,387.8],[1008.6,423.7],[1070.6,424.6],[1123.3,412.1],[1143.9,457.9],[1154.2,503.7],[1128,548.5],[1083.1,601.8],[1012.6,643.7],[975.6,628.6],[950.7,640.7],[926.4,666.8],[894.2,671.1],[880.4,629.4],[851,604.1],[776.8,556],[723.7,515.2],[689.4,502.9],[625.8,489.9],[573.5,458],[589.3,437.2],[620,417.4],[676.6,356.9],[683.1,346.9],[701.8,319.4],[717,324.1],[752.7,334.6],[772.5,311.2],[798.2,290.8],[779.5,263.3],[804.1,238.7],[818.7,242.8],[828.6,232.3],[844.4,249.3],[890,250.4],[950.8,236.4],[974.7,252.8],[960.4,288.2]],
  },
  {
    id: 'terr_240', name: 'Віндвейл', regionId: 'terr_237',
    goldPerDay: 1,
    adjacentTo: ['terr_234', 'terr_239', 'terr_241'],
    army: [
      { class: 'warrior', level: 1 }, { class: 'warrior', level: 1 }, { class: 'archer', level: 1 },
    ],
    polygon: [[1150.6,272.7],[1221.6,285],[1274.5,311.9],[1229,330.6],[1189.3,365.6],[1123.3,412.1],[1070.6,424.6],[1008.6,423.7],[965.3,387.8],[945.7,347.8],[960.4,288.2],[974.7,252.8],[980.6,233.5],[975.3,218.9],[982.9,206.6],[1001,220.6],[1022.7,231.7],[1060.7,244.6],[1048.4,278.5],[1075.3,290.3],[1096.9,274.4],[1096.9,256.9],[1085.2,265],[1070.6,252.2],[1089.3,213.6],[1117.1,239.3]],
  },
  {
    id: 'terr_241', name: 'Кілтшаєр', regionId: 'terr_237',
    goldPerDay: 1,
    adjacentTo: ['terr_227', 'terr_234', 'terr_235', 'terr_240'],
    army: [
      { class: 'warrior', level: 2 }, { class: 'warrior', level: 2 }, { class: 'warrior', level: 2 }, { class: 'warrior', level: 2 },
      { class: 'archer',  level: 2 }, { class: 'mage',    level: 2, magePath: 'earth' },
    ],
    polygon: [[1089.4,214.8],[1070,197.2],[1058.3,178.5],[1035.5,162.2],[1061.2,160.4],[1067.7,152.8],[1067.7,124.2],[1092.8,114.3],[1109.2,140.6],[1153,129.5],[1168.8,140],[1195.1,140],[1207.9,162.2],[1222.5,183.8],[1247.7,192.6],[1274,174.5],[1300.9,179.7],[1323.7,196.1],[1326.6,175],[1339.4,162.2],[1371.6,166.3],[1379.8,193.2],[1364,201.3],[1357,225.9],[1375.7,247.5],[1378.4,265.5],[1398.8,304],[1344.6,325.9],[1274.5,311.9],[1221.6,285],[1150.6,272.7],[1117.1,239.3]],
  },

  // ── Паліндор ────────────────────────────────────────────────────────────────
  {
    id: 'terr_209', name: 'Ампурі', regionId: 'terr_206',
    goldPerDay: 1,
    adjacentTo: ['terr_203', 'terr_208', 'terr_210', 'terr_238'],
    army: [
      { class: 'warrior', level: 3, warriorPath: 'paladin' }, { class: 'warrior', level: 3, warriorPath: 'paladin' }, { class: 'warrior', level: 3, warriorPath: 'paladin' },
      { class: 'archer',  level: 3 }, { class: 'archer',  level: 3 },
    ],
    polygon: [[751.3,773.3],[751.3,791.6],[743.6,814],[716.4,855.3],[685.1,885.5],[664.5,886],[635.5,881.3],[606.6,889],[570.4,891],[564.3,874.6],[563.1,857],[545.5,859.4],[500.6,870.9],[485.4,859.4],[489.6,843.6],[485.4,826.6],[493.3,809],[479.3,809],[469.6,815],[452.6,819.9],[445.3,801.7],[435.6,805.3],[416.1,796.2],[401.9,794.8],[439.7,752.7],[501.8,747],[537,757.9],[554,751.3],[574.7,736.7],[605,723.9],[639.7,722.7],[654.3,694.2],[685.2,694.2],[713.2,696.6],[737.5,693],[753.9,703.3],[787.3,716.6],[816.4,705.7],[816.8,732.5],[807.4,753.2],[780.2,756.1]],
  },
  {
    id: 'terr_210', name: 'Глумвік', regionId: 'terr_206',
    goldPerDay: 1,
    adjacentTo: ['terr_208', 'terr_209', 'terr_211', 'terr_215', 'terr_238'],
    army: [
      { class: 'warrior', level: 3, warriorPath: 'paladin' }, { class: 'warrior', level: 3, warriorPath: 'paladin' }, { class: 'warrior', level: 3, warriorPath: 'paladin' },
      { class: 'archer',  level: 3 }, { class: 'mage',    level: 3, magePath: 'fire' },
    ],
    polygon: [[986.2,808.9],[970.3,830.3],[958.4,838.2],[948.9,847.8],[938.6,866.8],[941,883.5],[953.7,895.4],[961.6,919.2],[963.3,936.2],[929.1,940.7],[893.4,945.3],[863.1,949.1],[844.1,968.8],[822.8,986.3],[793.2,1000],[792.6,990],[782,970.5],[762.5,956.9],[738.2,932.8],[723.2,908.6],[709.4,891.3],[685.1,885.5],[716.4,855.3],[743.6,814],[751.3,791.6],[751.3,773.3],[780.2,756.1],[807.4,753.2],[816.8,732.5],[816.4,705.7],[865.6,693.6],[903.7,732.7],[927.5,739.8],[926.7,766],[945.7,789.8]],
  },
  {
    id: 'terr_211', name: 'Гланафон', regionId: 'terr_206',
    goldPerDay: 1,
    adjacentTo: ['terr_210', 'terr_215', 'terr_231', 'terr_238', 'terr_239'],
    army: [
      { class: 'warrior', level: 3, warriorPath: 'paladin' }, { class: 'warrior', level: 3, warriorPath: 'paladin' }, { class: 'warrior', level: 3, warriorPath: 'paladin' },
      { class: 'archer',  level: 3 }, { class: 'archer',  level: 3 }, { class: 'mage', level: 3, magePath: 'earth' },
    ],
    polygon: [[1013.2,784.3],[1013.2,762.9],[1015.5,740.6],[1030.6,742.2],[1044.9,750.9],[1063.1,748.8],[1041.8,728.8],[1034.5,700.8],[1035.1,684.4],[1016.9,660.1],[1012.6,643.7],[975.6,628.6],[950.7,640.7],[926.4,666.8],[894.2,671.1],[865.6,693.6],[903.7,732.7],[927.5,739.8],[926.7,766],[945.7,789.8],[986.2,808.9]],
  },
  {
    id: 'terr_215', name: 'Шілд Роув', regionId: 'terr_206',
    goldPerDay: 1,
    adjacentTo: ['terr_210', 'terr_211', 'terr_214', 'terr_217', 'terr_231'],
    army: [
      { class: 'warrior', level: 3, warriorPath: 'paladin' }, { class: 'warrior', level: 3, warriorPath: 'paladin' }, { class: 'warrior', level: 3, warriorPath: 'paladin' },
      { class: 'archer',  level: 2 }, { class: 'archer', level: 2 },
    ],
    polygon: [[1121.5,900.7],[1135,888.8],[1140.6,849.2],[1155.6,811.1],[1169.1,811.1],[1196.7,771.3],[1166.3,771.3],[1136.6,758.6],[1114.1,760.4],[1101.9,775],[1081.3,775.6],[1063.1,748.8],[1044.9,750.9],[1030.6,742.2],[1015.5,740.6],[1013.2,762.9],[1013.2,784.3],[986.2,808.9],[970.3,830.3],[958.4,838.2],[948.9,847.8],[938.6,866.8],[941,883.5],[953.7,895.4],[961.6,919.2],[963.3,936.2],[991.4,928.6],[1016.4,948.3],[1050.6,960.5],[1076.4,974.1],[1094.5,957.1],[1118.4,950.7],[1120.7,926.9]],
  },
  {
    id: 'terr_214', name: 'Порт', regionId: 'terr_206',
    goldPerDay: 1,
    adjacentTo: ['terr_215', 'terr_217', 'terr_231'],
    army: [
      { class: 'warrior', level: 3, warriorPath: 'champion' }, { class: 'warrior', level: 3, warriorPath: 'champion' }, { class: 'warrior', level: 3, warriorPath: 'champion' },
      { class: 'archer',  level: 2 }, { class: 'mage', level: 2, magePath: 'water' },
    ],
    polygon: [[1140.6,849.2],[1155.6,811.1],[1169.1,811.1],[1196.7,771.3],[1218,746.4],[1243.5,733],[1278.1,739.7],[1278.1,766.5],[1270.8,781.6],[1279.9,792.6],[1305,791.9],[1315.6,805.6],[1294.4,810.9],[1289.8,830.6],[1272.3,832.1],[1248.8,822.3],[1231.3,821.5],[1204,823.8],[1191.8,841.2],[1210.8,853.4],[1169.1,862.7]],
  },
  {
    id: 'terr_208', name: 'Кленмур', regionId: 'terr_206',
    goldPerDay: 1,
    adjacentTo: ['terr_207', 'terr_209', 'terr_210'],
    army: [
      { class: 'warrior', level: 3, warriorPath: 'paladin' }, { class: 'warrior', level: 3, warriorPath: 'paladin' }, { class: 'warrior', level: 3, warriorPath: 'paladin' },
      { class: 'archer',  level: 3 }, { class: 'archer', level: 3 }, { class: 'mage', level: 2, magePath: 'fire' },
    ],
    polygon: [[709.4,891.3],[723.2,908.6],[738.2,932.8],[762.5,956.9],[782,970.5],[792.6,990],[793.2,1000],[778.8,1006],[752.2,1040.2],[739.3,1083.5],[714.4,1056.6],[685.7,1043],[640.2,1037.4],[610.6,1043],[610.5,1027.6],[602.2,1018],[577.7,1018.5],[569.8,1008.2],[544.3,1021.6],[535.8,1014.3],[521.2,1026.4],[502.4,1020.4],[475.7,1047.7],[460.5,1050.1],[463.5,1031.9],[459.9,1021],[464.7,993],[452.6,977.8],[464.1,952.9],[478.7,949.9],[493.9,963.9],[496.9,933.5],[510.9,920.1],[530.9,923.8],[563.7,922.6],[572.9,904.3],[570.4,891],[606.6,889],[635.5,881.3],[664.5,886],[685.1,885.5]],
  },
  {
    id: 'terr_207', name: 'Вагна', regionId: 'terr_206',
    goldPerDay: 1,
    adjacentTo: ['terr_208'],
    army: [
      { class: 'warrior', level: 3, warriorPath: 'paladin' }, { class: 'warrior', level: 3, warriorPath: 'paladin' },
      { class: 'warrior', level: 3, warriorPath: 'champion' }, { class: 'warrior', level: 3, warriorPath: 'champion' },
      { class: 'archer',  level: 3 }, { class: 'archer', level: 3 }, { class: 'mage', level: 3, magePath: 'water' },
    ],
    polygon: [[610.6,1043],[640.2,1037.4],[685.7,1043],[714.4,1056.6],[739.3,1083.5],[759,1108.5],[781.1,1139.7],[781.1,1167],[759,1186],[724.1,1222.4],[719.6,1247.5],[704.1,1260.3],[675.5,1259.7],[665.2,1269.4],[664.6,1301],[662.1,1325.9],[647.6,1322.3],[647.6,1312.6],[636,1307.7],[633.6,1321.1],[613.6,1325.9],[592.3,1308.9],[582,1305.3],[569.8,1324.1],[552.8,1317.4],[547.9,1310.1],[547.9,1302.8],[530.3,1298.6],[529.7,1271.9],[526.1,1251.8],[542.5,1241.5],[558.3,1246.3],[561.9,1234.2],[565,1218.4],[589.3,1223.3],[608.7,1230.5],[617.2,1226.9],[600.8,1216],[595.9,1202.6],[600.8,1192.9],[611.7,1180.7],[616.6,1167.4],[599,1165.5],[588,1160.1],[583.2,1144.9],[583.2,1132.1],[571.6,1126.1],[564.3,1114.5],[565.6,1096.3],[577.7,1070.8],[583.2,1054.4],[550.4,1055.6],[543.7,1045.9],[577.7,1018.5],[602.2,1018],[610.5,1027.6]],
  },
  {
    id: 'terr_213', name: 'Форт Гладстон', regionId: 'terr_206',
    goldPerDay: 1,
    adjacentTo: ['terr_212', 'terr_217'],
    army: [
      { class: 'warrior', level: 3, warriorPath: 'champion' }, { class: 'warrior', level: 3, warriorPath: 'champion' }, { class: 'warrior', level: 3, warriorPath: 'champion' },
      { class: 'archer',  level: 3 }, { class: 'archer', level: 3 }, { class: 'mage', level: 3, magePath: 'fire' },
    ],
    polygon: [[1203.3,964.2],[1261.2,957.9],[1309.6,969],[1340.5,990.4],[1342.9,1010.2],[1338.4,1038.7],[1314.1,1052.3],[1298.9,1072.8],[1271.6,1078.9],[1241.2,1075.1],[1219.9,1064.5],[1214.6,1037.9],[1198.7,1019.7],[1165.3,1002.2]],
  },
  {
    id: 'terr_212', name: 'Калкеін', regionId: 'terr_206',
    goldPerDay: 1,
    adjacentTo: ['terr_213', 'terr_217'],
    army: [
      { class: 'warrior', level: 3, warriorPath: 'paladin' }, { class: 'warrior', level: 3, warriorPath: 'paladin' },
      { class: 'warrior', level: 3, warriorPath: 'champion' }, { class: 'warrior', level: 3, warriorPath: 'champion' },
      { class: 'archer',  level: 3 }, { class: 'archer', level: 3 }, { class: 'mage', level: 3, magePath: 'fire' },
    ],
    polygon: [[1342.9,1010.2],[1338.4,1038.7],[1361.2,1054.6],[1383.2,1072.8],[1392.3,1091.1],[1393.8,1115.4],[1411.3,1140.4],[1419.6,1122.2],[1437.9,1113.8],[1460.6,1108.5],[1475.8,1097.9],[1478.1,1084.2],[1462.2,1056.9],[1467.5,1028.8],[1458.4,1024.2],[1469.8,1007.5],[1478.9,1015.9],[1485.7,1003.7],[1468.2,993.1],[1447.7,1003.7],[1428,1009.1],[1417.4,994.6],[1429.5,970.3],[1379.4,948.3],[1360.4,959.7],[1344.5,965],[1340.5,990.4]],
  },
  {
    id: 'terr_217', name: 'Паліндорград', regionId: 'terr_206', isCapital: true,
    goldPerDay: 3,
    adjacentTo: ['terr_212', 'terr_213', 'terr_214', 'terr_215'],
    army: [
      { class: 'warrior',  level: 3, warriorPath: 'paladin' }, { class: 'warrior', level: 3, warriorPath: 'paladin' }, { class: 'warrior', level: 3, warriorPath: 'paladin' },
      { class: 'archer',   level: 3 }, { class: 'archer', level: 3 }, { class: 'mage', level: 3, magePath: 'water' },
      { class: 'catapult', level: 1 },
    ],
    polygon: [[1170.2,862.1],[1140.6,849.2],[1135,888.8],[1121.5,900.7],[1120.7,926.9],[1118.4,950.7],[1094.5,957.1],[1076.4,974.1],[1100.7,991.6],[1132.6,999.9],[1165.3,1002.2],[1203.3,964.2],[1261.2,957.9],[1309.6,969],[1340.5,990.4],[1344.5,965],[1344.5,936.9],[1372.6,906.5],[1356.6,892.9],[1373.3,880],[1365,856.4],[1342.2,857.9],[1324.7,883],[1313.3,873.9],[1268.5,845.8],[1257.9,857.9],[1264,869.3],[1254.1,876.9],[1238.9,864],[1219.9,872.4],[1210.8,853.4]],
  },

  // ── Калідонія ───────────────────────────────────────────────────────────────
  {
    id: 'terr_234', name: 'Валкорн', regionId: 'terr_230',
    goldPerDay: 1,
    adjacentTo: ['terr_231', 'terr_235', 'terr_239', 'terr_240', 'terr_241'],
    army: [
      { class: 'warrior', level: 3, warriorPath: 'paladin' }, { class: 'warrior', level: 3, warriorPath: 'paladin' }, { class: 'warrior', level: 3, warriorPath: 'paladin' },
      { class: 'archer',  level: 3 }, { class: 'archer', level: 3 }, { class: 'mage', level: 3, magePath: 'earth' },
    ],
    polygon: [[1317,466.4],[1324.8,491.3],[1332.6,522.6],[1342.3,561.8],[1304.9,551.3],[1271,544.3],[1226.6,539.6],[1182,539.9],[1128,548.5],[1154.2,503.7],[1143.9,457.9],[1123.3,412.1],[1189.3,365.6],[1229,330.6],[1274.5,311.9],[1344.6,325.9],[1333.9,373.7],[1317,402.4],[1303.9,435.1]],
  },
  {
    id: 'terr_231', name: 'Лінтон', regionId: 'terr_230',
    goldPerDay: 1,
    adjacentTo: ['terr_211', 'terr_214', 'terr_215', 'terr_232', 'terr_234', 'terr_236', 'terr_239'],
    army: [
      { class: 'warrior', level: 3, warriorPath: 'paladin' }, { class: 'warrior', level: 3, warriorPath: 'paladin' }, { class: 'warrior', level: 3, warriorPath: 'paladin' },
      { class: 'archer',  level: 3 }, { class: 'archer', level: 3 }, { class: 'mage', level: 3, magePath: 'water' },
    ],
    polygon: [[1226.6,539.6],[1271,544.3],[1304.9,551.3],[1342.3,561.8],[1329.4,593.2],[1331,624.2],[1327.4,654.4],[1310.2,686.6],[1282.2,703.1],[1278.1,739.7],[1243.5,733],[1218,746.4],[1196.7,771.3],[1166.3,771.3],[1136.6,758.6],[1114.1,760.4],[1101.9,775],[1081.3,775.6],[1063.1,748.8],[1041.8,728.8],[1034.5,700.8],[1035.1,684.4],[1016.9,660.1],[1012.6,643.7],[1083.1,601.8],[1128,548.5],[1182,539.9]],
  },
  {
    id: 'terr_232', name: 'Кейп Нотт', regionId: 'terr_230',
    goldPerDay: 1,
    adjacentTo: ['terr_231', 'terr_236'],
    army: [
      { class: 'warrior', level: 4, warriorPath: 'paladin' }, { class: 'warrior', level: 4, warriorPath: 'paladin' },
      { class: 'warrior', level: 4, warriorPath: 'paladin' }, { class: 'warrior', level: 4, warriorPath: 'champion' },
      { class: 'archer',  level: 3 }, { class: 'archer', level: 3 }, { class: 'mage', level: 4, magePath: 'fire' },
    ],
    polygon: [[1282.2,702.2],[1278.1,739.7],[1291.9,729.3],[1313.9,726.9],[1324.4,720.2],[1325.9,699.1],[1350.7,700.1],[1383.3,700.6],[1386.1,683.3],[1402.9,667.5],[1377.9,634.1],[1331,624.2],[1327.4,654.4],[1310.2,686.6]],
  },
  {
    id: 'terr_233', name: 'Серін', regionId: 'terr_230',
    goldPerDay: 1,
    adjacentTo: ['terr_236'],
    army: [
      { class: 'warrior', level: 4, warriorPath: 'champion' }, { class: 'warrior', level: 4, warriorPath: 'champion' }, { class: 'warrior', level: 4, warriorPath: 'champion' },
      { class: 'archer',  level: 3 }, { class: 'mage', level: 4, magePath: 'fire' }, { class: 'mage', level: 4, magePath: 'air' },
    ],
    polygon: [[1522.9,730.6],[1531.9,719.9],[1541.9,724.5],[1551.8,716.1],[1565.2,719.1],[1576.3,714.1],[1590.9,714.5],[1592,727.2],[1585.5,735.6],[1566.4,743.6],[1561.7,760.5],[1550.7,757],[1538.8,761.6],[1531.5,766.6],[1518.2,760.1],[1509.3,751.3],[1510.1,739.4],[1522.7,743.2],[1533.1,744],[1533.1,734.8]],
  },
  {
    id: 'terr_235', name: 'Пекка', regionId: 'terr_230',
    goldPerDay: 1,
    adjacentTo: ['terr_227', 'terr_234', 'terr_236', 'terr_241'],
    army: [
      { class: 'warrior',  level: 4, warriorPath: 'paladin' }, { class: 'warrior', level: 4, warriorPath: 'paladin' }, { class: 'warrior', level: 4, warriorPath: 'paladin' },
      { class: 'archer',   level: 3 }, { class: 'archer', level: 3 }, { class: 'mage', level: 4, magePath: 'fire' },
      { class: 'catapult', level: 2, catapultPath: 'ballista' },
    ],
    polygon: [[1409.7,531.8],[1369.2,547.5],[1342.3,561.8],[1332.6,522.6],[1324.8,491.3],[1317,466.4],[1303.9,435.1],[1317,402.4],[1333.9,373.7],[1344.6,325.9],[1398.8,304],[1435.7,335.1],[1460.3,356.4],[1448,370.3],[1452.1,389.9],[1469.3,400.6],[1473.4,418.6],[1480.7,435.8],[1474.2,453],[1475,480],[1505.3,506.2],[1465.9,531.8]],
  },
  {
    id: 'terr_236', name: 'Калідон', regionId: 'terr_230', isCapital: true,
    goldPerDay: 3,
    adjacentTo: ['terr_226', 'terr_231', 'terr_232', 'terr_233', 'terr_235'],
    army: [
      { class: 'warrior',  level: 4, warriorPath: 'paladin' }, { class: 'warrior', level: 4, warriorPath: 'paladin' }, { class: 'warrior', level: 4, warriorPath: 'paladin' },
      { class: 'archer',   level: 3 }, { class: 'archer', level: 3 }, { class: 'mage', level: 4, magePath: 'fire' },
      { class: 'catapult', level: 3, catapultPath: 'trebuchet' },
    ],
    polygon: [[1343,560.1],[1329.4,593.2],[1331,624.2],[1377.9,634.1],[1402.9,667.5],[1424.4,680.9],[1412.9,713.9],[1436.8,711.6],[1456.5,686.2],[1475.6,688.6],[1493.8,687.2],[1506.2,670.9],[1493.8,658],[1510,653.2],[1536.8,681.4],[1548.8,670.4],[1539.2,650.8],[1512.9,629.3],[1519.1,622.1],[1547.4,631.7],[1555.5,601.5],[1571.3,605.8],[1578.5,592.4],[1590.4,603.4],[1596.2,589.6],[1592.3,575.7],[1596.2,566],[1575.7,557],[1561.8,536.5],[1546.2,529.2],[1529,512],[1505.3,506.2],[1465.9,531.8],[1409.7,531.8],[1369.2,547.5]],
  },

  // ── Тетрарія ────────────────────────────────────────────────────────────────
  {
    id: 'terr_229', name: 'Гайспайр', regionId: 'terr_223',
    goldPerDay: 1,
    adjacentTo: ['terr_226', 'terr_227'],
    army: [
      { class: 'warrior',  level: 4, warriorPath: 'paladin' }, { class: 'warrior', level: 4, warriorPath: 'paladin' },
      { class: 'warrior',  level: 4, warriorPath: 'champion' }, { class: 'warrior', level: 4, warriorPath: 'champion' },
      { class: 'archer',   level: 3 }, { class: 'archer', level: 3 }, { class: 'mage', level: 4, magePath: 'fire' },
      { class: 'catapult', level: 2, catapultPath: 'ballista' },
    ],
    polygon: [[1462.6,139.3],[1509.7,124.4],[1535.2,114],[1568.4,104.7],[1565.8,80.7],[1553.1,53.2],[1560.2,35.5],[1545.5,37.6],[1526.2,54.8],[1521.2,25.5],[1498.5,22.1],[1483.8,33],[1481.3,48.5],[1467.5,45.6],[1472.1,29.7],[1472.1,14.1],[1443.2,16.2],[1438.1,41.8],[1418.9,103.4],[1429.3,115.2]],
  },
  {
    id: 'terr_227', name: 'Тетра', regionId: 'terr_223', isCapital: true,
    goldPerDay: 3,
    adjacentTo: ['terr_226', 'terr_229', 'terr_235', 'terr_241'],
    army: [
      { class: 'warrior',  level: 4, warriorPath: 'paladin' }, { class: 'warrior', level: 4, warriorPath: 'paladin' }, { class: 'warrior', level: 4, warriorPath: 'paladin' },
      { class: 'archer',   level: 3 }, { class: 'archer', level: 3 }, { class: 'mage', level: 4, magePath: 'fire' },
      { class: 'catapult', level: 3, catapultPath: 'trebuchet' },
    ],
    polygon: [[1509.7,124.4],[1535.2,114],[1568.4,104.7],[1590.3,141.4],[1607.6,167.4],[1629.6,201.6],[1624,235.8],[1597.4,284.8],[1570.4,305.7],[1552,341.9],[1535.2,372.5],[1524,414.3],[1520.9,467.4],[1505.3,506.2],[1475,480],[1474.2,453],[1480.7,435.8],[1473.4,418.6],[1470.4,406.3],[1469.3,400.6],[1452.1,389.9],[1448,370.3],[1460.3,356.4],[1435.7,335.1],[1398.8,304],[1378.4,265.5],[1395.4,246.4],[1411.3,249.8],[1422.6,240.6],[1424.7,221.7],[1417.6,199],[1426,185.2],[1455.3,163.8],[1463.3,139.5]],
  },
  {
    id: 'terr_226', name: 'Елмбрі', regionId: 'terr_223',
    goldPerDay: 1,
    adjacentTo: ['terr_227', 'terr_229', 'terr_236'],
    army: [
      { class: 'warrior',  level: 4, warriorPath: 'paladin' }, { class: 'warrior', level: 4, warriorPath: 'paladin' }, { class: 'warrior', level: 4, warriorPath: 'champion' },
      { class: 'archer',   level: 3 }, { class: 'archer', level: 3 }, { class: 'mage', level: 4, magePath: 'earth' },
      { class: 'catapult', level: 3, catapultPath: 'trebuchet' },
    ],
    polygon: [[1556.7,460.4],[1561.4,455.6],[1590.3,435.5],[1597.1,444.7],[1620.5,428.4],[1640.2,407],[1646.5,412.5],[1652.4,395.3],[1645.7,389],[1653.7,368.9],[1670.4,357.5],[1684.3,337.4],[1649.5,336.6],[1644.4,298.8],[1659.5,295.9],[1672.5,300.5],[1673.8,290],[1655.3,274.9],[1655.8,259],[1663.3,251],[1680.1,258.2],[1685.5,254.4],[1678,237.6],[1699.4,212.9],[1709.8,212.9],[1699.8,178.1],[1711.5,167.2],[1720.3,157.1],[1715.3,146.6],[1730,124],[1717.8,113.9],[1698.9,122.7],[1689.7,109.7],[1693.9,97.6],[1679.7,89.6],[1665.8,58.2],[1649,38.5],[1617.6,24.6],[1617.6,41.4],[1610.1,57.3],[1601.7,44.3],[1590.3,30.5],[1560.2,35.5],[1553.1,53.2],[1565.8,80.7],[1568.4,104.7],[1590.3,141.4],[1607.6,167.4],[1629.6,201.6],[1624,235.8],[1597.4,284.8],[1570.4,305.7],[1552,341.9],[1535.2,372.5],[1524,414.3],[1520.9,467.4],[1505.3,506.2],[1529,512],[1546.2,529.2],[1561.8,536.5],[1575.7,557],[1596.2,566],[1598.7,538.7],[1605.9,519],[1617.6,511.8],[1605,484.6],[1580.7,466.5]],
  },
]

// ── Lookups ───────────────────────────────────────────────────────────────────
const DISTRICT_MAP = new Map(DISTRICTS_2.map(d => [d.id, d]))
const REGION_MAP   = new Map(REGIONS_2.map(r => [r.id, r]))

export function getDistrictById(id: string): District | undefined {
  return DISTRICT_MAP.get(id)
}
export function getRegionById(id: string): Region2 | undefined {
  return REGION_MAP.get(id)
}

// ── Game helpers ──────────────────────────────────────────────────────────────
export function getDailyIncome(ownership: Record<string, 'player' | 'enemy' | 'bot'>): number {
  let total = 0
  for (const [id, owner] of Object.entries(ownership)) {
    if (owner === 'player') total += (DISTRICT_MAP.get(id)?.goldPerDay ?? 0)
  }
  return total
}

export function isRegionComplete(regionId: string, ownership: Record<string, 'player' | 'enemy' | 'bot'>): boolean {
  const region = REGION_MAP.get(regionId)
  if (!region || region.isBoss) return false
  return region.districts.every(id => ownership[id] === 'player')
}

export function getAttackableDistricts(
  ownership:      Record<string, 'player' | 'enemy' | 'bot'>,
  armyNodeId:     string,
  activeRegionId: string,
): Set<string> {
  const district = DISTRICT_MAP.get(armyNodeId)
  if (!district) return new Set()
  const playerSet = new Set(
    Object.entries(ownership).filter(([, o]) => o === 'player').map(([id]) => id)
  )
  return new Set(district.adjacentTo.filter(id => {
    if (playerSet.has(id)) return false
    const d = DISTRICT_MAP.get(id)
    return d?.regionId === activeRegionId
  }))
}

export function getMovableDistricts(
  ownership:  Record<string, 'player' | 'enemy' | 'bot'>,
  armyNodeId: string,
): Set<string> {
  const district = DISTRICT_MAP.get(armyNodeId)
  if (!district) return new Set()
  const playerSet = new Set(
    Object.entries(ownership).filter(([, o]) => o === 'player').map(([id]) => id)
  )
  return new Set(district.adjacentTo.filter(id => playerSet.has(id)))
}

export function getUnlockedRegions(conqueredRegions: string[]): Set<string> {
  const unlocked = new Set<string>(['terr_218'])
  for (const rid of conqueredRegions) {
    const r = REGION_MAP.get(rid)
    if (r) r.adjacentRegions.forEach(a => unlocked.add(a))
  }
  return unlocked
}

// ── Army builder ──────────────────────────────────────────────────────────────
export function buildArmyFromSpecs2(specs: UnitSpec2[], side: Side): GameUnit[] {
  const units: GameUnit[] = []
  const hasCat   = specs.some(s => s.class === 'catapult')
  const warriors = specs.filter(s => s.class === 'warrior')
  const cats     = specs.filter(s => s.class === 'catapult')
  const ranged   = specs.filter(s => s.class === 'archer' || s.class === 'mage')

  for (let i = 0; i < warriors.length; i++) {
    const s = warriors[i]
    units.push(buildFreeUnit(s.class, s.level, side, 0, i, undefined, undefined, s.warriorPath))
  }
  if (hasCat && cats.length > 0) {
    const s = cats[0]
    units.push(buildFreeUnit(s.class, s.level, side, 0, 3, undefined, s.catapultPath))
  }
  let slot = 0
  for (const s of ranged) {
    if (hasCat && slot === 3) slot++
    units.push(buildFreeUnit(s.class, s.level, side, 1, slot++, s.magePath, undefined, s.warriorPath))
  }
  return units
}

// ── Initial state ─────────────────────────────────────────────────────────────
export function createInitialTerritoryMap2State(): TerritoryMap2State {
  const ownership: Record<string, 'player' | 'enemy' | 'bot'> = {}
  for (const d of DISTRICTS_2) ownership[d.id] = d.isStart ? 'player' : 'enemy'
  ownership['terr_240'] = 'bot'
  return {
    ownership,
    conqueredRegions:    [],
    botConqueredRegions: [],
    activeRegionId:      'terr_218',
    pendingFinalBattle:  null,
    gold:                10,
    turn:                1,
    ap:                  2,
    armyNodeId:          'terr_221',
    maxArmySlots:        4,
    fortressLevel:       1,
    restedThisTurn:      false,
    botUnits:            3,
    botGold:             0,
    botRestTurns:        0,
  }
}

// ── Bot AI ────────────────────────────────────────────────────────────────────
export function doBotTurn(state: TerritoryMap2State): { state: TerritoryMap2State; botMessage: string | null } {
  const ownership = { ...state.ownership }
  const botConqueredRegions = [...state.botConqueredRegions]

  // Earn gold from owned districts (like player's daily income)
  let botGold = state.botGold
  for (const [id, o] of Object.entries(ownership)) {
    if (o === 'bot') botGold += (DISTRICT_MAP.get(id)?.goldPerDay ?? 0)
  }

  // Hire one unit per turn while affordable (3 gold each, max 8)
  let botUnits = state.botUnits
  if (botGold >= 3 && botUnits < 8) {
    botUnits++
    botGold -= 3
  }

  // Decrement rest — bot is recovering after last battle
  let botRestTurns = Math.max(0, state.botRestTurns - 1)
  if (botRestTurns > 0) {
    return {
      state: { ...state, ownership, botConqueredRegions, botGold, botUnits, botRestTurns },
      botMessage: null,
    }
  }

  // Collect adjacent non-bot districts
  const botDistricts = Object.entries(ownership).filter(([, o]) => o === 'bot').map(([id]) => id)
  if (botDistricts.length === 0) return { state: { ...state, botGold, botUnits, botRestTurns }, botMessage: null }

  const reachable = new Set<string>()
  for (const distId of botDistricts) {
    const d = DISTRICT_MAP.get(distId)
    if (!d) continue
    for (const adjId of d.adjacentTo) {
      if (ownership[adjId] !== 'bot') reachable.add(adjId)
    }
  }

  // Neutral districts first, player second; within each group fewest units first
  const targets = Array.from(reachable).sort((a, b) => {
    const ao = ownership[a] === 'enemy', bo = ownership[b] === 'enemy'
    if (ao && !bo) return -1
    if (!ao && bo) return 1
    return (DISTRICT_MAP.get(a)?.army.length ?? 0) - (DISTRICT_MAP.get(b)?.army.length ?? 0)
  })

  for (const targetId of targets) {
    const district = DISTRICT_MAP.get(targetId)
    if (!district) continue

    // Defense = number of enemy units; player districts have min garrison of 3
    const rawDef = district.army.length
    const defense = ownership[targetId] === 'player' ? Math.max(rawDef, 3) : rawDef

    // Bot needs strictly more units than defenders to attack
    if (botUnits <= defense) continue

    // Battle won — take casualties, then rest proportional to fight difficulty
    botUnits = Math.max(1, botUnits - Math.ceil(defense * 0.5))
    botRestTurns = Math.max(1, defense)  // 1 rest turn per enemy unit

    ownership[targetId] = 'bot'
    const regionId = district.regionId
    if (!botConqueredRegions.includes(regionId)) {
      const region = REGION_MAP.get(regionId)
      if (region && !region.isBoss && region.districts.every(id => ownership[id] === 'bot')) {
        botConqueredRegions.push(regionId)
      }
    }

    return {
      state: { ...state, ownership, botConqueredRegions, botGold, botUnits, botRestTurns },
      botMessage: `Ворог захопив ${district.name}`,
    }
  }

  return {
    state: { ...state, ownership, botConqueredRegions, botGold, botUnits, botRestTurns },
    botMessage: null,
  }
}
