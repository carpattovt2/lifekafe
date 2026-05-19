'use client'

import { useReducer, useEffect, useRef, useState, useCallback, useMemo } from 'react'
import type { Card, CardBack, GameState, Meld, Player, Phase, Suit } from '@/lib/game/types'
import { createDeck, shuffle, dealToPlayers, handCardValue, suitSymbol, isRed, RANK_NUM } from '@/lib/game/cards'
import {
  isValidMeld, meldType, meldValue, canAddToMeld, canStealJoker,
  totalMeldValue, findMeldsInHand, isBurningGroup, sortedMeldCards,
  getJokerPositionOptions, isValidGroup,
} from '@/lib/game/meld'
import { numToRank } from '@/lib/game/cards'
import { computeAITurn } from '@/lib/game/ai'
import { useLanguage } from '@/lib/LanguageContext'

// ── Constants ─────────────────────────────────────────────────────────────────
const AI_COLORS = ['#ef4444', '#3b82f6', '#f97316', '#a855f7']
const CARD_BACKS: CardBack[] = ['night','elegant','dragon','runes','poker','sea','vip','vegas']

// ── Sound hook — iOS-safe (AudioContext created on first user interaction) ────
function useGameSounds(enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null)
  const readyRef = useRef(false)  // true once user has interacted

  // Call this on any user gesture (touch/click) to unlock Web Audio on iOS
  function unlockAudio() {
    if (readyRef.current) return
    readyRef.current = true
    if (typeof window === 'undefined') return
    try {
      if (!ctxRef.current) {
        ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      }
      if (ctxRef.current.state === 'suspended') ctxRef.current.resume()
    } catch {}
  }

  function getCtx() {
    if (!readyRef.current || typeof window === 'undefined') return null
    if (!ctxRef.current) {
      try { ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)() } catch { return null }
    }
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume()
    return ctxRef.current
  }
  function noise(duration: number, gainVal: number) {
    try {
      const ctx = getCtx(); if (!ctx) return
      const sr = ctx.sampleRate, buf = ctx.createBuffer(1, sr*duration, sr)
      const data = buf.getChannelData(0); for(let i=0;i<data.length;i++) data[i]=Math.random()*2-1
      const src = ctx.createBufferSource(); src.buffer=buf
      const g = ctx.createGain(); g.gain.setValueAtTime(gainVal,ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+duration)
      src.connect(g); g.connect(ctx.destination); src.start(); src.stop(ctx.currentTime+duration)
    } catch {}
  }

  function tone(freq: number, duration: number, gainVal: number, type: OscillatorType='sine', delay=0) {
    try {
      const ctx = getCtx(); if (!ctx) return
      const osc=ctx.createOscillator(), g=ctx.createGain()
      osc.type=type; osc.frequency.value=freq
      g.gain.setValueAtTime(0.001,ctx.currentTime+delay); g.gain.linearRampToValueAtTime(gainVal,ctx.currentTime+delay+0.01)
      g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+delay+duration)
      osc.connect(g); g.connect(ctx.destination); osc.start(ctx.currentTime+delay); osc.stop(ctx.currentTime+delay+duration+0.05)
    } catch {}
  }

  const play = useCallback((type: 'draw'|'discard'|'meld'|'burn'|'select'|'invalid'|'aiTick'|'roundWin'|'gameWin'|'shuffle') => {
    if (!enabled) return
    switch (type) {
      case 'select':   tone(880,0.05,0.12,'sine'); break
      case 'draw':     tone(520,0.08,0.15,'sine'); tone(780,0.1,0.12,'sine',0.07); break
      case 'discard':  tone(200,0.1,0.22,'triangle'); break
      case 'meld':     tone(523,0.15,0.18,'sine'); tone(659,0.15,0.14,'sine',0.15); tone(784,0.18,0.16,'sine',0.3); break
      case 'burn':     noise(0.12,0.35); noise(0.15,0.25); noise(0.2,0.15); break
      case 'invalid':  tone(150,0.2,0.25,'sawtooth'); break
      case 'aiTick':   tone(600,0.06,0.08,'sine'); break
      case 'shuffle':  noise(0.08,0.2); noise(0.06,0.15); noise(0.08,0.18); noise(0.06,0.12); break
      case 'roundWin': [523,587,659,698,784].forEach((f,i)=>tone(f,0.12,0.18,'sine',i*0.1)); break
      case 'gameWin':  [523,587,659,698,784,880,988,1047].forEach((f,i)=>tone(f,0.14,0.2,'sine',i*0.15)); break
    }
  }, [enabled])
  return { play, noise, tone, unlockAudio }
}

// ── Module-level ref for AI flash meld ID (Fix 8) ────────────────────────────
const aiFlashMeldIdRef = { current: null as string | null }

// ── Helpers ───────────────────────────────────────────────────────────────────
let _meldId = 0
const mkMeldId = () => `m${++_meldId}`
function makeMeld(cards: Card[], owner: number): Meld { const type=meldType(cards); return {id:mkMeldId(),cards:sortedMeldCards(cards,type),ownerIndex:owner,type} }
function updatedMeld(meld: Meld, extra: Card[]): Meld { return {...meld,cards:sortedMeldCards([...meld.cards,...extra],meld.type)} }
function burnIntoDiscard(pile: Card[], burned: Card[]): Card[] { const mid=Math.floor(pile.length/2); return [...pile.slice(0,mid),...burned,...pile.slice(mid)] }
function calcPenalty(hand: Card[], hasMelded: boolean): number {
  if(!hand.length) return 0
  // Fix 3: if player melded AND still has a Joker in hand → flat +10 penalty
  if(hasMelded && hand.some(c=>c.isJoker)) return 10
  return Math.min(10,Math.round(hand.reduce((s,c)=>s+handCardValue(c),0)/10))
}
function reshuffleIfEmpty(s: GameState): GameState { if(s.deck.length>0)return s; const top=s.discardPile[s.discardPile.length-1],rest=s.discardPile.slice(0,-1); return {...s,deck:shuffle(rest),discardPile:top?[top]:[]} }
function nextIdx(cur: number, n: number) { return (cur+1)%n }
function circlesCompleted(players: Player[]) { return players.length?Math.min(...players.map(p=>p.turnCount)):0 }
function mutPlayer(state: GameState, i: number, patch: Partial<Player>): Player[] { return state.players.map((p,idx)=>idx===i?{...p,...patch}:p) }

// ── Initial / deal ────────────────────────────────────────────────────────────
function makeSetup(): GameState {
  return {
    phase:'setup',numPlayers:2,roundNumber:1,dealerIndex:0,currentPlayerIndex:0,
    deck:[],discardPile:[],trumpCard:null,trumpSuit:null,takenTrumpCard:null,
    players:[],melds:[],roundScores:[],
    selectedCardIds:[],stagedMelds:[],drawnThisTurn:false,drawnFromDiscardCardId:null,message:'',
    burningMeldId:null,burningHasJoker:false,firstMeldSingleCardLeft:false,
  }
}
function createPlayers(n: number): Player[] {
  const arr: Player[] = [{id:'human',name:'You',isHuman:true,hand:[],hasMelded:false,turnCount:0}]
  for(let i=1;i<n;i++) arr.push({id:`ai${i}`,name:`AI ${i}`,isHuman:false,hand:[],hasMelded:false,turnCount:0})
  return arr
}
function dealRound(base: GameState): GameState {
  const d=[...shuffle(createDeck())]
  const flipped=d.shift()!
  let trumpCard:Card|null=null,trumpSuit:Suit|null=null,jokerForFirst:Card|null=null
  if(flipped.isJoker) jokerForFirst=flipped
  else { trumpCard=flipped; trumpSuit=flipped.suit as Suit }
  const firstIdx=nextIdx(base.dealerIndex,base.numPlayers)
  const {hands,remaining}=dealToPlayers(d,base.numPlayers,firstIdx)
  const players=base.players.map((p,i)=>({...p,hand:[...hands[i]],hasMelded:false,turnCount:0}))
  if(jokerForFirst){const fp=players[firstIdx]; remaining.push(fp.hand.splice(Math.floor(Math.random()*fp.hand.length),1)[0]); fp.hand.push(jokerForFirst)}
  const firstPhase:Phase=players[firstIdx].isHuman?'player-draw':'ai-turn'
  return {
    ...base,roundNumber:base.roundNumber,deck:remaining,discardPile:[],trumpCard,trumpSuit,takenTrumpCard:null,
    players,melds:[],selectedCardIds:[],stagedMelds:[],drawnThisTurn:false,drawnFromDiscardCardId:null,
    currentPlayerIndex:firstIdx,phase:firstPhase,message:'',burningMeldId:null,burningHasJoker:false,firstMeldSingleCardLeft:false,
  }
}
// allAtOnce=true  → player emptied hand in a single turn, first meld of the round → -10 (or -20 with joker)
// allAtOnce=false → player had already melded 51+ before, then disposed remaining → -5
function finishRound(state: GameState, winnerIdx: number, allAtOnce: boolean, lastJoker: boolean): GameState {
  const bonus = allAtOnce ? (lastJoker ? -20 : -10) : -5
  const scores=state.players.map((p,i)=>{if(i===winnerIdx)return bonus;if(!p.hasMelded)return 10;return calcPenalty(p.hand,p.hasMelded)})
  // After final round: go directly to game-end (no round-end intermediate)
  const nextPhase: Phase = state.roundNumber >= 7 ? 'game-end' : 'round-end'
  return {
    ...state,roundScores:[...state.roundScores,scores],phase:nextPhase,message:'',
    selectedCardIds:[],stagedMelds:[],burningMeldId:null,burningHasJoker:false,takenTrumpCard:null,
    firstMeldSingleCardLeft:false,
  }
}
function advanceTurn(state: GameState): GameState {
  const next=nextIdx(state.currentPlayerIndex,state.numPlayers),nxt=state.players[next]
  return {...state,currentPlayerIndex:next,phase:nxt.isHuman?'player-draw':'ai-turn',drawnThisTurn:false,drawnFromDiscardCardId:null,selectedCardIds:[],stagedMelds:[],message:'',takenTrumpCard:null}
}

// ── Reducer ───────────────────────────────────────────────────────────────────
type Action =
  |{type:'START_GAME';numPlayers:number}|{type:'INIT_ROUND'}
  |{type:'DRAW_DECK'}|{type:'DRAW_DISCARD'}|{type:'TAKE_TRUMP'}|{type:'RETURN_TRUMP'}
  |{type:'TOGGLE_CARD';cardId:string}|{type:'REORDER_HAND';fromIndex:number;toIndex:number}|{type:'REORDER_HAND_TO';hand:Card[]}
  |{type:'STAGE_MELD'}|{type:'CLEAR_STAGED'}|{type:'COMMIT_MELDS';jokerPositions?:Record<string,number>}
  |{type:'ADD_TO_MELD';meldId:string}|{type:'STEAL_JOKER';meldId:string}
  |{type:'BURN_MELD'}|{type:'REPLACE_BURNING_JOKER'}|{type:'RETURN_TO_DISCARD'}
  |{type:'DISCARD';cardId:string}|{type:'AI_TURN_DONE';next:Partial<GameState>}
  |{type:'NEXT_ROUND'}|{type:'END_GAME_EARLY'}

