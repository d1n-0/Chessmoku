import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newGame,applyAction,canMove,findFive,legalTargets} from '../shared/game.js';
const piece=(type,color='w',moved=false)=>({type,color,moved});
test('initial armies, free placement, turn ownership and immutable state',()=>{
 const g=newGame();assert.equal(Object.values(g.reserves.w).reduce((a,b)=>a+b),16);
 const next=applyAction(g,{kind:'place',type:'q',to:0});assert.equal(next.board[0].type,'q');assert.equal(next.reserves.w.q,0);assert.equal(next.turn,'b');assert.equal(g.board[0],null);
 assert.throws(()=>applyAction(next,{kind:'place',type:'p',to:1},'w'));
 assert.throws(()=>applyAction(next,{kind:'place',type:'p',to:0}));
 for(const to of [-1,64,1.5,'1',null])assert.throws(()=>applyAction(g,{kind:'place',type:'p',to}));
 assert.throws(()=>applyAction(g,{kind:'place',type:'toString',to:1}));
});
test('rook, bishop and queen paths cannot cross occupied squares',()=>{
 const g=newGame();g.board[27]=piece('r');assert.equal(canMove(g,27,3),true);assert.equal(canMove(g,27,0),false);g.board[19]=piece('p','b');assert.equal(canMove(g,27,3),false);assert.equal(canMove(g,27,19),true);
 g.board[27]=piece('b');assert.equal(canMove(g,27,0),true);g.board[18]=piece('p');assert.equal(canMove(g,27,0),false);assert.equal(canMove(g,27,18),false);
 g.board[27]=piece('q');assert.equal(canMove(g,27,31),true);assert.equal(canMove(g,27,44),false);
});
test('knights jump, kings step, and castling is excluded',()=>{
 const g=newGame();g.board[27]=piece('n');g.board[19]=piece('p');assert.equal(canMove(g,27,10),true);assert.equal(canMove(g,27,9),false);
 g.board[27]=piece('k');assert.equal(canMove(g,27,28),true);assert.equal(canMove(g,27,29),false);assert.equal(canMove(g,27,19),false);
});
test('pawn direction, double step, capture, no en passant or promotion',()=>{
 const g=newGame();g.board[52]=piece('p');assert.equal(canMove(g,52,44),true);assert.equal(canMove(g,52,36),true);assert.equal(canMove(g,52,43),false);
 g.board[44]=piece('r','b');assert.equal(canMove(g,52,44),false);assert.equal(canMove(g,52,36),false);g.board[43]=piece('r','b');assert.equal(canMove(g,52,43),true);
 g.board[44]=null;g.board[52].moved=true;assert.equal(canMove(g,52,36),false);
 g.board[8]=piece('p');const next=applyAction(g,{kind:'move',from:8,to:0});assert.equal(next.board[0].type,'p');assert.equal(canMove(next,0,8),false);
 const b=newGame();b.board[12]=piece('p','b');assert.equal(canMove(b,12,28),true);assert.equal(canMove(b,12,4),false);
});
test('captured pieces change ownership and can be redeployed on a later turn',()=>{
 let g=newGame();g.board[27]=piece('r');g.board[3]=piece('q','b');g=applyAction(g,{kind:'move',from:27,to:3});assert.equal(g.reserves.w.q,2);assert.equal(g.board[3].color,'w');assert.equal(g.history[0].captured,'q');
 g=applyAction(g,{kind:'place',type:'p',to:63});g=applyAction(g,{kind:'place',type:'q',to:20});assert.equal(g.board[20].color,'w');assert.equal(g.reserves.w.q,1);
});
test('five in all four directions, six accepted, no edge wrapping or mixed colors',()=>{
 for(const line of [[0,1,2,3,4],[0,8,16,24,32],[0,9,18,27,36],[4,11,18,25,32],[0,1,2,3,4,5]]){const g=newGame();line.forEach(i=>g.board[i]=piece('p'));assert.ok(findFive(g.board,'w'));}
 const g=newGame();[6,7,8,9,10].forEach(i=>g.board[i]=piece('p'));assert.equal(findFive(g.board,'w'),null);g.board=Array(64).fill(null);[0,1,2,3].forEach(i=>g.board[i]=piece('p'));g.board[4]=piece('p','b');assert.equal(findFive(g.board,'w'),null);
});
test('placement and movement both win by five, game over rejects further turns',()=>{
 let g=newGame();[0,1,2,3].forEach(i=>g.board[i]=piece('p'));let n=applyAction(g,{kind:'place',type:'r',to:4});assert.equal(n.result.reason,'five');assert.throws(()=>applyAction(n,{kind:'place',type:'q',to:60}));
 g.board[12]=piece('r');n=applyAction(g,{kind:'move',from:12,to:4});assert.equal(n.result.reason,'five');assert.equal(legalTargets(n,{type:'p'}).length,0);
});
test('king capture wins without conventional check restrictions',()=>{
 const g=newGame();g.board[0]=piece('r');g.board[7]=piece('k','b');const n=applyAction(g,{kind:'move',from:0,to:7});assert.deepEqual(n.result,{winner:'w',reason:'king',line:[]});assert.equal(n.reserves.w.k,2);
});
test('no available move or reserve produces a draw',()=>{
 const g=newGame();g.reserves.b={p:0,r:0,n:0,b:0,q:0,k:0};const n=applyAction(g,{kind:'place',type:'p',to:5});assert.equal(n.result.reason,'stalemate');
});
