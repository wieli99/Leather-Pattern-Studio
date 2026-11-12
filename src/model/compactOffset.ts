import { cubicAt, flattenCubic, type Cubic } from "./curves";
import { applyMatrix, shapeMatrix, worldCubics } from "./geometry";
import { isClosedShape } from "./closedShape";
import type { Point, Shape } from "./project";
import type { OffsetJoin } from "./offset";

const EPS = 1e-8;
const TOLERANCE = 0.01;
const MAX_SEGMENTS = 128;
const MAX_CHECK_EDGES = 2048;
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: Point, n: number): Point => ({ x: a.x * n, y: a.y * n });
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const length = (a: Point) => Math.hypot(a.x, a.y);
const near = (a: Point, b: Point) => length(sub(a, b)) < EPS;
const right = (a: Point): Point => ({ x: a.y, y: -a.x });

type Parametric = {
  point(t: number): Point;
  derivative(t: number): Point;
  second(t: number): Point;
};

function cubicParam(c: Cubic): Parametric {
  const a = mul(sub(c[1], c[0]), 3);
  const b = mul(sub(c[2], c[1]), 3);
  const d = mul(sub(c[3], c[2]), 3);
  return {
    point: t => cubicAt(c, t),
    derivative: t => add(add(mul(a, (1-t)*(1-t)), mul(b, 2*t*(1-t))), mul(d, t*t)),
    second: t => mul(add(mul(sub(b, a), 1-t), mul(sub(d, b), t)), 2),
  };
}

function ellipseParam(s: Shape): Parametric {
  const a = s.points[0], b = s.points[1];
  const circle = s.kind === "circle" || s.kind === "arc";
  const cx = circle ? a.x : (a.x+b.x)/2, cy = circle ? a.y : (a.y+b.y)/2;
  const radius = length(sub(b,a));
  const rx = circle ? radius : Math.abs(b.x-a.x)/2;
  const ry = circle ? radius : Math.abs(b.y-a.y)/2;
  const matrix = shapeMatrix(s);
  const c = applyMatrix(matrix, { x: cx, y: cy });
  const u = { x: matrix.a*rx, y: matrix.b*rx };
  const v = { x: matrix.c*ry, y: matrix.d*ry };
  return {
    point: t => add(c, add(mul(u, Math.cos(t)), mul(v, Math.sin(t)))),
    derivative: t => add(mul(u, -Math.sin(t)), mul(v, Math.cos(t))),
    second: t => add(mul(u, -Math.cos(t)), mul(v, -Math.sin(t))),
  };
}

function minimumEllipseRadius(s: Shape): number {
  const a=s.points[0], b=s.points[1], circle=s.kind === "circle" || s.kind === "arc";
  const rx=circle ? length(sub(b,a)) : Math.abs(b.x-a.x)/2;
  const ry=circle ? rx : Math.abs(b.y-a.y)/2;
  const m=shapeMatrix(s), u={x:m.a*rx,y:m.b*rx}, v={x:m.c*ry,y:m.d*ry};
  const trace=dot(u,u)+dot(v,v), determinant=cross(u,v);
  const majorSquared=(trace+Math.sqrt(Math.max(0,trace*trace-4*determinant*determinant)))/2;
  const major=Math.sqrt(majorSquared), minorSquared=determinant*determinant/majorSquared;
  return minorSquared/major;
}

function cubicArea(c: Cubic): number {
  // Five-point Gauss quadrature integrates the cubic area polynomial exactly.
  const nodes = [0, -0.5384693101056831, 0.5384693101056831, -0.9061798459386640, 0.9061798459386640];
  const weights = [0.5688888888888889, 0.4786286704993665, 0.4786286704993665, 0.2369268850561891, 0.2369268850561891];
  const p = cubicParam(c);
  return nodes.reduce((sum, node, i) => {
    const t = (node+1)/2;
    return sum + weights[i]*cross(p.point(t), p.derivative(t))/4;
  }, 0);
}

function tangent(p: Parametric, t: number): Point {
  let v = p.derivative(t);
  if (length(v) < EPS) {
    const delta = 1e-5;
    const from = p.point(Math.max(0, t-delta));
    const to = p.point(Math.min(1, t+delta));
    v = sub(to, from);
  }
  const size = length(v);
  if (size < EPS) throw Error("Offset contains a collapsed curve segment.");
  return mul(v, 1/size);
}