function reducer(state: GameState, action: Action): GameState {
  const cp=state.currentPlayerIndex,cur=state.players[cp]
  switch(action.type){
    case 'START_GAME':{const players=createPlayers(action.numPlayers); return dealRound({...makeSetup(),numPlayers:action.numPlayers,players,dealerIndex:Math.floor(Math.random()*action.numPlayers)})}
    case 'INIT_ROUND': return dealRound(state)
    case 'DRAW_DECK':{
      if(state.drawnThisTurn||state.phase!=='player-draw') return state
      let s=reshuffleIfEmpty(state); if(!s.deck.length) return{...s,message:'Deck is empty!'}
      const card=s.deck[0]
      return{...s,deck:s.deck.slice(1),players:mutPlayer(s,cp,{hand:[...cur.hand,card]}),drawnThisTurn:true,phase:'player-action',message:''}
    }
    case 'DRAW_DISCARD':{
      if(state.drawnThisTurn||state.phase!=='player-draw') return state
      const top=state.discardPile[state.discardPile.length-1]
      if(!top) return{...state,message:'Discard pile is empty.'}
      if(circlesCompleted(state.players)<2) return{...state,message:'Cannot draw from discard until circle 3.'}
      return{...state,discardPile:state.discardPile.slice(0,-1),players:mutPlayer(state,cp,{hand:[...cur.hand,top]}),drawnThisTurn:true,drawnFromDiscardCardId:top.id,phase:'player-action',message:''}
    }
    case 'TAKE_TRUMP':{
      if(state.drawnThisTurn||state.phase!=='player-draw'||!state.trumpCard) return state
      if(circlesCompleted(state.players)<2) return{...state,message:'Trump can only be taken from circle 3+.'}
      const card=state.trumpCard
      return{...state,trumpCard:null,trumpSuit:null,takenTrumpCard:card,players:mutPlayer(state,cp,{hand:[...cur.hand,card]}),drawnThisTurn:true,phase:'player-action',message:''}
    }
    case 'RETURN_TRUMP':{
      const card=state.takenTrumpCard; if(!card) return state
      return{...state,trumpCard:card,trumpSuit:card.suit as Suit,takenTrumpCard:null,players:mutPlayer(state,cp,{hand:cur.hand.filter(c=>c.id!==card.id)}),message:''}
    }
    case 'TOGGLE_CARD':{
      const already=state.selectedCardIds.includes(action.cardId)
      return{...state,selectedCardIds:already?state.selectedCardIds.filter(id=>id!==action.cardId):[...state.selectedCardIds,action.cardId]}
    }
    case 'REORDER_HAND':{const h=[...cur.hand];const card=h.splice(action.fromIndex,1)[0];h.splice(action.toIndex,0,card);return{...state,players:mutPlayer(state,cp,{hand:h})}}
    case 'REORDER_HAND_TO': return{...state,players:mutPlayer(state,0,{hand:action.hand})}
    case 'STAGE_MELD':{
      if(circlesCompleted(state.players)<2) return{...state,message:`Cannot meld until circle 3.`}
      if(state.selectedCardIds.length<3) return{...state,message:'Select at least 3 cards.'}
      const selected=cur.hand.filter(c=>state.selectedCardIds.includes(c.id))
      if(!isValidMeld(selected)) return{...state,message:'Not a valid meld.'}
      return{...state,stagedMelds:[...state.stagedMelds,selected],selectedCardIds:[],message:''}
    }
    case 'CLEAR_STAGED': return{...state,stagedMelds:[],selectedCardIds:[],message:''}
    case 'COMMIT_MELDS':{
      if(!state.stagedMelds.length) return{...state,message:'No staged melds.'}
      const total=totalMeldValue(state.stagedMelds)
      if(!cur.hasMelded&&total<51) return{...state,message:`First meld needs 51+ pts. You have ${total}.`}
      const usedIds=new Set(state.stagedMelds.flat().map(c=>c.id))
      // Apply joker positions passed from dialog (Fix 5)
      const jp=action.jokerPositions
      const newMelds=state.stagedMelds.map(cards=>{
        const type=meldType(cards)
        if(type==='sequence'&&jp){
          const jokers=cards.filter(c=>c.isJoker)
          if(jokers.length>0){
            const positions:Record<string,number>={}
            jokers.forEach(j=>{if(jp[j.id])positions[j.id]=jp[j.id]})
            if(Object.keys(positions).length>0){
              const sorted=sortedMeldCards(cards,'sequence',positions)
              return{id:mkMeldId(),cards:sorted,ownerIndex:cp,type:'sequence' as const,jokerPositions:positions}
            }
          }
        }
        return makeMeld(cards,cp)
      })
      const newHand=cur.hand.filter(c=>!usedIds.has(c.id))
      const allMelds=[...state.melds,...newMelds]
      const discardUsed=state.drawnFromDiscardCardId&&usedIds.has(state.drawnFromDiscardCardId)
      const allAtOnce = !cur.hasMelded  // true if this was player's FIRST meld this round
      // Fix 2: track when first meld leaves exactly 1 card (discard will score as -10)
      const isFirstMeldOneLeft = !cur.hasMelded && newHand.length === 1
      console.log(`[SCORING] COMMIT_MELDS cp=${cp} hasMelded=${cur.hasMelded} allAtOnce=${allAtOnce} newHandLen=${newHand.length} firstMeldOneLeft=${isFirstMeldOneLeft}`)
      const burning=newMelds.find(m=>isBurningGroup(m))
      if(burning){
        const hasJ=burning.cards.some(c=>c.isJoker)
        if(!newHand.length&&!hasJ) return finishRound({...state,players:mutPlayer(state,cp,{hand:newHand,hasMelded:true}),melds:allMelds,stagedMelds:[]},cp,allAtOnce,false)
        return{...state,players:mutPlayer(state,cp,{hand:newHand,hasMelded:true}),melds:allMelds,stagedMelds:[],selectedCardIds:[],drawnFromDiscardCardId:discardUsed?null:state.drawnFromDiscardCardId,burningMeldId:burning.id,burningHasJoker:hasJ,message:hasJ?'🔥 4-of-a-kind JOKER!':'🔥 4-of-a-kind! Burns on discard.'}
      }
      if(!newHand.length) return finishRound({...state,players:mutPlayer(state,cp,{hand:newHand,hasMelded:true}),melds:allMelds,stagedMelds:[],firstMeldSingleCardLeft:false},cp,allAtOnce,false)
      return{...state,players:mutPlayer(state,cp,{hand:newHand,hasMelded:true}),melds:allMelds,stagedMelds:[],selectedCardIds:[],drawnFromDiscardCardId:discardUsed?null:state.drawnFromDiscardCardId,firstMeldSingleCardLeft:isFirstMeldOneLeft,message:''}
    }
    case 'ADD_TO_MELD':{
      if(circlesCompleted(state.players)<2) return{...state,message:'Cannot add to sets until circle 3.'}
      if(!state.selectedCardIds.length) return{...state,message:'Select cards to add.'}
      const selected=cur.hand.filter(c=>state.selectedCardIds.includes(c.id))
      const meld=state.melds.find(m=>m.id===action.meldId); if(!meld) return state
      if(!canAddToMeld(meld,selected)) return{...state,message:'Cannot add those cards.'}
      const usedIds=new Set(selected.map(c=>c.id))
      const newMeld=updatedMeld(meld,selected),newMelds=state.melds.map(m=>m.id===meld.id?newMeld:m)
      const newHand=cur.hand.filter(c=>!usedIds.has(c.id))
      const discardUsed=state.drawnFromDiscardCardId&&usedIds.has(state.drawnFromDiscardCardId)
      // allAtOnce: true if this is the player's first card placement this round
      const addAllAtOnce=!cur.hasMelded
      console.log(`[SCORING] ADD_TO_MELD cp=${cp} hasMelded=${cur.hasMelded} allAtOnce=${addAllAtOnce} handEmpty=${!newHand.length}`)
      if(isBurningGroup(newMeld)){
        const hasJ=newMeld.cards.some(c=>c.isJoker)
        if(!newHand.length&&!hasJ) return finishRound({...state,players:mutPlayer(state,cp,{hand:newHand}),melds:newMelds,selectedCardIds:[]},cp,addAllAtOnce,false)
        return{...state,players:mutPlayer(state,cp,{hand:newHand}),melds:newMelds,selectedCardIds:[],drawnFromDiscardCardId:discardUsed?null:state.drawnFromDiscardCardId,burningMeldId:newMeld.id,burningHasJoker:hasJ,message:'🔥 Burns on discard.'}
      }
      if(!newHand.length) return finishRound({...state,players:mutPlayer(state,cp,{hand:newHand}),melds:newMelds,selectedCardIds:[]},cp,addAllAtOnce,false)
      return{...state,players:mutPlayer(state,cp,{hand:newHand,hasMelded:true}),melds:newMelds,selectedCardIds:[],drawnFromDiscardCardId:discardUsed?null:state.drawnFromDiscardCardId,message:''}
    }
    case 'STEAL_JOKER':{
      if(circlesCompleted(state.players)<2) return{...state,message:'Cannot steal Joker until circle 3.'}
      const meld=state.melds.find(m=>m.id===action.meldId); if(!meld) return state
      // ── GROUP: require 2 real cards to rescue Joker ──────────────────────
      if(meld.type==='group'){
        if(state.selectedCardIds.length!==2) return{...state,message:'Select exactly 2 real cards to rescue Joker from group.'}
        const selected2=cur.hand.filter(c=>state.selectedCardIds.includes(c.id))
        const jokerG=meld.cards.find(c=>c.isJoker); if(!jokerG) return state
        const realCards=[...meld.cards.filter(c=>!c.isJoker),...selected2]
        if(!isValidGroup(realCards)) return{...state,message:'These 2 cards do not complete the group.'}
        // Joker rescued, 4-real group auto-burns
        const usedIds2=new Set(selected2.map(c=>c.id))
        const newHand2=[...cur.hand.filter(c=>!usedIds2.has(c.id)),jokerG]
        const burnedCards=sortedMeldCards(realCards,'group')
        return{...state,
          players:mutPlayer(state,cp,{hand:newHand2}),
          melds:state.melds.filter(m=>m.id!==meld.id),
          discardPile:burnIntoDiscard(state.discardPile,burnedCards),
          selectedCardIds:[],message:'Joker rescued! Group burned. ★'}
      }
      // ── SEQUENCE: existing 1-card logic ─────────────────────────────────
      if(state.selectedCardIds.length!==1) return{...state,message:'Select exactly 1 card.'}
      const realCard=cur.hand.find(c=>c.id===state.selectedCardIds[0])!
      const{canSteal,jokerIndex}=canStealJoker(meld,realCard)
      if(!canSteal) return{...state,message:'Cannot replace Joker with that card.'}
      const joker=meld.cards[jokerIndex]
      const newMeldCards=sortedMeldCards(meld.cards.map((c,i)=>i===jokerIndex?realCard:c),meld.type)
      return{...state,players:mutPlayer(state,cp,{hand:[...cur.hand.filter(c=>c.id!==realCard.id),joker]}),melds:state.melds.map(m=>m.id===meld.id?{...m,cards:newMeldCards}:m),selectedCardIds:[],message:'Joker stolen! ★'}
    }
    case 'REPLACE_BURNING_JOKER':{
      if(state.selectedCardIds.length!==2) return{...state,message:'Select exactly 2 cards.'}
      const bm=state.melds.find(m=>m.id===state.burningMeldId); if(!bm) return state
      const joker=bm.cards.find(c=>c.isJoker); if(!joker) return state
      const replacers=cur.hand.filter(c=>state.selectedCardIds.includes(c.id)); if(replacers.length!==2) return state
      const usedIds=new Set(replacers.map(c=>c.id))
      return{...state,players:mutPlayer(state,cp,{hand:[...cur.hand.filter(c=>!usedIds.has(c.id)),joker]}),melds:state.melds.filter(m=>m.id!==state.burningMeldId),discardPile:burnIntoDiscard(state.discardPile,[...bm.cards.filter(c=>!c.isJoker),...replacers]),selectedCardIds:[],burningMeldId:null,burningHasJoker:false,message:'Joker rescued! ★'}
    }
    case 'BURN_MELD':{
      const bm=state.melds.find(m=>m.id===state.burningMeldId); if(!bm) return{...state,burningMeldId:null,burningHasJoker:false}
      return{...state,melds:state.melds.filter(m=>m.id!==state.burningMeldId),discardPile:burnIntoDiscard(state.discardPile,bm.cards),burningMeldId:null,burningHasJoker:false,message:'🔥 Set burned!'}
    }
    case 'RETURN_TO_DISCARD':{
      const drawnId=state.drawnFromDiscardCardId; if(!drawnId) return state
      const card=cur.hand.find(c=>c.id===drawnId); if(!card) return{...state,drawnFromDiscardCardId:null,phase:'player-draw',drawnThisTurn:false}
      const newStaged=state.stagedMelds.map(m=>m.filter(c=>c.id!==drawnId)).filter(m=>m.length>0)
      return{...state,players:mutPlayer(state,cp,{hand:cur.hand.filter(c=>c.id!==drawnId)}),discardPile:[...state.discardPile,card],stagedMelds:newStaged,selectedCardIds:state.selectedCardIds.filter(id=>id!==drawnId),drawnThisTurn:false,drawnFromDiscardCardId:null,phase:'player-draw',message:''}
    }
    case 'DISCARD':{
      if(state.phase!=='player-action') return state
      if(!state.drawnThisTurn) return{...state,message:'Draw a card first.'}
      if(state.drawnFromDiscardCardId){
        const drawn=cur.hand.find(c=>c.id===state.drawnFromDiscardCardId)
        const inStaged=state.stagedMelds.flat().some(c=>c.id===state.drawnFromDiscardCardId)
        if(drawn&&!inStaged) return{...state,message:'⚠ Use drawn card in meld — or RETURN TO DISCARD.'}
      }
      let s=state
      if(s.burningMeldId){const bm=s.melds.find(m=>m.id===s.burningMeldId);if(bm)s={...s,melds:s.melds.filter(m=>m.id!==s.burningMeldId),discardPile:burnIntoDiscard(s.discardPile,bm.cards),burningMeldId:null,burningHasJoker:false}}
      const card=s.players[cp].hand.find(c=>c.id===action.cardId); if(!card) return s
      const newHand=s.players[cp].hand.filter(c=>c.id!==action.cardId)
      const pile=[...s.discardPile,card]
      const upd=mutPlayer(s,cp,{hand:newHand,turnCount:s.players[cp].turnCount+1})
      // Fix 2: if this was the first-meld-one-card-left scenario, treat discard as allAtOnce (-10)
      const discardAllAtOnce = s.firstMeldSingleCardLeft
      console.log(`[SCORING] DISCARD cp=${cp} firstMeldSingleCardLeft=${s.firstMeldSingleCardLeft} allAtOnce=${discardAllAtOnce} handEmpty=${!newHand.length}`)
      if(!newHand.length) return finishRound({...s,players:upd,discardPile:pile,firstMeldSingleCardLeft:false},cp,discardAllAtOnce,card.isJoker)
      return advanceTurn({...s,players:upd,discardPile:pile})
    }
    case 'AI_TURN_DONE': return{...state,...action.next}
    case 'NEXT_ROUND':{if(state.roundNumber>=7)return{...state,phase:'game-end'};return dealRound({...state,roundNumber:state.roundNumber+1,dealerIndex:nextIdx(state.dealerIndex,state.numPlayers)})}
    case 'END_GAME_EARLY': return{...state,roundScores:[...state.roundScores,state.players.map((_,i)=>i===0?25:0)],phase:'game-end',message:''}
    default: return state
  }
}

