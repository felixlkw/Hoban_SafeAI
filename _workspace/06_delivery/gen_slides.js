/* ============================================================================
 *  PwC Delivery Style — PPTX Extended Template (22 Patterns)
 * ----------------------------------------------------------------------------
 *  Comprehensive pptxgenjs template covering all major consulting slide types.
 *
 *  PATTERNS (22):
 *  Structural: Cover, Agenda, Section Divider, Executive Summary, Closing
 *  Comparison: Two-Column Compare, Numbered Cards, 2x2 Matrix, Harvey Ball, SWOT
 *  Data: Data Table, Waterfall Chart, KPI Dashboard, Funnel
 *  Process: Process Chevron, Timeline, Gantt, Swimlane, Demo/Step
 *  Structure: Pyramid, Text+Icon Grid, Quote/Key Message
 * ==========================================================================*/

const pptxgen = require('pptxgenjs');
const React = require('react');
const ReactDOMServer = require('react-dom/server');
const sharp = require('sharp');

// ============================================================================
//  DECK METADATA
// ============================================================================
const DECK = {
  title: '호반그룹 JHA AI 에이전트 PoC 구성(안) 검토',   // 푸터에 브랜드 옆 회색으로 표기됨 (삼일 PwC 표준)
  footerBrand: 'Samil PwC',           // 좌하단 볼드 브랜드 락업
  date: '2026.06',
  outFile: process.env.OUT_FILE || 'Hoban_JHA_PoC_구성검토.pptx',
  total: 20,
};

// ============================================================================
//  DESIGN TOKENS
// ============================================================================
const C = {
  orange:'EB6B16', orangeDeep:'C75510', orangeLight:'F49B5C', orangeVLight:'FCDDC2',
  white:'FFFFFF', peach:'FBEEE2', peachLight:'FDF6EE', cream:'FAF6F0',
  ink:'1A1A1A', text:'2B2B2B', textLight:'595959', muted:'7A7A7A',
  grayBg:'E8E8E8', grayLight:'F5F5F5', grayLine:'D0D0D0', grayDark:'4A4A4A',
  green:'2E7D32', greenLight:'E8F5E9', red:'C62828', redLight:'FFEBEE',
  blue:'1565C0', blueLight:'E3F2FD', warn:'D97706', warnLight:'FFF8E1',
};
const FONT_TITLE='Noto Serif CJK KR', FONT_BODY='맑은 고딕', FONT_MONO='Consolas';
const W=10, H=5.625;

