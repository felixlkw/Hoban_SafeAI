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
  title: '프레젠테이션 제목',          // 푸터에 브랜드 옆 회색으로 표기됨 (삼일 PwC 표준)
  footerBrand: 'Samil PwC',           // 좌하단 볼드 브랜드 락업
  date: '2026.01.01',
  outFile: 'slides.pptx',
  total: 22,
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
async function build(){
  const pres=new pptxgen();
  pres.layout='LAYOUT_16x9'; pres.author=DECK.footerBrand; pres.title=DECK.title;
  const pwcLogo=await makePwcLogo(), coverGfx=await makeCoverGraphic(), coralBg=await makeCoralBg();
  const hb={}; for(const f of[0,0.25,0.5,0.75,1]) hb[f]=await makeHarveyBall(f);
  let pg=0;

  // 1. Cover
  { pg++; const s=pres.addSlide(); s.background={color:C.white};
    s.addImage({data:coralBg,x:0,y:0,w:W,h:H}); s.addImage({data:pwcLogo,x:0.4,y:0.32,w:0.85,h:0.45});
    s.addText('메인 타이틀',{x:0.4,y:1.65,w:9.2,h:0.75,fontFace:FONT_TITLE,fontSize:44,bold:true,color:C.ink,margin:0});
    s.addText('서브 타이틀 — 한 줄 설명',{x:0.42,y:2.4,w:9.2,h:0.5,fontFace:FONT_TITLE,fontSize:22,color:C.ink,margin:0});
    s.addImage({data:coverGfx,x:1.5,y:3.1,w:7.5,h:1.65});
    s.addText(DECK.date,{x:0.4,y:5.15,w:2,h:0.25,fontFace:FONT_BODY,fontSize:11,color:C.ink,margin:0}); }

  // 2. Agenda
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'목차','Agenda');
    agendaItems(s,[{num:'01',label:'현황 분석 및 진단'},{num:'02',label:'전략 방향 수립'},{num:'03',label:'실행 로드맵'},{num:'04',label:'기대 효과 및 다음 단계'}],0); addFooter(s,pg); }

  // 3. Section Divider
  { pg++; const s=pres.addSlide(); sectionDividerContent(s,'01','현황 분석 및 진단','외부 환경 및 내부 역량에 대한 종합 분석'); addFooter(s,pg); }

  // 4. Executive Summary
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'Executive Summary','핵심 분석 결과 및 권고사항 요약');
    execSummaryColumns(s,[
      {title:'현황',body:'시장 성장률 12% 대비\n자사 성장률 5%로\n경쟁력 격차 확대 중.\n\n주요 원인:\n• 디지털 전환 지연\n• 고객 접점 분산\n• 레거시 시스템 의존'},
      {title:'핵심 과제',body:'3대 전략 과제 도출:\n\n1. 플랫폼 기반 고객\n   경험 통합\n2. AI 기반 운영 효율화\n3. 신성장 동력 확보\n   (해외 시장 진출)'},
      {title:'기대 효과',body:'3개년 추진 시:\n\n• 매출 +25% 성장\n• 운영비용 -15% 절감\n• NPS 20pt 개선\n• 시장점유율 3%p 확대'},
    ]); addFooter(s,pg); }

  // 5. Closing / Next Steps
  { pg++; const s=pres.addSlide(); s.background={color:C.peach};
    s.addText('다음 단계',{x:0.4,y:0.5,w:9.2,h:0.3,fontFace:FONT_BODY,fontSize:11,bold:true,color:C.orange,charSpacing:4,margin:0});
    s.addText('실행을 위한 즉시 착수 과제',{x:0.4,y:0.9,w:9.2,h:0.65,fontFace:FONT_TITLE,fontSize:28,bold:true,color:C.ink,margin:0});
    [{num:'01',label:'태스크포스 구성',desc:'주관 부서 및 외부 파트너 선정 — 2주 내'},
     {num:'02',label:'Quick Win 과제 착수',desc:'3개월 내 가시적 성과 확보 가능한 과제 우선 실행'},
     {num:'03',label:'상세 실행 계획 수립',desc:'3개년 로드맵 기반 분기별 마일스톤 확정'}
    ].forEach((st,i)=>{
      const y=2.4+i*0.95;
      s.addShape('rect',{x:0.4,y,w:9.2,h:0.85,fill:{color:C.white},line:{color:C.orange,width:0.75}});
      s.addShape('rect',{x:0.4,y,w:0.95,h:0.85,fill:{color:C.orange},line:{color:C.orange,width:0}});
      s.addText(st.num,{x:0.4,y,w:0.95,h:0.85,fontFace:FONT_TITLE,fontSize:26,bold:true,color:C.white,align:'center',valign:'middle',margin:0});
      s.addText(st.label,{x:1.5,y:y+0.13,w:7.6,h:0.35,fontFace:FONT_BODY,fontSize:15,bold:true,color:C.ink,valign:'middle',margin:0});
      s.addText(st.desc,{x:1.5,y:y+0.45,w:7.6,h:0.35,fontFace:FONT_BODY,fontSize:11.5,color:C.textLight,valign:'middle',margin:0});
    }); addFooter(s,pg); }

  // 6. Two-Column Compare
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'비교 슬라이드','AS-IS vs TO-BE');
    const cY=1.7,cH=2.7;
    s.addShape('rect',{x:0.4,y:cY,w:4.3,h:cH,fill:{color:C.grayLight},line:{color:C.grayLine,width:0.75}});
    s.addShape('rect',{x:0.4,y:cY,w:4.3,h:0.32,fill:{color:C.grayDark},line:{color:C.grayDark,width:0}});
    s.addText('AS-IS',{x:0.4,y:cY,w:4.3,h:0.32,fontFace:FONT_BODY,fontSize:11,bold:true,color:C.white,align:'center',valign:'middle',margin:0});
    s.addText('• 수작업 기반 프로세스\n• 데이터 사일로\n• 느린 의사결정',{x:0.6,y:cY+0.5,w:3.9,h:2.0,fontFace:FONT_BODY,fontSize:13,color:C.textLight,valign:'top',margin:0});
    s.addShape('rect',{x:5.3,y:cY,w:4.3,h:cH,fill:{color:C.white},line:{color:C.orange,width:1}});
    s.addShape('rect',{x:5.3,y:cY,w:4.3,h:0.32,fill:{color:C.orange},line:{color:C.orange,width:0}});
    s.addText('TO-BE',{x:5.3,y:cY,w:4.3,h:0.32,fontFace:FONT_BODY,fontSize:11,bold:true,color:C.white,align:'center',valign:'middle',margin:0});
    s.addText('• 자동화된 워크플로\n• 통합 데이터 플랫폼\n• 실시간 대시보드',{x:5.5,y:cY+0.5,w:3.9,h:2.0,fontFace:FONT_BODY,fontSize:13,color:C.ink,valign:'top',margin:0});
    calloutBand(s,4.7,[{text:'핵심 — ',options:{bold:true,color:C.orange}},{text:'디지털 전환을 통해 운영 효율 30% 개선 목표',options:{color:C.ink}}]); addFooter(s,pg); }

  // 7. Numbered Cards Row
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'4대 전략 방향','핵심 이니셔티브 개요');
    [{num:'01',t:'고객 경험 혁신',b:'옴니채널 통합 및\nAI 개인화 서비스'},{num:'02',t:'운영 효율화',b:'RPA/AI 기반\n프로세스 자동화'},
     {num:'03',t:'데이터 역량',b:'통합 CDP 구축 및\n분석 체계 고도화'},{num:'04',t:'신사업 확장',b:'해외 시장 진출 및\n플랫폼 BM 확대'}
    ].forEach((it,i)=>{
      const cW=2.18,x=0.4+i*(cW+0.12);
      numberedCard(s,x,1.6,cW,2.5,it.num,it.t);
      s.addText(it.b,{x:x+0.15,y:2.15,w:cW-0.3,h:1.75,fontFace:FONT_BODY,fontSize:11,color:C.textLight,align:'center',valign:'top',margin:0});
    }); addFooter(s,pg); }

  // 8. 2x2 Matrix
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'전략 우선순위 매트릭스','영향도 × 실행 용이성 기준 평가');
    matrix2x2(s,{low:'실행 용이성 낮음',high:'실행 용이성 높음'},{low:'영향도 낮음',high:'영향도 높음'},[
      {title:'전략적 투자',items:'• 플랫폼 전면 전환\n• 해외 법인 설립'},
      {title:'✦ Quick Win',items:'• RPA 도입\n• 대시보드 구축\n• 고객 알림 자동화'},
      {title:'후순위',items:'• 사내 앱 리디자인\n• 문서 표준화'},
      {title:'점진적 개선',items:'• FAQ 챗봇\n• 보고서 자동 생성'},
    ]); addFooter(s,pg); }

  // 9. Harvey Ball Table
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'솔루션 비교 평가','Harvey Ball 기준 기능 충족도');
    const headers=['기능','솔루션 A','솔루션 B','솔루션 C'];
    const rows=[['확장성',1,0.75,0.5],['보안',0.75,1,0.75],['사용 편의성',0.5,0.75,1],['비용 효율',0.75,0.5,0.75],['기술 지원',1,0.5,0.25]];
    const tX=0.4,tY=1.6,colW=[2.5,2.23,2.23,2.24],rH=0.52;
    let cx=tX; headers.forEach((h,j)=>{
      s.addShape('rect',{x:cx,y:tY,w:colW[j],h:rH,fill:{color:C.ink},line:{color:C.ink,width:0}});
      s.addText(h,{x:cx+0.1,y:tY,w:colW[j]-0.2,h:rH,fontFace:FONT_BODY,fontSize:11,bold:true,color:C.white,valign:'middle',margin:0}); cx+=colW[j];
    });
    rows.forEach((r,ri)=>{
      cx=tX; const rY=tY+rH+ri*rH, alt=ri%2===0?C.white:C.peachLight;
      r.forEach((cell,ci)=>{
        s.addShape('rect',{x:cx,y:rY,w:colW[ci],h:rH,fill:{color:alt},line:{color:C.grayLine,width:0.5}});
        if(ci===0) s.addText(cell,{x:cx+0.1,y:rY,w:colW[ci]-0.2,h:rH,fontFace:FONT_BODY,fontSize:11,bold:true,color:C.ink,valign:'middle',margin:0});
        else s.addImage({data:hb[cell],x:cx+colW[ci]/2-0.15,y:rY+0.11,w:0.3,h:0.3});
        cx+=colW[ci];
      });
    }); addFooter(s,pg); }

  // 10. SWOT
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'SWOT 분석');
    swotQuadrant(s,{
      s:{label:'Strengths (강점)',items:'• 높은 브랜드 인지도\n• 안정적 고객 기반\n• 우수한 기술 인력'},
      w:{label:'Weaknesses (약점)',items:'• 레거시 시스템 의존\n• 디지털 역량 부족\n• 조직 사일로'},
      o:{label:'Opportunities (기회)',items:'• AI/GenAI 기술 도입\n• 신흥 시장 성장\n• 규제 완화 흐름'},
      t:{label:'Threats (위협)',items:'• 신규 진입자 확대\n• 고객 기대 수준 상승\n• 경기 둔화 리스크'},
    }); addFooter(s,pg); }

  // 11. Data Table
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'재무 요약','최근 3개년 주요 지표');
    const cols=[{w:0.7,l:'#'},{w:2.5,l:'항목'},{w:1.8,l:'FY24'},{w:1.8,l:'FY25'},{w:2.4,l:'YoY 증감'}];
    let cx=0.4; cols.forEach(c=>{
      s.addShape('rect',{x:cx,y:1.6,w:c.w,h:0.55,fill:{color:C.ink},line:{color:C.ink,width:0}});
      s.addText(c.l,{x:cx+0.1,y:1.6,w:c.w-0.2,h:0.55,fontFace:FONT_BODY,fontSize:11,bold:true,color:C.white,valign:'middle',margin:0}); cx+=c.w;
    });
    [['01','매출액','1,200억','1,500억','+25%'],['02','영업이익','180억','240억','+33%'],['03','고객 수','45만','52만','+16%'],['04','NPS','62','71','+9pt']].forEach((r,i)=>{
      cx=0.4; const rY=2.15+i*0.55, alt=i%2===0?C.white:C.peachLight;
      cols.forEach((c,j)=>{
        s.addShape('rect',{x:cx,y:rY,w:c.w,h:0.55,fill:{color:alt},line:{color:C.grayLine,width:0.5}});
        s.addText(r[j],{x:cx+0.1,y:rY,w:c.w-0.2,h:0.55,fontFace:j>=2?FONT_MONO:FONT_BODY,fontSize:j===0?13:11,bold:j<=1,color:j===0?C.orange:(j===4?C.orange:C.ink),valign:'middle',margin:0}); cx+=c.w;
      });
    }); addFooter(s,pg); }

  // 12. Waterfall Chart
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'매출 변동 분석 (Bridge Chart)','FY24 → FY25 매출 증감 요인');
    waterfallChart(s,[{label:'FY24\n매출',value:1200,type:'total'},{label:'신규\n고객',value:180,type:'positive'},{label:'업셀링',value:95,type:'positive'},{label:'가격\n인상',value:60,type:'positive'},{label:'이탈\n고객',value:-35,type:'negative'},{label:'FY25\n매출',value:1500,type:'total'}]);
    addFooter(s,pg); }

  // 13. KPI Dashboard
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'KPI 대시보드','2025년 4분기 주요 성과 지표');
    [{v:'1,500억',l:'매출',d:'▲ +25% YoY'},{v:'16.0%',l:'영업이익률',d:'▲ +2.0%p'},{v:'52만',l:'활성 고객 수',d:'▲ +16%'},{v:'71',l:'NPS 점수',d:'▲ +9pt'}].forEach((k,i)=>{
      kpiCard(s,0.5+i*2.3,1.5,2.1,1.5,k.v,k.l,k.d);
    });
    calloutBand(s,3.5,[{text:'인사이트 — ',options:{bold:true,color:C.orange}},{text:'4분기 연속 모든 핵심 지표 목표 초과 달성',options:{color:C.ink}}]); addFooter(s,pg); }

  // 14. Funnel
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'고객 전환 퍼널','단계별 전환율 분석');
    funnelDiagram(s,[{label:'인지 (Awareness)',value:'100,000',pct:'100%'},{label:'관심 (Interest)',value:'45,000',pct:'45%'},{label:'고려 (Consideration)',value:'18,000',pct:'18%'},{label:'전환 (Conversion)',value:'5,400',pct:'5.4%'},{label:'충성 (Loyalty)',value:'2,700',pct:'2.7%'}]);
    addFooter(s,pg); }

  // 15. Process Chevron
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'프로젝트 추진 프로세스','5단계 접근 방법론');
    processChevron(s,[{label:'현황 진단'},{label:'전략 수립'},{label:'설계'},{label:'구축/실행'},{label:'안정화'}],1.7,{activeIdx:1});
    const descs=['데이터 수집\n인터뷰\n벤치마크','목표 설정\n과제 도출\n우선순위화','아키텍처\n프로세스\nUI/UX','개발\n테스트\n교육','모니터링\n최적화\n이관'];
    const dW=(9.2-0.06*4)/5;
    descs.forEach((d,i)=>{const x=0.4+i*(dW+0.06);
      s.addShape('rect',{x,y:2.7,w:dW,h:1.8,fill:{color:C.white},line:{color:C.grayLine,width:0.5}});
      s.addText(d,{x:x+0.08,y:2.8,w:dW-0.16,h:1.6,fontFace:FONT_BODY,fontSize:10,color:C.textLight,align:'center',valign:'top',margin:0});
    }); addFooter(s,pg); }

  // 16. Timeline Milestone
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'프로젝트 마일스톤','주요 일정 및 산출물');
    timelineMilestones(s,[{date:'2026.Q1',label:'킥오프 &\n현황 진단'},{date:'2026.Q2',label:'전략 수립\n완료'},{date:'2026.Q3',label:'MVP\n출시'},{date:'2026.Q4',label:'전사 확산\n& 안정화'},{date:'2027.Q1',label:'성과 측정\n& 이관'}],2.2);
    calloutBand(s,4.6,[{text:'총 프로젝트 기간: ',options:{bold:true,color:C.orange}},{text:'12개월 (2026.Q1 ~ 2027.Q1)',options:{color:C.ink}}]); addFooter(s,pg); }

  // 17. Gantt / Roadmap
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'실행 로드맵 (Gantt)','워크스트림별 일정 계획');
    const aX=2.0,tW=7.6,hY=1.55;
    ['Q1','Q2','Q3','Q4'].forEach((q,i)=>{const x=aX+i*(tW/4);
      s.addShape('rect',{x,y:hY,w:tW/4,h:0.3,fill:{color:C.grayBg},line:{color:C.grayLine,width:0.5}});
      s.addText(q,{x,y:hY,w:tW/4,h:0.3,fontFace:FONT_BODY,fontSize:9,bold:true,color:C.ink,align:'center',valign:'middle',margin:0});
    });
    const rS=1.95,rH=0.48;
    ganttRow(s,'현황 진단',rS,0,0.25,{axisX:aX,totalW:tW,rowH:rH,color:C.orange});
    ganttRow(s,'전략 수립',rS+rH+0.04,0.15,0.45,{axisX:aX,totalW:tW,rowH:rH,color:C.orangeLight});
    ganttRow(s,'시스템 설계',rS+2*(rH+0.04),0.25,0.55,{axisX:aX,totalW:tW,rowH:rH,color:C.orange});
    ganttRow(s,'개발 & 테스트',rS+3*(rH+0.04),0.4,0.8,{axisX:aX,totalW:tW,rowH:rH,color:C.orangeDeep});
    ganttRow(s,'배포 & 안정화',rS+4*(rH+0.04),0.75,1.0,{axisX:aX,totalW:tW,rowH:rH,color:C.grayDark});
    ganttRow(s,'PMO / 변화관리',rS+5*(rH+0.04),0,1.0,{axisX:aX,totalW:tW,rowH:rH,color:C.peach});
    addFooter(s,pg); }

  // 18. Swimlane Roadmap
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'스윔레인 로드맵','부서별 병렬 추진 계획');
    const aX=2.0,tW=7.6;
    ['1월','2월','3월','4월','5월','6월'].forEach((m,i)=>{const x=aX+i*(tW/6);
      s.addShape('rect',{x,y:1.55,w:tW/6,h:0.3,fill:{color:C.grayBg},line:{color:C.grayLine,width:0.5}});
      s.addText(m,{x,y:1.55,w:tW/6,h:0.3,fontFace:FONT_BODY,fontSize:9,bold:true,color:C.ink,align:'center',valign:'middle',margin:0});
    });
    const sS=1.95,sH=0.6;
    swimlaneRow(s,{label:'전략팀',bars:[{startFrac:0,endFrac:0.33,text:'과제 도출',color:C.orange},{startFrac:0.35,endFrac:0.67,text:'상세 설계',color:C.orangeLight}]},sS,{axisX:aX,totalW:tW,rowH:sH});
    swimlaneRow(s,{label:'개발팀',bars:[{startFrac:0.17,endFrac:0.5,text:'MVP 개발',color:C.orangeLight},{startFrac:0.5,endFrac:0.83,text:'테스트',color:C.orangeVLight}]},sS+sH+0.04,{axisX:aX,totalW:tW,rowH:sH});
    swimlaneRow(s,{label:'운영팀',bars:[{startFrac:0.33,endFrac:0.67,text:'프로세스 전환',color:C.orangeDeep},{startFrac:0.67,endFrac:1.0,text:'안정화',color:C.peach}]},sS+2*(sH+0.04),{axisX:aX,totalW:tW,rowH:sH});
    swimlaneRow(s,{label:'PMO',bars:[{startFrac:0,endFrac:1.0,text:'프로젝트 관리 & 리스크 모니터링',color:C.grayDark}]},sS+3*(sH+0.04),{axisX:aX,totalW:tW,rowH:sH});
    addFooter(s,pg); }

  // 19. Demo / Step
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'데모 / 스텝 슬라이드','강사가 슬라이드만 보고 따라할 수 있는 구조');
    progressStrip(s,[{tag:'1분',label:'준비 단계'},{tag:'5분',label:'진행 단계'},{tag:'2분',label:'확인 단계'}],1.4,[1]);
    const bY=2.1;
    s.addShape('rect',{x:0.4,y:bY,w:5.5,h:2.4,fill:{color:C.ink},line:{color:C.ink,width:0}});
    s.addText('입력 / 강사 행동 가이드',{x:0.55,y:bY+0.12,w:5.3,h:0.28,fontFace:FONT_BODY,fontSize:10,bold:true,color:C.orangeLight,charSpacing:2,margin:0});
    s.addText('여기에 코드, 프롬프트, 또는\n단계별 행동 지침을 넣습니다.',{x:0.55,y:bY+0.5,w:5.3,h:1.8,fontFace:FONT_MONO,fontSize:11,color:C.white,margin:0});
    ['포인트 하나','포인트 둘','포인트 셋'].forEach((p,i)=>{const y=bY+0.45+i*0.62;
      s.addShape('rect',{x:6.05,y,w:3.55,h:0.5,fill:{color:C.peachLight},line:{color:C.orange,width:0.5}});
      s.addText(String(i+1),{x:6.1,y,w:0.4,h:0.5,fontFace:FONT_TITLE,fontSize:16,bold:true,color:C.orange,align:'center',valign:'middle',margin:0});
      s.addText(p,{x:6.5,y,w:3.0,h:0.5,fontFace:FONT_BODY,fontSize:11,bold:true,color:C.ink,valign:'middle',margin:0});
    });
    calloutBand(s,4.65,[{text:'결과 확인 — ',options:{bold:true,color:C.orange}},{text:'이 단계가 끝나면 무엇을 점검할지 한 줄로.',options:{color:C.ink}}]); addFooter(s,pg); }

  // 20. Pyramid
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'역량 프레임워크','성숙도 피라미드 모델');
    pyramidLayers(s,[{label:'전략적 리더십'},{label:'데이터 기반 의사결정'},{label:'프로세스 자동화'},{label:'디지털 인프라 구축'}]); addFooter(s,pg); }

  // 21. Text + Icon Grid
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'핵심 서비스','고객에게 제공하는 6대 서비스');
    [{ic:'📊',t:'전략 컨설팅',d:'시장 분석부터 실행\n전략까지 end-to-end'},{ic:'⚙️',t:'프로세스 혁신',d:'업무 자동화 및\n린 오퍼레이션'},
     {ic:'💡',t:'AI / 데이터',d:'GenAI, ML 모델\n구축 및 운영'},{ic:'🔒',t:'사이버 보안',d:'위협 탐지, 컴플라이언스\n보안 아키텍처'},
     {ic:'☁️',t:'클라우드',d:'마이그레이션\n및 최적화'},{ic:'👥',t:'변화 관리',d:'조직 설계 및\n교육 프로그램'}
    ].forEach((item,i)=>{const col=i%3,row=Math.floor(i/3);
      iconTextTile(s,0.4+col*3.05,1.5+row*2.0,2.85,1.85,item.ic,item.t,item.d);
    }); addFooter(s,pg); }

  // 22. Quote / Key Message
  { pg++; const s=pres.addSlide();
    quoteBlock(s,'디지털 전환은 기술의 문제가 아니라\n사람과 문화의 변화에서 시작된다.','CEO 인터뷰 발췌'); addFooter(s,pg); }

  // ══════════════════════════════════════════════════════════════════════════
  //  NEW PATTERNS 23-36
  // ══════════════════════════════════════════════════════════════════════════

  // 23. Stacked Bar Chart
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'부문별 매출 구성','Stacked Bar — 사업부별 3개년 매출 추이');
    stackedBarChart(s,['FY23','FY24','FY25','FY26E'],[
      {name:'B2C',values:[300,350,400,450],color:C.orange},
      {name:'B2B',values:[200,250,320,400],color:C.orangeLight},
      {name:'신사업',values:[50,80,130,200],color:C.peach},
    ]); addFooter(s,pg); }

  // 24. Donut Chart
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'비용 구조 분석','Donut Chart — 총 운영비 비중');
    donutChart(s,[
      {label:'인건비',value:42,color:C.orange},
      {label:'IT 인프라',value:25,color:C.orangeLight},
      {label:'마케팅',value:18,color:C.peach},
      {label:'기타',value:15,color:C.grayBg},
    ],5.0,3.0,1.8,1.0); addFooter(s,pg); }

  // 25. Line Trend Chart
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'핵심 지표 추이','Line Trend — 분기별 매출 및 이익률');
    lineTrendChart(s,['Q1\'24','Q2\'24','Q3\'24','Q4\'24','Q1\'25','Q2\'25','Q3\'25','Q4\'25'],[
      {name:'매출(억)',values:[280,310,295,340,350,380,365,420],color:C.orange},
      {name:'이익률(%)',values:[12,13,11,15,14,16,15,18],color:C.ink},
    ]); addFooter(s,pg); }

  // 26. Tornado / Sensitivity
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'민감도 분석','Tornado Chart — NPV 주요 변동 요인');
    tornadoChart(s,[
      {label:'고객 이탈률',low:85,high:120},
      {label:'ARPU',low:70,high:95},
      {label:'시장 성장률',low:55,high:80},
      {label:'할인율',low:45,high:50},
      {label:'구축 비용',low:30,high:25},
      {label:'인건비',low:20,high:15},
    ],{x:2.8,y:1.7,w:6.4,h:3.0}); addFooter(s,pg); }

  // 27. Risk Heatmap
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'리스크 히트맵','영향도 × 발생 가능성 매트릭스');
    riskHeatmap(s,[
      {id:'R1',impact:4,probability:4},
      {id:'R2',impact:5,probability:3},
      {id:'R3',impact:2,probability:5},
      {id:'R4',impact:3,probability:2},
      {id:'R5',impact:1,probability:1},
    ]); addFooter(s,pg); }

  // 28. Org Chart
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'프로젝트 거버넌스','Org Chart — 추진 조직 체계');
    const bw=2.0,bh=0.55,rootX=4.0;
    orgChart(s,[
      {level:0,x:rootX,y:1.5,title:'스티어링 위원회',name:'CEO / CFO / CIO'},
      {level:1,x:1.0,y:2.6,title:'PMO',name:'프로젝트 총괄',parentX:rootX,parentY:1.5},
      {level:1,x:4.0,y:2.6,title:'전략 리드',name:'컨설팅 파트너',parentX:rootX,parentY:1.5},
      {level:1,x:7.0,y:2.6,title:'기술 리드',name:'CTO / 아키텍트',parentX:rootX,parentY:1.5},
      {level:2,x:0.2,y:3.7,title:'변화 관리',name:'HR 팀장',parentX:1.0,parentY:2.6},
      {level:2,x:2.3,y:3.7,title:'품질 관리',name:'QA 매니저',parentX:1.0,parentY:2.6},
      {level:2,x:4.4,y:3.7,title:'비즈 분석',name:'BA 팀',parentX:4.0,parentY:2.6},
      {level:2,x:6.5,y:3.7,title:'개발팀',name:'Dev Lead',parentX:7.0,parentY:2.6},
      {level:2,x:8.2,y:3.7,title:'인프라팀',name:'Ops Lead',parentX:7.0,parentY:2.6},
    ]); addFooter(s,pg); }

  // 29. Venn Diagram
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'핵심 역량 교집합','Venn Diagram — 경쟁 우위 영역');
    vennDiagram(s,[
      {x:2.5,y:1.6,r:1.6,label:'기술',color:C.orangeVLight,borderColor:C.orange,labelDx:0.2,labelDy:0.6},
      {x:4.6,y:1.6,r:1.6,label:'비즈니스',color:C.orangeVLight,borderColor:C.orangeDeep,labelDx:1.2,labelDy:0.6},
      {x:3.55,y:3.0,r:1.6,label:'사용자',color:C.peach,borderColor:C.orange,labelDx:0.5,labelDy:1.8},
    ],{text:'핵심 가치',x:3.5,y:2.7,w:1.4}); addFooter(s,pg); }

  // 30. Maturity Assessment
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'디지털 성숙도 평가','Maturity Assessment — 현재 수준 진단');
    maturityAssessment(s,[
      {label:'전략 & 거버넌스',score:4},
      {label:'데이터 & 분석',score:3},
      {label:'기술 인프라',score:3.5},
      {label:'프로세스 자동화',score:2},
      {label:'인재 & 문화',score:2.5},
      {label:'고객 경험',score:3},
    ]); addFooter(s,pg); }

  // 31. Before/After Metrics
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'전환 효과 요약','Before/After — 핵심 지표 변화');
    beforeAfterMetrics(s,[
      {label:'처리 시간',before:'48h',after:'4h',delta:'-92%'},
      {label:'에러율',before:'8.5%',after:'1.2%',delta:'-86%'},
      {label:'고객 만족도',before:'62',after:'89',delta:'+44%'},
      {label:'비용/건',before:'₩15만',after:'₩3만',delta:'-80%'},
    ]); addFooter(s,pg); }

  // 32. Scenario Comparison
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'전략 옵션 비교','Scenario — 3개 시나리오 분석');
    scenarioColumns(s,[
      {title:'Option A: 보수적',body:'• 기존 시스템 점진 개선\n• 투자: 50억\n• ROI: 12%\n• 리스크: 낮음\n• 기간: 24개월\n\n기존 조직으로 내부 추진'},
      {title:'Option B: 균형형',recommended:true,body:'• 핵심 모듈 클라우드 전환\n• 투자: 120억\n• ROI: 28%\n• 리스크: 중간\n• 기간: 18개월\n\n외부 파트너 협업 추진'},
      {title:'Option C: 공격적',body:'• 전면 리플랫폼\n• 투자: 250억\n• ROI: 45%\n• 리스크: 높음\n• 기간: 12개월\n\n글로벌 SI 파트너 주도'},
    ]); addFooter(s,pg); }

  // 33. Checkmark Feature Grid
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'기능 비교 매트릭스','Checkmark Grid — 솔루션별 기능 지원 현황');
    checkmarkGrid(s,['기능','솔루션 A','솔루션 B','자사 제품'],[
      ['실시간 분석',true,true,true],
      ['AI 예측 모델',false,true,true],
      ['멀티 클라우드',true,false,true],
      ['한국어 지원',false,false,true],
      ['온프레미스 배포',true,true,false],
      ['24/7 기술 지원',true,false,true],
    ]); addFooter(s,pg); }

  // 34. RACI Matrix
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'RACI 매트릭스','역할과 책임 정의');
    raciMatrix(s,['활동','PMO','전략팀','개발팀','운영팀','경영진'],[
      ['요구사항 정의','A','R','C','C','I'],
      ['아키텍처 설계','C','I','R','C','I'],
      ['개발 & 테스트','I','I','R','C','A'],
      ['변화 관리','R','C','I','C','A'],
      ['성과 측정','R','C','I','R','A'],
    ]); addFooter(s,pg); }

  // 35. Mekko Chart
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'시장 점유율 구조','Mekko Chart — 세그먼트 × 경쟁사 비중');
    mekkoChart(s,[
      {label:'엔터프라이즈',size:450,segments:[{pct:40,color:C.orange},{pct:30,color:C.orangeLight},{pct:30,color:C.grayBg}]},
      {label:'SMB',size:300,segments:[{pct:25,color:C.orange},{pct:45,color:C.orangeLight},{pct:30,color:C.grayBg}]},
      {label:'공공',size:200,segments:[{pct:50,color:C.orange},{pct:20,color:C.orangeLight},{pct:30,color:C.grayBg}]},
      {label:'스타트업',size:100,segments:[{pct:10,color:C.orange},{pct:35,color:C.orangeLight},{pct:55,color:C.grayBg}]},
    ]);
    // Legend
    [{c:C.orange,l:'자사'},{c:C.orangeLight,l:'경쟁사 A'},{c:C.grayBg,l:'기타'}].forEach((lg,i)=>{
      const s2=s; s2.addShape('rect',{x:1.0+i*1.8,y:1.25,w:0.2,h:0.15,fill:{color:lg.c},line:{color:lg.c,width:0}});
      s2.addText(lg.l,{x:1.25+i*1.8,y:1.22,w:1.4,h:0.22,fontFace:FONT_BODY,fontSize:9,color:C.text,margin:0});
    }); addFooter(s,pg); }

  // 36. Value Chain
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'가치 사슬 분석','Value Chain — 핵심 활동별 경쟁력 평가');
    valueChain(s,[
      {title:'인바운드\n물류',items:'원자재 조달\n재고 관리\n공급망 최적화'},
      {title:'운영\n/생산',items:'제조 프로세스\n품질 관리\n설비 자동화'},
      {title:'아웃바운드\n물류',items:'주문 처리\n배송 네트워크\n창고 관리'},
      {title:'마케팅\n& 영업',items:'브랜딩\n디지털 마케팅\n채널 전략'},
      {title:'서비스',items:'고객 지원\nAS / 유지보수\n고객 성공'},
    ],['기업 인프라 (전략/재무/법무)','인적 자원 관리','기술 개발 / R&D','조달 / 구매'],
    {x:0.2,y:1.5,w:9.2}); addFooter(s,pg); }

  // ══════════════════════════════════════════════════════════════════════════
  //  FEW-SHOT PATTERNS 37-48
  // ══════════════════════════════════════════════════════════════════════════

  // 37. Strategic House
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'전략 체계도','Strategic House — 비전에서 기반까지');
    strategicHouse(s,{vision:'디지털 혁신을 통한 고객 중심 기업으로의 전환',mission:'2028년까지 디지털 채널 매출 비중 50% 달성',pillars:[
      {title:'고객 경험 혁신',items:'• 옴니채널 통합\n• AI 개인화 추천\n• 셀프서비스 확대'},
      {title:'운영 효율화',items:'• RPA 전사 확산\n• 프로세스 표준화\n• 실시간 모니터링'},
      {title:'데이터 역량 강화',items:'• 통합 CDP 구축\n• AI/ML 분석 체계\n• 데이터 거버넌스'},
    ],foundation:'클라우드 인프라  |  애자일 조직  |  변화 관리 프로그램'}); addFooter(s,pg); }

  // 38. 4-Quadrant Trend
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'산업 환경 분석','4-Quadrant — 시장·기술·규제·경쟁');
    quadTrendAnalysis(s,[
      {items:'• 글로벌 CAGR 15%\n• MZ세대 디지털 소비 급증\n• 구독 경제 확산'},
      {items:'• GenAI 상용화 가속\n• 클라우드 네이티브 전환\n• 엣지 컴퓨팅 부상'},
      {items:'• 데이터 3법 강화\n• AI 윤리 가이드라인\n• ESG 공시 의무화'},
      {items:'• A사: 플랫폼 전략 전환\n• B사: AI 투자 3배 확대\n• 이종업종 진입 가속'},
    ],'디지털 기술 활용한 선제적 대응이 시급하며 규제 환경 변화 사전 준비 필요'); addFooter(s,pg); }

  // 39. Strategic Alignment Cascade
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'전략 연계 체계','Cascading — 비전 → 경영목표 → 실행목표');
    alignmentCascade(s,{vision:'고객 중심 디지털 혁신 선도 기업',bizGoals:['매출 성장 25%','운영비용 15% 절감','NPS 20pt 향상'],execGoals:['CDP 구축 & AI 마케팅','RPA 200개 프로세스 자동화','옴니채널 통합 플랫폼']}); addFooter(s,pg); }

  // 40. IT Architecture Layers
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'As-Is IT 아키텍처','Architecture Layers — 계층별 시스템 현황');
    architectureLayers(s,[{title:'채널 접점',systems:['웹 포털','모바일 앱','콜센터','챗봇']},{title:'비즈 앱',systems:['ERP','CRM','SCM','MES','BI']},{title:'데이터',systems:['DW','ETL','Master Data','로그 수집']},{title:'인프라',systems:['온프레미스 서버','VPN','백업','모니터링']}]); addFooter(s,pg); }

  // 41. Option Scoring Table
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'대안 평가 매트릭스','Option Scoring — 가중치 기반 정량 평가');
    optionScoringTable(s,[{name:'기술 적합성',weight:'30%'},{name:'도입 비용',weight:'25%'},{name:'구현 기간',weight:'20%'},{name:'확장성',weight:'15%'},{name:'벤더 안정성',weight:'10%'}],['Option A','Option B','Option C'],[[8,7,9],[7,9,6],[8,6,7],[9,7,8],[8,8,7]]); addFooter(s,pg); }

  // 42. Investment Plan
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'투자 소요 산정','Investment Plan — CAPEX / OPEX');
    investmentPlan(s,[{name:'하드웨어',type:'CAPEX',amount:'15억',note:'클라우드 전환 시 감소'},{name:'소프트웨어 라이선스',type:'CAPEX',amount:'22억',note:'SaaS 구독'},{name:'SI 구축 인건비',type:'CAPEX',amount:'38억',note:'12개월'},{name:'유지보수/운영',type:'OPEX',amount:'8억/년'},{name:'교육/변화관리',type:'OPEX',amount:'5억'}],'총 88억','ROI: 3년 내 회수 (IRR 32%)'); addFooter(s,pg); }

  // 43. Root Cause Tree
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'근본 원인 분석','Root Cause Tree — Why-Why 분석');
    rootCauseTree(s,'고객 이탈률\n증가',[{name:'프로세스',causes:'• 응대 시간 48h 초과\n• 수작업 오류 빈발'},{name:'시스템',causes:'• 레거시 CRM 성능 저하\n• 채널 간 데이터 단절'},{name:'조직',causes:'• 부서 간 사일로\n• CS 전문 인력 부족'}]); addFooter(s,pg); }

  // 44. Target Operating Model
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'목표 운영 모델 (TOM)','5대 요소 정의');
    tomModel(s,'데이터 기반 실시간 의사결정 체계 구축',[{icon:'⚙',title:'프로세스',items:'• E2E 자동화\n• 실시간 처리\n• 표준화 SOP'},{icon:'👥',title:'조직',items:'• CoE 신설\n• 애자일 스쿼드\n• 역할 재정의'},{icon:'📊',title:'데이터',items:'• 통합 MDM\n• RT 파이프라인\n• 품질 거버넌스'},{icon:'💻',title:'시스템',items:'• 클라우드 MSA\n• API Gateway\n• Low-Code'},{icon:'📋',title:'거버넌스',items:'• KPI 모니터링\n• 변화관리 PMO\n• 정기 리뷰'}]); addFooter(s,pg); }

  // 45. Initiative Detail Card
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'개선 과제 상세','Initiative Detail Card');
    initiativeCard(s,{code:'PI-03',name:'고객 응대 프로세스 자동화',asIs:'• 수작업 접수 → 엑셀 관리\n• 평균 응대 시간 48시간\n• 에러율 8.5%\n• 고객 불만 증가',toBe:'• AI 챗봇 1차 응대\n• 티켓 자동 분류/배정\n• 응대 4시간 이내\n• 실시간 감성 분석',benefit:'• 응대 시간 92% 단축\n• 에러율 1.2%\n• CS 인력 30% 재배치\n• NPS 27pt 향상',prereq:'• CRM 업그레이드\n• AI 학습 데이터\n• CS 조직 재편\n• 고객 동의 프로세스'}); addFooter(s,pg); }

  // 46. ADKAR Change Management
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'변화 관리 전략','ADKAR 모델 기반 실행 계획');
    adkarModel(s,[{letter:'A',title:'인식',items:'• 경영진 킥오프\n• 타운홀 미팅\n• 변화 필요성\n  커뮤니케이션'},{letter:'D',title:'동기부여',items:'• 얼리어답터\n• 인센티브\n• 성공사례 공유'},{letter:'K',title:'지식습득',items:'• 맞춤형 교육\n• e-Learning\n• 실습 워크숍'},{letter:'A',title:'실행능력',items:'• 현장 코칭\n• 헬프데스크\n• 피드백 루프'},{letter:'R',title:'정착강화',items:'• KPI 모니터링\n• 보상 체계\n• 정기 리뷰'}]); addFooter(s,pg); }

  // 47. Project Scope Table
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'프로젝트 범위 정의','Scope & Boundary — In/Out 구분');
    scopeTable(s,[{area:'프로세스',inScope:'주문→배송 E2E',outScope:'인사/회계'},{area:'시스템',inScope:'CRM, OMS, WMS',outScope:'ERP 전면 교체'},{area:'조직',inScope:'영업/CS/물류',outScope:'경영지원/R&D'},{area:'지역',inScope:'국내 전 사업장',outScope:'해외 법인 (Phase 2)'},{area:'데이터',inScope:'고객/주문/재고',outScope:'HR/재무 데이터'}]); addFooter(s,pg); }

  // 48. Gap Analysis
  { pg++; const s=pres.addSlide(); s.background={color:C.white}; addTitle(s,'갭 분석','Gap Analysis — 현행 vs 목표 상태');
    gapAnalysis(s,{asIs:'• 수작업 기반 운영\n• 데이터 사일로\n• 48시간 응대 시간\n• 부서 간 협업 곤란\n• 레거시 시스템 의존',toBe:'• 자동화 워크플로\n• 통합 데이터 플랫폼\n• 4시간 실시간 응대\n• 크로스기능 협업\n• 클라우드 MSA',gapKeyword:'디지털\n역량',strategy:'3단계 — ① Quick Win 자동화 (3개월) → ② 플랫폼 전환 (9개월) → ③ AI 고도화 (12개월)'}); addFooter(s,pg); }

  // ══════════════════════════════════════════════════════════════════════════
  //  COMPLEX COMPOSITIONS (C1-C3) — building blocks 조합 데모
  // ══════════════════════════════════════════════════════════════════════════

  // C1. 듀얼 패널 프로세스 비교 (첨부 Slide 2 수준)
  { pg++; const s=pres.addSlide(); s.background={color:C.white};
    addTitle(s,'현행 vs 목표 프로세스 비교','현행 프로세스의 구조적 문제와 목표 체계를 대비하여 개선 방향을 제시함');
    const LX=0.4,LW=4.35,RX=5.05,RW=4.55,topY=1.35;
    // === LEFT PANEL: 현행 문제점 ===
    sectionPanel(s,LX,topY,LW,3.7,{header:'⚠  현행 프로세스의 구조적 문제',headerFill:C.grayDark,fill:C.grayLight,border:C.grayLine});
    // Flow: 3 boxes
    flowBox(s,LX+0.15,topY+0.5,1.1,0.4,'요청 접수',{fill:C.grayBg,border:C.grayDark});
    flowArrow(s,LX+1.25,topY+0.7,LX+1.55,topY+0.7);
    flowBox(s,LX+1.55,topY+0.5,1.2,0.4,'수작업 처리',{fill:C.grayBg,border:C.grayDark});
    flowArrow(s,LX+2.75,topY+0.7,LX+3.05,topY+0.7);
    flowBox(s,LX+3.05,topY+0.5,1.1,0.4,'개별 취합',{fill:C.grayBg,border:C.grayDark});
    // 4 pain points
    annotItem(s,LX+0.1,topY+1.1,LW-0.2,'1','전략 부재 상태에서 분업','목차만 나눠 각자 작성 → 방향성 없는 조각 모음',{descH:0.32});
    annotItem(s,LX+0.1,topY+1.75,LW-0.2,'2','부서 간 Silo 구조','개인별 관점으로 진행 → 고객 관점 통합 불가',{descH:0.32});
    annotItem(s,LX+0.1,topY+2.4,LW-0.2,'3','통합 스토리 구현 불가','취합 시 일관성 부재 → 논리적 흐름 훼손',{descH:0.32});
    annotItem(s,LX+0.1,topY+3.05,LW-0.2,'4','전문성 활용 미흡','Available 인력 중심 → 깊이 있는 제안 어려움',{descH:0.32});
    // Result band (left)
    resultBand(s,topY+3.7,['차별화 없는 산출물','성과 정체','구조적 한계 반복'],{x:LX,w:LW,h:0.3,fill:C.grayDark,fontSize:8.5});

    // === RIGHT PANEL: 목표 체계 ===
    sectionPanel(s,RX,topY,RW,3.7,{header:'✓  목표 프로세스 (Page-by-Page 체계)',headerFill:C.orange,fill:C.white,border:C.orange});
    // Flow: 3 boxes
    flowBox(s,RX+0.15,topY+0.5,1.2,0.4,'전략 수립',{fill:C.peach,border:C.orange});
    flowArrow(s,RX+1.35,topY+0.7,RX+1.65,topY+0.7);
    flowBox(s,RX+1.65,topY+0.5,1.2,0.4,'스토리보드\n설계',{fill:C.peach,border:C.orange,fontSize:9});
    flowArrow(s,RX+2.85,topY+0.7,RX+3.15,topY+0.7);
    flowBox(s,RX+3.15,topY+0.5,1.2,0.4,'Assign\n& 집필',{fill:C.peach,border:C.orange,fontSize:9});
    // 5 improvement items
    annotItem(s,RX+0.1,topY+1.1,RW-0.2,'A','스토리라인 설계 선행 필수','RFP 분석 → Win Theme 도출 → Storyboard 작성',{badgeFill:C.orangeDeep,descH:0.28});
    annotItem(s,RX+0.1,topY+1.65,RW-0.2,'B','전문 인력의 전략적 참여','설계 단계부터 산업/기술 전문가 참여',{badgeFill:C.orangeDeep,descH:0.28});
    annotItem(s,RX+0.1,topY+2.2,RW-0.2,'C','사례 기반 품질 표준화','글로벌 사례 축적, BP 교육 통한 역량 상향',{badgeFill:C.orangeDeep,descH:0.28});
    annotItem(s,RX+0.1,topY+2.75,RW-0.2,'D','템플릿 표준화 & 역할 정의','Storyboard 템플릿 + 참여 역할/프로세스 명확화',{badgeFill:C.orangeDeep,descH:0.28});
    annotItem(s,RX+0.1,topY+3.3,RW-0.2,'E','역량 강화 체계 수립','On/Offline 교육, 실습 등 체계적 교육 프로그램',{badgeFill:C.orangeDeep,descH:0.28});
    // Result band (right)
    resultBand(s,topY+3.7,['일관된 스토리','차별화된 산출물','역량 강화','Win Rate Up'],{x:RX,w:RW,h:0.3,fontSize:8.5});
    addFooter(s,pg); }

  // C2. 멀티 액터 프로세스 플로우 (첨부 Slide 3 수준)
  { pg++; const s=pres.addSlide(); s.background={color:C.white};
    addTitle(s,'스토리보드 기반 제안서 작성 프로세스','3단계 (Draft → 1차 작성 → Page-by-Page 리뷰) 를 통해 스토리보드 완성도를 높임');
    // Phase banners
    phaseBanner(s,0.4,1.35,2.6,'Phase 1: 초안 생성',{fill:C.orange});
    phaseBanner(s,3.1,1.35,3.0,'Phase 2: 스토리보드 작성',{fill:C.orangeLight});
    phaseBanner(s,6.2,1.35,3.4,'Phase 3: 리뷰 & 확정',{fill:C.orangeDeep});
    // Actor lane labels (left side)
    const laneY=[1.8,2.45,3.1,3.75]; const laneH=0.55;
    ['AI Agent','제안팀','제안 PM','Expert/리더십'].forEach((a,i)=>{
      s.addShape('rect',{x:0.05,y:laneY[i],w:0.35,h:laneH,fill:{color:C.ink},line:{color:C.ink,width:0}});
      s.addText(a,{x:0.05,y:laneY[i],w:0.35,h:laneH,fontFace:FONT_BODY,fontSize:7,bold:true,color:C.white,align:'center',valign:'middle',margin:0});
      // Lane background
      s.addShape('rect',{x:0.4,y:laneY[i],w:9.2,h:laneH,fill:{color:i%2===0?C.peachLight:C.white},line:{color:C.grayLine,width:0.5}});
    });
    // Phase 1 flow boxes
    flowBox(s,0.55,laneY[0]+0.08,1.4,0.4,'RFP 등록 &\nDraft 생성',{fill:C.peach,fontSize:8.5});
    milestoneTag(s,0.55,laneY[0]+0.08,'M1');
    flowBox(s,2.1,laneY[0]+0.08,1.3,0.4,'Research &\n프롬프팅 반복',{fill:C.peach,fontSize:8.5});
    flowArrow(s,1.95,laneY[0]+0.28,2.1,laneY[0]+0.28,{fontSize:10});
    // Phase 2 flow boxes
    flowBox(s,3.2,laneY[1]+0.08,1.5,0.4,'1차 스토리보드\n작성 (L1~L4)',{fill:C.white,fontSize:8.5});
    milestoneTag(s,3.2,laneY[1]+0.08,'M2');
    flowBox(s,4.85,laneY[1]+0.08,1.5,0.4,'리드메시지/\n리서치 구체화',{fill:C.white,fontSize:8.5});
    flowArrow(s,4.7,laneY[1]+0.28,4.85,laneY[1]+0.28,{fontSize:10});
    // Connector to PM lane
    dashedBox(s,3.2,laneY[2]+0.08,1.5,0.4,'전문가 의견 반영\n(필요 시)');
    // Phase 3 flow boxes
    flowBox(s,6.5,laneY[2]+0.08,1.5,0.4,'Page-by-Page\n스토리보드 Review',{fill:C.orangeVLight,fontSize:8.5});
    milestoneTag(s,6.5,laneY[2]+0.08,'M3');
    flowBox(s,8.1,laneY[1]+0.08,1.3,0.4,'Mock Deck\n작성',{fill:C.white,fontSize:8.5});
    flowArrow(s,8.0,laneY[1]+0.28,8.1,laneY[1]+0.28,{fontSize:10});
    flowBox(s,8.1,laneY[2]+0.08,1.3,0.4,'최종 제안서\nReview',{fill:C.peach,fontSize:8.5});
    dashedBox(s,6.5,laneY[3]+0.08,3.0,0.4,'리더십 참여 Review (필요 시)');
    // End marker
    s.addShape('ellipse',{x:9.3,y:laneY[1]+0.13,w:0.3,h:0.3,fill:{color:C.orangeDeep},line:{color:C.orangeDeep,width:0}});
    s.addText('End',{x:9.3,y:laneY[1]+0.13,w:0.3,h:0.3,fontFace:FONT_BODY,fontSize:7,bold:true,color:C.white,align:'center',valign:'middle',margin:0});
    // Bottom: 3 milestone descriptions
    const descY=4.45,descW=3.0,descH=0.95;
    [{code:'M1',title:'Draft by AI',desc:'• AI Workspace 활용 초안 생성\n• RFP + 추가 정보 입력\n• 반복 프롬프팅으로 고도화'},
     {code:'M2',title:'1차 스토리보드 작성',desc:'• 경쟁력 및 장단점 확인\n• 논리적 일관성 점검\n• 고객 관점 통합 스토리 검토'},
     {code:'M3',title:'Page-by-Page Review',desc:'• 고객 Needs 포함 여부 확인\n• 핵심 메시지 연결성 점검\n• Winning Point 검증'}
    ].forEach((m,i)=>{
      const x=0.4+i*(descW+0.1);
      sectionPanel(s,x,descY,descW,descH,{header:null,fill:C.white,border:C.grayLine});
      milestoneTag(s,x+0.06,descY+0.06,m.code);
      s.addText(m.title,{x:x+0.5,y:descY+0.02,w:descW-0.6,h:0.3,fontFace:FONT_BODY,fontSize:10,bold:true,color:C.ink,valign:'middle',margin:0});
      s.addText(m.desc,{x:x+0.08,y:descY+0.35,w:descW-0.16,h:descH-0.4,fontFace:FONT_BODY,fontSize:8.5,color:C.textLight,valign:'top',margin:0});
    });
    addFooter(s,pg); }

  // C3. 멀티 스테이지 리뷰 + 액터 구성 (첨부 Slide 9 수준)
  { pg++; const s=pres.addSlide(); s.background={color:C.white};
    addTitle(s,'Page-by-Page 스토리보드 리뷰 프로세스','점검사항 및 체크리스트를 기반으로 3단계 리뷰를 진행함');
    // 3 review stages (top section)
    const stageY=1.4,stageH=2.2,stageW=2.9,stageGap=0.12;
    const stages=[
      {title:'제안팀 스토리보드 고도화',sub:'(제안 PM / 제안팀)',actors:['제안팀원','제안 PM'],dayLabel:'D+1'},
      {title:'담당파트너 스토리보드 Review',sub:'(PIC / 제안 PM / 제안팀)',actors:['제안팀원','제안 PM','담당파트너'],dayLabel:'D+2'},
      {title:'전문가그룹 스토리보드 리뷰',sub:'(필요 시)',actors:['제안팀원','제안 PM','담당파트너','전문가\n그룹'],dayLabel:'D+3'},
    ];
    stages.forEach((st,i)=>{
      const x=0.4+i*(stageW+stageGap);
      sectionPanel(s,x,stageY,stageW,stageH,{fill:C.white,border:C.grayLine});
      // Orange left accent
      s.addShape('rect',{x,y:stageY,w:0.06,h:stageH,fill:{color:C.orange},line:{color:C.orange,width:0}});
      // Stage title box
      flowBox(s,x+0.15,stageY+0.15,stageW-0.3,0.55,st.title+'\n'+st.sub,{fill:C.peach,border:C.orange,fontSize:9});
      // Day label
      milestoneTag(s,x+stageW-0.55,stageY+0.15,st.dayLabel,{w:0.5});
      // Actor icons
      st.actors.forEach((a,ai)=>{
        actorIcon(s,x+0.25+ai*0.7,stageY+0.9,a);
      });
      // Description
      s.addText(i===0?'제안팀 담당자와 제안 PM은\nPage 단위 스토리보드 Review 진행':
                    i===1?'담당파트너의 스토리보드\nReview 진행, 리뷰 커멘트 기록':
                    '전문가그룹 / 본부장 참여\n스토리보드 Review 진행',
        {x:x+0.1,y:stageY+1.55,w:stageW-0.2,h:0.6,fontFace:FONT_BODY,fontSize:8.5,color:C.textLight,align:'center',valign:'top',margin:0});
      // Arrow to next
      if(i<2) flowArrow(s,x+stageW,stageY+stageH/2,x+stageW+stageGap,stageY+stageH/2,{fontSize:14});
    });
    // Bottom: Review checklist (5 items across)
    const ckY=3.85,ckH=1.2,ckW=1.76,ckGap=0.08;
    const checks=[
      {title:'Page 단위 Review',body:'① 리드메시지 & Key Message\n   연관성 확인\n② 최적 담당자 배치\n③ 일정 적정 여부'},
      {title:'연계성 확인',body:'• 4-Layer Decoding 반영\n• Implied Needs 반영\n• 숨은 관심사 반영\n• 평가 우선 항목 고려'},
      {title:'통합스토리 점검',body:'• 일관된 스토리 검증\n• 일관성 낮은 부분 파악\n• 논리적 흐름 오류 식별'},
      {title:'중복 제거',body:'• 유사 내용 반복 제거\n• 섹션 간 중복 식별'},
      {title:'경쟁력 평가',body:'• 경쟁사 대비 차별화\n• 추진전략 반영 여부\n• Win Theme 반영도'},
    ];
    s.addShape('rect',{x:0.4,y:ckY,w:9.2,h:0.3,fill:{color:C.ink},line:{color:C.ink,width:0}});
    s.addText('스토리보드 Review 점검사항',{x:0.5,y:ckY,w:9.0,h:0.3,fontFace:FONT_BODY,fontSize:10,bold:true,color:C.white,valign:'middle',margin:0});
    checks.forEach((ck,i)=>{
      const x=0.4+i*(ckW+ckGap);
      s.addShape('rect',{x,y:ckY+0.3,w:ckW,h:ckH,fill:{color:C.white},line:{color:C.grayLine,width:0.5}});
      s.addText(ck.title,{x:x+0.06,y:ckY+0.32,w:ckW-0.12,h:0.24,fontFace:FONT_BODY,fontSize:9,bold:true,color:C.orange,valign:'middle',margin:0});
      s.addText(ck.body,{x:x+0.06,y:ckY+0.58,w:ckW-0.12,h:ckH-0.3,fontFace:FONT_BODY,fontSize:8,color:C.text,valign:'top',margin:0});
    });
    // Final note
    calloutNote(s,0.4,ckY+ckH+0.35,9.2,0.3,'리뷰 시 점검 사항은 반드시 \'스토리보드 템플릿\'에 기록',{accent:C.orange,fontSize:9.5});
    addFooter(s,pg); }

  DECK.total=pg;
  await pres.writeFile({fileName:DECK.outFile});
  console.log(`Saved ${DECK.outFile} (${pg} slides)`);
}

build().catch(e=>{console.error(e);process.exit(1);});