// ── AI runner ─────────────────────────────────────────────────────────────────
function runAITurn(state: GameState, dispatch: (a:Action)=>void, tg: any, addToast: (t:string)=>void) {
  const cp=state.currentPlayerIndex,player=state.players[cp]
  let s=reshuffleIfEmpty({...state});const decision=computeAITurn(s,cp)
  let hand=[...player.hand],deck=[...s.deck],discardPile=[...s.discardPile],melds=[...s.melds],hasMelded=player.hasMelded
  let aiFirstMeldOneCard=false  // Fix 2: track when AI first melds with 1 card remaining
  let lastModifiedMeldId:string|null=null  // Fix 8: track which meld was last modified
  const usedIds=new Set<string>()
  if(decision.drawFromDiscard&&discardPile.length){
    hand=[...hand,discardPile[discardPile.length-1]];discardPile=discardPile.slice(0,-1)
    addToast(`${player.name} ${tg.logDrawDiscard}`)
  } else if(deck.length){
    hand=[...hand,deck[0]];deck=deck.slice(1)
    addToast(`${player.name} ${tg.logDrawDeck}`)
  }
  if(decision.meldsToPlay.length){
    for(const mc of decision.meldsToPlay){
      if(!isValidMeld(mc)) continue
      melds=[...melds,makeMeld(mc,cp)]
      mc.forEach(c=>usedIds.add(c.id))
    }
    hasMelded=true; hand=hand.filter(c=>!usedIds.has(c.id))
    // Fix 2: if this was first meld and exactly 1 card left
    if(!player.hasMelded && hand.length===1) aiFirstMeldOneCard=true
    const meldVal=totalMeldValue(decision.meldsToPlay)
    addToast(`${player.name} ${tg.logMelds} (${meldVal} ${tg.logPoints})`)
  }
  if(hasMelded){
    for(const{meldId,cards}of decision.cardsToAddToMeld){
      const meld=melds.find(m=>m.id===meldId); if(!meld) continue
      if(!canAddToMeld(meld,cards)) continue
      const nm=updatedMeld(meld,cards)
      melds=melds.map(m=>m.id===meldId?nm:m)
      cards.forEach(c=>usedIds.add(c.id))
      hand=hand.filter(c=>!cards.map(x=>x.id).includes(c.id))
      addToast(`${player.name} ${tg.logAdds} [${cards.map(c=>c.rank+suitSymbol(c.suit)).join(' ')}]`)
      lastModifiedMeldId=meldId   // Fix 8: track which set was modified for animation
    }
  }
  let burningMeldId=s.burningMeldId,burningHasJoker=s.burningHasJoker
  const newBurning=melds.find(m=>isBurningGroup(m)&&m.id!==burningMeldId)
  if(newBurning&&!burningMeldId){burningMeldId=newBurning.id;burningHasJoker=newBurning.cards.some(c=>c.isJoker)}
  if(burningMeldId){
    const bm=melds.find(m=>m.id===burningMeldId)
    if(bm){
      if(decision.burnAction==='steal'&&burningHasJoker&&decision.jokerReplacementCards.length>=2){
        const joker=bm.cards.find(c=>c.isJoker)!,r=decision.jokerReplacementCards.filter(c=>hand.some(h=>h.id===c.id)).slice(0,2)
        if(r.length>=2){discardPile=burnIntoDiscard(discardPile,[...bm.cards.filter(c=>!c.isJoker),r[0],r[1]]);melds=melds.filter(m=>m.id!==burningMeldId);hand=[...hand.filter(c=>c.id!==r[0].id&&c.id!==r[1].id),joker]}
        else{discardPile=burnIntoDiscard(discardPile,bm.cards);melds=melds.filter(m=>m.id!==burningMeldId)}
      }else{discardPile=burnIntoDiscard(discardPile,bm.cards);melds=melds.filter(m=>m.id!==burningMeldId)}
    }
    burningMeldId=null;burningHasJoker=false
  }
  const dc=hand.find(c=>c.id===decision.discardCard.id)??hand[hand.length-1]
  const newPlayers=state.players.map((p,i)=>i===cp?{...p,hand:dc?hand.filter(c=>c.id!==dc.id):[],hasMelded,turnCount:p.turnCount+1}:p)
  // allAtOnce: true only if this was AI's first meld this round and it ran out of cards
  const aiAllAtOnce = !player.hasMelded
  if(!dc){
    addToast(`🏆 ${player.name} ${tg.logWins}`)
    dispatch({type:'AI_TURN_DONE',next:finishRound({...s,players:newPlayers,deck,discardPile,melds,burningMeldId:null,burningHasJoker:false},cp,aiAllAtOnce,false)});return
  }
  const finalHand=newPlayers[cp].hand;discardPile=[...discardPile,dc]
  addToast(`${player.name} ${tg.logDiscards} [${dc.rank}${suitSymbol(dc.suit)}]`)
  if(!finalHand.length){
    addToast(`🏆 ${player.name} ${tg.logWins}`)
    // Fix 2: if AI first melded with 1 card left and now discards it, treat as allAtOnce
    dispatch({type:'AI_TURN_DONE',next:finishRound({...s,players:newPlayers,deck,discardPile,melds,burningMeldId:null,burningHasJoker:false,firstMeldSingleCardLeft:false},cp,aiFirstMeldOneCard,dc.isJoker)});return
  }
  const ni=nextIdx(cp,state.numPlayers),nxt=newPlayers[ni]
  // Fix 8: pass the last meld ID that was modified so animation highlights the correct set
  // Store lastModifiedMeldId in a module-level ref for the animation effect to pick up
  aiFlashMeldIdRef.current = lastModifiedMeldId
  dispatch({type:'AI_TURN_DONE',next:{players:newPlayers,deck,discardPile,melds,burningMeldId:null,burningHasJoker:false,currentPlayerIndex:ni,phase:nxt.isHuman?'player-draw':'ai-turn',drawnThisTurn:false,drawnFromDiscardCardId:null,selectedCardIds:[],stagedMelds:[],message:'',takenTrumpCard:null,firstMeldSingleCardLeft:false}})
}