function offsetPoint(p: Parametric, t: number, signed: number): Point {
  return add(p.point(t), mul(right(tangent(p, t)), signed));
}

function offsetDerivative(p: Parametric, t: number, signed: number): Point {
  const v = p.derivative(t);
  const size = length(v);
  if (size < EPS) {
    const delta = 1e-5;
    return mul(sub(offsetPoint(p, Math.min(1, t+delta), signed), offsetPoint(p, Math.max(0, t-delta), signed)),
      1/(Math.min(1,t+delta)-Math.max(0,t-delta)));
  }
  const scale = 1 + signed*cross(v, p.second(t))/(size*size*size);
  if (scale <= EPS) throw Error("Offset collapses or develops a cusp.");
  return mul(v, scale);
}

function fit(p: Parametric, signed: number, start: number, end: number, out: Cubic[], depth = 0) {
  const a = offsetPoint(p, start, signed), d = offsetPoint(p, end, signed);
  const span = end-start;
  const b = add(a, mul(offsetDerivative(p, start, signed), span/3));
  const c = sub(d, mul(offsetDerivative(p, end, signed), span/3));
  const curve: Cubic = [a,b,c,d];
  let error = 0;
  for (let i=1; i<8; i++) {
    const t = start+span*i/8;
    offsetDerivative(p, t, signed);
    error = Math.max(error, length(sub(cubicAt(curve, i/8), offsetPoint(p, t, signed))));
  }
  if (error <= TOLERANCE) {
    if (out.length >= MAX_SEGMENTS) throw Error("Offset needs too many curve segments at 0.01 mm accuracy.");
    out.push(curve);
  } else {
    if (depth >= 18 || out.length >= MAX_SEGMENTS) throw Error("Offset needs too many curve segments at 0.01 mm accuracy.");
    const mid = (start+end)/2;
    fit(p, signed, start, mid, out, depth+1);
    fit(p, signed, mid, end, out, depth+1);
  }
}

function segment(a: Point, b: Point): Cubic {
  return [a, add(a,mul(sub(b,a),1/3)), add(a,mul(sub(b,a),2/3)), b];
}

function joinCurves(result: Cubic[], previous: Cubic, next: Cubic, anchor: Point,
  previousTangent: Point, nextTangent: Point, signed: number, join: OffsetJoin) {
  const a = previous[3], b = next[0];
  if (near(a,b)) return;
  const turn = cross(previousTangent, nextTangent)*Math.sign(signed);
  if (join === "rounded" && turn > 1e-7) {
    const v0 = sub(a,anchor), v1 = sub(b,anchor), radius = Math.abs(signed);
    let sweep = Math.atan2(cross(v0,v1),dot(v0,v1));
    if (signed > 0 && sweep < 0) sweep += Math.PI*2;
    if (signed < 0 && sweep > 0) sweep -= Math.PI*2;
    let steps = Math.max(1, Math.ceil(Math.abs(sweep)/(Math.PI/2)));
    while (steps <= MAX_SEGMENTS) {
      const delta=sweep/steps, k=4/3*Math.tan(delta/4);
      const sample: Cubic=[{x:1,y:0},{x:1,y:k},
        {x:Math.cos(delta)+k*Math.sin(delta),y:Math.sin(delta)-k*Math.cos(delta)},
        {x:Math.cos(delta),y:Math.sin(delta)}];
      const error=Math.max(...Array.from({length:7},(_,i) =>
        Math.abs(length(cubicAt(sample,(i+1)/8))-1)*radius));
      if (error <= TOLERANCE) break;
      steps*=2;
    }
    if (steps > MAX_SEGMENTS) throw Error("Offset needs too many curve segments at 0.01 mm accuracy.");
    for (let i=0; i<steps; i++) {
      const t0 = Math.atan2(v0.y,v0.x)+sweep*i/steps;
      const t1 = Math.atan2(v0.y,v0.x)+sweep*(i+1)/steps;
      const delta = t1-t0, k = 4/3*Math.tan(delta/4);
      const p0 = i === 0 ? a : add(anchor,{x:radius*Math.cos(t0),y:radius*Math.sin(t0)});
      const p3 = i === steps-1 ? b : add(anchor,{x:radius*Math.cos(t1),y:radius*Math.sin(t1)});
      const p1 = add(p0,{x:-radius*k*Math.sin(t0),y:radius*k*Math.cos(t0)});
      const p2 = sub(p3,{x:-radius*k*Math.sin(t1),y:radius*k*Math.cos(t1)});
      result.push([p0,p1,p2,p3]);
    }
    return;
  }
  const den = cross(previousTangent,nextTangent);
  if (Math.abs(den) < 1e-8) throw Error("Offset has incompatible curve tangents.");
  const delta = sub(b,a);
  const u = cross(delta,nextTangent)/den;
  const v = cross(delta,previousTangent)/den;
  const miter = add(a,mul(previousTangent,u));
  if (length(sub(miter,anchor)) > Math.max(10*Math.abs(signed),0.01))
    throw Error("Sharp corner creates an excessive spike; try Rounded corners or a smaller distance.");
  if (turn < -1e-7) {
    const straight = (c: Cubic) => {
      const chord=sub(c[3],c[0]), size=length(chord);
      return size>EPS && c.slice(1,3).every(p => Math.abs(cross(sub(p,c[0]),chord))/size < 1e-9);
    };
    if (!straight(previous) || !straight(next))
      throw Error("Inside curve join cannot preserve offset accuracy; use a smaller distance or smooth the corner.");
    // An inside corner trims the two offset branches. Move their end controls
    // with the endpoints so the join keeps each branch's tangent direction.
    const previousShift=sub(miter,a), nextShift=sub(miter,b);
    if (length(previousShift) > length(sub(previous[3],previous[0])) ||
        length(nextShift) > length(sub(next[3],next[0])))
      throw Error("Offset collapses or reverses part of the outline.");
    previous[2]=add(previous[2],previousShift);
    previous[3]=miter;
    next[0]=miter;
    next[1]=add(next[1],nextShift);
    return;
  }
  if (!near(a,miter)) result.push(segment(a,miter));
  if (!near(miter,b)) result.push(segment(miter,b));
}