// ============================================================================
//  ASSET BUILDERS
// ============================================================================
async function iconPng(IconComponent, color='#'+C.orange, size=256) {
  const svg=ReactDOMServer.renderToStaticMarkup(React.createElement(IconComponent,{color,size:String(size)}));
  const buf=await sharp(Buffer.from(svg)).png().toBuffer();
  return 'image/png;base64,'+buf.toString('base64');
}
async function makePwcLogo(size=256) {
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 120" width="${size}" height="${Math.round(size*0.55)}"><polygon points="50,10 130,10 115,35 35,35" fill="#${C.orange}"/><polygon points="130,10 200,10 185,35 115,35" fill="#${C.orange}" opacity="0.55"/><text x="0" y="105" font-family="Georgia,serif" font-size="78" font-weight="900" fill="#${C.ink}" letter-spacing="-2">pwc</text></svg>`;
  return 'image/png;base64,'+(await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64');
}
async function makeCoverGraphic() {
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500" width="2000" height="1000"><polygon points="450,140 900,140 870,260 420,260" fill="#${C.orange}"/><polygon points="120,290 700,290 670,410 90,410" fill="#${C.orange}"/></svg>`;
  return 'image/png;base64,'+(await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64');
}
async function makeCoralBg(w=2000,h=1125) {
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FFFFFF"/><stop offset="50%" stop-color="#FDEEE0"/><stop offset="100%" stop-color="#F9C9A8"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/></svg>`;
  return 'image/png;base64,'+(await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64');
}
async function makeHarveyBall(fill=1, size=64) {
  const r=size/2, cx=r, cy=r;
  let inner='';
  if(fill===0) inner=`<circle cx="${cx}" cy="${cy}" r="${r-2}" fill="none" stroke="#${C.grayLine}" stroke-width="2"/>`;
  else if(fill===1) inner=`<circle cx="${cx}" cy="${cy}" r="${r-1}" fill="#${C.orange}"/>`;
  else if(fill===0.5) inner=`<circle cx="${cx}" cy="${cy}" r="${r-1}" fill="#${C.orange}"/><rect x="${cx}" y="0" width="${r}" height="${size}" fill="#${C.white}"/><circle cx="${cx}" cy="${cy}" r="${r-2}" fill="none" stroke="#${C.orange}" stroke-width="2"/>`;
  else if(fill===0.25) inner=`<circle cx="${cx}" cy="${cy}" r="${r-1}" fill="#${C.orange}"/><rect x="${cx}" y="0" width="${r}" height="${size}" fill="#${C.white}"/><rect x="0" y="0" width="${cx}" height="${cy}" fill="#${C.white}"/><circle cx="${cx}" cy="${cy}" r="${r-2}" fill="none" stroke="#${C.orange}" stroke-width="2"/>`;
  else inner=`<circle cx="${cx}" cy="${cy}" r="${r-1}" fill="#${C.orange}"/><rect x="0" y="0" width="${cx}" height="${cy}" fill="#${C.white}"/><circle cx="${cx}" cy="${cy}" r="${r-2}" fill="none" stroke="#${C.orange}" stroke-width="2"/>`;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${inner}</svg>`;
  return 'image/png;base64,'+(await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64');
}

// ============================================================================
//  LAYOUT HELPERS — CORE
// ============================================================================
// 삼일 PwC 표준 푸터: 좌측 "Samil PwC"(볼드) + 덱 제목(회색), 우측 페이지 번호
function addFooter(slide,page){
  slide.addText(DECK.footerBrand,{x:0.4,y:5.32,w:1.1,h:0.22,fontFace:FONT_BODY,fontSize:9,bold:true,color:C.ink,margin:0});
  slide.addText(DECK.title,{x:1.55,y:5.32,w:6.0,h:0.22,fontFace:FONT_BODY,fontSize:8.5,color:C.muted,margin:0});
  slide.addText(String(page),{x:9.4,y:5.32,w:0.3,h:0.22,fontFace:FONT_BODY,fontSize:9,color:C.muted,align:'right',margin:0});
}
// 삼일 PwC 표준 타이틀: 세리프 볼드 제목 + 거버닝 메시지(서술형 리드 문장, 최대 2줄)
// lead는 키워드 나열이 아닌 완결된 문장으로 작성 (예: "Q1에서 운영체계를 공식화하고, Q2에서 오퍼링 4개를 출시합니다.")
function addTitle(slide,title,lead){
  slide.addText(title,{x:0.4,y:0.28,w:9.2,h:0.5,fontFace:FONT_TITLE,fontSize:22,bold:true,color:C.ink,margin:0});
  if(lead) slide.addText(lead,{x:0.42,y:0.82,w:9.2,h:0.5,fontFace:FONT_BODY,fontSize:10.5,color:C.text,valign:'top',margin:0,lineSpacing:14});
}
function sectionBar(slide,x,y,w,label){
  slide.addShape('rect',{x,y,w,h:0.32,fill:{color:C.grayBg},line:{color:C.grayBg,width:0}});
  slide.addText(label,{x,y,w,h:0.32,fontFace:FONT_BODY,fontSize:11,bold:true,color:C.white,align:'center',valign:'middle',margin:0});
}
function numberedCard(slide,x,y,w,h,num,title){
  slide.addShape('rect',{x,y,w,h:0.4,fill:{color:C.orange},line:{color:C.orange,width:0}});
  slide.addShape('rect',{x:x+0.08,y:y+0.06,w:0.3,h:0.28,fill:{color:C.ink},line:{color:C.ink,width:0}});
  slide.addText(num,{x:x+0.08,y:y+0.06,w:0.3,h:0.28,fontFace:FONT_BODY,fontSize:12,bold:true,color:C.white,align:'center',valign:'middle',margin:0});
  slide.addText(title,{x:x+0.45,y,w:w-0.55,h:0.4,fontFace:FONT_BODY,fontSize:12,bold:true,color:C.white,valign:'middle',margin:0});
  slide.addShape('rect',{x,y:y+0.4,w,h:h-0.4,fill:{color:C.white},line:{color:C.grayLine,width:0.5}});
}
function progressStrip(slide,segments,y,activeIdx=[],opts={}){
  const n=segments.length,gap=0.08,startX=0.4,segH=0.55;
  const segW=(9.2-gap*(n-1))/n;
  const onPeach=opts.onPeach||false;
  const inFill=onPeach?C.white:C.peachLight, inBorder=onPeach?C.peachLight:C.orangeLight;
  segments.forEach((s,i)=>{
    const x=startX+i*(segW+gap), active=activeIdx.includes(i);
    slide.addShape('rect',{x,y,w:segW,h:segH,fill:{color:active?C.orange:inFill},line:{color:active?C.orange:inBorder,width:0.75}});
    slide.addText(s.tag,{x:x+0.08,y:y+0.05,w:segW-0.16,h:0.22,fontFace:FONT_BODY,fontSize:9,bold:true,color:active?C.white:C.orange,charSpacing:1,valign:'middle',margin:0});
    slide.addText(s.label,{x:x+0.08,y:y+0.27,w:segW-0.16,h:0.26,fontFace:FONT_BODY,fontSize:9,bold:active,color:active?C.white:C.muted,valign:'middle',margin:0});
    if(i<n-1) slide.addText('▶',{x:x+segW-0.01,y:y+segH/2-0.12,w:0.12,h:0.24,fontFace:FONT_BODY,fontSize:8,color:C.orange,align:'center',valign:'middle',margin:0});
  });
}
function calloutBand(slide,y,content,opts={}){
  const bandH=opts.h||0.42, f=opts.fill||C.peach;
  slide.addText(content,{shape:'rect',x:0.4,y,w:9.2,h:bandH,fill:{color:f},line:{color:f,width:0},fontFace:FONT_BODY,fontSize:opts.fontSize||11.5,color:C.text,valign:'middle',margin:0});
}

// ============================================================================
//  LAYOUT HELPERS — NEW
// ============================================================================

/** Agenda item list with active highlight */
function agendaItems(slide,items,activeIdx,startY=1.6){
  const itemH=0.65,gap=0.1,xL=0.8,w=8.4;
  items.forEach((it,i)=>{
    const y=startY+i*(itemH+gap), active=i===activeIdx;
    slide.addShape('rect',{x:xL,y,w,h:itemH,fill:{color:active?C.orange:C.white},line:{color:active?C.orange:C.grayLine,width:active?0:0.75}});
    slide.addText(it.num,{x:xL+0.15,y,w:0.5,h:itemH,fontFace:FONT_TITLE,fontSize:20,bold:true,color:active?C.white:C.orange,valign:'middle',margin:0});
    slide.addText(it.label,{x:xL+0.7,y,w:w-1.0,h:itemH,fontFace:FONT_BODY,fontSize:14,bold:active,color:active?C.white:C.ink,valign:'middle',margin:0});
  });
}

/** Section divider — 삼일 PwC 표준: 피치 배경 + 초대형 오렌지 숫자(우중앙) + 좌하단 세리프 타이틀 */
function sectionDividerContent(slide,num,title,subtitle){
  slide.background={color:C.peach};
  slide.addText(num,{x:5.2,y:0.4,w:4.4,h:4.0,fontFace:FONT_TITLE,fontSize:220,bold:true,color:C.orange,align:'center',valign:'middle',margin:0});
  slide.addText(title,{x:0.4,y:4.2,w:8.0,h:0.7,fontFace:FONT_TITLE,fontSize:30,bold:true,color:C.ink,valign:'bottom',margin:0});
  if(subtitle) slide.addText(subtitle,{x:0.42,y:4.95,w:8.0,h:0.32,fontFace:FONT_BODY,fontSize:12,color:C.textLight,margin:0});
  slide.addText(DECK.footerBrand,{x:0.4,y:5.32,w:2.0,h:0.22,fontFace:FONT_BODY,fontSize:9,bold:true,color:C.ink,margin:0});
}

/** Contents — 삼일 PwC 표준: 세리프 'Contents' 대제목 + 오렌지 번호 리스트 + 우측 페이지 번호 */
function contentsList(slide,items,startY=1.7){
  slide.addText('Contents',{x:0.5,y:0.5,w:5,h:0.9,fontFace:FONT_TITLE,fontSize:36,bold:true,color:C.ink,margin:0});
  const itemH=0.46;
  items.forEach((it,i)=>{
    const y=startY+i*itemH;
    slide.addText(`${i+1}.`,{x:2.6,y,w:0.5,h:itemH,fontFace:FONT_BODY,fontSize:13,bold:true,color:C.orange,valign:'middle',margin:0});
    slide.addText(it.label,{x:3.15,y,w:4.6,h:itemH,fontFace:FONT_BODY,fontSize:13,bold:true,color:C.ink,valign:'middle',margin:0});
    slide.addText(it.page,{x:7.8,y,w:0.7,h:itemH,fontFace:FONT_BODY,fontSize:12,color:C.textLight,align:'right',valign:'middle',margin:0});
  });
}

/** Cover — 삼일 PwC 표준: 좌측 백색 패널(로고+세리프 타이틀+날짜) + 우측 비주얼 패널 + 오렌지 평행사변형 모티프 */
async function coverSamil(slide,opts={}){
  slide.background={color:C.white};
  // 우측 비주얼 패널 (사진 대체: 웜 그레이 그라디언트)
  const photoSvg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1125" width="1000" height="1125"><defs><linearGradient id="p" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#E9E4DD"/><stop offset="55%" stop-color="#D8D2C8"/><stop offset="100%" stop-color="#BFB8AC"/></linearGradient></defs><rect width="1000" height="1125" fill="url(#p)"/></svg>`;
  const photo='image/png;base64,'+(await sharp(Buffer.from(photoSvg)).png().toBuffer()).toString('base64');
  slide.addImage({data:photo,x:5.0,y:0,w:5.0,h:H});
  if(opts.photoPath) slide.addImage({path:opts.photoPath,x:5.0,y:0,w:5.0,h:H,sizing:{type:'cover',w:5.0,h:H}});
  // 오렌지 평행사변형 모티프 (사진 위 오버레이)
  const paraSvg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500" width="2000" height="1000"><polygon points="430,120 980,120 920,240 370,240" fill="#${C.orange}"/><polygon points="80,300 660,300 600,420 20,420" fill="#${C.orange}"/></svg>`;
  const para='image/png;base64,'+(await sharp(Buffer.from(paraSvg)).png().toBuffer()).toString('base64');
  slide.addImage({data:para,x:4.4,y:2.6,w:5.2,h:2.6});
  // 좌상단 로고 락업
  slide.addImage({data:await makePwcLogo(),x:0.4,y:0.35,w:0.85,h:0.47});
  slide.addText(opts.brandName||'삼일회계법인',{x:1.35,y:0.45,w:2.5,h:0.3,fontFace:FONT_BODY,fontSize:12,bold:true,color:C.ink,valign:'middle',margin:0});
  // 세리프 타이틀 + 날짜
  slide.addText(opts.title||DECK.title,{x:0.4,y:1.5,w:4.3,h:1.8,fontFace:FONT_TITLE,fontSize:30,bold:true,color:C.ink,valign:'top',margin:0,lineSpacing:40});
  if(opts.subtitle) slide.addText(opts.subtitle,{x:0.42,y:3.3,w:4.3,h:0.6,fontFace:FONT_BODY,fontSize:12,color:C.textLight,valign:'top',margin:0});
  slide.addText(opts.date||DECK.date,{x:0.4,y:4.85,w:2.5,h:0.3,fontFace:FONT_BODY,fontSize:11,color:C.text,margin:0});
}

/** Executive summary — 2 or 3 key-finding columns */
function execSummaryColumns(slide,columns){
  const n=columns.length,gap=0.2,startX=0.4,totalW=9.2;
  const colW=(totalW-gap*(n-1))/n, topY=1.5;
  columns.forEach((col,i)=>{
    const x=startX+i*(colW+gap);
    slide.addShape('rect',{x,y:topY,w:colW,h:0.06,fill:{color:C.orange},line:{color:C.orange,width:0}});
    slide.addText(col.title,{x,y:topY+0.15,w:colW,h:0.35,fontFace:FONT_BODY,fontSize:13,bold:true,color:C.ink,margin:0});
    slide.addText(col.body,{x,y:topY+0.55,w:colW,h:3.0,fontFace:FONT_BODY,fontSize:11,color:C.text,valign:'top',margin:0});
  });
}

/** Process chevron — horizontal arrow-shaped steps */
function processChevron(slide,steps,y=1.8,opts={}){
  const n=steps.length,startX=0.4,totalW=9.2,gap=0.06,chevH=opts.h||0.7;
  const stepW=(totalW-gap*(n-1))/n;
  steps.forEach((s,i)=>{
    const x=startX+i*(stepW+gap), active=opts.activeIdx===i;
    const fill=active?C.orange:(i%2===0?C.peach:C.peachLight);
    slide.addShape('rect',{x,y,w:stepW,h:chevH,fill:{color:fill},line:{color:C.orange,width:0.75}});
    slide.addText(String(i+1),{x:x+0.08,y:y+0.05,w:0.25,h:0.25,fontFace:FONT_BODY,fontSize:9,bold:true,color:active?C.white:C.orange,align:'center',valign:'middle',margin:0});
    slide.addText(s.label,{x:x+0.05,y:y+0.28,w:stepW-0.1,h:0.35,fontFace:FONT_BODY,fontSize:10,bold:true,color:active?C.white:C.ink,align:'center',valign:'middle',margin:0});
    if(i<n-1) slide.addText('▶',{x:x+stepW-0.02,y:y+chevH/2-0.12,w:0.16,h:0.24,fontFace:FONT_BODY,fontSize:10,color:C.orange,align:'center',valign:'middle',margin:0});
  });
}

/** Timeline milestones — horizontal dot-line */
function timelineMilestones(slide,milestones,y=2.4){
  const n=milestones.length,startX=0.8,endX=9.2,lineY=y+0.15;
  slide.addShape('rect',{x:startX,y:lineY,w:endX-startX,h:0.03,fill:{color:C.grayLine},line:{color:C.grayLine,width:0}});
  milestones.forEach((m,i)=>{
    const x=startX+i*((endX-startX)/(n-1||1));
    slide.addShape('ellipse',{x:x-0.12,y:lineY-0.1,w:0.24,h:0.24,fill:{color:C.orange},line:{color:C.orange,width:0}});
    slide.addText(String(i+1),{x:x-0.12,y:lineY-0.1,w:0.24,h:0.24,fontFace:FONT_BODY,fontSize:8,bold:true,color:C.white,align:'center',valign:'middle',margin:0});
    slide.addText(m.date,{x:x-0.5,y:y-0.45,w:1.0,h:0.3,fontFace:FONT_MONO,fontSize:9,color:C.orange,align:'center',valign:'bottom',margin:0});
    slide.addText(m.label,{x:x-0.6,y:lineY+0.25,w:1.2,h:0.5,fontFace:FONT_BODY,fontSize:10,color:C.ink,align:'center',valign:'top',margin:0});
  });
}

/** 2x2 Matrix with axis labels and quadrant content */
function matrix2x2(slide,axisX,axisY,quadrants,startY=1.5){
  const mX=1.4,mY=startY,mW=3.7,mH=1.7,gap=0.06;
  const qColors=[C.peachLight,C.orangeVLight,C.grayLight,C.peach];
  slide.addText(axisY.high+' ↑',{x:0.15,y:mY+0.2,w:1.1,h:0.4,fontFace:FONT_BODY,fontSize:9,bold:true,color:C.orange,align:'right',margin:0});
  slide.addText('↓ '+axisY.low,{x:0.15,y:mY+mH+gap+mH-0.5,w:1.1,h:0.4,fontFace:FONT_BODY,fontSize:9,bold:true,color:C.muted,align:'right',margin:0});
  slide.addText(axisX.low,{x:mX,y:mY+2*mH+gap+0.08,w:mW,h:0.3,fontFace:FONT_BODY,fontSize:9,bold:true,color:C.muted,align:'center',margin:0});
  slide.addText(axisX.high,{x:mX+mW+gap,y:mY+2*mH+gap+0.08,w:mW,h:0.3,fontFace:FONT_BODY,fontSize:9,bold:true,color:C.orange,align:'center',margin:0});
  const positions=[{x:mX,y:mY},{x:mX+mW+gap,y:mY},{x:mX,y:mY+mH+gap},{x:mX+mW+gap,y:mY+mH+gap}];
  positions.forEach((p,i)=>{
    slide.addShape('rect',{x:p.x,y:p.y,w:mW,h:mH,fill:{color:qColors[i]},line:{color:C.grayLine,width:0.5}});
    if(quadrants[i]){
      slide.addText(quadrants[i].title,{x:p.x+0.15,y:p.y+0.12,w:mW-0.3,h:0.32,fontFace:FONT_BODY,fontSize:11,bold:true,color:C.ink,margin:0});
      if(quadrants[i].items) slide.addText(quadrants[i].items,{x:p.x+0.15,y:p.y+0.48,w:mW-0.3,h:mH-0.6,fontFace:FONT_BODY,fontSize:10,color:C.textLight,valign:'top',margin:0});
    }
  });
}

/** Waterfall (bridge) chart */
function waterfallChart(slide,items,opts={}){
  const startX=opts.x||0.6,startY=opts.y||1.5,chartW=opts.w||8.8,chartH=opts.h||3.2;
  const n=items.length, barW=(chartW/n)*0.6;
  let cumulative=0,maxVal=0;
  const bars=items.map(it=>{
    if(it.type==='total'){const h=cumulative; maxVal=Math.max(maxVal,h); return{...it,barStart:0,barH:h};}
    const prev=cumulative; cumulative+=it.value;
    maxVal=Math.max(maxVal,cumulative,prev);
    return{...it,barStart:Math.min(prev,cumulative),barH:Math.abs(it.value)};
  });
  const range=maxVal||1;
  bars.forEach((b,i)=>{
    const x=startX+i*(chartW/n)+(chartW/n-barW)/2;
    const bH=(b.barH/range)*chartH;
    const bY=startY+((maxVal-b.barStart-b.barH)/range)*chartH;
    const color=b.type==='total'?C.ink:(b.type==='positive'?C.orange:C.grayDark);
    slide.addShape('rect',{x,y:bY,w:barW,h:Math.max(bH,0.05),fill:{color},line:{color,width:0}});
    slide.addText(String(b.value!==undefined?b.value:b.barH),{x,y:bY-0.22,w:barW,h:0.22,fontFace:FONT_MONO,fontSize:9,bold:true,color,align:'center',margin:0});
    slide.addText(b.label,{x:x-0.1,y:startY+chartH+0.05,w:barW+0.2,h:0.35,fontFace:FONT_BODY,fontSize:8.5,color:C.text,align:'center',valign:'top',margin:0});
  });
}

/** KPI card — big number with label and delta */
function kpiCard(slide,x,y,w,h,value,label,delta){
  slide.addShape('rect',{x,y,w,h,fill:{color:C.white},line:{color:C.grayLine,width:0.75}});
  slide.addShape('rect',{x,y,w,h:0.05,fill:{color:C.orange},line:{color:C.orange,width:0}});
  slide.addText(value,{x:x+0.1,y:y+0.15,w:w-0.2,h:h*0.45,fontFace:FONT_MONO,fontSize:28,bold:true,color:C.ink,align:'center',valign:'middle',margin:0});
  slide.addText(label,{x:x+0.1,y:y+h*0.55,w:w-0.2,h:0.3,fontFace:FONT_BODY,fontSize:10,color:C.textLight,align:'center',valign:'middle',margin:0});
  if(delta){
    const isUp=delta.startsWith('+')||delta.startsWith('▲');
    slide.addText(delta,{x:x+0.1,y:y+h-0.35,w:w-0.2,h:0.25,fontFace:FONT_MONO,fontSize:9,bold:true,color:isUp?C.green:C.red,align:'center',valign:'middle',margin:0});
  }
}

/** Funnel diagram */
function funnelDiagram(slide,items,startX=0.8,startY=1.6,maxW=8.4,totalH=3.2){
  const n=items.length, rowH=totalH/n;
  items.forEach((it,i)=>{
    const fraction=1-i*(0.7/(n-1||1));
    const barW=maxW*fraction, x=startX+(maxW-barW)/2, y=startY+i*rowH;
    const shades=[C.orange,C.orangeLight,C.orangeVLight,C.peach,C.grayBg];
    const shade=shades[Math.min(i,shades.length-1)];
    const textColor=i<2?C.white:C.ink;
    slide.addShape('rect',{x,y:y+0.03,w:barW,h:rowH-0.06,fill:{color:shade},line:{color:C.white,width:1.5}});
    const txt=it.pct?`${it.label}  (${it.pct})`:it.label;
    slide.addText(txt,{x,y:y+0.03,w:barW,h:(rowH-0.06)*0.55,fontFace:FONT_BODY,fontSize:12,bold:true,color:textColor,align:'center',valign:'middle',margin:0});
    if(it.value) slide.addText(it.value,{x,y:y+(rowH-0.06)*0.5,w:barW,h:(rowH-0.06)*0.45,fontFace:FONT_MONO,fontSize:11,color:textColor,align:'center',valign:'middle',margin:0});
  });
}

/** Pyramid layers — from top (narrow) to bottom (wide) */
function pyramidLayers(slide,layers,startX=1.2,startY=1.5,maxW=7.6,totalH=3.4){
  const n=layers.length, rowH=totalH/n;
  const colors=[C.orangeDeep,C.orange,C.orangeLight,C.orangeVLight,C.peach];
  layers.forEach((l,i)=>{
    const fraction=0.25+0.75*(i/(n-1||1));
    const barW=maxW*fraction, x=startX+(maxW-barW)/2, y=startY+i*rowH;
    slide.addShape('rect',{x,y,w:barW,h:rowH-0.04,fill:{color:colors[Math.min(i,colors.length-1)]},line:{color:C.white,width:1.5}});
    slide.addText(l.label,{x,y,w:barW,h:rowH-0.04,fontFace:FONT_BODY,fontSize:12,bold:true,color:i<2?C.white:C.ink,align:'center',valign:'middle',margin:0});
  });
}

/** Gantt row */
function ganttRow(slide,label,y,startFrac,endFrac,opts={}){
  const axisX=opts.axisX||2.0,totalW=opts.totalW||7.6,rowH=opts.rowH||0.42,labelX=opts.labelX||0.4;
  slide.addText(label,{x:labelX,y,w:axisX-labelX-0.1,h:rowH,fontFace:FONT_BODY,fontSize:10,bold:true,color:C.ink,valign:'middle',align:'right',margin:0});
  slide.addShape('rect',{x:axisX,y:y+0.02,w:totalW,h:rowH-0.04,fill:{color:C.grayLight},line:{color:C.grayLine,width:0.5}});
  const barX=axisX+startFrac*totalW, barW=(endFrac-startFrac)*totalW;
  slide.addShape('rect',{x:barX,y:y+0.06,w:barW,h:rowH-0.12,fill:{color:opts.color||C.orange},line:{color:opts.color||C.orange,width:0}});
}

/** Swimlane row */
function swimlaneRow(slide,lane,y,opts={}){
  const axisX=opts.axisX||2.0,totalW=opts.totalW||7.6,rowH=opts.rowH||0.55,labelX=opts.labelX||0.4;
  slide.addShape('rect',{x:labelX,y,w:axisX-labelX-0.05,h:rowH,fill:{color:C.ink},line:{color:C.ink,width:0}});
  slide.addText(lane.label,{x:labelX+0.08,y,w:axisX-labelX-0.2,h:rowH,fontFace:FONT_BODY,fontSize:9,bold:true,color:C.white,valign:'middle',margin:0});
  slide.addShape('rect',{x:axisX,y,w:totalW,h:rowH,fill:{color:C.grayLight},line:{color:C.grayLine,width:0.5}});
  (lane.bars||[]).forEach(b=>{
    const bx=axisX+b.startFrac*totalW, bw=(b.endFrac-b.startFrac)*totalW;
    slide.addShape('rect',{x:bx,y:y+0.06,w:bw,h:rowH-0.12,fill:{color:b.color||C.orange},line:{color:C.white,width:0.5}});
    if(b.text) slide.addText(b.text,{x:bx,y:y+0.06,w:bw,h:rowH-0.12,fontFace:FONT_BODY,fontSize:8,color:C.white,align:'center',valign:'middle',margin:0});
  });
}

/** Text + Icon tile */
function iconTextTile(slide,x,y,w,h,iconChar,title,desc){
  slide.addShape('rect',{x,y,w,h,fill:{color:C.white},line:{color:C.grayLine,width:0.5}});
  const circR=0.35;
  slide.addShape('ellipse',{x:x+w/2-circR,y:y+0.15,w:circR*2,h:circR*2,fill:{color:C.peach},line:{color:C.orange,width:0.75}});
  slide.addText(iconChar,{x:x+w/2-circR,y:y+0.15,w:circR*2,h:circR*2,fontFace:FONT_BODY,fontSize:16,color:C.orange,align:'center',valign:'middle',margin:0});
  slide.addText(title,{x:x+0.1,y:y+0.9,w:w-0.2,h:0.32,fontFace:FONT_BODY,fontSize:11,bold:true,color:C.ink,align:'center',valign:'middle',margin:0});
  slide.addText(desc,{x:x+0.1,y:y+1.25,w:w-0.2,h:h-1.45,fontFace:FONT_BODY,fontSize:9.5,color:C.textLight,align:'center',valign:'top',margin:0});
}

/** SWOT quadrant */
function swotQuadrant(slide,data,startY=1.4){
  const qW=4.5,qH=1.8,gap=0.2,xL=0.4,xR=xL+qW+gap;
  const configs=[
    {x:xL,y:startY,hc:C.green,hb:C.greenLight,label:data.s?.label||'Strengths'},
    {x:xR,y:startY,hc:C.blue,hb:C.blueLight,label:data.w?.label||'Weaknesses'},
    {x:xL,y:startY+qH+0.1,hc:C.orange,hb:C.orangeVLight,label:data.o?.label||'Opportunities'},
    {x:xR,y:startY+qH+0.1,hc:C.red,hb:C.redLight,label:data.t?.label||'Threats'},
  ];
  const bodies=[data.s?.items,data.w?.items,data.o?.items,data.t?.items];
  configs.forEach((c,i)=>{
    slide.addShape('rect',{x:c.x,y:c.y,w:qW,h:0.36,fill:{color:c.hc},line:{color:c.hc,width:0}});
    slide.addText(c.label,{x:c.x+0.12,y:c.y,w:qW-0.24,h:0.36,fontFace:FONT_BODY,fontSize:11,bold:true,color:C.white,valign:'middle',margin:0});
    slide.addShape('rect',{x:c.x,y:c.y+0.36,w:qW,h:qH-0.36,fill:{color:c.hb},line:{color:c.hc,width:0.5}});
    if(bodies[i]) slide.addText(bodies[i],{x:c.x+0.12,y:c.y+0.44,w:qW-0.24,h:qH-0.56,fontFace:FONT_BODY,fontSize:10,color:C.text,valign:'top',margin:0});
  });
}

/** Quote / key message — full-slide emphasis */
function quoteBlock(slide,text,attribution){
  slide.background={color:C.peach};
  slide.addText('\u201C',{x:0.3,y:0.8,w:1,h:1.2,fontFace:FONT_TITLE,fontSize:120,color:C.orangeLight,margin:0});
  slide.addText(text,{x:1.0,y:1.5,w:8.0,h:2.2,fontFace:FONT_TITLE,fontSize:24,color:C.ink,valign:'middle',margin:0});
  if(attribution) slide.addText('— '+attribution,{x:1.0,y:3.9,w:8.0,h:0.4,fontFace:FONT_BODY,fontSize:13,color:C.orange,margin:0});
}

// ============================================================================
//  LAYOUT HELPERS — EXTENDED (14 additional patterns: 23-36)
// ============================================================================

/** 23. Stacked Bar Chart — grouped segments per category */
function stackedBarChart(slide,categories,series,opts={}){
  const startX=opts.x||1.2,startY=opts.y||1.6,chartW=opts.w||8.4,chartH=opts.h||3.2;
  const n=categories.length,barW=(chartW/n)*0.65,gap=(chartW/n)*0.35;
  const maxVal=Math.max(...categories.map((_,ci)=>series.reduce((s,sr)=>s+(sr.values[ci]||0),0)));
  const scale=chartH/(maxVal||1);
  categories.forEach((cat,ci)=>{
    const x=startX+ci*(barW+gap)+gap/2;
    let cumY=startY+chartH;
    series.forEach((sr,si)=>{
      const v=sr.values[ci]||0, bH=v*scale;
      cumY-=bH;
      slide.addShape('rect',{x,y:cumY,w:barW,h:Math.max(bH,0.02),fill:{color:sr.color||C.orange},line:{color:C.white,width:0.5}});
      if(bH>0.18) slide.addText(String(v),{x,y:cumY,w:barW,h:bH,fontFace:FONT_MONO,fontSize:8,color:C.white,align:'center',valign:'middle',margin:0});
    });
    slide.addText(cat,{x:x-0.1,y:startY+chartH+0.05,w:barW+0.2,h:0.3,fontFace:FONT_BODY,fontSize:9,color:C.text,align:'center',valign:'top',margin:0});
  });
  // Legend
  const legY=opts.legY||startY-0.3;
  series.forEach((sr,i)=>{
    const lx=startX+i*2.0;
    slide.addShape('rect',{x:lx,y:legY,w:0.2,h:0.15,fill:{color:sr.color},line:{color:sr.color,width:0}});
    slide.addText(sr.name,{x:lx+0.25,y:legY-0.02,w:1.6,h:0.2,fontFace:FONT_BODY,fontSize:8,color:C.text,margin:0});
  });
}

/** 24. Donut Chart — arc segments (simplified wedge approach) */
function donutChart(slide,segments,cx,cy,outerR,innerR){
  // Draw full circle bg, then colored arcs as overlapping shapes
  slide.addShape('ellipse',{x:cx-outerR,y:cy-outerR,w:outerR*2,h:outerR*2,fill:{color:C.grayLight},line:{color:C.grayLine,width:0.5}});
  // Use pptxgenjs native pie chart for accuracy
  const data=[{labels:segments.map(s=>s.label),values:segments.map(s=>s.value)}];
  slide.addChart('doughnut',data,{
    x:cx-outerR,y:cy-outerR,w:outerR*2,h:outerR*2,
    holeSize:55,showPercent:true,showValue:false,showTitle:false,showLegend:false,
    chartColors:segments.map(s=>s.color||C.orange),
    dataLabelFontSize:9,dataLabelColor:C.ink,
  });
}

/** 25. Line Trend Chart — native pptxgenjs line chart */
function lineTrendChart(slide,labels,seriesArr,opts={}){
  const data=seriesArr.map(sr=>({name:sr.name,labels,values:sr.values}));
  slide.addChart('line',data,{
    x:opts.x||0.6,y:opts.y||1.5,w:opts.w||8.8,h:opts.h||3.2,
    showLegend:true,legendPos:'b',legendFontSize:9,
    lineDataSymbol:'circle',lineDataSymbolSize:6,
    chartColors:seriesArr.map(sr=>sr.color||C.orange),
    valAxisMinVal:opts.minVal,valAxisMaxVal:opts.maxVal,
    catAxisOrientation:'minMax',valAxisOrientation:'minMax',
    showValue:false,
  });
}

/** 26. Tornado / Sensitivity Chart — horizontal bars left/right from center */
function tornadoChart(slide,items,opts={}){
  const startX=opts.x||0.6,startY=opts.y||1.7,chartW=opts.w||8.8,chartH=opts.h||3.0;
  const n=items.length, rowH=chartH/n, midX=startX+chartW/2, halfW=chartW/2;
  const maxAbs=Math.max(...items.map(it=>Math.max(Math.abs(it.low),Math.abs(it.high))));
  const scale=halfW/(maxAbs||1);
  items.forEach((it,i)=>{
    const y=startY+i*rowH;
    // Label
    slide.addText(it.label,{x:startX-0.1,y,w:halfW-0.2,h:rowH,fontFace:FONT_BODY,fontSize:9,bold:true,color:C.ink,align:'right',valign:'middle',margin:0});
    // Low bar (left)
    const lowW=Math.abs(it.low)*scale;
    slide.addShape('rect',{x:midX-lowW,y:y+0.06,w:lowW,h:rowH-0.12,fill:{color:it.lowColor||C.grayDark},line:{color:C.white,width:0.5}});
    // High bar (right)
    const highW=Math.abs(it.high)*scale;
    slide.addShape('rect',{x:midX,y:y+0.06,w:highW,h:rowH-0.12,fill:{color:it.highColor||C.orange},line:{color:C.white,width:0.5}});
    // Values
    slide.addText(String(it.low),{x:midX-lowW-0.5,y:y+0.06,w:0.45,h:rowH-0.12,fontFace:FONT_MONO,fontSize:8,color:C.grayDark,align:'right',valign:'middle',margin:0});
    slide.addText('+'+String(it.high),{x:midX+highW+0.05,y:y+0.06,w:0.5,h:rowH-0.12,fontFace:FONT_MONO,fontSize:8,color:C.orange,valign:'middle',margin:0});
  });
  // Center line
  slide.addShape('rect',{x:midX-0.01,y:startY,w:0.02,h:chartH,fill:{color:C.ink},line:{color:C.ink,width:0}});
}

/** 27. Risk Heatmap (5×5 RAG matrix) */
function riskHeatmap(slide,items,opts={}){
  const startX=opts.x||1.8,startY=opts.y||1.4,cellW=opts.cw||1.5,cellH=opts.ch||0.72;
  const rows=5,cols=5;
  // Color grid: green(low) → yellow → orange → red(high)
  const heatColors=[
    [C.greenLight,C.greenLight,C.warnLight,C.warnLight,C.redLight],
    [C.greenLight,C.warnLight,C.warnLight,C.redLight,C.redLight],
    [C.greenLight,C.warnLight,C.orangeVLight,C.redLight,C.redLight],
    [C.warnLight,C.warnLight,C.redLight,C.redLight,C.red],
    [C.warnLight,C.orangeVLight,C.redLight,C.red,C.red],
  ];
  const impLabels=['1','2','3','4','5'], probLabels=['5','4','3','2','1'];
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      const x=startX+c*cellW,y=startY+r*cellH;
      slide.addShape('rect',{x,y,w:cellW,h:cellH,fill:{color:heatColors[r][c]},line:{color:C.grayLine,width:0.5}});
    }
    // Prob labels (left)
    slide.addText(probLabels[r],{x:startX-0.5,y:startY+r*cellH,w:0.4,h:cellH,fontFace:FONT_MONO,fontSize:9,color:C.muted,align:'center',valign:'middle',margin:0});
  }
  // Impact labels (bottom)
  for(let c=0;c<cols;c++) slide.addText(impLabels[c],{x:startX+c*cellW,y:startY+rows*cellH+0.05,w:cellW,h:0.25,fontFace:FONT_MONO,fontSize:9,color:C.muted,align:'center',margin:0});
  // Axis titles
  slide.addText('발생 가능성 →',{x:startX-1.3,y:startY+1.2,w:1.2,h:0.3,fontFace:FONT_BODY,fontSize:9,bold:true,color:C.ink,align:'center',margin:0,rotate:270});
  slide.addText('영향도 →',{x:startX+1.5,y:startY+rows*cellH+0.3,w:1.5,h:0.25,fontFace:FONT_BODY,fontSize:9,bold:true,color:C.ink,align:'center',margin:0});
  // Plot risk items as labeled dots
  (items||[]).forEach(it=>{
    const x=startX+(it.impact-1)*cellW+cellW/2-0.18;
    const y=startY+(5-it.probability)*cellH+cellH/2-0.18;
    slide.addShape('ellipse',{x,y,w:0.36,h:0.36,fill:{color:C.ink},line:{color:C.white,width:1}});
    slide.addText(it.id||'',{x,y,w:0.36,h:0.36,fontFace:FONT_BODY,fontSize:8,bold:true,color:C.white,align:'center',valign:'middle',margin:0});
  });
}

/** 28. Org Chart — hierarchical boxes with connector lines */
function orgChart(slide,nodes,opts={}){
  const boxW=opts.bw||2.0,boxH=opts.bh||0.55;
  nodes.forEach(n=>{
    const isRoot=n.level===0;
    const fill=isRoot?C.orange:(n.level===1?C.ink:C.white);
    const textColor=n.level<2?C.white:C.ink;
    const border=n.level<2?fill:C.grayLine;
    slide.addShape('rect',{x:n.x,y:n.y,w:boxW,h:boxH,fill:{color:fill},line:{color:border,width:n.level<2?0:0.75}});
    slide.addText(n.title,{x:n.x+0.08,y:n.y,w:boxW-0.16,h:boxH*0.55,fontFace:FONT_BODY,fontSize:10,bold:true,color:textColor,align:'center',valign:'bottom',margin:0});
    if(n.name) slide.addText(n.name,{x:n.x+0.08,y:n.y+boxH*0.5,w:boxW-0.16,h:boxH*0.45,fontFace:FONT_BODY,fontSize:8.5,color:n.level<2?C.orangeVLight:C.textLight,align:'center',valign:'top',margin:0});
    // Connector line to parent
    if(n.parentX!==undefined){
      const px=n.parentX+boxW/2, py=n.parentY+boxH;
      const cx=n.x+boxW/2, cy=n.y;
      const midY=(py+cy)/2;
      slide.addShape('rect',{x:px-0.01,y:py,w:0.02,h:midY-py,fill:{color:C.grayLine},line:{color:C.grayLine,width:0}});
      slide.addShape('rect',{x:Math.min(px,cx),y:midY,w:Math.abs(cx-px)||0.02,h:0.02,fill:{color:C.grayLine},line:{color:C.grayLine,width:0}});
      slide.addShape('rect',{x:cx-0.01,y:midY,w:0.02,h:cy-midY,fill:{color:C.grayLine},line:{color:C.grayLine,width:0}});
    }
  });
}

/** 29. Venn Diagram — 2 or 3 overlapping circles */
function vennDiagram(slide,circles,centerLabel,opts={}){
  circles.forEach(c=>{
    slide.addShape('ellipse',{x:c.x,y:c.y,w:c.r*2,h:c.r*2,fill:{color:c.color||C.peach},line:{color:c.borderColor||C.orange,width:1},transparency:45});
    slide.addText(c.label,{x:c.x+c.labelDx,y:c.y+c.labelDy,w:c.r*1.2,h:0.5,fontFace:FONT_BODY,fontSize:11,bold:true,color:C.ink,align:'center',valign:'middle',margin:0});
  });
  if(centerLabel) slide.addText(centerLabel.text,{x:centerLabel.x,y:centerLabel.y,w:centerLabel.w||1.5,h:0.4,fontFace:FONT_BODY,fontSize:10,bold:true,color:C.orange,align:'center',valign:'middle',margin:0});
}

/** 30. Maturity Assessment — table with colored progress bars */
function maturityAssessment(slide,dimensions,opts={}){
  const startX=opts.x||0.4,startY=opts.y||1.6,totalW=opts.w||9.2,rowH=0.52;
  const labelW=2.5,barAreaW=totalW-labelW-1.5,scoreW=1.5;
  // Header
  slide.addShape('rect',{x:startX,y:startY,w:totalW,h:rowH,fill:{color:C.ink},line:{color:C.ink,width:0}});
  slide.addText('영역',{x:startX+0.1,y:startY,w:labelW-0.2,h:rowH,fontFace:FONT_BODY,fontSize:10,bold:true,color:C.white,valign:'middle',margin:0});
  slide.addText('성숙도',{x:startX+labelW,y:startY,w:barAreaW,h:rowH,fontFace:FONT_BODY,fontSize:10,bold:true,color:C.white,align:'center',valign:'middle',margin:0});
  slide.addText('점수',{x:startX+labelW+barAreaW,y:startY,w:scoreW,h:rowH,fontFace:FONT_BODY,fontSize:10,bold:true,color:C.white,align:'center',valign:'middle',margin:0});
  dimensions.forEach((d,i)=>{
    const y=startY+rowH+i*rowH, alt=i%2===0?C.white:C.peachLight;
    slide.addShape('rect',{x:startX,y,w:totalW,h:rowH,fill:{color:alt},line:{color:C.grayLine,width:0.5}});
    slide.addText(d.label,{x:startX+0.1,y,w:labelW-0.2,h:rowH,fontFace:FONT_BODY,fontSize:10,bold:true,color:C.ink,valign:'middle',margin:0});
    // Progress bar bg
    const barX=startX+labelW+0.15,barY=y+0.15,barH=rowH-0.3;
    slide.addShape('rect',{x:barX,y:barY,w:barAreaW-0.3,h:barH,fill:{color:C.grayLight},line:{color:C.grayLine,width:0.5}});
    // Progress bar fill
    const pct=d.score/5;
    const fillColor=pct>=0.8?C.green:(pct>=0.5?C.orange:C.red);
    slide.addShape('rect',{x:barX,y:barY,w:(barAreaW-0.3)*pct,h:barH,fill:{color:fillColor},line:{color:fillColor,width:0}});
    // Score
    slide.addText(`${d.score}/5`,{x:startX+labelW+barAreaW,y,w:scoreW,h:rowH,fontFace:FONT_MONO,fontSize:11,bold:true,color:fillColor,align:'center',valign:'middle',margin:0});
  });
}

/** 31. Before/After Metrics — big number pairs side by side */
function beforeAfterMetrics(slide,metrics,opts={}){
  const n=metrics.length,startX=0.4,totalW=9.2,gap=0.15;
  const cardW=(totalW-gap*(n-1))/n,cardH=opts.h||2.2,startY=opts.y||1.7;
  metrics.forEach((m,i)=>{
    const x=startX+i*(cardW+gap);
    slide.addShape('rect',{x,y:startY,w:cardW,h:cardH,fill:{color:C.white},line:{color:C.grayLine,width:0.75}});
    slide.addText(m.label,{x:x+0.1,y:startY+0.08,w:cardW-0.2,h:0.28,fontFace:FONT_BODY,fontSize:10,bold:true,color:C.ink,align:'center',valign:'middle',margin:0});
    // Before
    slide.addText(m.before,{x,y:startY+0.45,w:cardW/2,h:0.6,fontFace:FONT_MONO,fontSize:22,bold:true,color:C.grayDark,align:'center',valign:'middle',margin:0});
    slide.addText('Before',{x,y:startY+1.05,w:cardW/2,h:0.22,fontFace:FONT_BODY,fontSize:8,color:C.muted,align:'center',margin:0});
    // Arrow
    slide.addText('→',{x:x+cardW/2-0.15,y:startY+0.55,w:0.3,h:0.4,fontFace:FONT_BODY,fontSize:18,color:C.orange,align:'center',valign:'middle',margin:0});
    // After
    slide.addText(m.after,{x:x+cardW/2,y:startY+0.45,w:cardW/2,h:0.6,fontFace:FONT_MONO,fontSize:22,bold:true,color:C.orange,align:'center',valign:'middle',margin:0});
    slide.addText('After',{x:x+cardW/2,y:startY+1.05,w:cardW/2,h:0.22,fontFace:FONT_BODY,fontSize:8,color:C.muted,align:'center',margin:0});
    // Delta
    if(m.delta) slide.addText(m.delta,{x:x+0.1,y:startY+cardH-0.4,w:cardW-0.2,h:0.3,fontFace:FONT_MONO,fontSize:9,bold:true,color:m.delta.startsWith('-')?C.green:C.orange,align:'center',valign:'middle',margin:0});
  });
}

/** 32. Scenario Comparison — 3 option columns side by side */
function scenarioColumns(slide,scenarios,opts={}){
  const n=scenarios.length,startX=0.4,totalW=9.2,gap=0.15;
  const colW=(totalW-gap*(n-1))/n,startY=opts.y||1.5;
  scenarios.forEach((sc,i)=>{
    const x=startX+i*(colW+gap), recommended=sc.recommended;
    // Header
    slide.addShape('rect',{x,y:startY,w:colW,h:0.45,fill:{color:recommended?C.orange:C.grayDark},line:{color:recommended?C.orange:C.grayDark,width:0}});
    slide.addText(sc.title,{x:x+0.1,y:startY,w:colW-0.2,h:0.45,fontFace:FONT_BODY,fontSize:12,bold:true,color:C.white,align:'center',valign:'middle',margin:0});
    if(recommended) slide.addText('★ 권고',{x:x+colW-0.8,y:startY+0.02,w:0.7,h:0.2,fontFace:FONT_BODY,fontSize:8,bold:true,color:C.white,align:'center',valign:'middle',margin:0});
    // Body
    const bodyH=opts.bodyH||3.2;
    slide.addShape('rect',{x,y:startY+0.45,w:colW,h:bodyH,fill:{color:C.white},line:{color:recommended?C.orange:C.grayLine,width:recommended?1.5:0.75}});
    slide.addText(sc.body,{x:x+0.12,y:startY+0.55,w:colW-0.24,h:bodyH-0.2,fontFace:FONT_BODY,fontSize:10,color:C.text,valign:'top',margin:0});
  });
}

/** 33. Checkmark Feature Grid — ✓/✗ comparison table */
function checkmarkGrid(slide,headers,rows,opts={}){
  const startX=opts.x||0.4,startY=opts.y||1.6,totalW=opts.w||9.2,rowH=0.48;
  const n=headers.length,firstColW=totalW*0.3,otherColW=(totalW-firstColW)/(n-1);
  // Header
  let cx=startX;
  headers.forEach((h,j)=>{
    const w=j===0?firstColW:otherColW;
    slide.addShape('rect',{x:cx,y:startY,w,h:rowH,fill:{color:C.ink},line:{color:C.ink,width:0}});
    slide.addText(h,{x:cx+0.08,y:startY,w:w-0.16,h:rowH,fontFace:FONT_BODY,fontSize:10,bold:true,color:C.white,align:j===0?'left':'center',valign:'middle',margin:0});
    cx+=w;
  });
  rows.forEach((r,ri)=>{
    cx=startX; const y=startY+rowH+ri*rowH, alt=ri%2===0?C.white:C.peachLight;
    r.forEach((cell,ci)=>{
      const w=ci===0?firstColW:otherColW;
      slide.addShape('rect',{x:cx,y,w,h:rowH,fill:{color:alt},line:{color:C.grayLine,width:0.5}});
      if(ci===0) slide.addText(cell,{x:cx+0.08,y,w:w-0.16,h:rowH,fontFace:FONT_BODY,fontSize:10,bold:true,color:C.ink,valign:'middle',margin:0});
      else{
        const isCheck=cell===true||cell==='✓';
        slide.addText(isCheck?'✓':'✗',{x:cx,y,w,h:rowH,fontFace:FONT_BODY,fontSize:14,bold:true,color:isCheck?C.green:C.red,align:'center',valign:'middle',margin:0});
      }
      cx+=w;
    });
  });
}

/** 34. RACI Matrix — colored R/A/C/I cells */
function raciMatrix(slide,headers,rows,opts={}){
  const startX=opts.x||0.4,startY=opts.y||1.6,totalW=opts.w||9.2,rowH=0.48;
  const n=headers.length,firstColW=totalW*0.28,otherColW=(totalW-firstColW)/(n-1);
  const raciColors={R:C.orange,A:C.ink,C:C.orangeLight,I:C.grayBg};
  const raciText={R:C.white,A:C.white,C:C.white,I:C.ink};
  let cx=startX;
  headers.forEach((h,j)=>{
    const w=j===0?firstColW:otherColW;
    slide.addShape('rect',{x:cx,y:startY,w,h:rowH,fill:{color:C.ink},line:{color:C.ink,width:0}});
    slide.addText(h,{x:cx+0.06,y:startY,w:w-0.12,h:rowH,fontFace:FONT_BODY,fontSize:9,bold:true,color:C.white,align:j===0?'left':'center',valign:'middle',margin:0});
    cx+=w;
  });
  rows.forEach((r,ri)=>{
    cx=startX; const y=startY+rowH+ri*rowH;
    r.forEach((cell,ci)=>{
      const w=ci===0?firstColW:otherColW;
      if(ci===0){
        slide.addShape('rect',{x:cx,y,w,h:rowH,fill:{color:ri%2===0?C.white:C.peachLight},line:{color:C.grayLine,width:0.5}});
        slide.addText(cell,{x:cx+0.06,y,w:w-0.12,h:rowH,fontFace:FONT_BODY,fontSize:10,bold:true,color:C.ink,valign:'middle',margin:0});
      }else{
        const bg=raciColors[cell]||C.white;
        slide.addShape('rect',{x:cx,y,w,h:rowH,fill:{color:bg},line:{color:C.grayLine,width:0.5}});
        slide.addText(cell||'',{x:cx,y,w,h:rowH,fontFace:FONT_BODY,fontSize:11,bold:true,color:raciText[cell]||C.muted,align:'center',valign:'middle',margin:0});
      }
      cx+=w;
    });
  });
}

/** 35. Mekko Chart — variable-width stacked bars */
function mekkoChart(slide,categories,opts={}){
  const startX=opts.x||0.8,startY=opts.y||1.6,chartW=opts.w||8.4,chartH=opts.h||3.0;
  const totalSize=categories.reduce((s,c)=>s+c.size,0);
  let cx=startX;
  categories.forEach(cat=>{
    const barW=(cat.size/totalSize)*chartW;
    let cumPct=0;
    (cat.segments||[]).forEach(seg=>{
      const segH=(seg.pct/100)*chartH;
      const y=startY+chartH-cumPct*chartH/100-segH;
      slide.addShape('rect',{x:cx,y,w:barW,h:segH,fill:{color:seg.color||C.orange},line:{color:C.white,width:0.75}});
      if(segH>0.25) slide.addText(`${seg.pct}%`,{x:cx,y,w:barW,h:segH,fontFace:FONT_MONO,fontSize:8,color:C.white,align:'center',valign:'middle',margin:0});
      cumPct+=seg.pct;
    });
    // Width label
    slide.addText(`${cat.label}\n(${cat.size})`,{x:cx,y:startY+chartH+0.05,w:barW,h:0.45,fontFace:FONT_BODY,fontSize:8,color:C.text,align:'center',valign:'top',margin:0});
    cx+=barW;
  });
}

/** 36. Value Chain — horizontal primary activities + support row */
function valueChain(slide,primary,support,opts={}){
  const startX=opts.x||0.4,startY=opts.y||1.5,totalW=opts.w||9.2;
  const supportH=0.9,primaryH=1.6,gap=0.08;
  // Support row (top)
  slide.addShape('rect',{x:startX,y:startY,w:totalW,h:supportH,fill:{color:C.peach},line:{color:C.orange,width:0.75}});
  slide.addText('지원 활동 (Support Activities)',{x:startX+0.12,y:startY,w:2.5,h:0.3,fontFace:FONT_BODY,fontSize:9,bold:true,color:C.orange,valign:'middle',margin:0});
  const sn=support.length, sw=(totalW-0.2-gap*(sn-1))/sn;
  support.forEach((s,i)=>{
    const x=startX+0.1+i*(sw+gap);
    slide.addText(s,{x,y:startY+0.3,w:sw,h:supportH-0.4,fontFace:FONT_BODY,fontSize:10,color:C.text,valign:'middle',align:'center',margin:0});
  });
  // Primary activities (bottom)
  const pY=startY+supportH+0.12;
  const pn=primary.length, pw=(totalW-gap*(pn-1))/pn;
  primary.forEach((p,i)=>{
    const x=startX+i*(pw+gap);
    const isLast=i===pn-1;
    slide.addShape('rect',{x,y:pY,w:pw,h:primaryH,fill:{color:isLast?C.orange:C.white},line:{color:C.orange,width:0.75}});
    slide.addText(p.title,{x:x+0.08,y:pY+0.1,w:pw-0.16,h:0.35,fontFace:FONT_BODY,fontSize:11,bold:true,color:isLast?C.white:C.orange,align:'center',valign:'middle',margin:0});
    if(p.items) slide.addText(p.items,{x:x+0.08,y:pY+0.5,w:pw-0.16,h:primaryH-0.65,fontFace:FONT_BODY,fontSize:9,color:isLast?C.white:C.textLight,align:'center',valign:'top',margin:0});
    if(i<pn-1) slide.addText('▶',{x:x+pw-0.02,y:pY+primaryH/2-0.12,w:0.14,h:0.24,fontFace:FONT_BODY,fontSize:9,color:C.orange,align:'center',valign:'middle',margin:0});
  });
  // Margin arrow
  slide.addShape('rect',{x:startX+totalW+0.08,y:startY,w:0.35,h:supportH+0.12+primaryH,fill:{color:C.orangeDeep},line:{color:C.orangeDeep,width:0}});
  slide.addText('M\nA\nR\nG\nI\nN',{x:startX+totalW+0.08,y:startY+0.2,w:0.35,h:supportH+primaryH-0.2,fontFace:FONT_BODY,fontSize:8,bold:true,color:C.white,align:'center',valign:'middle',margin:0});
}


// ============================================================================
//  LAYOUT HELPERS — FEW-SHOT PATTERNS (12 additional: 37-48)
// ============================================================================

/** 37. Strategic House — Vision/Mission/Pillars/Foundation */
function strategicHouse(slide,data,opts={}){
  const sX=opts.x||0.4,sY=opts.y||1.4,w=opts.w||9.2;
  const roofH=0.55,missionH=0.4,pillarH=2.0,foundH=0.5,gap=0.06;
  // Roof (Vision)
  slide.addShape('rect',{x:sX,y:sY,w,h:roofH,fill:{color:C.orange},line:{color:C.orange,width:0}});
  slide.addText(data.vision,{x:sX+0.15,y:sY,w:w-0.3,h:roofH,fontFace:FONT_TITLE,fontSize:14,bold:true,color:C.white,align:'center',valign:'middle',margin:0});
  // Mission bar
  const mY=sY+roofH+gap;
  slide.addShape('rect',{x:sX,y:mY,w,h:missionH,fill:{color:C.orangeLight},line:{color:C.orange,width:0.5}});
  slide.addText(data.mission,{x:sX+0.15,y:mY,w:w-0.3,h:missionH,fontFace:FONT_BODY,fontSize:11,bold:true,color:C.ink,align:'center',valign:'middle',margin:0});
  // Pillars
  const pY=mY+missionH+gap,n=data.pillars.length,pGap=0.12;
  const pW=(w-pGap*(n-1))/n;
  data.pillars.forEach((p,i)=>{
    const x=sX+i*(pW+pGap);
    slide.addShape('rect',{x,y:pY,w:pW,h:pillarH,fill:{color:C.white},line:{color:C.orange,width:0.75}});
    slide.addShape('rect',{x,y:pY,w:pW,h:0.35,fill:{color:C.peach},line:{color:C.orange,width:0.5}});
    slide.addText(p.title,{x:x+0.08,y:pY,w:pW-0.16,h:0.35,fontFace:FONT_BODY,fontSize:10,bold:true,color:C.orange,align:'center',valign:'middle',margin:0});
    slide.addText(p.items,{x:x+0.08,y:pY+0.42,w:pW-0.16,h:pillarH-0.52,fontFace:FONT_BODY,fontSize:9.5,color:C.text,valign:'top',margin:0});
  });
  // Foundation
  const fY=pY+pillarH+gap;
  slide.addShape('rect',{x:sX,y:fY,w,h:foundH,fill:{color:C.ink},line:{color:C.ink,width:0}});
  slide.addText(data.foundation,{x:sX+0.15,y:fY,w:w-0.3,h:foundH,fontFace:FONT_BODY,fontSize:11,bold:true,color:C.white,align:'center',valign:'middle',margin:0});
}

/** 38. 4-Quadrant Trend Analysis — Market/Tech/Regulation/Competitor */
function quadTrendAnalysis(slide,quads,implication,opts={}){
  const sX=opts.x||0.4,sY=opts.y||1.4,totalW=opts.w||9.2;
  const qW=(totalW-0.15)/2,qH=1.55,gap=0.15;
  const icons=['📈','🔧','📋','🏢'];
  const titles=['시장 동향','기술 동향','규제 동향','경쟁사 동향'];
  quads.forEach((q,i)=>{
    const col=i%2,row=Math.floor(i/2);
    const x=sX+col*(qW+gap),y=sY+row*(qH+gap);
    slide.addShape('rect',{x,y,w:qW,h:qH,fill:{color:C.white},line:{color:C.orange,width:0.75}});
    slide.addShape('rect',{x,y,w:qW,h:0.32,fill:{color:row===0?(col===0?C.orange:C.orangeLight):(col===0?C.orangeDeep:C.orangeVLight)},line:{color:C.orange,width:0}});
    slide.addText(`${icons[i]}  ${q.title||titles[i]}`,{x:x+0.1,y,w:qW-0.2,h:0.32,fontFace:FONT_BODY,fontSize:10,bold:true,color:row<1||col<1?C.white:C.ink,valign:'middle',margin:0});
    slide.addText(q.items,{x:x+0.1,y:y+0.38,w:qW-0.2,h:qH-0.45,fontFace:FONT_BODY,fontSize:9.5,color:C.text,valign:'top',margin:0});
  });
  // Implication bar
  if(implication){
    const iY=sY+2*(qH+gap)+0.05;
    calloutBand(slide,iY,[{text:'Implication — ',options:{bold:true,color:C.orange}},{text:implication,options:{color:C.ink}}]);
  }
}

/** 39. Strategic Alignment Cascade — Vision → Biz Goals → IT/Execution Goals */
function alignmentCascade(slide,data,opts={}){
  const sX=opts.x||0.4,sY=opts.y||1.4,w=opts.w||9.2;
  const rowH=0.65,gap=0.08;
  const levels=[
    {label:'비전',items:[data.vision],fill:C.orange,text:C.white},
    {label:'경영 목표',items:data.bizGoals,fill:C.peach,text:C.ink},
    {label:'실행 목표',items:data.execGoals,fill:C.white,text:C.ink},
  ];
  levels.forEach((lv,li)=>{
    const y=sY+li*(rowH+gap+0.4);
    // Level label
    slide.addShape('rect',{x:sX,y,w:1.4,h:rowH,fill:{color:C.ink},line:{color:C.ink,width:0}});
    slide.addText(lv.label,{x:sX+0.08,y,w:1.24,h:rowH,fontFace:FONT_BODY,fontSize:9,bold:true,color:C.white,align:'center',valign:'middle',margin:0});
    // Items
    const n=lv.items.length,iW=(w-1.5-0.08*(n-1))/n;
    lv.items.forEach((it,ii)=>{
      const x=sX+1.5+ii*(iW+0.08);
      slide.addShape('rect',{x,y,w:iW,h:rowH,fill:{color:lv.fill},line:{color:C.orange,width:0.75}});
      slide.addText(it,{x:x+0.08,y,w:iW-0.16,h:rowH,fontFace:FONT_BODY,fontSize:10,bold:li===0,color:lv.text,align:'center',valign:'middle',margin:0});
    });
    // Arrow down
    if(li<levels.length-1) slide.addText('▼',{x:sX+w/2-0.15,y:y+rowH+0.02,w:0.3,h:0.3,fontFace:FONT_BODY,fontSize:14,color:C.orange,align:'center',valign:'middle',margin:0});
  });
}

/** 40. IT Architecture Layers — Channel→BizApp→Data→Infra */
function architectureLayers(slide,layers,opts={}){
  const sX=opts.x||0.4,sY=opts.y||1.5,w=opts.w||9.2;
  const layerH=0.85,gap=0.06;
  const shades=[C.orange,C.orangeLight,C.orangeVLight,C.peach];
  const textColors=[C.white,C.ink,C.ink,C.ink];
  layers.forEach((l,i)=>{
    const y=sY+i*(layerH+gap);
    slide.addShape('rect',{x:sX,y,w,h:layerH,fill:{color:shades[Math.min(i,shades.length-1)]},line:{color:C.orange,width:0.5}});
    slide.addText(l.title,{x:sX+0.12,y,w:1.5,h:layerH,fontFace:FONT_BODY,fontSize:11,bold:true,color:textColors[Math.min(i,textColors.length-1)],valign:'middle',margin:0});
    // Systems as inline tags
    const tagY=y+0.12, tagH=layerH-0.24;
    const systems=l.systems||[];
    const sW=Math.min(1.3,(w-2.0-0.08*(systems.length-1))/systems.length);
    systems.forEach((sys,si)=>{
      const sx=sX+1.8+si*(sW+0.08);
      slide.addShape('rect',{x:sx,y:tagY,w:sW,h:tagH,fill:{color:C.white},line:{color:C.grayLine,width:0.5}});
      slide.addText(sys,{x:sx+0.04,y:tagY,w:sW-0.08,h:tagH,fontFace:FONT_BODY,fontSize:8.5,color:C.ink,align:'center',valign:'middle',margin:0});
    });
  });
}

/** 41. Option Scoring Table — weighted criteria evaluation */
function optionScoringTable(slide,criteria,options,scores,recommendation,opts={}){
  const sX=opts.x||0.4,sY=opts.y||1.5,totalW=opts.w||9.2,rH=0.44;
  const firstW=2.0,weightW=0.7,optW=(totalW-firstW-weightW)/options.length;
  // Header
  let cx=sX;
  [{w:firstW,t:'평가 기준'},{w:weightW,t:'가중치'},...options.map(o=>({w:optW,t:o}))].forEach(h=>{
    slide.addShape('rect',{x:cx,y:sY,w:h.w,h:rH,fill:{color:C.ink},line:{color:C.ink,width:0}});
    slide.addText(h.t,{x:cx+0.06,y:sY,w:h.w-0.12,h:rH,fontFace:FONT_BODY,fontSize:9,bold:true,color:C.white,align:'center',valign:'middle',margin:0});
    cx+=h.w;
  });
  // Rows
  criteria.forEach((cr,ri)=>{
    cx=sX; const y=sY+rH+ri*rH, alt=ri%2===0?C.white:C.peachLight;
    [{w:firstW,t:cr.name,a:'left'},{w:weightW,t:cr.weight,a:'center'},...scores[ri].map(sc=>({w:optW,t:String(sc),a:'center'}))].forEach((cell,ci)=>{
      slide.addShape('rect',{x:cx,y,w:cell.w,h:rH,fill:{color:alt},line:{color:C.grayLine,width:0.5}});
      const isScore=ci>=2;
      slide.addText(cell.t,{x:cx+0.06,y,w:cell.w-0.12,h:rH,fontFace:isScore?FONT_MONO:FONT_BODY,fontSize:isScore?11:9.5,bold:ci<2,color:C.ink,align:cell.a,valign:'middle',margin:0});
      cx+=cell.w;
    });
  });
  // Total row
  const totY=sY+rH+criteria.length*rH;
  cx=sX;
  slide.addShape('rect',{x:sX,y:totY,w:firstW+weightW,h:rH,fill:{color:C.orange},line:{color:C.orange,width:0}});
  slide.addText('합계',{x:sX+0.06,y:totY,w:firstW+weightW-0.12,h:rH,fontFace:FONT_BODY,fontSize:10,bold:true,color:C.white,align:'center',valign:'middle',margin:0});
  cx=sX+firstW+weightW;
  const totals=options.map((_,oi)=>scores.reduce((s,row)=>s+row[oi],0));
  const maxTotal=Math.max(...totals);
  totals.forEach((tot,oi)=>{
    const isMax=tot===maxTotal;
    slide.addShape('rect',{x:cx,y:totY,w:optW,h:rH,fill:{color:isMax?C.orange:C.grayBg},line:{color:C.grayLine,width:0.5}});
    slide.addText(String(tot)+(isMax?' ★':''),{x:cx,y:totY,w:optW,h:rH,fontFace:FONT_MONO,fontSize:12,bold:true,color:isMax?C.white:C.ink,align:'center',valign:'middle',margin:0});
    cx+=optW;
  });
}

/** 42. Investment Plan — CAPEX/OPEX breakdown table */
function investmentPlan(slide,items,total,roi,opts={}){
  const sX=opts.x||0.4,sY=opts.y||1.6,totalW=opts.w||9.2,rH=0.52;
  const cols=[{w:0.6,l:'#'},{w:2.5,l:'항목'},{w:2.0,l:'분류'},{w:2.2,l:'금액'},{w:1.9,l:'비고'}];
  let cx=sX; cols.forEach(c=>{
    slide.addShape('rect',{x:cx,y:sY,w:c.w,h:rH,fill:{color:C.ink},line:{color:C.ink,width:0}});
    slide.addText(c.l,{x:cx+0.08,y:sY,w:c.w-0.16,h:rH,fontFace:FONT_BODY,fontSize:10,bold:true,color:C.white,valign:'middle',margin:0}); cx+=c.w;
  });
  items.forEach((it,i)=>{
    cx=sX; const y=sY+rH+i*rH, alt=i%2===0?C.white:C.peachLight;
    [String(i+1).padStart(2,'0'),it.name,it.type,it.amount,it.note||''].forEach((v,j)=>{
      slide.addShape('rect',{x:cx,y,w:cols[j].w,h:rH,fill:{color:alt},line:{color:C.grayLine,width:0.5}});
      slide.addText(v,{x:cx+0.08,y,w:cols[j].w-0.16,h:rH,fontFace:j===3?FONT_MONO:FONT_BODY,fontSize:j===0?11:10,bold:j<=1,color:j===0?C.orange:C.ink,valign:'middle',margin:0}); cx+=cols[j].w;
    });
  });
  // Total row
  const tY=sY+rH+items.length*rH;
  slide.addShape('rect',{x:sX,y:tY,w:totalW,h:rH,fill:{color:C.orange},line:{color:C.orange,width:0}});
  slide.addText('총 투자 소요',{x:sX+0.08,y:tY,w:3.1,h:rH,fontFace:FONT_BODY,fontSize:11,bold:true,color:C.white,valign:'middle',margin:0});
  slide.addText(total,{x:sX+3.1,y:tY,w:2.2,h:rH,fontFace:FONT_MONO,fontSize:13,bold:true,color:C.white,valign:'middle',margin:0});
  if(roi) slide.addText(roi,{x:sX+5.3,y:tY,w:totalW-5.3,h:rH,fontFace:FONT_BODY,fontSize:10,color:C.white,valign:'middle',margin:0});
}

/** 43. Root Cause Tree — Core Problem → Category → Sub-causes */
function rootCauseTree(slide,problem,categories,opts={}){
  const sX=opts.x||0.4,sY=opts.y||1.5,w=opts.w||9.2;
  // Core problem (left)
  const probW=2.2,probH=1.2;
  slide.addShape('rect',{x:sX,y:sY+0.8,w:probW,h:probH,fill:{color:C.orange},line:{color:C.orange,width:0}});
  slide.addText(problem,{x:sX+0.1,y:sY+0.8,w:probW-0.2,h:probH,fontFace:FONT_BODY,fontSize:11,bold:true,color:C.white,align:'center',valign:'middle',margin:0});
  // Categories (right)
  const n=categories.length,catX=sX+probW+0.8,catW=w-probW-0.8;
  const catH=2.6/n,catGap=0.08;
  categories.forEach((cat,i)=>{
    const y=sY+i*(catH+catGap);
    // Category header
    slide.addShape('rect',{x:catX,y,w:1.6,h:catH,fill:{color:C.peach},line:{color:C.orange,width:0.75}});
    slide.addText(cat.name,{x:catX+0.06,y,w:1.48,h:catH,fontFace:FONT_BODY,fontSize:10,bold:true,color:C.orange,align:'center',valign:'middle',margin:0});
    // Sub-causes
    slide.addShape('rect',{x:catX+1.7,y,w:catW-1.7,h:catH,fill:{color:C.white},line:{color:C.grayLine,width:0.5}});
    slide.addText(cat.causes,{x:catX+1.78,y,w:catW-1.86,h:catH,fontFace:FONT_BODY,fontSize:9,color:C.text,valign:'middle',margin:0});
    // Connector
    const midY=sY+0.8+probH/2, cY=y+catH/2;
    slide.addShape('rect',{x:sX+probW,y:midY-0.01,w:0.4,h:0.02,fill:{color:C.orange},line:{color:C.orange,width:0}});
    slide.addShape('rect',{x:sX+probW+0.38,y:Math.min(midY,cY),w:0.02,h:Math.abs(cY-midY)||0.02,fill:{color:C.orange},line:{color:C.orange,width:0}});
    slide.addShape('rect',{x:sX+probW+0.38,y:cY-0.01,w:0.42,h:0.02,fill:{color:C.orange},line:{color:C.orange,width:0}});
  });
}

/** 44. Target Operating Model — 5 horizontal elements */
function tomModel(slide,vision,elements,opts={}){
  const sX=opts.x||0.4,sY=opts.y||1.4,w=opts.w||9.2;
  // Vision banner
  slide.addShape('rect',{x:sX,y:sY,w,h:0.5,fill:{color:C.orange},line:{color:C.orange,width:0}});
  slide.addText(vision,{x:sX+0.15,y:sY,w:w-0.3,h:0.5,fontFace:FONT_BODY,fontSize:12,bold:true,color:C.white,align:'center',valign:'middle',margin:0});
  // 5 element cards
  const n=elements.length,gap=0.1,cardW=(w-gap*(n-1))/n,cardH=2.5,cY=sY+0.6;
  elements.forEach((el,i)=>{
    const x=sX+i*(cardW+gap);
    slide.addShape('rect',{x,y:cY,w:cardW,h:cardH,fill:{color:C.white},line:{color:C.orange,width:0.75}});
    // Icon circle
    slide.addShape('ellipse',{x:x+cardW/2-0.2,y:cY+0.1,w:0.4,h:0.4,fill:{color:C.peach},line:{color:C.orange,width:0.5}});
    slide.addText(el.icon||String(i+1),{x:x+cardW/2-0.2,y:cY+0.1,w:0.4,h:0.4,fontFace:FONT_BODY,fontSize:12,bold:true,color:C.orange,align:'center',valign:'middle',margin:0});
    slide.addText(el.title,{x:x+0.06,y:cY+0.55,w:cardW-0.12,h:0.3,fontFace:FONT_BODY,fontSize:10,bold:true,color:C.ink,align:'center',valign:'middle',margin:0});
    slide.addText(el.items,{x:x+0.06,y:cY+0.9,w:cardW-0.12,h:cardH-1.05,fontFace:FONT_BODY,fontSize:9,color:C.textLight,align:'center',valign:'top',margin:0});
  });
}

/** 45. Initiative Detail Card — As-Is / To-Be / Benefit / Prerequisites */
function initiativeCard(slide,data,opts={}){
  const sX=opts.x||0.4,sY=opts.y||1.4,w=opts.w||9.2;
  // Header with code
  slide.addShape('rect',{x:sX,y:sY,w,h:0.5,fill:{color:C.orange},line:{color:C.orange,width:0}});
  slide.addText(`${data.code}  |  ${data.name}`,{x:sX+0.15,y:sY,w:w-0.3,h:0.5,fontFace:FONT_BODY,fontSize:14,bold:true,color:C.white,valign:'middle',margin:0});
  // 2x2 grid: As-Is/To-Be/Benefit/Prerequisites
  const gY=sY+0.6,gW=(w-0.12)/2,gH=1.45,gGap=0.12;
  const sections=[
    {title:'현행 (As-Is)',body:data.asIs,fill:C.grayLight,titleFill:C.grayDark},
    {title:'개선 방향 (To-Be)',body:data.toBe,fill:C.white,titleFill:C.orange},
    {title:'기대 효과',body:data.benefit,fill:C.peachLight,titleFill:C.orangeDeep},
    {title:'선행 조건',body:data.prereq,fill:C.white,titleFill:C.ink},
  ];
  sections.forEach((sec,i)=>{
    const col=i%2,row=Math.floor(i/2);
    const x=sX+col*(gW+gGap),y=gY+row*(gH+0.08);
    slide.addShape('rect',{x,y,w:gW,h:gH,fill:{color:sec.fill},line:{color:C.grayLine,width:0.75}});
    slide.addShape('rect',{x,y,w:gW,h:0.3,fill:{color:sec.titleFill},line:{color:sec.titleFill,width:0}});
    slide.addText(sec.title,{x:x+0.08,y,w:gW-0.16,h:0.3,fontFace:FONT_BODY,fontSize:9,bold:true,color:C.white,valign:'middle',margin:0});
    slide.addText(sec.body,{x:x+0.08,y:y+0.35,w:gW-0.16,h:gH-0.42,fontFace:FONT_BODY,fontSize:9.5,color:C.text,valign:'top',margin:0});
  });
}

/** 46. Change Management (ADKAR) — 5-step arrow model */
function adkarModel(slide,steps,opts={}){
  const sX=opts.x||0.4,sY=opts.y||1.5,w=opts.w||9.2;
  const n=steps.length,gap=0.06,stepW=(w-gap*(n-1))/n,arrowH=0.5,descH=2.2;
  const shades=[C.orangeDeep,C.orange,C.orangeLight,C.orangeVLight,C.peach];
  steps.forEach((st,i)=>{
    const x=sX+i*(stepW+gap);
    // Arrow header
    slide.addShape('rect',{x,y:sY,w:stepW,h:arrowH,fill:{color:shades[i]},line:{color:C.orange,width:0.5}});
    slide.addText(st.letter,{x,y:sY,w:0.35,h:arrowH,fontFace:FONT_TITLE,fontSize:22,bold:true,color:i<2?C.white:C.orange,align:'center',valign:'middle',margin:0});
    slide.addText(st.title,{x:x+0.35,y:sY,w:stepW-0.4,h:arrowH,fontFace:FONT_BODY,fontSize:9,bold:true,color:i<2?C.white:C.ink,valign:'middle',margin:0});
    if(i<n-1) slide.addText('▶',{x:x+stepW-0.02,y:sY+arrowH/2-0.12,w:0.14,h:0.24,fontFace:FONT_BODY,fontSize:9,color:C.orange,align:'center',valign:'middle',margin:0});
    // Description card
    slide.addShape('rect',{x,y:sY+arrowH+0.06,w:stepW,h:descH,fill:{color:C.white},line:{color:C.grayLine,width:0.5}});
    slide.addText(st.items,{x:x+0.06,y:sY+arrowH+0.12,w:stepW-0.12,h:descH-0.12,fontFace:FONT_BODY,fontSize:9,color:C.text,valign:'top',margin:0});
  });
}

/** 47. Project Scope Table — In-Scope / Out-Scope boundary */
function scopeTable(slide,scopeRows,opts={}){
  const sX=opts.x||0.4,sY=opts.y||1.6,totalW=opts.w||9.2,rH=0.5;
  const cols=[{w:2.2,l:'업무 영역'},{w:3.5,l:'In-Scope (범위 내)'},{w:3.5,l:'Out-of-Scope (범위 외)'}];
  let cx=sX; cols.forEach(c=>{
    slide.addShape('rect',{x:cx,y:sY,w:c.w,h:rH,fill:{color:C.ink},line:{color:C.ink,width:0}});
    slide.addText(c.l,{x:cx+0.08,y:sY,w:c.w-0.16,h:rH,fontFace:FONT_BODY,fontSize:10,bold:true,color:C.white,align:'center',valign:'middle',margin:0}); cx+=c.w;
  });
  scopeRows.forEach((r,i)=>{
    cx=sX; const y=sY+rH+i*rH, alt=i%2===0?C.white:C.peachLight;
    [r.area,r.inScope,r.outScope].forEach((v,j)=>{
      slide.addShape('rect',{x:cx,y,w:cols[j].w,h:rH,fill:{color:alt},line:{color:C.grayLine,width:0.5}});
      slide.addText(v,{x:cx+0.08,y,w:cols[j].w-0.16,h:rH,fontFace:FONT_BODY,fontSize:9.5,bold:j===0,color:j===0?C.orange:C.ink,valign:'middle',margin:0}); cx+=cols[j].w;
    });
  });
}

/** 48. Gap Analysis — As-Is → Gap → To-Be with strategy */
function gapAnalysis(slide,data,opts={}){
  const sX=opts.x||0.4,sY=opts.y||1.5,w=opts.w||9.2;
  const colW=(w-1.2)/2,midW=1.2,colH=2.8;
  // As-Is column
  slide.addShape('rect',{x:sX,y:sY,w:colW,h:0.35,fill:{color:C.grayDark},line:{color:C.grayDark,width:0}});
  slide.addText('AS-IS (현행)',{x:sX+0.1,y:sY,w:colW-0.2,h:0.35,fontFace:FONT_BODY,fontSize:11,bold:true,color:C.white,align:'center',valign:'middle',margin:0});
  slide.addShape('rect',{x:sX,y:sY+0.35,w:colW,h:colH-0.35,fill:{color:C.grayLight},line:{color:C.grayLine,width:0.75}});
  slide.addText(data.asIs,{x:sX+0.1,y:sY+0.45,w:colW-0.2,h:colH-0.55,fontFace:FONT_BODY,fontSize:10,color:C.text,valign:'top',margin:0});
  // Gap (center)
  const gX=sX+colW,gY=sY+colH/2-0.5;
  slide.addShape('ellipse',{x:gX+midW/2-0.5,y:gY,w:1.0,h:1.0,fill:{color:C.orange},line:{color:C.orangeDeep,width:1}});
  slide.addText('GAP',{x:gX+midW/2-0.5,y:gY,w:1.0,h:0.5,fontFace:FONT_TITLE,fontSize:14,bold:true,color:C.white,align:'center',valign:'bottom',margin:0});
  slide.addText(data.gapKeyword,{x:gX+midW/2-0.5,y:gY+0.5,w:1.0,h:0.5,fontFace:FONT_BODY,fontSize:8,color:C.white,align:'center',valign:'top',margin:0});
  // To-Be column
  const tbX=sX+colW+midW;
  slide.addShape('rect',{x:tbX,y:sY,w:colW,h:0.35,fill:{color:C.orange},line:{color:C.orange,width:0}});
  slide.addText('TO-BE (목표)',{x:tbX+0.1,y:sY,w:colW-0.2,h:0.35,fontFace:FONT_BODY,fontSize:11,bold:true,color:C.white,align:'center',valign:'middle',margin:0});
  slide.addShape('rect',{x:tbX,y:sY+0.35,w:colW,h:colH-0.35,fill:{color:C.white},line:{color:C.orange,width:0.75}});
  slide.addText(data.toBe,{x:tbX+0.1,y:sY+0.45,w:colW-0.2,h:colH-0.55,fontFace:FONT_BODY,fontSize:10,color:C.ink,valign:'top',margin:0});
  // Strategy bar (bottom)
  const stY=sY+colH+0.12;
  calloutBand(slide,stY,[{text:'Gap 해소 전략 — ',options:{bold:true,color:C.orange}},{text:data.strategy,options:{color:C.ink}}]);
}


// ============================================================================
//  MICRO BUILDING BLOCKS — freely composable primitives
// ============================================================================

/** Flow box — rectangular process step */
function flowBox(slide,x,y,w,h,text,opts={}){
  const fill=opts.fill||C.white, border=opts.border||C.orange, textColor=opts.textColor||C.ink;
  slide.addText(text,{shape:opts.rounded?'roundRect':'rect',rectRadius:opts.rounded?0.05:0,x,y,w,h,fill:{color:fill},line:{color:border,width:opts.lineW||0.75},fontFace:opts.font||FONT_BODY,fontSize:opts.fontSize||10,bold:opts.bold!==false,color:textColor,align:opts.align||'center',valign:'middle',margin:0});
}

/** Flow arrow — directional connector between elements */
function flowArrow(slide,x1,y1,x2,y2,opts={}){
  const color=opts.color||C.orange, dashed=opts.dashed||false;
  if(y1===y2){
    // Horizontal
    const text=opts.label||'→';
    slide.addText(text,{x:Math.min(x1,x2),y:y1-0.12,w:Math.abs(x2-x1),h:0.24,fontFace:FONT_BODY,fontSize:opts.fontSize||12,color,align:'center',valign:'middle',margin:0});
  } else if(x1===x2){
    // Vertical
    const text=opts.label||(y2>y1?'▼':'▲');
    slide.addText(text,{x:x1-0.12,y:Math.min(y1,y2),w:0.24,h:Math.abs(y2-y1),fontFace:FONT_BODY,fontSize:opts.fontSize||10,color,align:'center',valign:'middle',margin:0});
  } else {
    // L-shaped: horizontal then vertical
    const midX=(x1+x2)/2;
    slide.addShape('rect',{x:x1,y:y1-0.01,w:midX-x1,h:0.02,fill:{color},line:{color,width:0}});
    slide.addShape('rect',{x:midX-0.01,y:Math.min(y1,y2),w:0.02,h:Math.abs(y2-y1),fill:{color},line:{color,width:0}});
    slide.addShape('rect',{x:midX,y:y2-0.01,w:x2-midX,h:0.02,fill:{color},line:{color,width:0}});
  }
}

/** Decision box — diamond-like shape for Y/N branching */
function decisionBox(slide,x,y,w,h,text,opts={}){
  slide.addShape('rect',{x,y,w,h,fill:{color:opts.fill||C.peach},line:{color:C.orange,width:1},rotate:0});
  slide.addText(text,{x:x+0.04,y,w:w-0.08,h,fontFace:FONT_BODY,fontSize:9,bold:true,color:C.orange,align:'center',valign:'middle',margin:0});
}

/** Annotated item — numbered/lettered annotation with title + description */
function annotItem(slide,x,y,w,num,title,desc,opts={}){
  const badgeSize=0.28, badgeFill=opts.badgeFill||C.orange;
  // Badge
  slide.addShape('ellipse',{x,y:y+0.02,w:badgeSize,h:badgeSize,fill:{color:badgeFill},line:{color:badgeFill,width:0}});
  slide.addText(num,{x,y:y+0.02,w:badgeSize,h:badgeSize,fontFace:FONT_BODY,fontSize:9,bold:true,color:C.white,align:'center',valign:'middle',margin:0});
  // Title + desc
  slide.addText(title,{x:x+badgeSize+0.08,y,w:w-badgeSize-0.12,h:0.24,fontFace:FONT_BODY,fontSize:10,bold:true,color:C.ink,valign:'middle',margin:0});
  if(desc) slide.addText(desc,{x:x+badgeSize+0.08,y:y+0.24,w:w-badgeSize-0.12,h:opts.descH||0.4,fontFace:FONT_BODY,fontSize:9,color:C.textLight,valign:'top',margin:0});
}

/** Actor icon — person silhouette with label */
function actorIcon(slide,x,y,label,opts={}){
  const size=opts.size||0.35;
  // Head
  slide.addShape('ellipse',{x:x+size*0.3,y,w:size*0.4,h:size*0.4,fill:{color:opts.color||C.ink},line:{color:opts.color||C.ink,width:0}});
  // Body
  slide.addShape('rect',{x:x+size*0.15,y:y+size*0.42,w:size*0.7,h:size*0.5,fill:{color:opts.color||C.ink},line:{color:opts.color||C.ink,width:0},rectRadius:0.03});
  // Label
  slide.addText(label,{x:x-0.2,y:y+size+0.02,w:size+0.4,h:0.22,fontFace:FONT_BODY,fontSize:7.5,color:C.ink,align:'center',valign:'top',margin:0});
}

/** Phase banner — section header across slide width */
function phaseBanner(slide,x,y,w,label,opts={}){
  const h=opts.h||0.32, fill=opts.fill||C.orange;
  slide.addText(label,{shape:'rect',x,y,w,h,fill:{color:fill},line:{color:fill,width:0},fontFace:FONT_BODY,fontSize:opts.fontSize||11,bold:true,color:C.white,align:opts.align||'center',valign:'middle',margin:0});
}

/** Milestone tag — M1/M2/M3 badge */
function milestoneTag(slide,x,y,code,opts={}){
  const w=opts.w||0.4,h=opts.h||0.28;
  slide.addText(code,{shape:'roundRect',rectRadius:0.04,x,y,w,h,fill:{color:C.orange},line:{color:C.orangeDeep,width:0.5},fontFace:FONT_BODY,fontSize:9,bold:true,color:C.white,align:'center',valign:'middle',margin:0});
}

/** Callout box — highlighted note with colored left border */
function calloutNote(slide,x,y,w,h,text,opts={}){
  const accentColor=opts.accent||C.orange;
  slide.addShape('rect',{x,y,w:0.05,h,fill:{color:accentColor},line:{color:accentColor,width:0}});
  slide.addText(text,{shape:'rect',x:x+0.07,y,w:w-0.07,h,fill:{color:opts.fill||C.peachLight},line:{color:C.grayLine,width:0.5},fontFace:FONT_BODY,fontSize:opts.fontSize||9,color:C.text,valign:'middle',margin:0});
}

/** Grade badge row — MD/D/SM/M/SA/A hierarchy indicator */
function gradeBadges(slide,x,y,grades,activeRange,opts={}){
  const bW=opts.bw||0.4,bH=opts.bh||0.26,gap=0.03;
  grades.forEach((g,i)=>{
    const gx=x+i*(bW+gap);
    const active=i>=activeRange[0]&&i<=activeRange[1];
    slide.addShape('rect',{x:gx,y,w:bW,h:bH,fill:{color:active?C.orange:C.grayBg},line:{color:active?C.orange:C.grayLine,width:0.5}});
    slide.addText(g,{x:gx,y,w:bW,h:bH,fontFace:FONT_BODY,fontSize:8,bold:true,color:active?C.white:C.muted,align:'center',valign:'middle',margin:0});
  });
}

/** Result band — bottom strip with arrow-chained outcomes */
function resultBand(slide,y,items,opts={}){
  const startX=opts.x||0.4,w=opts.w||9.2,h=opts.h||0.35;
  slide.addShape('rect',{x:startX,y,w,h,fill:{color:opts.fill||C.orange},line:{color:opts.fill||C.orange,width:0}});
  const text=items.join('  →  ');
  slide.addText(text,{x:startX+0.12,y,w:w-0.24,h,fontFace:FONT_BODY,fontSize:opts.fontSize||10,bold:true,color:C.white,align:'center',valign:'middle',margin:0});
}

/** Dashed box — optional/conditional area */
function dashedBox(slide,x,y,w,h,text,opts={}){
  slide.addShape('rect',{x,y,w,h,fill:{color:'FFFFFF'},line:{color:opts.color||C.grayLine,width:0.75,dashType:'dash'}});
  if(text) slide.addText(text,{x:x+0.06,y,w:w-0.12,h,fontFace:FONT_BODY,fontSize:8.5,color:C.muted,align:'center',valign:'middle',margin:0});
}

/** Vertical separator line */
function splitLine(slide,x,y1,y2,opts={}){
  slide.addShape('rect',{x:x-0.01,y:y1,w:0.02,h:y2-y1,fill:{color:opts.color||C.grayLine},line:{color:opts.color||C.grayLine,width:0}});
}

/** Section panel — colored left/right/top panel with optional header */
function sectionPanel(slide,x,y,w,h,opts={}){
  const headerH=opts.headerH||0.32;
  if(opts.header){
    slide.addText(opts.header,{shape:'rect',x,y,w,h:headerH,fill:{color:opts.headerFill||C.ink},line:{color:opts.headerFill||C.ink,width:0},fontFace:FONT_BODY,fontSize:opts.headerFontSize||10,bold:true,color:C.white,valign:'middle',margin:0});
  }
  const bodyY=opts.header?y+headerH:y, bodyH=opts.header?h-headerH:h;
  if(opts.body!==undefined){
    // body 텍스트(문자열 또는 런 배열)를 배경 박스에 직접 작성 — 단일 오브젝트
    slide.addText(opts.body,{shape:'rect',x,y:bodyY,w,h:bodyH,fill:{color:opts.fill||C.white},line:{color:opts.border||C.grayLine,width:0.75},fontFace:FONT_BODY,fontSize:opts.bodyFontSize||9,color:C.text,align:opts.bodyAlign||'left',valign:opts.bodyValign||'top',margin:0});
  } else {
    slide.addShape('rect',{x,y:bodyY,w,h:bodyH,fill:{color:opts.fill||C.white},line:{color:opts.border||C.grayLine,width:0.75}});
  }
}

/** 번호 원형 뱃지 — '01' '02' 오렌지 원 (첨부 마일스톤·핵심액션 넘버링) */
function numBadge(slide,x,y,num,opts={}){
  const d=opts.size||0.32;
  slide.addText(num,{shape:'ellipse',x,y,w:d,h:d,fill:{color:opts.fill||C.orange},line:{color:opts.fill||C.orange,width:0},fontFace:FONT_BODY,fontSize:opts.fontSize||9,bold:true,color:C.white,align:'center',valign:'middle',margin:0});
}

/** 수치 강조 카드 — 레이블 + 대형 오렌지 수치 + 보조 캡션 (첨부 KPI·목표 카드) */
function statCard(slide,x,y,w,h,label,value,caption,opts={}){
  const runs=[
    {text:label,options:{fontSize:opts.labelSize||9,bold:true,color:C.ink,breakLine:true}},
    {text:value,options:{fontSize:opts.valueSize||15,bold:true,color:C.orange,breakLine:!!caption}},
  ];
  if(caption) runs.push({text:caption,options:{fontSize:8,color:C.textLight}});
  slide.addText(runs,{shape:'rect',x,y,w,h,fill:{color:opts.fill||C.white},line:{color:opts.border||C.grayLine,width:0.75},fontFace:FONT_BODY,align:'center',valign:'middle',margin:0});
}

/** 하단 아이콘 밴드 — 아이콘+제목+캡션 그룹을 가로 배열 (첨부 최하단 요약 밴드) */
async function iconBand(slide,y,items,opts={}){
  const n=items.length,startX=0.4,totalW=9.2,gap=0.15;
  const itemW=(totalW-gap*(n-1))/n, iconD=0.34;
  for(let i=0;i<n;i++){
    const it=items[i], x=startX+i*(itemW+gap);
    if(it.icon) slide.addImage({data:await iconPng(it.icon),x:x+0.05,y:y+0.05,w:iconD,h:iconD});
    slide.addText(it.title,{x:x+(it.icon?iconD+0.15:0.05),y,w:itemW-(it.icon?iconD+0.2:0.1),h:0.26,fontFace:FONT_BODY,fontSize:10,bold:true,color:C.ink,valign:'middle',margin:0});
    if(it.caption) slide.addText(it.caption,{x:x+(it.icon?iconD+0.15:0.05),y:y+0.25,w:itemW-(it.icon?iconD+0.2:0.1),h:0.24,fontFace:FONT_BODY,fontSize:8.5,color:C.textLight,valign:'top',margin:0});
    if(i<n-1&&opts.divider!==false) slide.addShape('line',{x:x+itemW+gap/2,y:y+0.03,w:0,h:0.44,line:{color:C.grayLine,width:0.75}});
  }
}


// ============================================================================
//  BUILD — 48 example slides + 3 complex compositions
// ============================================================================

// ============================================================================
//  BUILD — 호반 JHA PoC 구성(안) 검토 덱 (18 slides)
// ============================================================================
async function build(){
  const pres=new pptxgen();
  pres.layout='LAYOUT_16x9'; pres.author=DECK.footerBrand; pres.title=DECK.title;
  let pg=0;

  // ── 1. 표지 (coverSamil) ───────────────────────────────────────────────
  { pg++; const s=pres.addSlide();
    await coverSamil(s,{
      title:'호반그룹 작업위험성평가(JHA)\nAI 에이전트 PoC 구성(안)',
      subtitle:'PoC 구성 검토 요청 — 오픈이노베이션팀·EHS 부서 협의용',
      date:'2026. 06',
      brandName:'삼일회계법인',
    });
  }

  // ── 2. 목차 (contentsList) ─────────────────────────────────────────────
  { pg++; const s=pres.addSlide(); s.background={color:C.white};
    contentsList(s,[
      {label:'추진 배경 — As-Is 문제와 To-Be 목표상',page:'03'},
      {label:'PoC 개요 — 범위·데모 시나리오·사용자 여정',page:'05'},
      {label:'데이터 구성 — 전사 위험요인 자산화·파이프라인',page:'08'},
      {label:'AI 에이전트 아키텍처 — RAG·가드레일·연동',page:'12'},
      {label:'검증 현황 — 메커니즘 검증 vs 실 LLM 보류',page:'15'},
      {label:'검토 요청 사항 — 함께 결정할 안건',page:'18'},
    ]);
    addFooter(s,pg);
  }

  // ════════════════ 섹션 1 — 추진 배경 ════════════════
  { pg++; const s=pres.addSlide(); sectionDividerContent(s,'01','추진 배경','수기 위험성평가의 한계를 자연어·AI 추천 구조로 전환'); addFooter(s,pg); }

  // ── 4. As-Is 3대 Pain Point → To-Be (gapAnalysis 변형: 좌 As-Is / 우 To-Be) ──
  { pg++; const s=pres.addSlide(); s.background={color:C.white};
    addTitle(s,'추진 배경 — As-Is의 3대 부담을 AI 추천 구조로 전환',
      '현 위험성평가는 수기 입력·수동 검색·주관적 등급에 의존해 업무 부하·역량 편차·데이터 휘발이 누적됨. 자연어 입력 → AI 분류·기준 제안 → 객관적 등급 가이드 → ERP 자동 등록 구조로 전환 필요.');
    // As-Is 3 pain cards (좌)
    const LX=0.4, LW=4.35, RX=5.05, RW=4.55, topY=1.55;
    sectionPanel(s,LX,topY,LW,0.34,{header:'As-Is — 현 위험성평가의 부담',headerFill:C.grayDark,headerFontSize:11});
    const pains=[
      {t:'업무 부하',d:'작업마다 위험요인·대책을 수기 입력. 과거 자료를 수동 검색해 재작성 — 평가 1건당 시간 과다'},
      {t:'개인 역량 편차',d:'담당자 경험에 따라 위험요인 누락·등급 산정이 주관적. 평가 품질이 사람마다 다름'},
      {t:'데이터 휘발',d:'작성된 평가가 문서로만 남아 재사용·축적 안 됨. 조직 지식으로 자산화되지 못함'},
    ];
    let py=topY+0.42;
    pains.forEach((p,i)=>{
      const h=0.92;
      numBadge(s,LX+0.05,py+0.05,String(i+1),{size:0.3});
      s.addText([
        {text:p.t+'\n',options:{fontSize:11,bold:true,color:C.ink}},
        {text:p.d,options:{fontSize:9,color:C.textLight}},
      ],{shape:'rect',x:LX+0.45,y:py,w:LW-0.5,h:h,fill:{color:C.grayLight},line:{color:C.grayLine,width:0.5},valign:'middle',margin:0,fontFace:FONT_BODY});
      py+=h+0.1;
    });
    // To-Be (우)
    sectionPanel(s,RX,topY,RW,0.34,{header:'To-Be — AI 에이전트 지원 목표상',headerFill:C.orange,headerFontSize:11});
    const tobe=[
      {t:'자연어 입력 → AI 분류',d:'작업 내용 한 줄 입력 → 대/중공종·세부항목 자동 분류 추천'},
      {t:'기준 제안 → 객관적 등급',d:'위험요인·재해형태·KRAS 5×5 등급을 데이터 근거로 제시'},
      {t:'검토·확정 → ERP 자동 등록',d:'안전관리자 검토 후 ERP 자동 등록. 평가가 조직 자산으로 축적'},
    ];
    let ty=topY+0.42;
    tobe.forEach((t,i)=>{
      const h=0.92;
      numBadge(s,RX+0.05,ty+0.05,String(i+1),{size:0.3});
      s.addText([
        {text:t.t+'\n',options:{fontSize:11,bold:true,color:C.orangeDeep}},
        {text:t.d,options:{fontSize:9,color:C.text}},
      ],{shape:'rect',x:RX+0.45,y:ty,w:RW-0.5,h:h,fill:{color:C.peachLight},line:{color:C.orange,width:0.5},valign:'middle',margin:0,fontFace:FONT_BODY});
      ty+=h+0.1;
    });
    calloutBand(s,4.92,[
      {text:'핵심 AI 기술 — ',options:{bold:true,color:C.orange}},
      {text:'LLM(자연어 이해) · RAG(사내 위험요인 검색·근거) · Semantic Search · Agentic Workflow. 단, 사용자가 항상 수정·거절 가능해야 함(제약사항).',options:{color:C.ink}},
    ],{h:0.46});
    addFooter(s,pg);
  }

  // ════════════════ 섹션 2 — PoC 개요 ════════════════
  { pg++; const s=pres.addSlide(); sectionDividerContent(s,'02','PoC 개요','자연어 입력부터 ERP 등록까지 5단계 파이프라인을 데모로 시연'); addFooter(s,pg); }

  // ── 6. PoC 범위 — 5단계 파이프라인 (processChevron) + 사용자 여정 ──
  { pg++; const s=pres.addSlide(); s.background={color:C.white};
    addTitle(s,'PoC 범위 — 입력부터 등록까지 5단계 파이프라인',
      '자연어 입력 → 분류 → 위험요인·등급 → 검토·확정 → ERP 등록의 단일 흐름을 PoC 범위로 정의. 작업자는 입력·검토, 안전관리자는 확정·등록 책임을 가지는 역할 분기 구조.');
    processChevron(s,[
      {label:'자연어 입력'},{label:'AI 분류'},{label:'위험요인·등급'},{label:'검토·확정'},{label:'ERP 등록'},
    ],1.55,{h:0.7});
    // 단계별 설명 카드
    const cards=[
      {t:'자연어 입력',d:'작업 내용 한 줄 입력. 동의어 정규화(낙상→추락)'},
      {t:'AI 분류',d:'대공종20·중공종254·세부1,182 트리 추천 + 대안'},
      {t:'위험요인·등급',d:'재해형태·KRAS 5×5 등급·중점등록·개선대책'},
      {t:'검토·확정',d:'안전관리자 검토. 경계셀·필수인용은 확정 게이트'},
      {t:'ERP 등록',d:'확정분만 ERP 자동 등록(Outbox·Idempotency)'},
    ];
    const n=cards.length, gap=0.06, cw=(9.2-gap*(n-1))/n, cy=2.45;
    cards.forEach((c,i)=>{
      const x=0.4+i*(cw+gap);
      s.addText([
        {text:c.t+'\n',options:{fontSize:9.5,bold:true,color:C.orange}},
        {text:c.d,options:{fontSize:8,color:C.text}},
      ],{shape:'rect',x,y:cy,w:cw,h:1.15,fill:{color:C.white},line:{color:C.grayLine,width:0.5},valign:'top',margin:0,fontFace:FONT_BODY});
    });
    // 역할 분기 밴드
    sectionPanel(s,0.4,3.85,4.55,1.0,{header:'작업자(worker)',headerFill:C.ink,headerFontSize:10,
      body:'자연어 입력 · 분류/평가 결과 검토 요청\n등급·중점등록 자동 확정 권한 없음\n(경계셀·필수인용 미해소 시 등록 차단)',bodyFontSize:9});
    sectionPanel(s,5.05,3.85,4.55,1.0,{header:'안전관리자(safety_manager)',headerFill:C.orange,headerFontSize:10,
      body:'경계셀·필수인용 확정 · 최종 검토 · ERP 등록 승인\n사람 확인 전 ERP 자동 등록 불가\n모든 AI 추천 수정·거절 가능',bodyFontSize:9});
    addFooter(s,pg);
  }

  // ── 7. 데모 시나리오 5건 (checkmarkGrid 스타일 테이블) ──
  { pg++; const s=pres.addSlide(); s.background={color:C.white};
    addTitle(s,'데모 시나리오 — 난이도·재해형태·가드레일을 다양화한 5건',
      '추락·붕괴·복합재해·갭(밀폐공간)을 고루 포함해 분류·등급·인용·refuse 거동을 시연. Mock 어댑터로 외부 LLM 호출 없이 결정적 재현 가능.');
    const rows=[
      ['① 타워크레인 해체','가설공사 / 타워크레인(T형)','추락·낙하·협착','상(경계셀)','경계셀 → 안전관리자 확정 게이트'],
      ['② 굴착 흙막이 가시설','토공 및 가시설 / 굴착','붕괴·도괴·전도','중~상','표준 정상 등록 플로우'],
      ['③ 거푸집·동바리','골조(형틀) / 보 슬래브','낙하·붕괴·추락','중~상','인용 원문 패널 연동'],
      ['④ 고소 강교 용접','토목 전문공사 / 강교설치','추락·감전·화재','중~상','복합재해 다중 법적 인용'],
      ['⑤ 밀폐공간(E/V PIT·맨홀)','부대토목 / 맨홀','추락·질식','상 후보','갭 영역 refuse 가드레일'],
    ];
    const cols=[{w:2.0,l:'시나리오'},{w:2.6,l:'기대 분류'},{w:1.8,l:'재해형태'},{w:1.0,l:'등급'},{w:1.8,l:'시연 포인트'}];
    let sx=0.4, sy=1.55, rh=0.46;
    let cx=sx; cols.forEach(c=>{
      s.addText(c.l,{shape:'rect',x:cx,y:sy,w:c.w,h:rh,fill:{color:C.ink},line:{color:C.ink,width:0},fontFace:FONT_BODY,fontSize:9.5,bold:true,color:C.white,align:'center',valign:'middle',margin:0}); cx+=c.w;
    });
    rows.forEach((r,ri)=>{
      cx=sx; const y=sy+rh+ri*rh, alt=ri%2===0?C.white:C.peachLight;
      r.forEach((v,ci)=>{
        s.addText(v,{shape:'rect',x:cx,y,w:cols[ci].w,h:rh,fill:{color:alt},line:{color:C.grayLine,width:0.5},fontFace:FONT_BODY,fontSize:8.5,bold:ci===0,color:ci===0?C.orangeDeep:C.ink,align:ci===0?'left':'center',valign:'middle',margin:0}); cx+=cols[ci].w;
      });
    });
    calloutNote(s,0.4,sy+rh*6+0.2,9.2,0.55,'시나리오 ①·⑤가 핵심 데모 — ①은 경계셀 자동확정 금지(3중 강제), ⑤는 데이터 갭 영역에서 근거 없는 대책을 생성하지 않는 refuse 가드레일을 시연함.',{accent:C.orange,fontSize:9.5});
    addFooter(s,pg);
  }

  // ════════════════ 섹션 3 — 데이터 구성 ════════════════
  { pg++; const s=pres.addSlide(); sectionDividerContent(s,'03','데이터 구성','전사 위험요인 4,469행을 정제·청킹·인덱스로 자산화'); addFooter(s,pg); }

  // ── 9. 데이터 자산 개요 (statCard 4종 + 분포) ──
  { pg++; const s=pres.addSlide(); s.background={color:C.white};
    addTitle(s,'데이터 구성 — 전사 위험요인 4,469행을 단일 자산으로',
      '대공종 20·중공종 254·세부항목 1,182·재해형태 21의 3계층 분류 체계. 결측 0건·범위위반 0건·인코딩 손상 0건으로 정제 품질 확보됨(openpyxl 실측).');
    const cards=[
      {l:'총 데이터 행',v:'4,469',c:'결측 0 / 중복 0'},
      {l:'분류 3계층',v:'20·254·1,182',c:'대/중공종·세부항목'},
      {l:'재해형태',v:'21종',c:'KRAS 표준'},
      {l:'위험등급 분포',v:'하2,444·중1,507·상518',c:'상=중점등록 518'},
    ];
    const n=cards.length, gap=0.15, cw=(9.2-gap*(n-1))/n, cy=1.55;
    cards.forEach((c,i)=>{ statCard(s,0.4+i*(cw+gap),cy,cw,1.0,c.l,c.v,c.c,{valueSize:i===1||i===3?13:18}); });
    // 재해형태 TOP — 6대 사망사고 매핑
    sectionPanel(s,0.4,2.75,9.2,0.34,{header:'6대 사망사고 다발 재해형태 (행수 / 등급 상 행수)',headerFill:C.orange,headerFontSize:10});
    const haz=[
      {t:'추락',d:'792행 / 상168'},{t:'낙하·비래',d:'874행 / 상82'},{t:'전도',d:'685행 / 상77'},
      {t:'협착',d:'525행 / 상66'},{t:'붕괴·도괴',d:'197행 / 상31'},{t:'충돌',d:'343행 / 상32'},
    ];
    const hn=haz.length, hgap=0.1, hw=(9.2-hgap*(hn-1))/hn, hy=3.15;
    haz.forEach((h,i)=>{
      const x=0.4+i*(hw+hgap);
      s.addText([
        {text:h.t+'\n',options:{fontSize:10,bold:true,color:C.ink}},
        {text:h.d,options:{fontSize:8.5,color:C.orangeDeep}},
      ],{shape:'rect',x,y:hy,w:hw,h:0.7,fill:{color:C.peachLight},line:{color:C.orange,width:0.5},align:'center',valign:'middle',margin:0,fontFace:FONT_BODY});
    });
    calloutNote(s,0.4,4.05,9.2,0.8,'등급 상 518행의 재해형태 TOP4(추락·전도·낙하·협착)가 전체 상의 73.8%. 데모·평가는 이 4종에 집중함. 단 토목·가설 편중(52.1%)으로 밀폐공간·화학물질 등은 데이터가 얕아 갭 영역으로 분리 처리(refuse 대상).',{accent:C.orange,fontSize:9.5});
    addFooter(s,pg);
  }

  // ── 10. KRAS 5×5 등급 체계 + 자산화 파이프라인 + 보안 ──
  { pg++; const s=pres.addSlide(); s.background={color:C.white};
    addTitle(s,'데이터 구성 — KRAS 5×5 등급 체계와 자산화 파이프라인',
      '실데이터 전수 역산으로 등급 임계곱 확정(하≤9 / 중10~15 / 상≥16). 곱16(강도4×빈도4)만 상·중 혼합인 경계셀로, 자동 확정하지 않고 안전관리자 판단에 위임.');
    const LX=0.4, LW=4.35, RX=5.05, RW=4.55, topY=1.5;
    // 등급 임계곱 표 (좌)
    sectionPanel(s,LX,topY,LW,0.32,{header:'등급 임계곱 (실데이터 역산 · 99.22% 재현)',headerFill:C.ink,headerFontSize:10});
    const grades=[
      {g:'하 (Low)',r:'강도 × 빈도 ≤ 9',n:'2,444행',c:C.greenLight},
      {g:'중 (Medium)',r:'10 ≤ 강도 × 빈도 ≤ 15',n:'1,507행',c:C.warnLight},
      {g:'상 (High)',r:'강도 × 빈도 ≥ 16',n:'518행 (전부 중점등록 O)',c:C.orangeVLight},
      {g:'경계셀',r:'강도4 × 빈도4 = 16 (상249/중35)',n:'자동확정 금지·인간 판단',c:C.redLight},
    ];
    let gy=topY+0.4;
    grades.forEach(gd=>{
      s.addText([
        {text:gd.g+'  ',options:{fontSize:10,bold:true,color:C.ink}},
        {text:gd.r+'\n',options:{fontSize:9,color:C.text}},
        {text:gd.n,options:{fontSize:8.5,color:C.orangeDeep,bold:true}},
      ],{shape:'rect',x:LX,y:gy,w:LW,h:0.66,fill:{color:gd.c},line:{color:C.grayLine,width:0.5},valign:'middle',margin:0,fontFace:FONT_BODY});
      gy+=0.74;
    });
    // 파이프라인 + 보안 (우)
    sectionPanel(s,RX,topY,RW,0.32,{header:'데이터 자산화 파이프라인',headerFill:C.orange,headerFontSize:10});
    const steps=[
      {t:'정제·정규화',d:'선행 불릿 제거·다중공백 단일화·동의어 정규화·분류 ID 부여(MJ/SB/DT)'},
      {t:'행 단위 청킹',d:'4,469행 → 행 단위 청크 + 메타데이터 inline(분류·등급·인용 추적)'},
      {t:'BM25 인덱스',d:'kiwipiepy 토크나이저 BM25 인덱스(PoC 베이스라인). dense 임베딩은 차기'},
    ];
    let sy=topY+0.4;
    steps.forEach((st,i)=>{
      numBadge(s,RX+0.05,sy+0.05,String(i+1),{size:0.28});
      s.addText([
        {text:st.t+'\n',options:{fontSize:9.5,bold:true,color:C.orangeDeep}},
        {text:st.d,options:{fontSize:8.5,color:C.text}},
      ],{shape:'rect',x:RX+0.42,y:sy,w:RW-0.45,h:0.62,fill:{color:C.white},line:{color:C.grayLine,width:0.5},valign:'middle',margin:0,fontFace:FONT_BODY});
      sy+=0.7;
    });
    calloutNote(s,RX,sy+0.02,RW,0.62,'보안 — PII 0건(작업자 정보 미포함) · 외부 LLM 화이트리스트 필터 강제 · 위반 필드 탐지 시 외부 전송 중단',{accent:C.orange,fontSize:8.5});
    addFooter(s,pg);
  }

  // ── 11. Data Pipeline 구성계획 — 안전관리자 CRUD → 자동 재인덱싱 ──
  { pg++; const s=pres.addSlide(); s.background={color:C.white};
    addTitle(s,'데이터 구성 — 운영 가능한 Data Pipeline 구성계획',
      '안전관리자가 위험요인 데이터를 직접 관리하면 무결성 강제·자동 재인덱싱을 거쳐 AI 지식베이스가 즉시 갱신되는 운영 파이프라인을 구성함. 타 현장 우수사례·신규 위험요인이 휘발되지 않고 전사 지식자산으로 축적됨.');
    // ── 좌→우 5단계 흐름 다이어그램 (단계 헤더 + 구축/계획 상태 태그) ──
    const stageY=1.5, stageH=1.35, gap=0.05;
    const stages=[
      {n:'01',t:'원천 데이터',d:'전사 위험요인\nExcel 4,469행\n(불변 보존)',st:'구축 완료',built:true},
      {n:'02',t:'운영 CRUD',d:'안전관리자 전용\n관리화면 — 검색·\n필터·행 생성/수정/삭제',st:'구성 계획',built:false},
      {n:'03',t:'무결성 강제',d:'서버 등급 재계산·\n중점등록 자동연동·\n경계셀 판단 플래그',st:'구성 계획',built:false},
      {n:'04',t:'자동 재인덱싱',d:'재청킹·재인덱싱\n→ 무중단 교체\n→ AI 답변 즉시반영',st:'구성 계획',built:false},
      {n:'05',t:'AI 지식베이스',d:'BM25 검색 인덱스\n갱신 → RAG 검색에\n즉시 활용',st:'구축 완료',built:true},
    ];
    const sn=stages.length, sw=(9.2-gap*(sn-1))/sn;
    stages.forEach((sg,i)=>{
      const x=0.4+i*(sw+gap);
      const accent=sg.built?C.orange:C.orangeDeep;
      // 단계 헤더 (번호+제목) — 단일 오브젝트
      s.addText([
        {text:sg.n+'  ',options:{fontSize:11,bold:true,color:C.white}},
        {text:sg.t,options:{fontSize:9.5,bold:true,color:C.white}},
      ],{shape:'rect',x,y:stageY,w:sw,h:0.34,fill:{color:accent},line:{color:accent,width:0},valign:'middle',align:'center',margin:0,fontFace:FONT_BODY});
      // 본문 + 상태 태그 — 단일 오브젝트
      s.addText([
        {text:sg.d+'\n',options:{fontSize:8.3,color:C.text,breakLine:true}},
        {text:(sg.built?'● ':'◆ ')+sg.st,options:{fontSize:8,bold:true,color:accent}},
      ],{shape:'rect',x,y:stageY+0.34,w:sw,h:stageH-0.34,fill:{color:sg.built?C.peachLight:C.white},line:{color:accent,width:sg.built?0.5:1,dashType:sg.built?'solid':'dash'},valign:'top',align:'center',margin:4,fontFace:FONT_BODY});
      // 흐름 화살표
      if(i<sn-1) s.addText('▶',{x:x+sw-0.02,y:stageY+0.34+(stageH-0.34)/2-0.12,w:0.1,h:0.24,fontFace:FONT_BODY,fontSize:9,bold:true,color:C.orange,align:'center',valign:'middle',margin:0});
    });
    // ── 무결성 자동 강제 상세 밴드 ──
    calloutBand(s,3.05,[
      {text:'무결성 자동 강제 — ',options:{bold:true,color:C.orange}},
      {text:'등급은 강도×빈도 임계곱(하≤9 / 중10~15 / 상≥16)으로 서버가 재계산, 중점등록=등급‘상’ 자동 연동, 곱16 경계셀은 인간판단 플래그. 입력 실수가 지식베이스를 오염시키지 않는 구조.',options:{color:C.ink}},
    ],{h:0.5});
    // ── 권한·감사 / 품질 게이트 2분할 ──
    const LX=0.4, LW=4.55, RX=5.05, RW=4.55, dY=3.7;
    sectionPanel(s,LX,dY,LW,1.0,{header:'권한 게이트 · 변경 감사',headerFill:C.ink,headerFontSize:10,
      body:'· 데이터 관리화면 접근 — 안전관리자·관리자만(역할 게이트)\n· 행 생성/수정/삭제 전체 변경 감사 이력 기록\n· 작업자는 조회 불가 — 운영 데이터 오염 차단',bodyFontSize:8.7});
    sectionPanel(s,RX,dY,RW,1.0,{header:'품질 게이트 · 안전 폴백',headerFill:C.orange,headerFontSize:10,
      body:'· 변경 비율 5% 초과 시 회귀 평가 권고 플래그\n· 재인덱싱 실패 시 이전 인덱스 유지(안전 폴백)\n· 무중단 교체 — 서비스 중단 없이 AI 답변 갱신',bodyFontSize:8.7});
    // ── 운영 효과 1줄 (고객 Problem #3 대응) ──
    calloutNote(s,0.4,4.82,9.2,0.42,'운영 효과 — 타 현장 우수사례·신규 위험요인이 문서로만 남아 휘발되던 구조(Problem #3 “데이터 휘발”)를, 안전관리자 입력→자동 자산화 루프로 전환. 신규 계획부는 구성 계획(구현 중)으로 정직 구분 표기함.',{accent:C.orangeDeep,fontSize:8.7});
    addFooter(s,pg);
  }

  // ════════════════ 섹션 4 — AI 에이전트 아키텍처 ════════════════
  { pg++; const s=pres.addSlide(); sectionDividerContent(s,'04','AI 에이전트 아키텍처','RAG 파이프라인·신뢰성 가드레일·Human-in-the-loop·ERP 연동'); addFooter(s,pg); }

  // ── 12. RAG 파이프라인 (processChevron + 어댑터 격리) ──
  { pg++; const s=pres.addSlide(); s.background={color:C.white};
    addTitle(s,'AI 아키텍처 — RAG 파이프라인 7단계 (검색→생성→검산)',
      '의도추출·메타필터로 검색공간을 4,469행에서 수십 건으로 축소 후 LLM이 추천. 등급·중점등록·인용은 LLM을 신뢰하지 않고 백엔드가 결정적으로 재계산·검증함.');
    processChevron(s,[
      {label:'의도추출·정규화'},{label:'메타 prefilter'},{label:'하이브리드 검색'},{label:'LLM 생성'},{label:'후처리 검산'},
    ],1.55,{h:0.7});
    const cards=[
      {t:'의도추출·정규화',d:'작업 입력 → taxonomy 매칭, 동의어 정규화, 비작업 입력 게이트'},
      {t:'메타 prefilter',d:'대/중공종·재해형태 필터로 4,469 → 수십 건 축소(비용·정확도)'},
      {t:'하이브리드 검색',d:'BM25 단독(PoC). top_k 20→5. dense 임베딩은 차기 활성'},
      {t:'LLM 생성',d:'LLM 공급자 추상화(기본 OpenAI gpt-4.1, 모델 env 교체 가능). JSON 스키마 출력·자동 캐싱'},
      {t:'후처리 검산',d:'인용 검증·등급 재계산·경계셀 강제. 코드가 권위'},
    ];
    const n=cards.length, gap=0.06, cw=(9.2-gap*(n-1))/n, cy=2.45;
    cards.forEach((c,i)=>{
      const x=0.4+i*(cw+gap);
      s.addText([
        {text:c.t+'\n',options:{fontSize:9,bold:true,color:C.orange}},
        {text:c.d,options:{fontSize:8,color:C.text}},
      ],{shape:'rect',x,y:cy,w:cw,h:1.3,fill:{color:C.white},line:{color:C.grayLine,width:0.5},valign:'top',margin:0,fontFace:FONT_BODY});
    });
    calloutBand(s,4.0,[
      {text:'모델 의존성 격리 — ',options:{bold:true,color:C.orange}},
      {text:'임베딩·LLM·리랭커를 어댑터 인터페이스로 분리. LLM은 공급자 추상화로 기본 OpenAI gpt-4.1, 모델 env 교체 가능. 교체(예: BM25→dense)는 어댑터 단위로 격리되어 파이프라인 계약 불변.',options:{color:C.ink}},
    ],{h:0.46});
    calloutBand(s,4.56,[
      {text:'동적 위험 확장(차기) — ',options:{bold:true,color:C.orangeDeep}},
      {text:'정적 분류·평가에 현장 위치·실시간 기상·지형 재해 레이어 결합. 외부 공공 API는 provider 추상화로 목업↔실API 교체.',options:{color:C.ink}},
    ],{h:0.46,fill:C.peachLight});
    addFooter(s,pg);
  }

  // ── 13. 신뢰성 가드레일 + Human-in-the-loop ──
  { pg++; const s=pres.addSlide(); s.background={color:C.white};
    addTitle(s,'AI 아키텍처 — 신뢰성 가드레일과 Human-in-the-loop',
      'AI 추천 신뢰성을 코드로 강제. "출처 없이는 답하지 않는다" 원칙하에 인용 강제·등급 재계산·경계셀 인간판단·갭영역 거절을 적용하고, 안전관리자 확정 전 ERP 등록을 차단함.');
    const LX=0.4, LW=4.35, RX=5.05, RW=4.55, topY=1.5;
    sectionPanel(s,LX,topY,LW,0.32,{header:'신뢰성 가드레일 (백엔드 결정적 검증)',headerFill:C.ink,headerFontSize:10});
    const guards=[
      {t:'인용 강제',d:'모든 위험요인·대책에 source_row 인용 필수. 미검색 인용(환각) → 재생성 → 거절'},
      {t:'등급 코드 재계산',d:'강도×빈도를 코드가 재계산. LLM 등급과 불일치 시 코드 우선'},
      {t:'경계셀 인간판단 강제',d:'곱16은 자동 확정 금지. 기본 상(보수적)+안전관리자 확인 플래그'},
      {t:'갭영역 거절',d:'밀폐공간·화학물질·석면은 근거 부족 시 refuse(조문만 표시, 대책 차단)'},
    ];
    let gy=topY+0.4;
    guards.forEach((g,i)=>{
      numBadge(s,LX+0.05,gy+0.05,String(i+1),{size:0.28});
      s.addText([
        {text:g.t+'\n',options:{fontSize:9.5,bold:true,color:C.ink}},
        {text:g.d,options:{fontSize:8.5,color:C.text}},
      ],{shape:'rect',x:LX+0.42,y:gy,w:LW-0.45,h:0.72,fill:{color:C.peachLight},line:{color:C.orange,width:0.5},valign:'middle',margin:0,fontFace:FONT_BODY});
      gy+=0.8;
    });
    // Human-in-the-loop 상태 흐름 (우)
    sectionPanel(s,RX,topY,RW,0.32,{header:'Human-in-the-loop — ERP 등록 게이트',headerFill:C.orange,headerFontSize:10});
    const flow=['평가(ASSESSED)','검토 대기(PENDING_REVIEW)','안전관리자 확정(REVIEWED)','확정(FINALIZED)','ERP 등록(REGISTERING)'];
    let fy=topY+0.42;
    flow.forEach((f,i)=>{
      const last=i===flow.length-1;
      s.addText(f,{shape:'rect',x:RX+0.3,y:fy,w:RW-0.6,h:0.4,fill:{color:last?C.orange:C.white},line:{color:C.orange,width:0.75},fontFace:FONT_BODY,fontSize:9.5,bold:true,color:last?C.white:C.ink,align:'center',valign:'middle',margin:0});
      if(i<flow.length-1) s.addText('▼',{x:RX+RW/2-0.15,y:fy+0.4,w:0.3,h:0.18,fontFace:FONT_BODY,fontSize:11,color:C.orange,align:'center',margin:0});
      fy+=0.58;
    });
    calloutNote(s,RX,fy+0.0,RW,0.5,'경계셀·필수인용 미해소 레코드는 finalize 409 차단 + 어댑터 ErpFatal 이중 게이트. 사람 확인 없이 ERP 자동 등록 불가.',{accent:C.orange,fontSize:8.5});
    addFooter(s,pg);
  }

  // ════════════════ 섹션 5 — 검증 현황 ════════════════
  { pg++; const s=pres.addSlide(); sectionDividerContent(s,'05','검증 현황','실 LLM baseline 실측 — 핵심 품질축 임계 충족, 인용 정밀축은 측정방법 개선 과제'); addFooter(s,pg); }

  // ── 15. 검증 현황 — 실 LLM baseline 실측 결과 (메트릭 표 + FAIL 해석) ──
  { pg++; const s=pres.addSlide(); s.background={color:C.white};
    addTitle(s,'검증 현황 — 실 LLM(gpt-4.1) baseline 실측 결과',
      '실 LLM baseline에서 분류·위험요인 포착·거절·근거충실 등 핵심 품질축이 임계를 충족함을 확인. 인용 정밀 2개 축은 미달이나 원인은 환각이 아닌 gold 행-ID 입도 불일치로, 평가방법·모델 개선 병행 과제로 식별함.');
    const LX=0.4, LW=4.95, RX=5.5, RW=4.1, topY=1.5;
    // 좌 — 실측 메트릭 표 (PASS/FAIL)
    sectionPanel(s,LX,topY,LW,0.32,{header:'실측 메트릭 (gold 35건 · seed 42 · gpt-4.1)',headerFill:C.ink,headerFontSize:9.5});
    const rows=[
      ['classification','0.897','≥0.85','PASS'],
      ['hazard_coverage','0.882','≥0.80','PASS'],
      ['grade_alignment','0.790','≥0.75','PASS'],
      ['refuse_appropriateness','1.000','≥0.90','PASS'],
      ['faithfulness (judge)','4.71','≥4.0','PASS'],
      ['control_verifiability','0.795','≥0.70','PASS'],
      ['legal_recall (법조문)','0.909','참고','PASS'],
      ['citation_precision','0.336','≥0.90','FAIL'],
      ['citation_recall','0.618','≥0.70','FAIL'],
      ['지연 p95','15.3s','참고','WARN'],
    ];
    let ry=topY+0.4; const rh=0.31;
    rows.forEach(r=>{
      const fail=r[3]==='FAIL', warn=r[3]==='WARN';
      const bg=fail?C.redLight:(warn?C.warnLight:C.greenLight);
      const sym=fail?'✗':(warn?'⚠':'✓');
      const sc=fail?C.red:(warn?C.warn:C.green);
      s.addText([
        {text:r[0],options:{fontSize:8.5,bold:fail,color:fail?C.red:C.ink}},
      ],{shape:'rect',x:LX,y:ry,w:LW*0.5,h:rh,fill:{color:bg},line:{color:C.grayLine,width:0.4},fontFace:FONT_BODY,valign:'middle',margin:0,align:'left'});
      s.addText(r[1],{x:LX+LW*0.5,y:ry,w:LW*0.22,h:rh,fontFace:FONT_MONO,fontSize:8.5,bold:true,color:fail?C.red:C.ink,align:'center',valign:'middle',margin:0});
      s.addText(r[2],{x:LX+LW*0.72,y:ry,w:LW*0.16,h:rh,fontFace:FONT_BODY,fontSize:8,color:C.muted,align:'center',valign:'middle',margin:0});
      s.addText(sym,{x:LX+LW*0.88,y:ry,w:LW*0.12,h:rh,fontFace:FONT_BODY,fontSize:10,bold:true,color:sc,align:'center',valign:'middle',margin:0});
      ry+=rh;
    });
    s.addText('13개 임계 중 11 PASS · 2 FAIL(인용) — judge 편향점검 통과(max var 0.222<0.5)',
      {x:LX,y:ry+0.04,w:LW,h:0.26,fontFace:FONT_BODY,fontSize:7.8,italic:true,color:C.textLight,margin:0});
    // 우 — FAIL 정직 해석 + critical 2건
    sectionPanel(s,RX,topY,RW,0.32,{header:'FAIL 2건 정직 해석 (환각 아님)',headerFill:C.grayDark,headerFontSize:9.5});
    s.addText([
      {text:'원인 — gold 행-ID 입도 불일치\n',options:{fontSize:9,bold:true,color:C.orangeDeep}},
      {text:'의미상 동등한 중복행을 인용(4,469행에 동일 세부작업 다수 병존). legal_recall 0.909·faithfulness 4.71이 "인용 내용은 정답"을 교차검증. 단 측정 기준상 미달은 미달로 표기.\n\n',options:{fontSize:8.3,color:C.text}},
      {text:'개선 — 평가·모델 병행\n',options:{fontSize:9,bold:true,color:C.orangeDeep}},
      {text:'① 평가: 동등행 집합화(acceptable_source_rows) 채점  ② 모델: canonical 행 정규화로 인용 통일',options:{fontSize:8.3,color:C.text}},
    ],{shape:'rect',x:RX,y:topY+0.4,w:RW,h:1.78,fill:{color:C.peachLight},line:{color:C.orange,width:0.5},valign:'top',margin:0.06,fontFace:FONT_BODY});
    s.addText([
      {text:'critical 과소평가 2건 (상→중/하)\n',options:{fontSize:9,bold:true,color:C.red}},
      {text:'GS-0001 타워크레인 해체(추락 누락)·GS-0010 열풍기 연료(폭발 과소). 개선: 고소·인화물 작업에 지배재해를 강제 후보로 주입.',options:{fontSize:8.3,color:C.text}},
    ],{shape:'rect',x:RX,y:topY+2.28,w:RW,h:1.06,fill:{color:C.redLight},line:{color:C.red,width:0.5},valign:'top',margin:0.06,fontFace:FONT_BODY});
    calloutBand(s,5.0,[
      {text:'류의 판단 — ',options:{bold:true,color:C.orange}},
      {text:'핵심 품질축은 운영 게이트 임계 충족 확인. 인용 정밀축은 측정방법 개선 과제로 식별, 다음 회귀에서 동등행 집합 기준 재측정.',options:{color:C.ink}},
    ],{h:0.4,fontSize:9.5});
    addFooter(s,pg);
  }

  // ── 16. 테스트·데모 화면 구성 ──
  { pg++; const s=pres.addSlide(); s.background={color:C.white};
    addTitle(s,'검증 현황 — 테스트 커버리지와 데모 화면 구성',
      '백엔드 55·프론트엔드 72·E2E 12건 테스트로 메커니즘 검증. 챗 인터페이스에 상시 동반(companion) 패널을 결합해 분류·위험요인 매트릭스·인용 원문·등록 결과를 단계별로 시연.');
    // 테스트 statCard
    const cards=[
      {l:'백엔드 테스트',v:'55',c:'gap_guardrail·outbox·api_flow 등'},
      {l:'프론트엔드 단위',v:'72',c:'매트릭스·배지·companion 패널'},
      {l:'E2E 시나리오',v:'12',c:'worker·manager·동적위험 플로우'},
    ];
    const n=cards.length, gap=0.15, cw=(9.2-gap*(n-1))/n, cy=1.6;
    cards.forEach((c,i)=>{ statCard(s,0.4+i*(cw+gap),cy,cw,1.0,c.l,c.v,c.c,{valueSize:26}); });
    // 데모 화면 구성
    sectionPanel(s,0.4,2.8,9.2,0.34,{header:'데모 화면 — 챗 + 상시 동반 패널(companion panel)',headerFill:C.orange,headerFontSize:10});
    const panels=[
      {t:'작업 분류 도우미',d:'대공종20→중공종254 트리 드릴다운 + AI 추천 하이라이트'},
      {t:'위험요인 평가',d:'KRAS 5×5 매트릭스 시각화 + 경계셀 "안전관리자 확인" 배지'},
      {t:'인용 원문 패널',d:'추천 근거 source_row 원문 표시(위험요인·대책·강도·빈도)'},
      {t:'등록 완료',d:'ERP 등록 결과(ID·상태) + 다음 작업 유도'},
    ];
    const pn=panels.length, pgap=0.1, pw=(9.2-pgap*(pn-1))/pn, pyy=3.2;
    panels.forEach((p,i)=>{
      const x=0.4+i*(pw+pgap);
      s.addText([
        {text:p.t+'\n',options:{fontSize:9.5,bold:true,color:C.orangeDeep}},
        {text:p.d,options:{fontSize:8.5,color:C.text}},
      ],{shape:'rect',x,y:pyy,w:pw,h:1.25,fill:{color:C.peachLight},line:{color:C.orange,width:0.5},valign:'top',margin:0,fontFace:FONT_BODY});
    });
    calloutNote(s,0.4,4.6,9.2,0.4,'경보(작업중지)는 어느 단계에서도 패널 상단 1줄로 상시 노출 — 현장 햇빛·소음·장갑 환경을 고려한 색상+텍스트 병기(WCAG).',{accent:C.orange,fontSize:9});
    addFooter(s,pg);
  }

  // ════════════════ 섹션 6 — 검토 요청 사항 ════════════════
  { pg++; const s=pres.addSlide(); sectionDividerContent(s,'06','검토 요청 사항','함께 결정할 안건 — ERP I/F·DB 접근·검증 계획·데이터 범위'); addFooter(s,pg); }

  // ── 18. 검토 요청 안건 (numbered cards) ──
  { pg++; const s=pres.addSlide(); s.background={color:C.white};
    addTitle(s,'검토 요청 사항 — 고객과 함께 결정할 안건',
      '실 LLM baseline 측정은 완료(2026-06-12). 운영 전환을 위해 ERP I/F 확정·DB 접근 전략 승인·전문가 검증 계획·데이터 추가 범위, 그리고 인용 평가 기준 개선·등급 과소 2건 보강 후 회귀 재측정을 함께 결정 필요.');
    const items=[
      {p:'P0',t:'ERP I/F 확정',d:'ERP 패키지/버전·인터페이스 종류(REST/SOAP/OData)·JHA 등록 엔드포인트 존재 여부 확인 필요. 미확정 시 어댑터 구현체·등록 흐름 설계 진행 불가.'},
      {p:'승인',t:'안전 DB 접근 전략 — ETL 배치(옵션 C)',d:'안전 DB → 벡터 인덱스 일 1회 야간 배치 동기화 안 승인 요청. ERP 신규 개발·로그 접근 없이 읽기 권한만으로 착수 → 일정 리스크 최소.'},
      {p:'계획',t:'전문가 검증 기간·대조 검증(≥200건)',d:'안전관리자가 실작업 입력에 대해 AI 추천 vs 수기 평가 대조(권장 ≥200건). 오답 패턴 카테고리화 → gold set·few-shot 보강. AI 신뢰성 검증·튜닝 기간 필요(제약사항).'},
      {p:'범위',t:'데이터 추가 범위 — 갭 영역 보강',d:'밀폐공간(KOSHA Guide P-93)·화학물질/MSDS(산안법 §110~115)는 데이터 얕음 → 현재 refuse 대상. 2차 데이터 확보 범위·우선순위 협의 필요.'},
      {p:'완료',t:'실 LLM baseline 측정 — 완료(2026-06-12)',d:'gpt-4.1 baseline 35건 실측 완료. 분류0.897·hazard0.882·등급0.790·refuse1.0·faithfulness4.71 등 핵심축 임계 충족. 인용 정밀 2개 축은 미달 → 후속 안건으로 이관.'},
      {p:'합의',t:'인용 평가 기준 개선 — 동등행 집합 합의',d:'citation P/R 미달 원인은 gold 행-ID 입도 불일치(의미상 동등 중복행 인용). expected_source_rows를 동등행 집합(acceptable_source_rows)으로 확장하고 집합교차 채점하도록 메트릭 보강 — safety-domain-expert 협업·기준 합의 필요.'},
      {p:'보강',t:'등급 과소평가 2건 보강 후 회귀 재측정',d:'GS-0001(해체→중)·GS-0010(열풍기→하) 과소평가 보정 — 고소·인화물 작업 지배재해 강제 후보 주입 후 본 baseline 대비 회귀 재측정으로 critical_fail 해소 확인 필요.'},
    ];
    let iy=1.45;
    items.forEach(it=>{
      const h=0.5;
      const done=it.p==='완료';
      s.addText(it.p,{shape:'roundRect',rectRadius:0.04,x:0.4,y:iy,w:0.6,h:h,fill:{color:done?C.green:C.orange},line:{color:done?C.green:C.orangeDeep,width:0.5},fontFace:FONT_BODY,fontSize:9,bold:true,color:C.white,align:'center',valign:'middle',margin:0});
      s.addText([
        {text:it.t+'  ',options:{fontSize:9.5,bold:true,color:done?C.green:C.ink}},
        {text:'\n',options:{fontSize:3}},
        {text:it.d,options:{fontSize:8,color:C.text}},
      ],{shape:'rect',x:1.05,y:iy,w:8.55,h:h,fill:{color:done?C.greenLight:C.peachLight},line:{color:done?C.green:C.orange,width:0.5},valign:'middle',margin:0,fontFace:FONT_BODY});
      iy+=h+0.05;
    });
    addFooter(s,pg);
  }

  // ── 19. 마무리 — 향후 일정 + 협의 요청 (timeline) ──
  { pg++; const s=pres.addSlide(); s.background={color:C.peach};
    s.addText('마무리 — 운영 전환 로드맵 및 협의 요청',{x:0.4,y:0.45,w:9.2,h:0.55,fontFace:FONT_TITLE,fontSize:24,bold:true,color:C.ink,margin:0});
    s.addText('PoC(메커니즘 데모) → 운영(실작업 등록) 전환은 dense 검색·실 LLM baseline·refuse 보강·실 ERP 연동·전문가 검증을 순차 게이트로 진행함. 각 단계 진입 전 본 검토 안건의 결정을 전제로 함.',
      {x:0.42,y:1.05,w:9.2,h:0.6,fontFace:FONT_BODY,fontSize:10.5,color:C.text,valign:'top',margin:0,lineSpacing:14});
    const milestones=[
      {date:'현재',label:'PoC 메커니즘\n데모 (Mock)'},
      {date:'1차',label:'ERP I/F 확정\nDB 접근 승인'},
      {date:'2차',label:'실 LLM baseline\n+ refuse 보강'},
      {date:'3차',label:'실 ERP 연동\n+ dense 검색'},
      {date:'운영',label:'전문가 검증\n≥200건 후 전환'},
    ];
    timelineMilestones(s,milestones,2.6);
    // 협의 요청 박스
    s.addShape('rect',{x:0.4,y:3.9,w:9.2,h:1.05,fill:{color:C.white},line:{color:C.orange,width:0.75}});
    s.addText([
      {text:'협의 요청 — ',options:{fontSize:11,bold:true,color:C.orange}},
      {text:'본 PoC 구성(안)에 대해 함께 검토 부탁드립니다.\n',options:{fontSize:11,bold:true,color:C.ink}},
      {text:'특히 ① ERP I/F 확정(P0) ② 안전 DB ETL 배치 승인 ③ 전문가 검증 기간·대조 검증(≥200건) 계획은 운영 전환 일정의 전제 조건으로, 우선 결정 요청드림.',options:{fontSize:9.5,color:C.text}},
    ],{x:0.6,y:4.05,w:8.8,h:0.8,fontFace:FONT_BODY,valign:'middle',margin:0,lineSpacing:14});
    s.addText(DECK.footerBrand,{x:0.4,y:5.32,w:2.0,h:0.22,fontFace:FONT_BODY,fontSize:9,bold:true,color:C.ink,margin:0});
    addFooter(s,pg);
  }

  DECK.total=pg;
  await pres.writeFile({fileName:DECK.outFile});
  console.log(`Saved ${DECK.outFile} (${pg} slides)`);
}

build().catch(e=>{console.error(e);process.exit(1);});