// ── Card back renderer ────────────────────────────────────────────────────────
function renderCardBack(back: CardBack) {
  const styles: Record<CardBack, React.CSSProperties> = {
    night:   { background: '#0a0a2e', backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(255,215,0,0.22) 1.5px, transparent 1.5px), radial-gradient(circle at 70% 20%, rgba(255,215,0,0.18) 1px, transparent 1px), radial-gradient(circle at 50% 70%, rgba(255,215,0,0.2) 2px, transparent 2px), radial-gradient(circle at 85% 80%, rgba(255,215,0,0.15) 1px, transparent 1px)', backgroundSize: '40px 40px, 30px 30px, 50px 50px, 35px 35px' },
    elegant: { background: '#0d0d0d', backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(180,0,0,0.35) 10px, rgba(180,0,0,0.35) 11px), repeating-linear-gradient(-45deg, transparent, transparent 10px, rgba(180,0,0,0.35) 10px, rgba(180,0,0,0.35) 11px)' },
    dragon:  { background: '#0d2b1a', backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,215,0,0.18) 0, rgba(255,215,0,0.18) 1px, transparent 1px, transparent 14px), repeating-linear-gradient(90deg, rgba(255,215,0,0.18) 0, rgba(255,215,0,0.18) 1px, transparent 1px, transparent 14px)' },
    runes:   { background: '#1a0a2e', backgroundImage: 'repeating-linear-gradient(60deg, rgba(192,192,192,0.12) 0, rgba(192,192,192,0.12) 1px, transparent 1px, transparent 12px), repeating-linear-gradient(-60deg, rgba(192,192,192,0.12) 0, rgba(192,192,192,0.12) 1px, transparent 1px, transparent 12px), repeating-linear-gradient(0deg, rgba(192,192,192,0.08) 0, rgba(192,192,192,0.08) 1px, transparent 1px, transparent 12px)' },
    poker:   { background: '#6b0000', backgroundImage: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.45) 0, rgba(0,0,0,0.45) 2px, transparent 2px, transparent 14px), repeating-linear-gradient(-45deg, rgba(0,0,0,0.45) 0, rgba(0,0,0,0.45) 2px, transparent 2px, transparent 14px)' },
    sea:     { background: 'linear-gradient(180deg, #0a1a3e 0%, #0e2a55 100%)', backgroundImage: 'repeating-linear-gradient(170deg, rgba(100,200,255,0.12) 0, rgba(100,200,255,0.12) 2px, transparent 2px, transparent 20px)' },
    vip:     { background: '#050505', backgroundImage: 'repeating-linear-gradient(45deg, rgba(0,180,80,0.1) 0, rgba(0,180,80,0.1) 2px, transparent 2px, transparent 10px), repeating-linear-gradient(-45deg, rgba(0,180,80,0.1) 0, rgba(0,180,80,0.1) 2px, transparent 2px, transparent 10px)', boxShadow: 'inset 0 0 8px rgba(0,180,80,0.2)' },
    vegas:   { background: '#3d2a00', backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(0,0,0,0.7) 20%, transparent 21%), radial-gradient(circle at 0% 50%, rgba(0,0,0,0.5) 20%, transparent 21%)', backgroundSize: '20px 20px, 20px 20px', backgroundPosition: '0 0, 10px 10px' },
  }
  return <div style={{ width: '100%', height: '100%', borderRadius: 3, ...styles[back] }} />
}

// ── CardView ──────────────────────────────────────────────────────────────────
function CardView({ card, faceDown=false, selected=false, dimmed=false, onClick, small=false, glow=false, lifted=false, animClass='', cardBack='night' as CardBack, highlight=null as 'green'|'yellow'|null, tableCard=false, extraStyle={} as React.CSSProperties, onPointerDown, onPointerUp, onPointerMove }: {
  card:Card; faceDown?:boolean; selected?:boolean; dimmed?:boolean; onClick?:()=>void
  small?:boolean; glow?:boolean; lifted?:boolean; animClass?:string; cardBack?:CardBack
  highlight?:'green'|'yellow'|null; tableCard?:boolean; extraStyle?:React.CSSProperties
  onPointerDown?:(e:React.PointerEvent)=>void; onPointerUp?:(e:React.PointerEvent)=>void; onPointerMove?:(e:React.PointerEvent)=>void
}) {
  // Table cards slightly bigger than hand (small), player hand is full-size
  const w = tableCard ? 62 : small ? 42 : 56
  const h = tableCard ? 88 : small ? 58 : 80
  const rankFs = tableCard ? 17 : small ? 12 : 16
  const suitFs = tableCard ? 38 : small ? 24 : 36
  const red = isRed(card.suit), sym = suitSymbol(card.suit)
  const suitColor = red ? '#e63946' : '#1a1a1a'
  const borderColor = glow ? '#fb923c' : selected ? '#22d3ee' : '#c8c0a8'
  return (
    <div
      onClick={onClick} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerMove={onPointerMove}
      className={animClass}
      style={{
        width:w,height:h,flexShrink:0,borderRadius:4,position:'relative',
        border:`2px solid ${borderColor}`,
        background:faceDown?'var(--bg3)':'#fffef0',
        cursor:onClick?'pointer':'default',opacity:dimmed?0.45:1,
        boxShadow:glow?'0 0 10px rgba(251,146,60,0.8)':selected?'0 0 8px rgba(34,211,238,0.7)':lifted?'0 14px 30px rgba(0,0,0,0.8)':tableCard?'0 6px 18px rgba(0,0,0,0.55), 2px 2px 0 rgba(0,0,0,0.3)':'0 6px 14px rgba(0,0,0,0.5)',
        transform:selected?'translateY(-8px)':lifted?'scale(1.1) translateY(-10px)':'none',
        transition:'transform 0.1s,box-shadow 0.1s,opacity 0.12s',
        userSelect:'none',
        display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
        ...extraStyle,
      }}
    >
      {faceDown ? renderCardBack(cardBack)
      : card.isJoker ? (
        card.jokerNum === 2 ? (
          /* ── Joker 2: gold card, black star, black bold text ── */
          <div style={{width:'100%',height:'100%',borderRadius:3,background:'linear-gradient(145deg,#f5c800,#ffd700,#e8b800)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',border:'2px solid #a07800',position:'relative'}}>
            <div style={{position:'absolute',top:2,left:3,fontFamily:"'Press Start 2P',monospace",fontSize:small?4:6,color:'#1a1a1a',fontWeight:900}}>J2</div>
            <div style={{fontSize:small?22:34,lineHeight:1,color:'#1a1a1a'}}>★</div>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:small?5:7,color:'#1a1a1a',marginTop:2,letterSpacing:1,fontWeight:900}}>JOKER</div>
          </div>
        ) : (
          /* ── Joker 1: white card, gold star, rainbow-gradient "JOKER" ── */
          <div style={{width:'100%',height:'100%',borderRadius:3,background:'#fffff5',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',border:'2px solid #ffd700',position:'relative',boxShadow:'inset 0 0 8px rgba(255,215,0,0.25)'}}>
            <div style={{position:'absolute',top:2,left:3,fontFamily:"'Press Start 2P',monospace",fontSize:small?4:6,color:'#aaa',fontWeight:700}}>J1</div>
            <div style={{fontSize:small?22:34,lineHeight:1,color:'#ffd700',textShadow:'0 0 8px rgba(255,215,0,0.9), 0 0 3px #ff8800'}}>★</div>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:small?5:7,marginTop:2,letterSpacing:1,fontWeight:700,background:'linear-gradient(90deg,#e63946,#f97316,#fbbf24,#22c55e,#3b82f6,#8b5cf6)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',backgroundClip:'text'}}>JOKER</div>
          </div>
        )
      ) : (
        <>
          <div style={{position:'absolute',top:3,left:4,color:suitColor,fontWeight:800,fontSize:rankFs,lineHeight:1}}>{card.rank}</div>
          <div style={{color:suitColor,fontSize:suitFs,lineHeight:1}}>{sym}</div>
          <div style={{position:'absolute',bottom:3,right:4,color:suitColor,fontWeight:800,fontSize:rankFs,lineHeight:1,transform:'rotate(180deg)'}}>{card.rank}</div>
        </>
      )}
      {/* Highlight dot top-right */}
      {!faceDown && highlight && (
        <div style={{position:'absolute',top:3,right:3,width:9,height:9,borderRadius:'50%',background:highlight==='green'?'#22c55e':'#fbbf24',boxShadow:`0 0 5px ${highlight==='green'?'#22c55e':'#fbbf24'}`,zIndex:2}} title={highlight==='green'?'Can add to table':'Potential meld'} />
      )}
    </div>
  )
}

// ── DraggableHand ─────────────────────────────────────────────────────────────
type DragState={cardId:string;fromIndex:number;toIndex:number;x:number;y:number}|null
function DraggableHand({hand,selectedIds,stagedIds,drawnCardId,onToggle,onReorder,cardBack,highlights,dealAnimating=false}:{
  hand:Card[];selectedIds:string[];stagedIds:string[];drawnCardId?:string|null
  onToggle:(id:string)=>void;onReorder:(from:number,to:number)=>void
  cardBack:CardBack;highlights:Map<string,'green'|'yellow'>;dealAnimating?:boolean
}){
  const[drag,setDrag]=useState<DragState>(null)
  const timerRef=useRef<ReturnType<typeof setTimeout>|null>(null)
  const cardElsRef=useRef<Map<string,HTMLElement>>(new Map())
  const calcDrop=useCallback((cx:number,cy:number,dragId:string):number=>{
    const pos=hand.filter(c=>c.id!==dragId).map(c=>{const el=cardElsRef.current.get(c.id);if(!el)return null;const r=el.getBoundingClientRect();return{origIdx:hand.indexOf(c),cx:r.left+r.width/2,cy:r.top+r.height/2}}).filter(Boolean) as{origIdx:number;cx:number;cy:number}[]
    if(!pos.length)return 0
    let minD=Infinity,near=pos[0];for(const p of pos){const d=Math.hypot(cx-p.cx,cy-p.cy);if(d<minD){minD=d;near=p}}
    const el=hand[near.origIdx]?cardElsRef.current.get(hand[near.origIdx].id):null
    return el?(cx>el.getBoundingClientRect().left+el.getBoundingClientRect().width/2?near.origIdx+1:near.origIdx):near.origIdx
  },[hand])
  useEffect(()=>{
    if(!drag)return
    const onMove=(e:PointerEvent)=>{const ti=calcDrop(e.clientX,e.clientY,drag.cardId);setDrag(d=>d?{...d,x:e.clientX,y:e.clientY,toIndex:ti}:null)}
    const onUp=(e:PointerEvent)=>{setDrag(prev=>{if(prev){const ti=calcDrop(e.clientX,e.clientY,prev.cardId);if(ti!==prev.fromIndex)onReorder(prev.fromIndex,ti)}return null})}
    document.addEventListener('pointermove',onMove);document.addEventListener('pointerup',onUp)
    return()=>{document.removeEventListener('pointermove',onMove);document.removeEventListener('pointerup',onUp)}
  },[drag,calcDrop,onReorder])
  const visible=hand.map((card,i)=>({card,origIndex:i})).filter(item=>!drag||item.card.id!==drag.cardId)
  const withGap:({type:'card';card:Card;origIndex:number}|{type:'gap'})[]=[]; let gapDone=false
  for(let i=0;i<=visible.length;i++){
    if(drag&&!gapDone&&(i===visible.length||(visible[i]&&visible[i].origIndex>=drag.toIndex))){withGap.push({type:'gap'});gapDone=true}
    if(i<visible.length)withGap.push({type:'card',...visible[i]})
  }
  if(drag&&!gapDone)withGap.push({type:'gap'})
  return(
    <div style={{display:'flex',flexWrap:'wrap',gap:5,position:'relative',touchAction:'none'}}>
      {withGap.map((item,ri)=>{
        if(item.type==='gap')return <div key="gap" style={{width:56,height:80,border:'2px dashed var(--c-dash)',borderRadius:4,flexShrink:0,background:'rgba(34,211,238,0.08)'}}/>
        const{card,origIndex}=item,isSel=!drag&&selectedIds.includes(card.id),isStaged=stagedIds.includes(card.id),isDrawn=card.id===drawnCardId
        return(
          <div key={card.id} ref={el=>{if(el)cardElsRef.current.set(card.id,el);else cardElsRef.current.delete(card.id)}} style={{flexShrink:0}}>
            <CardView card={card} selected={isSel&&!isStaged} dimmed={isStaged} cardBack={cardBack}
              animClass={isDrawn?'card-draw-in':dealAnimating?'card-deal-in':''}
              extraStyle={dealAnimating?{animationDelay:`${origIndex*52}ms`}:{}}
              highlight={!isSel&&!isStaged?(highlights.get(card.id)??null):null}
              onClick={drag?undefined:()=>onToggle(card.id)}
              onPointerDown={(e:React.PointerEvent)=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);const{clientX,clientY}=e;timerRef.current=setTimeout(()=>{setDrag({cardId:card.id,fromIndex:origIndex,toIndex:origIndex,x:clientX,y:clientY});timerRef.current=null},200)}}
              onPointerUp={()=>{if(timerRef.current){clearTimeout(timerRef.current);timerRef.current=null}}}
              onPointerMove={(e:React.PointerEvent)=>{if(timerRef.current&&Math.hypot(e.movementX,e.movementY)>3){clearTimeout(timerRef.current);timerRef.current=null}}}
            />
          </div>
        )
      })}
      {drag&&(()=>{const d=hand.find(c=>c.id===drag.cardId);if(!d)return null;return <div style={{position:'fixed',left:drag.x-28,top:drag.y-40,zIndex:999,pointerEvents:'none'}}><CardView card={d} lifted cardBack={cardBack}/></div>})()}
    </div>
  )
}