function intersects(a: Point,b: Point,c: Point,d: Point): boolean {
  const ab=sub(b,a), cd=sub(d,c), den=cross(ab,cd);
  if (Math.abs(den)<1e-10) return false;
  const t=cross(sub(c,a),cd)/den, u=cross(sub(c,a),ab)/den;
  return t>1e-8 && t<1-1e-8 && u>1e-8 && u<1-1e-8;
}

function validate(curves: Cubic[], closed: boolean, areaSign: number) {
  const points = curves.flatMap((c,i) => flattenCubic(c,0.05).slice(i ? 1 : 0));
  if (points.length > MAX_CHECK_EDGES) throw Error("Offset outline is too complex to validate.");
  const count=points.length-1;
  const edges = Array.from({length:count},(_,i) => ({
    i, a:points[i], b:points[i+1],
    minX:Math.min(points[i].x,points[i+1].x), maxX:Math.max(points[i].x,points[i+1].x),
    minY:Math.min(points[i].y,points[i+1].y), maxY:Math.max(points[i].y,points[i+1].y),
  })).sort((a,b) => a.minX-b.minX);
  const active: typeof edges = [];
  for (const e of edges) {
    for (let j=active.length-1; j>=0; j--) if (active[j].maxX < e.minX) active.splice(j,1);
    for (const other of active) {
      if (Math.abs(e.i-other.i) <= 1 || closed && Math.abs(e.i-other.i) === count-1) continue;
      if (e.minY > other.maxY || e.maxY < other.minY) continue;
      if (intersects(e.a,e.b,other.a,other.b)) throw Error("Offset intersects itself.");
    }
    active.push(e);
  }
  if (closed) {
    const area=points.slice(0,-1).reduce((sum,p,i) => sum+cross(p,points[i+1]),0)/2;
    if (Math.sign(area)!==areaSign || Math.abs(area)<EPS) throw Error("Offset collapses the outline.");
  }
}

