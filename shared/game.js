export const SIZE = 8;
export const TYPES = ['p', 'n', 'b', 'r', 'q', 'k'];
export const NAMES = {p:'폰', n:'나이트', b:'비숍', r:'룩', q:'퀸', k:'킹'};
export const colorName = c => c === 'w' ? '백' : '흑';
export const other = c => c === 'w' ? 'b' : 'w';
export const squareName = i => 'abcdefgh'[i % 8] + (8 - Math.floor(i / 8));
export function newGame() {
  return {board:Array(64).fill(null), reserves:{w:{p:8,r:2,b:2,n:2,k:1,q:1},b:{p:8,r:2,b:2,n:2,k:1,q:1}},turn:'w',ply:0,history:[],result:null,last:null};
}
const validSquare = i => Number.isInteger(i) && i >= 0 && i < 64;
export function canMove(game, from, to) {
  if (!validSquare(from) || !validSquare(to) || from === to) return false;
  const p = game.board[from], target = game.board[to];
  if (!p || target?.color === p.color) return false;
  const x = from % 8, y = Math.floor(from/8), dx = to%8-x, dy = Math.floor(to/8)-y;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (p.type === 'n') return ax*ay === 2;
  if (p.type === 'k') return Math.max(ax,ay) === 1;
  if (p.type === 'p') {
    const dir = p.color === 'w' ? -1 : 1;
    if (target) return ax === 1 && dy === dir;
    if (dx !== 0) return false;
    if (dy === dir) return true;
    return !p.moved && y === (p.color === 'w' ? 6 : 1) && dy === 2*dir && !game.board[from+8*dir];
  }
  if (!((p.type === 'r' && (dx === 0 || dy === 0)) || (p.type === 'b' && ax === ay) || (p.type === 'q' && (dx === 0 || dy === 0 || ax === ay)))) return false;
  const sx = Math.sign(dx), sy = Math.sign(dy);
  for (let step = 1; step < Math.max(ax,ay); step++) if (game.board[(y+sy*step)*8+x+sx*step]) return false;
  return true;
}
export function legalTargets(game, selection) {
  if (!selection || game.result) return [];
  return Array.from({length:64},(_,i)=>i).filter(i=>selection.type ? !game.board[i] && game.reserves[game.turn][selection.type]>0 : game.board[selection.from]?.color===game.turn && canMove(game,selection.from,i));
}
export function findFive(board,color) {
  for (let i=0;i<64;i++) {
    if(board[i]?.color!==color) continue;
    for(const [dx,dy] of [[1,0],[0,1],[1,1],[1,-1]]) {
      const line=[];
      for(let n=0;n<5;n++) {
        const x=i%8+dx*n,y=Math.floor(i/8)+dy*n;
        if(x<0||x>7||y<0||y>7||board[y*8+x]?.color!==color) break;
        line.push(y*8+x);
      }
      if(line.length===5) return line;
    }
  }
  return null;
}
function hasAction(g) {
  if(g.board.some(p=>!p) && TYPES.some(t=>g.reserves[g.turn][t]>0)) return true;
  return g.board.some((p,i)=>p?.color===g.turn && g.board.some((_,j)=>canMove(g,i,j)));
}
export function applyAction(state, action, actor = state.turn) {
  if(state.result) throw new Error('이미 종료된 대국입니다.');
  if(actor!==state.turn) throw new Error('자신의 차례에만 둘 수 있습니다.');
  if(!action || !validSquare(action.to)) throw new Error('올바른 칸을 선택하세요.');
  const g=structuredClone(state), to=action.to;
  let type, captured=null;
  if(action.kind==='place') {
    type=action.type;
    if(!TYPES.includes(type)||g.reserves[actor][type]<1) throw new Error('배치할 기물이 없습니다.');
    if(g.board[to]) throw new Error('빈 칸에만 배치할 수 있습니다.');
    g.reserves[actor][type]--;
    g.board[to]={type,color:actor,moved:false};
  } else if(action.kind==='move') {
    if(!validSquare(action.from)||g.board[action.from]?.color!==actor||!canMove(g,action.from,to)) throw new Error('이동할 수 없는 칸입니다.');
    type=g.board[action.from].type;
    captured=g.board[to];
    if(captured) g.reserves[actor][captured.type]++;
    g.board[to]={...g.board[action.from],moved:true};
    g.board[action.from]=null;
  } else throw new Error('알 수 없는 행동입니다.');
  g.ply++;
  g.last={...action,color:actor};
  g.history.push({ply:g.ply,color:actor,type,kind:action.kind,from:action.kind==='move'?action.from:null,to,captured:captured?.type??null});
  const line=findFive(g.board,actor);
  if(captured?.type==='k') g.result={winner:actor,reason:'king',line:[]};
  else if(line) g.result={winner:actor,reason:'five',line};
  g.turn=other(actor);
  if(!g.result&&!hasAction(g)) g.result={winner:null,reason:'stalemate',line:[]};
  return g;
}