// ── MeldView ──────────────────────────────────────────────────────────────────
function MeldView({meld,playerNames,onAdd,onSteal,burning,cardBack,addLabel='+ADD',stealLabel='STEAL★'}:{
  meld:Meld;playerNames:string[];onAdd?:()=>void;onSteal?:()=>void;burning?:boolean
  cardBack:CardBack;addLabel?:string;stealLabel?:string
}){
  const color=meld.ownerIndex===0?'var(--c-weight)':AI_COLORS[meld.ownerIndex-1]||'var(--c-dash)'
  return(
    <div style={{background:'rgba(0,0,0,0.35)',border:`2px solid ${burning?'#fb923c':color}`,boxShadow:burning?'0 0 14px rgba(251,146,60,0.7)':undefined,padding:'6px 8px',borderRadius:3,display:'inline-flex',flexDirection:'column',gap:4,flexShrink:0}}>
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:burning?'var(--c-journal)':color,whiteSpace:'nowrap'}}>{burning?'🔥 ':''}{playerNames[meld.ownerIndex]??`P${meld.ownerIndex}`} · {meld.type.toUpperCase()} · {meldValue(meld.cards)} pts</div>
      <div style={{display:'flex',gap:3}}>
        {meld.cards.map(c=><CardView key={c.id} card={c} small cardBack={cardBack} glow={burning&&c.isJoker}/>)}
      </div>
      {(onAdd||(onSteal&&meld.cards.some(c=>c.isJoker)))&&(
        <div style={{display:'flex',gap:3,marginTop:2}}>
          {onAdd&&<button onClick={onAdd} className="pixel-btn pixel-btn-secondary" style={{fontSize:8,padding:'3px 6px'}}>{addLabel}</button>}
          {onSteal&&meld.cards.some(c=>c.isJoker)&&<button onClick={onSteal} className="pixel-btn pixel-btn-warning" style={{fontSize:8,padding:'3px 6px'}}>{stealLabel}</button>}
        </div>
      )}
    </div>
  )
}

// ── CompactScore ──────────────────────────────────────────────────────────────
function CompactScore({players,roundScores,youLabel,scoreLabel}:{players:Player[];roundScores:number[][];youLabel:string;scoreLabel:string}){
  const[expanded,setExpanded]=useState(false)
  const totals=players.map((_,pi)=>roundScores.reduce((s,r)=>s+(r[pi]??0),0))
  const playerColor=(p:Player,i:number)=>p.isHuman?'var(--c-weight)':AI_COLORS[i-1]||'var(--c-dash)'
  if(!expanded)return(
    <div onClick={()=>setExpanded(true)} style={{cursor:'pointer',fontSize:18,fontFamily:"'VT323',monospace",display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
      {players.map((p,i)=>(
        <span key={i} style={{color:playerColor(p,i)}}>
          {p.isHuman?youLabel:p.name}: <b style={{fontSize:20}}>{totals[i]}</b>
        </span>
      ))}
      <span style={{color:'var(--muted)',fontSize:14}}>▼</span>
    </div>
  )
  return(
    <div onClick={()=>setExpanded(false)} style={{cursor:'pointer'}}>
      <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:'var(--muted)',marginBottom:4}}>{scoreLabel} ▲</div>
      <div style={{display:'grid',gridTemplateColumns:`auto repeat(7,1fr) auto`,gap:2,minWidth:280,fontFamily:"'VT323',monospace"}}>
        {['','R1','R2','R3','R4','R5','R6','R7','Σ'].map((h,i)=>(<div key={i} style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:'var(--muted)',textAlign:'center',padding:'1px 2px'}}>{h}</div>))}
        {players.map((p,pi)=>([p.isHuman?youLabel.toUpperCase():p.name,...roundScores.map(r=>r[pi]??''),totals[pi]].map((v,i)=>(<div key={i} style={{textAlign:'center',padding:'1px 3px',color:i===0?playerColor(p,pi):'var(--text)',fontSize:16}}>{v}</div>))))}
      </div>
    </div>
  )
}