/** Fit the parallel outline of a smooth source to a bounded editable control curve. */
export function compactOffset(source: Shape, distance: number, join: OffsetJoin): Shape {
  const ellipse = source.kind === "ellipse" || source.kind === "circle";
  const arc = source.kind === "arc";
  const closed = ellipse || isClosedShape(source);
  if (closed && (ellipse || arc) && distance < 0 && -distance >= minimumEllipseRadius(source)-EPS)
    throw Error("Offset collapses or develops a cusp.");
  const sourceCurves = ellipse || arc ? [] : worldCubics(source);
  if (!ellipse && !arc && !sourceCurves.length) throw Error("Offset contains no curve segments.");
  if (sourceCurves.length > MAX_SEGMENTS)
    throw Error("Offset needs too many curve segments at 0.01 mm accuracy.");
  const first = ellipse || arc ? ellipseParam(source) : cubicParam(sourceCurves[0]);
  const arcStart=arc ? Math.atan2(source.points[1].y-source.points[0].y,source.points[1].x-source.points[0].x) : 0;
  const arcSpan=arc ? (source.sweep ?? 0)*Math.PI/180 : 0;
  const path: Parametric = arc ? {
    point:t => first.point(arcStart+arcSpan*t),
    derivative:t => mul(first.derivative(arcStart+arcSpan*t),arcSpan),
    second:t => mul(first.second(arcStart+arcSpan*t),arcSpan*arcSpan),
  } : first;
  const area = ellipse || arc ? cross(path.derivative(0),path.second(0)) : sourceCurves.reduce((sum,c) => sum+cubicArea(c),0);
  if (closed && Math.abs(area) < EPS) throw Error("Closed outline has no area.");
  const signed = closed ? Math.sign(area)*distance : distance;
  const arcSteps=arc ? Math.max(1,Math.ceil(Math.abs(arcSpan)/(Math.PI/2))) : 0;
  const params = ellipse ? Array.from({length:4},(_,i) => ({p:first,start:i*Math.PI/2,end:(i+1)*Math.PI/2}))
    : arc ? Array.from({length:arcSteps},(_,i) => ({p:path,start:i/arcSteps,end:(i+1)/arcSteps}))
      : sourceCurves.map(c => ({p:cubicParam(c),start:0,end:1}));
  const pieces = params.map(({p,start,end}) => {
    const segments: Cubic[]=[];
    fit(p,signed,start,end,segments);
    return segments;
  });
  const result: Cubic[]=[];
  for (let i=0; i<pieces.length; i++) {
    const current=pieces[i];
    if (!current.length) continue;
    if (i>0) {
      const before=params[i-1], after=params[i];
      joinCurves(result,pieces[i-1].at(-1)!,current[0],before.p.point(before.end),
        tangent(before.p,before.end),tangent(after.p,after.start),signed,join);
    }
    result.push(...current);
    if (result.length > MAX_SEGMENTS) throw Error("Offset needs too many curve segments at 0.01 mm accuracy.");
  }
  if (closed) {
    const before=params.at(-1)!, after=params[0];
    joinCurves(result,pieces.at(-1)!.at(-1)!,pieces[0][0],before.p.point(before.end),
      tangent(before.p,before.end),tangent(after.p,after.start),signed,join);
    if (result.length > MAX_SEGMENTS) throw Error("Offset needs too many curve segments at 0.01 mm accuracy.");
    if (!near(result.at(-1)![3],result[0][0])) throw Error("Offset does not close.");
    result.at(-1)![3] = result[0][0];
  }
  if (result.some(c => c.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) ||
      Math.abs(p.x)>1e7 || Math.abs(p.y)>1e7)))
    throw Error("Offset exceeds document coordinate limits.");
  validate(result,closed,Math.sign(area));
  const points: Point[]=[result[0][0],...result.map(c=>c[3])];
  const handles=points.map(() => ({incoming:{x:0,y:0},outgoing:{x:0,y:0}}));
  result.forEach((c,i) => {
    handles[i].outgoing=sub(c[1],c[0]);
    handles[i+1].incoming=sub(c[2],c[3]);
  });
  if (closed) {
    handles[0].incoming={...handles.at(-1)!.incoming};
    handles.at(-1)!.outgoing={...handles[0].outgoing};
  }
  return {id:crypto.randomUUID(),name:`${source.name.slice(0,193)} offset`,kind:"control-curve",points,handles,
    radius:0,rotation:0,strokeColor:source.strokeColor,strokeOpacity:source.strokeOpacity,
    strokeWidth:source.strokeWidth,fillOpacity:0};
}