// ── Round end overlay ─────────────────────────────────────────────────────────
function RoundEndOverlay({state,tg,youLabel,playerColor,onNextRound,onEndGame}:{state:GameState;tg:any;youLabel:string;playerColor:(p:Player,i:number)=>string;onNextRound:()=>void;onEndGame:()=>void}){
  const last=state.roundScores[state.roundScores.length-1]??[]
  const totals=state.players.map((_,pi)=>state.roundScores.reduce((s,r)=>s+(r[pi]??0),0))
  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.88)',zIndex:200,display:'flex',alignItems:'flex-end',backdropFilter:'blur(4px)'}}>
      <div className="round-end-panel" style={{width:'100%',background:'linear-gradient(180deg,#0d2e1a 0%,#163d24 100%)',borderTop:'3px solid var(--c-weight)',padding:'20px 16px',maxHeight:'85vh',overflowY:'auto'}}>
        <h2 style={{fontFamily:"'Press Start 2P',monospace",fontSize:11,color:'var(--c-weight)',marginBottom:16,textAlign:'center'}}>{tg.roundDone} {state.roundNumber} — COMPLETE</h2>
        <div style={{display:'grid',gridTemplateColumns:`repeat(${state.players.length},1fr)`,gap:10,marginBottom:18}}>
          {state.players.map((p,i)=>(
            <div key={i} style={{background:'rgba(0,0,0,0.35)',border:`1px solid ${playerColor(p,i)}`,padding:10,borderRadius:4,textAlign:'center'}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:playerColor(p,i),marginBottom:6}}>{p.isHuman?youLabel:p.name}</div>
              <div style={{fontSize:28,fontFamily:"'Press Start 2P',monospace",color:(last[i]??0)<=0?'var(--green)':'var(--red)'}}>{(last[i]??0)>0?'+':''}{last[i]??0}</div>
              <div style={{fontSize:16,color:'var(--muted)',marginTop:4}}>{tg.running} {totals[i]}</div>
              {p.hand.length>0&&(
                <div style={{display:'flex',flexWrap:'wrap',gap:2,justifyContent:'center',marginTop:6}}>
                  {p.hand.slice(0,5).map(c=><CardView key={c.id} card={c} small/>)}
                  {p.hand.length>5&&<span style={{color:'var(--muted)',fontSize:14,alignSelf:'center'}}>+{p.hand.length-5}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}>
          {state.roundNumber<7&&<button className="pixel-btn pixel-btn-success" onClick={onNextRound} style={{fontSize:11,padding:'12px 24px'}}>{tg.nextRound} ({state.roundNumber+1}/7) ►</button>}
          <button className="pixel-btn pixel-btn-danger" onClick={onEndGame} style={{fontSize:9}}>{tg.endGame}{state.roundNumber<7?' (+25)':''}</button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function JokerGame({ onBack }: { onBack?: () => void }){
  const[state,dispatch]=useReducer(reducer,undefined,makeSetup)
  const{t}=useLanguage();const tg=t.game

  type AnimSpeed = 'fast'|'normal'|'slow'
  type GameTheme = 'dark'|'pastel'
  type JokerPosReq = {meldCards:Card[]; jokerId:string; options:{rank:string;num:number;suit:string}[]} | null

  const[setupNumPlayers,setSetupNumPlayers]=useState(2)
  const[pendingJokerPositions,setPendingJokerPositions]=useState<Record<string,number>>({})
  const[cardBack,setCardBack]=useState<CardBack>(()=>(typeof localStorage!=='undefined'?localStorage.getItem('lk_cardback') as CardBack||'night':'night'))
  const[animSpeed,setAnimSpeedState]=useState<AnimSpeed>(()=>(typeof localStorage!=='undefined'?localStorage.getItem('lk_animspeed') as AnimSpeed||'fast':'fast'))
  const[gameTheme,setGameThemeState]=useState<GameTheme>(()=>(typeof localStorage!=='undefined'?localStorage.getItem('lk_gametheme') as GameTheme||'dark':'dark'))
  const[soundEnabled,setSoundEnabled]=useState(true)
  const[jokerPosReq,setJokerPosReq]=useState<JokerPosReq>(null)
  const[pendingStageMeld,setPendingStageMeld]=useState<Card[]|null>(null)

  function setAnimSpeed(s:AnimSpeed){setAnimSpeedState(s);if(typeof localStorage!=='undefined')localStorage.setItem('lk_animspeed',s)}
  function setGameTheme(t:GameTheme){setGameThemeState(t);if(typeof localStorage!=='undefined')localStorage.setItem('lk_gametheme',t)}

  const animMult = animSpeed==='fast'?1:animSpeed==='normal'?1.5:2
  const[sortMode,setSortMode]=useState<'none'|'suit'|'rank'>('none')
  const[origOrder,setOrigOrder]=useState<string[]>([])
  const[drawnCardId,setDrawnCardId]=useState<string|null>(null)
  const[turnBanner,setTurnBanner]=useState<{text:string;color:string;exiting:boolean}|null>(null)

  // ── Toast overlay state ───────────────────────────────────────────
  const[toasts,setToasts]=useState<{id:number;text:string;exiting:boolean}[]>([])
  const toastIdRef=useRef(0)

  // ── Animation state ───────────────────────────────────────────────
  const[deckBounce,setDeckBounce]=useState(false)
  const[deckReshuffle,setDeckReshuffle]=useState(false)
  const[discardFlash,setDiscardFlash]=useState(false)
  const[trumpFlash,setTrumpFlash]=useState(false)
  const[newMeldIds,setNewMeldIds]=useState(new Set<string>())
  const[flashMeldId,setFlashMeldId]=useState<string|null>(null)
  const[dealAnimating,setDealAnimating]=useState(false)
  const prevMeldIds=useRef<string[]>([])
  const prevDeckLen=useRef(0)
  const prevDiscardLen=useRef(0)
  const prevRoundRef=useRef(-1)

  const{play,unlockAudio}=useGameSounds(soundEnabled)

  // ── Toast helper ──────────────────────────────────────────────────
  function addToast(text:string){
    const id=++toastIdRef.current
    const showMs=Math.round(1700*animMult), hideMs=Math.round(2000*animMult)
    setToasts(prev=>[...prev.slice(-4),{id,text,exiting:false}])
    setTimeout(()=>setToasts(prev=>prev.map(t=>t.id===id?{...t,exiting:true}:t)),showMs)
    setTimeout(()=>setToasts(prev=>prev.filter(t=>t.id!==id)),hideMs)
  }

  // ── AI turn — pass tg + addToast ─────────────────────────────────
  useEffect(()=>{
    if(state.phase!=='ai-turn')return
    const timer=setTimeout(()=>runAITurn(state,dispatch,tg,addToast),1200)
    return()=>clearTimeout(timer)
  },[state.phase,state.currentPlayerIndex,state.roundNumber])

  // ── Animation triggers ────────────────────────────────────────────
  // Deck bounce + reshuffle detection
  useEffect(()=>{
    if(prevDeckLen.current===0&&state.deck.length>5){
      setDeckReshuffle(true); setTimeout(()=>setDeckReshuffle(false),600)
      addToast('🔀 Reshuffle...')
    }
    prevDeckLen.current=state.deck.length
  },[state.deck.length])

  // New melds animate in; track which set got added to
  useEffect(()=>{
    const cur=state.melds.map(m=>m.id)
    const fresh=new Set(cur.filter(id=>!prevMeldIds.current.includes(id)))
    if(fresh.size>0){
      setNewMeldIds(fresh)
      setTimeout(()=>setNewMeldIds(new Set()),500)
    }
    // Fix 8: use AI-provided meld ID if available, otherwise detect by size change
    const aiHint = aiFlashMeldIdRef.current; aiFlashMeldIdRef.current = null
    const changedId = aiHint || state.melds.find(m=>prevMeldIds.current.includes(m.id)&&!fresh.has(m.id))?.id
    if(changedId){
      setFlashMeldId(changedId)
      setTimeout(()=>setFlashMeldId(null),400)
    }
    prevMeldIds.current=cur
  },[state.melds])

  // Discard pile flash when new card lands
  useEffect(()=>{
    if(state.discardPile.length>prevDiscardLen.current){
      setDiscardFlash(true); setTimeout(()=>setDiscardFlash(false),350)
    }
    prevDiscardLen.current=state.discardPile.length
  },[state.discardPile.length])

  // Deal stagger animation on new round
  useEffect(()=>{
    if(state.roundNumber!==prevRoundRef.current&&state.roundNumber>0){
      prevRoundRef.current=state.roundNumber
      setDealAnimating(true)
      const cnt=state.players[0]?.hand.length??14
      setTimeout(()=>setDealAnimating(false),cnt*55+350)
    }
  },[state.roundNumber])

  // Turn banner (fixed overlay, slides from top)
  const prevPlayer=useRef(-1)
  useEffect(()=>{
    if(state.phase==='setup'||state.phase==='round-end'||state.phase==='game-end')return
    if(state.currentPlayerIndex===prevPlayer.current)return
    prevPlayer.current=state.currentPlayerIndex
    const cur=state.players[state.currentPlayerIndex]
    const isHuman=cur?.isHuman
    const text=isHuman?(state.phase==='player-draw'?tg.yourTurnDraw:tg.yourTurnAction):`${tg.aiTurnBanner} — ${cur?.name}`
    const color=isHuman?'#00ff88':AI_COLORS[state.currentPlayerIndex-1]||'#ff4444'
    setTurnBanner({text,color,exiting:false})
    const t1=setTimeout(()=>setTurnBanner(b=>b?{...b,exiting:true}:null),1100)
    const t2=setTimeout(()=>setTurnBanner(null),1450)
    return()=>{clearTimeout(t1);clearTimeout(t2)}
  },[state.currentPlayerIndex,state.phase])

  // Animate drawn card + bounce deck
  useEffect(()=>{
    if(state.phase==='player-action'&&state.drawnThisTurn){
      setDeckBounce(true); setTimeout(()=>setDeckBounce(false),250)
      const h=state.players[0]?.hand,last=h?.[h.length-1]
      if(last){setDrawnCardId(last.id);play('draw');setTimeout(()=>setDrawnCardId(null),300)}
    }
  },[state.drawnThisTurn])

  // AI tick-tock while AI thinks
  const aiTickRef=useRef<ReturnType<typeof setInterval>|null>(null)
  useEffect(()=>{
    if(state.phase==='ai-turn'&&soundEnabled){
      aiTickRef.current=setInterval(()=>play('aiTick'),600)
    }else{
      if(aiTickRef.current){clearInterval(aiTickRef.current);aiTickRef.current=null}
    }
    return()=>{if(aiTickRef.current){clearInterval(aiTickRef.current);aiTickRef.current=null}}
  },[state.phase,soundEnabled])

  // Round / game win sounds
  const prevPhase=useRef<string>('')
  useEffect(()=>{
    if(state.phase===prevPhase.current)return
    prevPhase.current=state.phase
    if(state.phase==='round-end')play('roundWin')
    if(state.phase==='game-end')play('gameWin')
  },[state.phase])

  const human=state.players[0],topDiscard=state.discardPile[state.discardPile.length-1]
  const stagedIds=new Set(state.stagedMelds.flat().map(c=>c.id))
  const playerNames=state.players.map(p=>p.isHuman?'You':p.name)
  const youLabel=t.nav.dashboard==='Дашборд'?'Ти':'You'
  const inDraw=state.phase==='player-draw',inAction=state.phase==='player-action'
  const isMyTurn=state.players[state.currentPlayerIndex]?.isHuman
  const circles=circlesCompleted(state.players)
  const playerColor=(p:Player,i:number)=>p.isHuman?'var(--c-weight)':AI_COLORS[i-1]||'var(--c-dash)'

  // Card highlights
  const highlights=useMemo(()=>{
    const map=new Map<string,'green'|'yellow'>()
    if(!human?.hand)return map
    for(const card of human.hand){for(const meld of state.melds){if(canAddToMeld(meld,[card])){map.set(card.id,'green');break}}}
    findMeldsInHand(human.hand).forEach(m=>m.forEach(c=>{if(!map.has(c.id))map.set(c.id,'yellow')}))
    return map
  },[human?.hand,state.melds])

  // Sort hand
  function handleSort(){
    const hand=human?.hand??[]
    if(sortMode==='none'){
      setOrigOrder(hand.map(c=>c.id));setSortMode('suit')
      const S:{[k:string]:number}={spades:0,hearts:1,diamonds:2,clubs:3,joker:9}
      dispatch({type:'REORDER_HAND_TO',hand:[...hand].sort((a,b)=>(S[a.suit]??9)-(S[b.suit]??9))})
    }else if(sortMode==='suit'){
      setSortMode('rank')
      dispatch({type:'REORDER_HAND_TO',hand:[...hand].sort((a,b)=>{if(a.isJoker)return 1;if(b.isJoker)return-1;return(RANK_NUM[a.rank]??0)-(RANK_NUM[b.rank]??0)})})
    }else{
      setSortMode('none')
      const restored=origOrder.map(id=>hand.find(c=>c.id===id)).filter(Boolean) as Card[]
      const extra=hand.filter(c=>!origOrder.includes(c.id))
      dispatch({type:'REORDER_HAND_TO',hand:[...restored,...extra]})
    }
  }

  // ── Setup screen ────────────────────────────────────────────────────────
  if(state.phase==='setup'){
    const backNames:Record<CardBack,string>={night:tg.backNight,elegant:tg.backElegant,dragon:tg.backDragon,runes:tg.backRunes,poker:tg.backPoker,sea:tg.backSea,vip:tg.backVip,vegas:tg.backVegas}
    return(
      <div style={{maxWidth:580,margin:'0 auto',padding:'32px 16px',textAlign:'center'}}>
        {onBack&&<button onClick={onBack} className="pixel-btn" style={{marginBottom:16,fontSize:9,padding:'7px 12px',float:'left'}}>{t.friends.back}</button>}
        <h1 style={{fontFamily:"'Press Start 2P',monospace",fontSize:16,color:'var(--c-journal)',marginBottom:24,clear:'both'}}>{tg.title}</h1>
        <div className="pixel-card card-journal" style={{padding:24,marginBottom:12}}>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:11,color:'var(--muted)',marginBottom:16}}>{tg.choosePlayers}</div>
          <div style={{display:'flex',gap:10,justifyContent:'center',marginBottom:24}}>
            {[2,3,4,5].map(n=>(
              <button key={n} className="pixel-btn" onClick={()=>setSetupNumPlayers(n)}
                style={{fontSize:14,padding:'14px 22px',background:setupNumPlayers===n?'var(--c-dash)':'var(--bg3)',color:setupNumPlayers===n?'#000':'var(--muted)',border:`2px solid ${setupNumPlayers===n?'var(--c-dash)':'var(--border)'}`,boxShadow:setupNumPlayers===n?'0 0 10px rgba(34,211,238,0.4)':undefined}}>
                {n}P
              </button>
            ))}
          </div>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,color:'var(--muted)',marginBottom:12}}>{tg.cardBackLabel}</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:10,justifyContent:'center',marginBottom:16}}>
            {CARD_BACKS.map(key=>(
              <div key={key} onClick={()=>setCardBack(key)} style={{cursor:'pointer',border:`3px solid ${cardBack===key?'var(--c-dash)':'var(--border)'}`,borderRadius:6,padding:4,width:64,boxShadow:cardBack===key?'0 0 10px rgba(34,211,238,0.5)':undefined}}>
                <div style={{width:56,height:78,borderRadius:4,overflow:'hidden',marginBottom:4}}>{renderCardBack(key)}</div>
                <div style={{fontFamily:"'VT323',monospace",fontSize:14,color:cardBack===key?'var(--c-dash)':'var(--muted)',textAlign:'center'}}>{backNames[key]}</div>
              </div>
            ))}
          </div>
          {/* Animation speed */}
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,color:'var(--muted)',marginBottom:8}}>{tg.animSpeedLabel}</div>
          <div style={{display:'flex',gap:6,justifyContent:'center',marginBottom:20}}>
            {(['fast','normal','slow'] as const).map(s=>(
              <button key={s} onClick={()=>setAnimSpeed(s)} className="pixel-btn" style={{flex:1,justifyContent:'center',fontSize:11,background:animSpeed===s?'rgba(34,211,238,0.2)':'var(--bg3)',border:`2px solid ${animSpeed===s?'var(--c-dash)':'var(--border)'}`,color:animSpeed===s?'var(--c-dash)':'var(--muted)'}}>
                {s==='fast'?tg.speedFast:s==='normal'?tg.speedNormal:tg.speedSlow}
              </button>
            ))}
          </div>
          {/* Theme */}
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,color:'var(--muted)',marginBottom:8}}>{tg.themeLabel}</div>
          <div style={{display:'flex',gap:6,justifyContent:'center',marginBottom:20}}>
            {(['dark','pastel'] as const).map(th=>(
              <button key={th} onClick={()=>setGameTheme(th)} className="pixel-btn" style={{flex:1,justifyContent:'center',fontSize:11,background:gameTheme===th?'rgba(34,211,238,0.2)':'var(--bg3)',border:`2px solid ${gameTheme===th?'var(--c-dash)':'var(--border)'}`,color:gameTheme===th?'var(--c-dash)':'var(--muted)'}}>
                {th==='dark'?tg.themeDark:tg.themePastel}
              </button>
            ))}
          </div>
          <div style={{fontSize:17,color:'var(--muted)',marginBottom:20}}>{tg.youAreP1}</div>
          <button className="pixel-btn pixel-btn-success" onClick={()=>dispatch({type:'START_GAME',numPlayers:setupNumPlayers})}
            style={{width:'100%',justifyContent:'center',fontSize:14,padding:'16px 0',letterSpacing:2}}>
            {tg.startGame} ▶
          </button>
        </div>
      </div>
    )
  }

  // ── Round end overlay ────────────────────────────────────────────────────
  if(state.phase==='round-end')return(
    <>
      <div style={{opacity:0.25,pointerEvents:'none',height:200,background:'var(--bg)'}}/>
      <RoundEndOverlay state={state} tg={tg} youLabel={youLabel} playerColor={playerColor} onNextRound={()=>dispatch({type:'NEXT_ROUND'})} onEndGame={()=>dispatch({type:'END_GAME_EARLY'})}/>
    </>
  )

  // ── Game end ─────────────────────────────────────────────────────────────
  if(state.phase==='game-end'){
    const totals=state.players.map((_,pi)=>state.roundScores.reduce((s,r)=>s+(r[pi]??0),0))
    const minScore=Math.min(...totals),winnerIdx=totals.indexOf(minScore),winner=state.players[winnerIdx]
    return(
      <div className={`game-container anim-speed-${animSpeed} game-theme-${gameTheme}`}>
        {/* Full-screen game-over overlay */}
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.92)',zIndex:300,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'20px 16px',overflowY:'auto',backdropFilter:'blur(6px)'}}>
          <div className="round-end-panel" style={{width:'100%',maxWidth:700,background:'linear-gradient(180deg,#0d1a10 0%,#142018 100%)',border:'3px solid #ffd700',padding:'28px 20px',borderRadius:4,boxShadow:'0 0 40px rgba(255,215,0,0.3)'}}>
            <h1 style={{fontFamily:"'Press Start 2P',monospace",fontSize:14,color:'#ffd700',textAlign:'center',textShadow:'0 0 20px rgba(255,215,0,0.6)',marginBottom:8}}>
              {tg.gameOver}
            </h1>
            <div style={{textAlign:'center',marginBottom:20}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:12,color:winner.isHuman?'var(--c-weight)':'var(--red)',marginBottom:8,textShadow:`0 0 12px ${winner.isHuman?'rgba(74,222,128,0.6)':'rgba(239,68,68,0.6)'}`}}>
                {winner.isHuman?tg.youWin:`🏆 ${winner.name} ${tg.aiWins}`}
              </div>
              <div style={{fontSize:17,color:'var(--muted)'}}>{tg.lowestWins}</div>
            </div>

            {/* Full scores table */}
            <div style={{marginBottom:20,overflowX:'auto'}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:'var(--muted)',marginBottom:8}}>{tg.allRounds}</div>
              <div style={{display:'grid',gridTemplateColumns:`auto repeat(${state.roundScores.length},1fr) auto`,gap:2,minWidth:320,fontFamily:"'VT323',monospace",fontSize:18}}>
                {['', ...state.roundScores.map((_,i)=>`R${i+1}`), 'Σ'].map((h,i)=>(
                  <div key={i} style={{fontFamily:"'Press Start 2P',monospace",fontSize:7,color:'var(--muted)',textAlign:'center',padding:'3px 4px'}}>{h}</div>
                ))}
                {state.players.map((p,pi)=>{
                  const pColor=pi===winnerIdx?'#ffd700':playerColor(p,pi)
                  return([p.isHuman?youLabel.toUpperCase():p.name,...state.roundScores.map(r=>r[pi]??''),totals[pi]].map((v,i)=>(
                    <div key={i} style={{textAlign:'center',padding:'3px 4px',color:i===0?pColor:'var(--text)',fontWeight:pi===winnerIdx&&i===state.roundScores.length+1?700:400}}>{v}</div>
                  )))
                })}
              </div>
            </div>

            <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
              <button className="pixel-btn pixel-btn-primary" onClick={()=>dispatch({type:'INIT_ROUND'})} style={{fontSize:12,padding:'14px 28px'}}>
                {tg.newGame}
              </button>
              <a href="/dashboard" className="pixel-btn pixel-btn-secondary" style={{fontSize:11,padding:'12px 20px',textDecoration:'none'}}>
                {tg.exitGame}
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Main game ────────────────────────────────────────────────────────────
  return(
    <div className={`game-container anim-speed-${animSpeed} game-theme-${gameTheme}`} style={{maxWidth:860,margin:'0 auto',userSelect:'none',overflow:'hidden'}} onPointerDown={unlockAudio}>

      {/* ── Fixed overlay: toasts ── */}
      <div style={{position:'fixed',top:80,left:'50%',zIndex:400,display:'flex',flexDirection:'column',gap:6,alignItems:'center',pointerEvents:'none',minWidth:200,maxWidth:'82vw'}}>
        {toasts.map(t=>(
          <div key={t.id} style={{
            background:'rgba(10,20,18,0.92)',color:'#e8f5f0',
            fontFamily:"'VT323',monospace",fontSize:18,
            padding:'8px 18px',borderRadius:4,border:'1px solid rgba(255,255,255,0.18)',
            backdropFilter:'blur(8px)',whiteSpace:'nowrap',textAlign:'center',
            animation:t.exiting?'toastOut 0.28s ease forwards':'toastIn 0.25s ease forwards',
          }}>{t.text}</div>
        ))}
      </div>

      {/* ── Fixed overlay: turn banner ── */}
      {turnBanner&&(
        <div style={{
          position:'fixed',top:90,left:'50%',zIndex:350,pointerEvents:'none',
          background:`${turnBanner.color}28`,border:`2px solid ${turnBanner.color}`,
          padding:'10px 28px',borderRadius:4,
          fontFamily:"'Press Start 2P',monospace",fontSize:11,color:turnBanner.color,letterSpacing:1,
          animation:turnBanner.exiting?'bannerSlideUp 0.32s ease forwards':'bannerSlideDown 0.3s ease forwards',
        }}>
          {turnBanner.text}
        </div>
      )}

      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 16px',background:'rgba(0,0,0,0.4)',flexWrap:'wrap',gap:6}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:11,color:'var(--c-journal)'}}>{tg.title}</span>
          <button onClick={()=>setSoundEnabled(e=>!e)} style={{background:'none',border:'none',fontSize:18,cursor:'pointer',padding:2}}>{soundEnabled?'🔊':'🔇'}</button>
        </div>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:14,color:'var(--muted)',letterSpacing:0.3}}>
          {tg.roundDone.replace('♦','').trim()} {state.roundNumber}/7 &nbsp;·&nbsp; {tg.circle} {circles+1}
        </div>
        <CompactScore players={state.players} roundScores={state.roundScores} youLabel={youLabel} scoreLabel={tg.scores}/>
      </div>

      {/* Error/game message */}
      {state.message&&(
        <div style={{background:state.burningMeldId?'rgba(251,146,60,0.2)':'rgba(0,0,0,0.5)',borderBottom:`1px solid ${state.burningMeldId?'var(--c-journal)':'var(--border)'}`,padding:'8px 16px',fontSize:18,color:state.burningMeldId?'var(--yellow)':'var(--text)'}}>
          {state.message}
        </div>
      )}

      {/* ZONE 1: AI Players */}
      <div className="ai-zone" style={{borderBottom:'1px solid rgba(255,255,255,0.06)',padding:'8px 16px'}}>
        <div style={{display:'flex',flexWrap:'wrap',gap:10,alignItems:'center'}}>
          {state.players.slice(1).map((p,i)=>{
            const color=AI_COLORS[i]||'#888'
            const isCurrent=state.currentPlayerIndex===i+1
            return(
              <div key={p.id} style={{display:'flex',alignItems:'center',gap:6,background:isCurrent?`${color}22`:'rgba(0,0,0,0.3)',border:`2px solid ${isCurrent?color:'rgba(255,255,255,0.08)'}`,padding:'5px 10px',borderRadius:4,transition:'all 0.3s'}}>
                <span style={{fontFamily:"'Press Start 2P',monospace",fontSize:9,color}}>{p.name}</span>
                {/* Mini card backs — show up to 3 then count */}
                <div style={{display:'flex',gap:2,alignItems:'center'}}>
                  {Array.from({length:Math.min(3,p.hand.length)}).map((_,j)=>(
                    <div key={j} style={{width:11,height:16,borderRadius:2,overflow:'hidden',flexShrink:0,boxShadow:'0 1px 2px rgba(0,0,0,0.4)'}}>
                      {renderCardBack(cardBack)}
                    </div>
                  ))}
                </div>
                <span style={{fontSize:20,color:'white',fontWeight:700,minWidth:18,textAlign:'center'}}>{p.hand.length}</span>
                {p.hasMelded?<span style={{fontSize:14,color}}>✓</span>:<span style={{fontSize:12,color:'rgba(255,255,255,0.3)'}}>○</span>}
                {isCurrent&&<span className="ai-spinner" style={{fontSize:13,color}}>⟳</span>}
              </div>
            )
          })}
        </div>

      </div>

      {/* ZONE 2: Table (felt) */}
      <div className="felt-zone" style={{padding:'14px 16px',borderBottom:'2px solid rgba(255,255,255,0.08)'}}>
        {/* Deck / Discard / Trump */}
        <div style={{display:'flex',gap:18,alignItems:'flex-start',justifyContent:'center',marginBottom:12,flexWrap:'wrap'}}>
          {/* Deck — bounce on draw, flicker on reshuffle */}
          <div style={{textAlign:'center'}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,color:'rgba(255,255,255,0.5)',marginBottom:6}}>{tg.deck} ({state.deck.length})</div>
            {state.deck.length>0
              ?<div className={deckBounce?'deck-bounce':deckReshuffle?'deck-reshuffle':''}>
                 <CardView card={state.deck[0]} faceDown cardBack={cardBack} tableCard onClick={inDraw?()=>dispatch({type:'DRAW_DECK'}):undefined}/>
               </div>
              :<div style={{width:62,height:88,border:'2px dashed rgba(255,255,255,0.2)',borderRadius:4,display:'flex',alignItems:'center',justifyContent:'center',color:'rgba(255,255,255,0.3)',fontSize:18}}>∅</div>}
          </div>
          {/* Discard — flash orange when card lands */}
          <div style={{textAlign:'center'}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,color:'rgba(255,255,255,0.5)',marginBottom:6}}>{tg.discardPile}</div>
            <div className={discardFlash?'discard-flash':''}>
              {topDiscard
                ?<CardView card={topDiscard} tableCard onClick={inDraw?()=>dispatch({type:'DRAW_DISCARD'}):undefined}/>
                :<div style={{width:62,height:88,border:'2px dashed rgba(255,255,255,0.2)',borderRadius:4,display:'flex',alignItems:'center',justifyContent:'center',color:'rgba(255,255,255,0.3)',fontSize:18}}>—</div>}
            </div>
          </div>
          {/* Trump — gold pulse */}
          <div style={{textAlign:'center'}}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,color:'#ffd700',marginBottom:6}}>{tg.trump} {state.trumpSuit?suitSymbol(state.trumpSuit):''}</div>
            {state.trumpCard?(
              <div>
                <div className={trumpFlash?'trump-pulse':''} style={{boxShadow:'0 0 14px #ffd700, 0 6px 18px rgba(0,0,0,0.55)',display:'inline-block',borderRadius:4,opacity:human?.hasMelded?0.4:1,filter:human?.hasMelded?'grayscale(0.5)':undefined}}>
                  <CardView card={state.trumpCard} tableCard/>
                </div>
                {inDraw&&!state.drawnThisTurn&&circles>=2&&!human?.hasMelded&&(
                  <button className="pixel-btn pixel-btn-warning" onClick={()=>{setTrumpFlash(true);setTimeout(()=>setTrumpFlash(false),600);dispatch({type:'TAKE_TRUMP'})}} style={{fontSize:8,padding:'4px 6px',marginTop:6,width:'100%'}}>{tg.takeTrump}</button>
                )}
                {human?.hasMelded&&(
                  <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:6,color:'rgba(255,215,0,0.45)',marginTop:4,textAlign:'center'}}>NOT AVAILABLE</div>
                )}
              </div>
            ):<div style={{width:62,height:88,border:'2px dashed rgba(255,215,0,0.3)',borderRadius:4,display:'flex',alignItems:'center',justifyContent:'center',color:'rgba(255,215,0,0.4)',fontSize:18}}>—</div>}
          </div>
          {/* Staged */}
          {state.stagedMelds.length>0&&(
            <div style={{flex:1,minWidth:120}}>
              <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:'var(--yellow)',marginBottom:4}}>{tg.staged} ({totalMeldValue(state.stagedMelds)} pts)</div>
              {state.stagedMelds.map((m,i)=>(
                <div key={i} style={{display:'flex',gap:3,marginBottom:4,flexWrap:'wrap'}}>
                  {m.map(c=><CardView key={c.id} card={c} small cardBack={cardBack}/>)}
                  <span style={{fontSize:16,color:'var(--muted)',alignSelf:'center'}}>{meldValue(m)}pt</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Melds — scale-in for new, flash-blue for add-to-set */}
        {state.melds.length>0&&(
          <div>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:'rgba(255,255,255,0.35)',marginBottom:6}}>{tg.tableZone} ({state.melds.length})</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:8,maxHeight:240,overflowY:'auto',paddingBottom:4}}>
              {state.melds.map(meld=>(
                <div key={meld.id} className={newMeldIds.has(meld.id)?'meld-appear':flashMeldId===meld.id?'set-flash-blue':''}>
                  <MeldView meld={meld} playerNames={playerNames} cardBack={cardBack} burning={meld.id===state.burningMeldId} addLabel={tg.addToSet} stealLabel={tg.stealJoker}
                    onAdd={inAction&&state.selectedCardIds.length>0&&meld.id!==state.burningMeldId?()=>dispatch({type:'ADD_TO_MELD',meldId:meld.id}):undefined}
                    onSteal={inAction&&state.selectedCardIds.length===1&&meld.id!==state.burningMeldId?()=>dispatch({type:'STEAL_JOKER',meldId:meld.id}):undefined}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ZONE 3: Player hand — cards stagger-animate in on new round */}
      <div className={`hand-zone ${isMyTurn?'player-turn-bar':''} game-safe-bottom`} style={{padding:'12px 16px 130px',borderTop:`3px solid ${isMyTurn?'#00ff88':'transparent'}`}}>
        <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:8,color:isMyTurn?'#00ff88':'rgba(255,255,255,0.35)',marginBottom:8}}>{tg.handZone}</div>

        {human&&(
          <>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,flexWrap:'wrap'}}>
              <span style={{fontSize:18,color:'var(--c-weight)'}}>{human.hand.length} cards · {human.hasMelded?tg.melded:tg.needPts}</span>
              {state.drawnFromDiscardCardId&&<span style={{color:'var(--yellow)',fontSize:18}}>⚠ use drawn card!</span>}
              {state.selectedCardIds.length>0&&<span style={{color:'var(--yellow)',fontSize:18}}>{state.selectedCardIds.length} selected</span>}
              <button onClick={handleSort} className="pixel-btn pixel-btn-secondary" style={{fontSize:9,padding:'5px 10px',marginLeft:'auto'}}>{tg.sortLabel}: {sortMode==='none'?tg.sortNone:sortMode==='suit'?tg.sortSuit:tg.sortRank}</button>
            </div>
            {/* Pass dealAnimating so DraggableHand can stagger card appearances */}
            <DraggableHand hand={human.hand} selectedIds={state.selectedCardIds} stagedIds={Array.from(stagedIds)} drawnCardId={drawnCardId} cardBack={cardBack} highlights={highlights} dealAnimating={dealAnimating}
              onToggle={id=>{if(inAction){play('select');dispatch({type:'TOGGLE_CARD',cardId:id})}}}
              onReorder={(from,to)=>dispatch({type:'REORDER_HAND',fromIndex:from,toIndex:to})}
            />
          </>
        )}

        {/* Action buttons */}
      </div>

      {/* ── Fixed bottom action bar ── */}
      {isMyTurn&&(
        <div className="fixed-actions">
          {inDraw&&(
            <div style={{display:'flex',gap:8}}>
              <button className="pixel-btn" onClick={()=>dispatch({type:'DRAW_DECK'})}
                style={{flex:1,justifyContent:'center',fontSize:13,padding:'13px 16px',background:'#1e3a5f',color:'#c8dcf0',border:'2px solid #2a5491',boxShadow:'3px 3px 0 rgba(0,0,0,0.5)'}}>
                {tg.drawDeck}
              </button>
              <button className="pixel-btn" onClick={()=>dispatch({type:'DRAW_DISCARD'})}
                disabled={!topDiscard||circles<2}
                title={circles<2?tg.noMeldCircle:''}
                style={{flex:1,justifyContent:'center',fontSize:13,padding:'13px 16px',background:circles>=2&&topDiscard?'#5c3a1e':'#2a2a3a',color:circles>=2&&topDiscard?'#f0d0a8':'#666',border:`2px solid ${circles>=2&&topDiscard?'#8b5a2b':'#444'}`,opacity:!topDiscard||circles<2?0.5:1,boxShadow:'3px 3px 0 rgba(0,0,0,0.5)'}}>
                {tg.drawDiscard}
              </button>
            </div>
          )}
          {inAction&&(
            <div style={{display:'flex',gap:7,flexWrap:'wrap',alignItems:'center'}}>
              {state.takenTrumpCard&&(
                <button className="pixel-btn pixel-btn-secondary" onClick={()=>dispatch({type:'RETURN_TRUMP'})} style={{borderColor:'#ffd700',color:'#ffd700',fontSize:9}}>{tg.returnTrump}</button>
              )}
              {state.burningMeldId?(
                <>
                  {state.burningHasJoker&&state.selectedCardIds.length===2&&(
                    <button className="pixel-btn pixel-btn-warning" onClick={()=>{play('meld');dispatch({type:'REPLACE_BURNING_JOKER'})}} style={{fontSize:10}}>{tg.rescueJoker}</button>
                  )}
                  <button className="pixel-btn pixel-btn-danger" onClick={()=>{play('burn');dispatch({type:'BURN_MELD'})}} style={{fontSize:11}}>{tg.burnSet}</button>
                </>
              ):(
                <>
                  <button className="pixel-btn" onClick={()=>{
                    const cards=(human?.hand??[]).filter(c=>state.selectedCardIds.includes(c.id))
                    if(isValidMeld(cards)&&meldType(cards)==='sequence'){
                      const jokers=cards.filter(c=>c.isJoker)
                      if(jokers.length>0){
                        const opts=getJokerPositionOptions(cards,jokers[0].id)
                        if(opts.length>1){setPendingStageMeld(cards);setJokerPosReq({meldCards:cards,jokerId:jokers[0].id,options:opts});return}
                      }
                    }
                    dispatch({type:'STAGE_MELD'})
                  }} disabled={state.selectedCardIds.length<3}
                    style={{fontSize:12,padding:'10px 14px',background:'#1a4a28',color:'#90d4a0',border:'2px solid #2a7a3a',boxShadow:'3px 3px 0 rgba(0,0,0,0.5)'}}>
                    {tg.stageMeld}
                  </button>
                  {state.stagedMelds.length>0&&(
                    <>
                      <button className="pixel-btn" onClick={()=>{play('meld');dispatch({type:'COMMIT_MELDS',jokerPositions:pendingJokerPositions});setPendingJokerPositions({})}}
                        style={{fontSize:12,padding:'10px 14px',background:'#1a2a5a',color:'#90b0e0',border:'2px solid #2a4a8a',boxShadow:'3px 3px 0 rgba(0,0,0,0.5)'}}>
                        {tg.commitMelds} ({totalMeldValue(state.stagedMelds)} pts)
                      </button>
                      <button className="pixel-btn pixel-btn-secondary" onClick={()=>dispatch({type:'CLEAR_STAGED'})} style={{fontSize:9}}>{tg.clearStaged}</button>
                    </>
                  )}
                </>
              )}
              {state.selectedCardIds.length===1&&!state.burningMeldId&&(
                <button className="pixel-btn" onClick={()=>{play('discard');dispatch({type:'DISCARD',cardId:state.selectedCardIds[0]})}}
                  style={{flex:1,justifyContent:'center',fontSize:14,padding:'12px 18px',background:'#4a1a1a',color:'#e0a0a0',border:'2px solid #7a2a2a',boxShadow:'3px 3px 0 rgba(0,0,0,0.5)'}}>
                  {tg.discardBtn}
                </button>
              )}
              {(()=>{
                const drawnId=state.drawnFromDiscardCardId;if(!drawnId)return null
                const stillUnused=human?.hand.some(c=>c.id===drawnId)&&!state.stagedMelds.flat().some(c=>c.id===drawnId)
                if(!stillUnused)return null
                return<button className="pixel-btn pixel-btn-secondary" onClick={()=>dispatch({type:'RETURN_TO_DISCARD'})} style={{borderColor:'var(--yellow)',color:'var(--yellow)',fontSize:9}}>{tg.returnDiscard}</button>
              })()}
            </div>
          )}
        </div>
      )}

      {/* ── Joker Position Dialog ── */}
      {jokerPosReq&&(
        <div className="modal-overlay" onClick={()=>{setJokerPosReq(null);setPendingStageMeld(null)}}>
          <div className="pixel-card card-planner" style={{width:'100%',maxWidth:420,padding:24}} onClick={e=>e.stopPropagation()}>
            <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:10,color:'var(--c-planner)',marginBottom:14}}>{tg.jokerPosTitle}</div>
            <div style={{fontSize:17,color:'var(--muted)',marginBottom:16}}>{tg.jokerPosHint}</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:8,justifyContent:'center'}}>
              {jokerPosReq.options.map(opt=>(
                <button key={opt.num} className="pixel-btn pixel-btn-primary" style={{fontSize:16,padding:'10px 16px'}}
                  onClick={()=>{
                    // Store the selected joker position
                    const newPositions={...pendingJokerPositions,[jokerPosReq.jokerId]:opt.num}
                    setPendingJokerPositions(newPositions)
                    // Stage the meld (the position will be used when committing)
                    if(pendingStageMeld) dispatch({type:'STAGE_MELD'})
                    setJokerPosReq(null);setPendingStageMeld(null)
                  }}>
                  {opt.rank} {suitSymbol((jokerPosReq.meldCards.find(c=>!c.isJoker)?.suit??'hearts') as any)}
                </button>
              ))}
            </div>
            <button className="pixel-btn pixel-btn-secondary" style={{marginTop:12,fontSize:9}} onClick={()=>{setJokerPosReq(null);setPendingStageMeld(null)}}>
              ✕ Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
