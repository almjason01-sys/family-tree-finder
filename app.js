import {active, ageAlerts, audit, children, choice, closure, day, empty, evidence, fields, generations, get, id, ladder, liveLinks, name, parents, person, relative, sample, similarSpelling, snapshot, surname, tiers, value} from './model.js';
import {fromFile, gedcom, markdown, readShare, shareTree} from './formats.js';

const $ = id => document.getElementById(id);
function el(tag, attrs={}, ...content) {
  const node=document.createElement(tag);
  for(const [k,v] of Object.entries(attrs)) {
    if(k==='class') node.className=v;
    else if(k.startsWith('on')) node.addEventListener(k.slice(2),v);
    else if(v!==false&&v!=null) node.setAttribute(k,v===true?'':v);
  }
  node.append(...content.flat().filter(x=>x!=null&&x!==false));
  return node;
}
const button=(label,onclick,cls)=>el('button',{type:'button',onclick,class:cls},label);
const option=(v,label)=>el('option',{value:v},label);
const badge=tier=>el('span',{class:`badge ${tier}`},tiers[tier]);
const muted=text=>el('p',{class:'muted'},text);
const status=text=>{$('status').textContent=text;};
const cfg={
  get:key=>{try{return localStorage.getItem(key);}catch{return null;}},
  set:(key,v)=>{try{localStorage.setItem(key,v);}catch{}}
};
const db=new Promise((resolve,reject)=>{
  const req=indexedDB.open('family-tree-finder',1);
  req.onupgradeneeded=()=>req.result.createObjectStore('trees');
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error);
});
async function store(key,data){
  const d=await db;
  return new Promise((resolve,reject)=>{
    const tx=d.transaction('trees',data?'readwrite':'readonly');
    const box=tx.objectStore('trees');
    const req=data?box.put(data,key):box.get(key);
    tx.oncomplete=()=>resolve(req.result);
    tx.onabort=()=>reject(tx.error||Error('Local save failed.'));
  });
}
let mode='demo', tree, focus='', selected='', zoom=1, busy=false;
let storageError='';
const targetHash=location.hash.startsWith('#tree=')?location.hash.slice(6):'';
try {
  if(targetHash){tree=readShare(targetHash);mode='shared';}
  else {
    mode=cfg.get('ftf.mode')==='private'?'private':'demo';
    tree=await store(mode)||(mode==='private'?empty():sample());
    if(mode==='demo') await store(mode,tree);
  }
}catch(err){
  storageError=targetHash?'Could not open that shared outline.':'Browser storage is unavailable. Changes cannot be saved.';
  tree=sample();mode='demo';
}
function loadFocus(){
  const preferred=mode==='shared'?'':cfg.get('ftf.focus.'+mode);
  focus=get(tree,preferred)?preferred:tree.root;
  selected=focus;
}
loadFocus();
function close(){if($('modal').open)$('modal').close();}
function dialog(title,...body){
  $('dialog-title').textContent=title;
  $('dialog-body').replaceChildren(...body);
  if(!$('modal').open)$('modal').showModal();
}
$('close').onclick=close;
$('modal').addEventListener('click',e=>{if(e.target===$('modal'))close();});
async function commit(reason,apply){
  if(mode==='shared') throw Error('Import an outline to edit a private copy.');
  if(busy) throw Error('Wait for the current save to finish.');
  busy=true;
  try {
    const next=structuredClone(tree);
    await apply(next);
    next.history.push({at:new Date().toISOString(),reason,state:snapshot(tree)});
    next.updated=day();
    await store(mode,next);
    tree=next;
    if(!get(tree,focus))focus=tree.root;
    if(!get(tree,selected))selected=focus;
    render();
    status(`Saved on this device · ${tree.updated}`);
  } finally {busy=false;}
}
function action(run){
  return async e=>{try{await run(e);}catch(err){status(err.message);}};
}
function field(label, key, cfg={}){
  const {options, multiline, initial, type='text',...rest}=cfg;
  const attrs={name:key,...rest};
  const input=options?el('select',attrs,...options.map(x=>option(...x))):
    multiline?el('textarea',attrs):el('input',{type,...attrs});
  if(initial!=null) input.value=initial;
  return el('label',{},label,input);
}
const check=(label,key,attrs={})=>el('label',{class:'check'},el('input',{type:'checkbox',name:key,...attrs}),label);
function evidenceFields(){
  return [
    field('Evidence tier','tier',{options:[['lead',tiers.lead],['confirmed',tiers.confirmed],['ruled',tiers.ruled]]}),
    muted('Use Confirmed for an obituary, official record, or the person’s firsthand statement. Record a citation even when the source is offline.'),
    field('Source citation','source',{required:true,maxlength:500,placeholder:'Record title, certificate number, or interview'}),
    field('Source link, if available','url',{type:'url',placeholder:'https://…'})
  ];
}
function factsFrom(f,v){
  const url=f.get('url')?.trim()||'';
  const source=f.get('source')?.trim();
  const val=String(v).trim();
  if(!val||!source)throw Error('Enter a value and a source citation.');
  if(url&&!/^https?:\/\//i.test(url)) throw Error('Source links must start with https:// or http://.');
  return evidence(val,f.get('tier'),source,url);
}
function form(title,inputs,save,label='Save'){
  const error=el('p',{class:'error',role:'alert',hidden:true});
  const submit=el('button',{class:'primary',type:'submit'},label);
  const ui=el('form',{},...inputs,error,el('div',{class:'actions'},submit,button('Cancel',close)));
  ui.onsubmit=async e=>{
    e.preventDefault();
    error.hidden=true;
    submit.disabled=true;
    try{await save(new FormData(ui));close();}
    catch(err){error.textContent=err.message;error.hidden=false;}
    finally{submit.disabled=false;}
  };
  dialog(title,ui);
}
function cite(f){
  const url=f.url;
  const target=url==='#fictional-records'?button('Fictional source',()=>dialog('Fictional records',muted('This example citation was created for the Bramblewick demo. It represents an invented interview, notebook or record transcription.'))):
    /^https?:\/\//i.test(url||'')?el('a',{href:url,target:'_blank',rel:'noopener noreferrer'},'Open source'):null;
  return el('small',{},f.source,target?' · ':null,target);
}
function factRow(label,f,extra){
  return el('div',{class:'fact'},el('div',{class:'row'},el('strong',{},label),badge(f.tier),extra),el('div',{},f.value),cite(f));
}
function relOptions(except=''){
  return tree.people.filter(p=>p.id!==except).map(p=>[p.id,name(p)]);
}
function fillSelect(id,options,preferred){
  const n=$(id);
  n.replaceChildren(...options.map(x=>option(...x)));
  n.value=options.some(([v])=>v===preferred)?preferred:options[0]?.[0]||'';
}
function render(){
  $('workspace').textContent=tree.title;
  $('add').disabled=mode==='shared';
  $('new').textContent=mode==='private'?'Show fictional demo':'Start my tree';
  fillSelect('focus',relOptions(),focus);
  const branches=parents(tree,focus);
  fillSelect('side',[['','All sides'],...branches.map(i=>[i,`${name(get(tree,i))}’s side`])],$('side').value);
  fillSelect('surname',[['','All surnames'],...[...new Set(tree.people.map(surname))].sort().map(x=>[x,x])],$('surname').value);
  renderTree();
  renderCard();
}
function renderTree(){
  const canvas=$('tree'), viewport=$('viewport'), all=$('layout').value==='all';
  canvas.replaceChildren();
  if(!tree.people.length){
    canvas.style.cssText='';
    canvas.append(el('p',{style:'padding:1rem'},'Add yourself to begin your tree.'));
    $('tree-summary').textContent='Empty tree';
    return;
  }
  const query=$('search').value.trim().toLowerCase();
  const d=generations(tree,focus,all||!!query);
  const relativeDepth=generations(tree,focus,false);
  const s=$('side').value;
  const branch=s?closure([s],i=>parents(tree,i)):null;
  if(branch)for(const ancestor of [...branch])for(const i of closure([ancestor],j=>children(tree,j)))branch.add(i);
  const familyName=$('surname').value;
  const visible=tree.people.filter(p=>d.has(p.id)&&(!branch||branch.has(p.id))&&(!familyName||surname(p)===familyName)&&
    (!query||active(p,'Name').some(f=>f.value.toLowerCase().includes(query))||p.spellings.some(f=>f.value.toLowerCase().includes(query))));
  $('tree-summary').textContent=`${visible.length} of ${tree.people.length} people`;
  if(!visible.length){canvas.style.cssText='';canvas.append(el('p',{style:'padding:1rem'},'No people match these filters.'));return;}
  const rows=Map.groupBy(visible,p=>d.get(p.id));
  const levels=[...rows.keys()].sort((a,b)=>a-b);
  // CSS zoom changes the scrollable dimensions, so panning remains available at any scale.
  const width=Math.max(viewport.clientWidth/zoom,Math.max(...[...rows.values()].map(items=>items.length))*174+28);
  const height=Math.max(viewport.clientHeight/zoom,levels.length*132+24);
  canvas.style.cssText=`zoom:${zoom};width:${width}px;height:${height}px;min-width:0;min-height:0`;
  const coords=new Map();
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('class','edges');
  svg.setAttribute('width',width);
  svg.setAttribute('height',height);
  svg.setAttribute('aria-hidden','true');
  canvas.append(svg);
  levels.forEach((level,idx)=>{
    const row=rows.get(level);
    if(row.some(p=>p.id===focus)){
      const i=row.findIndex(p=>p.id===focus);
      const [center]=row.splice(i,1);
      row.splice(Math.floor(row.length/2),0,center);
    }
    row.forEach((p,j)=>{
      const x=(width-(row.length*174-26))/2+j*174, y=22+idx*132;
      coords.set(p.id,{x:x+74,y:y+40});
      const n=choice(p,'Name');
      const node=el('button',{type:'button',class:`node ${p.id===focus?'center':''} ${p.id===selected?'current':''}`,
        style:`left:${x}px;top:${y}px`,'aria-pressed':p.id===selected?'true':'false',onclick:()=>{
          selected=p.id;
          renderTree();renderCard();
          [...canvas.querySelectorAll('button')].find(b=>b.dataset.person===p.id)?.focus({preventScroll:true});
        },'data-person':p.id},
        el('span',{},`${p.id===focus?'★ ':''}${name(p)}`),
        el('small',{},relative(tree,p.id,focus,relativeDepth.get(p.id))),n?badge(n.tier):el('small',{class:'open'},'OPEN'));
      canvas.append(node);
    });
  });
  for(const l of liveLinks(tree)){
    const a=coords.get(l.a), b=coords.get(l.b);
    if(!a||!b)continue;
    const line=document.createElementNS(svg.namespaceURI,'path');
    const path=a.y===b.y?`M ${a.x} ${a.y} H ${b.x}`:`M ${a.x} ${a.y} V ${(a.y+b.y)/2} H ${b.x} V ${b.y}`;
    line.setAttribute('d',path);line.setAttribute('fill','none');line.setAttribute('stroke','#617e71');
    line.setAttribute('stroke-width','2');
    if(l.tier!=='confirmed'||l.kind!=='parent')line.setAttribute('stroke-dasharray','5 4');
    svg.append(line);
  }
}
for(const key of ['layout','side','surname'])$(key).onchange=renderTree;
$('search').oninput=renderTree;
$('focus').onchange=()=>{
  focus=selected=$('focus').value;
  if(mode!=='shared')cfg.set('ftf.focus.'+mode,focus);
  $('side').value='';
  render();
};
for(const [k,n] of [['in',.15],['out',-.15],['reset',0]])$(k).onclick=()=>{
  zoom=n?Math.max(.55,Math.min(2,zoom+n)):1;
  renderTree();
};
const viewport=$('viewport');
let drag=null;
viewport.onpointerdown=e=>{
  if(e.button!==0||e.target.closest('button')||e.pointerType==='touch')return;
  drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};
  viewport.setPointerCapture(e.pointerId);
};
viewport.onpointermove=e=>{
  if(drag?.id!==e.pointerId)return;
  viewport.scrollLeft=drag.left+drag.x-e.clientX;
  viewport.scrollTop=drag.top+drag.y-e.clientY;
};
viewport.onlostpointercapture=()=>{drag=null;};
new ResizeObserver(renderTree).observe(viewport);
function reviseEvidence(p,key,original){
  form('Reassess evidence',[
    muted(`Current claim: ${original.value}. The previous tier and citation stay in the record.`),
    ...evidenceFields()
  ],f=>commit('Reassessed evidence',t=>{
    const target=get(t,p.id);
    const group=key?target.facts[key]:t.links;
    const prior=group.find(rec=>rec.id===original.id);
    const updated={...prior,...factsFrom(f,prior.value)};
    if(!key&&updated.kind==='parent'&&updated.tier!=='ruled'&&closure([updated.b],i=>children(t,i)).has(updated.a))
      throw Error('This link would make a person their own ancestor.');
    prior.supersededBy=updated.id;
    delete updated.supersededBy;
    group.push(updated);
    if(key&&target.picks[key]===prior.id)delete target.picks[key];
  }));
}
function addFact(p,key){
  form('Add evidence',[
    field('Field','key',{options:Object.entries(fields),initial:key}),
    field('What the source says','value',{required:true,maxlength:2000,multiline:true}),
    ...evidenceFields()
  ],f=>commit('Added evidence',t=>{
    const target=get(t,p.id), k=f.get('key'), fact=factsFrom(f,f.get('value'));
    (target.facts[k] ||= []).push(fact);
    if(active(target,k).some(other=>other.value.trim().toLowerCase()!==fact.value.trim().toLowerCase())&&fact.tier!=='ruled')
      delete target.picks[k];
  }));
}
function candidateFields(){
  return [
    el('fieldset',{},el('legend',{},'Look-alike check'),
      muted('Compare the candidate against your known person or family. Mark Missing when a detail is unavailable. A discrepancy blocks adding the match.'),
      ...['Birth year','Place','Parents','Spouse','Children','Death place'].map((x,i)=>field(x,'guard'+i,{
        required:true,options:[['','Choose a comparison'],['matches','Matches'],['missing','Missing or not recorded'],['differs','Differs']]
      })),
      field('Comparison notes','comparison',{required:true,multiline:true,maxlength:1500,placeholder:'Record the names, places or dates you compared.'})),
    el('fieldset',{},el('legend',{},'Spelling check'),
      field('Name spelling','spelling',{required:true,options:[['','Choose a result'],['same','No alternate spelling found'],['social','Alternate spelling checked against Facebook / Instagram'],['skip','Alternate spelling · social check unavailable or skipped']]}),
      field('Alternate spelling','variant',{maxlength:200,placeholder:'Record each known variant separately on the card'}))
  ];
}
const relationshipOptions=[['','Unconnected person'],['parent','Parent of selected person'],['child','Child of selected person'],['sibling','Sibling of selected person'],['spouse','Partner of selected person']];
function addPerson(){
  const existing=tree.people.length>0;
  const editingMode=mode;
  const nameField=field('Full name','name',{required:true,maxlength:120});
  const warning=el('p',{class:'open',role:'status',hidden:true});
  const similar=typed=>typed.trim().length<3?[]:[...new Set(tree.people.flatMap(p=>[
    ...active(p,'Name').map(f=>f.value),...p.spellings.map(s=>s.value)
  ]))].filter(known=>similarSpelling(known,typed));
  nameField.querySelector('input').oninput=e=>{
    const candidates=similar(e.target.value);
    warning.hidden=!candidates.length;
    warning.textContent=candidates.length?`Same or similar name: ${candidates.slice(0,4).join(', ')}. Compare the family details and check alternate spellings on Facebook or Instagram if appropriate.`:'';
  };
  form(existing?'Add a person':'Start with yourself',[
    nameField,warning,
    field('Birth date','born',{maxlength:60,placeholder:'Year or full date, if known'}),
    field('Birth place','place',{maxlength:200}),
    ...(existing?[
      field('Related to','anchor',{options:relOptions(),initial:selected}),
      field('Relationship to that person','kind',{options:relationshipOptions}),
      field('Identity review','result',{required:true,options:[['','Choose an outcome'],['add','Add after review'],['reject','Save to Do NOT add list']]}),
      muted('Check a similar spelling on Facebook or Instagram if appropriate. You can do this separately and leave the name as a lead when evidence is thin.'),
      ...candidateFields()
    ]:[]),
    ...evidenceFields()
  ],async f=>{
    if(mode!==editingMode)throw Error('The active tree changed. Reopen this form.');
    const n=factsFrom(f,f.get('name'));
    const relationship=f.get('kind');
    const results=existing?Array.from({length:6},(_,i)=>f.get('guard'+i)):[];
    const labels=['Birth year','Place','Parents','Spouse','Children','Death place'];
    const checkNotes=existing?`${labels.map((v,i)=>`${v}: ${results[i]}`).join(' · ')}. ${f.get('comparison').trim()}`:'';
    const variant=f.get('variant')?.trim();
    const spelling=f.get('spelling');
    if(existing&&!f.get('comparison').trim())throw Error('Enter the identity comparison notes.');
    if(f.get('result')==='reject'){
      await commit('Ruled out a candidate',t=>t.excluded.push({...n,tier:'ruled',text:`${n.value} · ${checkNotes}`}));
      return;
    }
    if(results.includes('differs'))throw Error('A comparison differs. Investigate the discrepancy or save this candidate to the Do NOT add list.');
    if(n.tier==='ruled')throw Error('Use the Do NOT add list to keep a ruled-out identity.');
    if(spelling&&spelling!=='same'&&!variant)throw Error('Enter the alternate spelling you checked.');
    const possible=similar(n.value);
    const excluded=tree.excluded.some(x=>similarSpelling(x.value,n.value));
    if(excluded||possible.length){
      if(!confirm(`${excluded?'The Do NOT add list contains this name. ':'The tree contains the same or a similar name. '}Add it only if your comparison identifies a different person.`))
        throw Error('Candidate left unadded.');
    }
    const p=person(n.value,n.tier,n.source,n.url);
    if(f.get('born')?.trim())p.facts.Birth=[factsFrom(f,f.get('born'))];
    if(f.get('place')?.trim())p.facts.BirthPlace=[factsFrom(f,f.get('place'))];
    if(existing)p.facts.Note=[{...n,id:id(),value:`Identity review · ${checkNotes}`}];
    if(variant)p.spellings.push({...n,id:id(),value:variant,text:`${variant} · ${spelling==='social'?'Social cross-check completed':'Social cross-check skipped or unavailable'}`});
    await commit('Added a person',t=>{
      t.people.push(p);
      t.root ||= p.id;
      if(relationship){
        const anchor=f.get('anchor'), kind=relationship==='child'?'parent':relationship;
        const [a,b]=relationship==='child'?[anchor,p.id]:[p.id,anchor];
        t.links.push({...n,id:id(),kind,a,b,value:kind});
      }
    });
    selected=p.id;
    render();
  });
}
$('add').onclick=addPerson;
function linkPerson(p){
  form('Link an existing person',[
    field('Other person','other',{options:relOptions(p.id),required:true}),
    field(`Relationship to ${name(p)}`,'kind',{options:relationshipOptions.slice(1)}),
    ...candidateFields(),...evidenceFields()
  ],f=>commit('Reviewed a relationship',t=>{
    const relationship=f.get('kind'), other=f.get('other');
    const kind=relationship==='child'?'parent':relationship;
    const [a,b]=relationship==='child'?[p.id,other]:[other,p.id];
    const notes=f.get('comparison').trim();
    const variant=f.get('variant').trim(), spelling=f.get('spelling');
    if(!notes)throw Error('Enter the identity comparison notes.');
    if(spelling!=='same'&&!variant)throw Error('Enter the alternate spelling you checked.');
    const rec=factsFrom(f,kind);
    if(rec.tier!=='ruled'&&Array.from({length:6},(_,i)=>f.get('guard'+i)).includes('differs'))
      throw Error('A comparison differs. Investigate or record the relationship as Ruled out.');
    if(kind==='parent'&&rec.tier!=='ruled'&&closure([b],i=>children(t,i)).has(a))
      throw Error('This link would make a person their own ancestor.');
    if(t.links.some(l=>l.kind===kind&&l.a===a&&l.b===b&&l.tier===rec.tier&&l.source===rec.source&&l.url===rec.url))
      throw Error('This relationship and source are already logged.');
    const otherPerson=get(t,other);
    const comparisons=['Birth year','Place','Parents','Spouse','Children','Death place']
      .map((label,i)=>`${label}: ${f.get('guard'+i)}`).join(' · ');
    (otherPerson.facts.Note ||= []).push({...rec,id:id(),value:`Identity review · ${comparisons}. ${notes}`});
    if(variant)otherPerson.spellings.push({...rec,id:id(),value:variant,text:`${variant} · ${spelling==='social'?'Social cross-check completed':'Social cross-check skipped or unavailable'}`});
    t.links.push({...rec,a,b,kind});
  }));
}
function addQuestion(p){
  form('Log an open question',[field('What needs checking?','q',{required:true,multiline:true,maxlength:700})],f=>commit('Logged an open question',t=>{
    const text=f.get('q').trim();
    if(!text)throw Error('Enter a question.');
    get(t,p.id).questions.push({text,closed:false});
  }));
}
function outreach(p,q){
  form('Draft a family message',[
    field('Who are you asking?','recipient',{placeholder:'Optional first name',maxlength:100}),
    field('What would you like to ask?','q',{required:true,multiline:true,initial:q||`Do you remember ${name(p)}’s birth year or where they were born?`}),
    muted('You can skip this step and return to the card.')
  ],f=>{
    const recipient=f.get('recipient').trim();
    const text=`Hi${recipient?' '+recipient:' there'}! I’m putting together our family tree and hoped you could help. ${f.get('q').trim()} It’s fine if you’re unsure or would rather skip. Thank you!`;
    // Let the form close before presenting the draft.
    setTimeout(()=>dialog('Family message draft',field('Copy or edit your message','draft',{multiline:true,initial:text}),button('Done',close)),0);
  },'Create draft');
}
function paid(p){
  form('Log a PAID OPTION',[
    field('Record or service','record',{required:true,maxlength:300}),
    field('Cost, including currency','cost',{required:true,maxlength:100}),
    field('What might it prove?','proof',{required:true,multiline:true,maxlength:800}),
    muted('Check free indexes, extracts and family copies first. This log is for planning purchases.')
  ],f=>commit('Logged a paid option',t=>{
    const values=['record','cost','proof'].map(key=>f.get(key).trim());
    if(values.some(x=>!x))throw Error('Record, cost and research purpose are required.');
    get(t,p.id).paid.push({text:`PAID OPTION · ${values[0]} · ${values[1]} · Could prove: ${values[2]}`});
  }));
}
function spelling(p){
  form('Log a spelling check',[
    field('Alternate or corrected spelling','v',{required:true,maxlength:120}),
    field('Cross-check result','how',{options:[['Checked Facebook / Instagram','Checked Facebook / Instagram'],['Social check skipped or unavailable','Social check skipped or unavailable']]}),
    muted('Compare family names and places as well as spelling. Social profiles can provide leads.'),
    ...evidenceFields()
  ],f=>commit('Logged a spelling check',t=>{
    const rec=factsFrom(f,f.get('v'));
    get(t,p.id).spellings.push({...rec,text:`${rec.value} · ${f.get('how')}`});
  }));
}
function attach(p){
  form('Attach a record or photo',[
    field('Image','image',{type:'file',accept:'image/png,image/jpeg,image/webp,image/gif',required:true}),
    field('Caption','caption',{required:true,maxlength:300}),
    field('Date found','found',{type:'date',required:true,initial:day()}),
    ...evidenceFields()
  ],f=>commit('Attached an image',async t=>{
    const file=f.get('image');
    if(file.size>8*1024*1024||!/^image\/(png|jpeg|webp|gif)$/.test(file.type))throw Error('Choose a PNG, JPG, WebP or GIF up to 8 MB.');
    const bitmap=await createImageBitmap(file);
    bitmap.close();
    const rec=factsFrom(f,f.get('caption'));
    const bytes=new Uint8Array(await file.arrayBuffer());
    let binary='';
    for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    t.media[rec.id]=`data:${file.type};base64,${btoa(binary)}`;
    get(t,p.id).images.push({...rec,text:`${rec.value} · Found ${f.get('found')}`});
  }));
}
function researchFinding(p,step){
  const census=step.startsWith('Census');
  const death=step==='Death indexes';
  form(`Log a finding · ${step}`,[
    field(census?'Household, ages, occupations and relationships':death?'Jurisdiction, year and certificate number':'What did you find?','finding',{
      required:true,multiline:true,maxlength:2000
    }),
    ...evidenceFields()
  ],f=>commit(`Logged research · ${step}`,t=>{
    const person=get(t,p.id);
    (person.research ||= []).push({...factsFrom(f,f.get('finding')),step});
  }));
}
function checklist(p){
  const known=[name(p),value(p,'Birth'),value(p,'BirthPlace'),value(p,'Death'),value(p,'DeathPlace')]
    .concat(liveLinks(tree).filter(l=>l.a===p.id||l.b===p.id).map(l=>name(get(tree,l.a===p.id?l.b:l.a))))
    .filter(Boolean).join(' · ');
  const panel=el('details',{},el('summary',{},'Free-first research ladder'),muted(`Search clues (check their badges above): ${known}`));
  const list=el('ol');
  for(const [label,description,url] of ladder){
    const item=el('input',{type:'checkbox',disabled:mode==='shared'});
    item.checked=!!p.checks[label];
    item.onchange=action(async()=>{
      try{await commit(`Updated ${label} checklist`,t=>{get(t,p.id).checks[label]=item.checked;});}
      catch(e){item.checked=!item.checked;throw e;}
    });
    const entries=(p.research||[]).filter(rec=>rec.step===label);
    list.append(el('li',{},el('label',{class:'check'},item,label),description,
      url?el('div',{},el('a',{href:url,target:'_blank',rel:'noopener noreferrer'},'Open collection')):null,
      ...entries.map(r=>factRow('Finding',r)),
      mode==='shared'?null:el('div',{},button('Log finding',()=>researchFinding(p,label)))));
  }
  panel.append(list);
  return panel;
}
function renderCard(){
  const card=$('card'), p=get(tree,selected), edit=mode!=='shared';
  if(!p){card.replaceChildren(el('h2',{},'Person details'),muted('Select a person to see their research.'));return;}
  const openDetails=new Set([...card.querySelectorAll('details[open] summary')].map(s=>s.textContent));
  const heading=el('div',{},el('p',{class:'eyebrow'},'Person record'),el('h2',{},name(p)));
  const actions=el('div',{class:'actions'},
    edit?button('Add fact',()=>addFact(p)):null,
    edit&&tree.people.length>1?button('Link person',()=>linkPerson(p)):null,
    p.id!==focus?button('View as this person',()=>{$('focus').value=p.id;$('focus').onchange();}):null);
  const facts=el('section',{},el('h3',{},'Facts and sources'));
  for(const [k,label] of Object.entries(fields)){
    const group=p.facts[k]||[];
    const values=new Set(active(p,k).map(f=>f.value.trim().toLowerCase()));
    if(k!=='Note'&&values.size>1)facts.append(el('p',{class:'open'},p.picks[k]?`${label} · selection recorded`:`OPEN · Conflicting ${label.toLowerCase()}`));
    for(const f of group){
      const available=!f.supersededBy && f.tier!=='ruled';
      const pick=k!=='Note'&&values.size>1&&available;
      facts.append(factRow(label,f,el('span',{class:'row'},
        f.supersededBy?el('small',{},'Earlier assessment'):edit?button('Reassess',()=>reviseEvidence(p,k,f)):null,
        pick&&(p.picks[k]===f.id?el('small',{},'Selected'):edit?button('Use this value',action(()=>commit(
          'Selected a conflicting value',t=>{get(t,p.id).picks[k]=f.id;})
        )):null))));
    }
  }
  const rel=el('section',{},el('h3',{},'Relationships'));
  const links=tree.links.filter(l=>l.a===p.id||l.b===p.id);
  if(!links.length)rel.append(muted('No relationships recorded.'));
  for(const l of links){
    const other=get(tree,l.a===p.id?l.b:l.a);
    const label=l.kind==='parent'?(l.a===p.id?'Child':'Parent'):l.kind==='spouse'?'Partner':'Sibling';
    rel.append(factRow(label,{...l,value:name(other)},el('span',{class:'row'},
      button('Open card',()=>{selected=other.id;render();}),
      l.supersededBy?el('small',{},'Earlier assessment'):edit?button('Reassess',()=>reviseEvidence(p,null,l)):null)));
  }
  const alerts=ageAlerts(tree).filter(a=>[a.link.a,a.link.b].includes(p.id));
  for(const a of alerts)rel.append(el('p',{class:'open'},'OPEN · ',a.text),edit?button('Draft a question',()=>outreach(p,a.text)):null);
  const questions=el('details',{},el('summary',{},'Open questions and family outreach'));
  for(const [i,q] of p.questions.entries())questions.append(el('p',{},q.closed?'Closed · ':'OPEN · ',q.text),edit?el('div',{class:'actions'},
    button('Draft message',()=>outreach(p,q.text)),
    button(q.closed?'Reopen':'Mark closed',action(()=>commit('Updated an open question',t=>{get(t,p.id).questions[i].closed=!q.closed;})))):null);
  if(edit)questions.append(el('div',{class:'actions'},button('Add question',()=>addQuestion(p)),button('Draft message',()=>outreach(p))));
  const spellingLog=el('details',{},el('summary',{},'Spelling corrections'));
  for(const s of p.spellings)spellingLog.append(factRow('Variant',{...s,value:s.text}));
  if(edit)spellingLog.append(button('Log spelling check',()=>spelling(p)));
  const payment=el('details',{},el('summary',{},'Paid options'));
  for(const item of p.paid)payment.append(el('p',{},item.text));
  if(edit)payment.append(button('Log PAID OPTION',()=>paid(p)));
  const images=el('details',{},el('summary',{},'Photos and record images'));
  for(const r of p.images){
    const src=tree.media[r.id];
    images.append(factRow('Attachment',{...r,value:r.text}));
    if(typeof src==='string'&&/^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(src))
      images.append(el('img',{src,alt:r.value,loading:'lazy'}));
  }
  if(edit)images.append(button('Attach image',()=>attach(p)));
  card.replaceChildren(heading,actions,facts,rel,checklist(p),questions,spellingLog,payment,images);
  for(const detail of card.querySelectorAll('details'))detail.open=openDetails.has(detail.querySelector('summary').textContent);
}
$('review').onclick=()=>{
  const report=audit(tree);
  const sections=[
    ['Agreements',report.agreements],['Unresolved conflicts',report.conflicts],
    ['Research gaps',report.gaps]
  ];
  dialog('Two-pass cross-reference',muted('Pass one reads the current evidence. Pass two groups values by field, compares source citations and checks dates and relationships.'),
    ...sections.map(([label,items])=>el('section',{},el('h3',{},`${label} (${items.length})`),
      items.length?el('ul',{},...items.map(item=>el('li',{},typeof item==='string'?item:
        button(item.text,()=>{selected=item.p.id;render();close();$('card').scrollIntoView({block:'nearest'});})))):muted('None found.'))));
};
$('excluded').onclick=()=>{
  const log=tree.excluded.length?tree.excluded.map(r=>factRow('Candidate',{...r,value:r.text})):
    [muted('No look-alikes have been ruled out.')];
  dialog('Do NOT add list',...log,mode==='shared'?null:button('Log a ruled-out candidate',()=>{
    form('Rule out a candidate',[
      field('Candidate name','name',{required:true,maxlength:150}),
      field('What ruled them out?','reason',{required:true,multiline:true,maxlength:1000}),
      field('Source citation','source',{required:true,maxlength:500}),
      field('Source link','url',{type:'url'})
    ],f=>commit('Ruled out a candidate',t=>{
      f.set('tier','ruled');
      const rec=factsFrom(f,f.get('name')), reason=f.get('reason').trim();
      if(!reason)throw Error('Enter the distinguishing evidence.');
      t.excluded.push({...rec,text:`${rec.value} · ${reason}`});
    }));
  }));
};
const heritageTypes=['Surname meaning / origin','Immigration','Earliest confirmed ancestor'];
$('heritage').onclick=()=>{
  const lines=[...new Set([...tree.people.map(surname),...tree.heritage.map(h=>h.line)])].sort();
  dialog('Surname heritage',muted('Keep a separate citation and evidence tier for each heritage claim.'),
    ...lines.map(line=>el('details',{},el('summary',{},line),
      ...heritageTypes.map(kind=>el('section',{},el('h3',{},kind),
        ...tree.heritage.filter(h=>h.line===line&&h.kind===kind).map(h=>factRow('Claim',h)),
        ...(tree.heritage.some(h=>h.line===line&&h.kind===kind)?[]:[muted('Open research question.')]))))),
    mode==='shared'?null:button('Add heritage claim',()=>form('Add heritage claim',[
      field('Surname line','line',{required:true,initial:get(tree,selected)?surname(get(tree,selected)):'',maxlength:120}),
      field('Topic','kind',{options:heritageTypes.map(x=>[x,x])}),
      field('What does the source say?','claim',{required:true,multiline:true,maxlength:1800}),
      ...evidenceFields()
    ],f=>commit('Added a heritage claim',t=>{
      const line=f.get('line').trim();
      if(!line)throw Error('Enter the surname line.');
      t.heritage.push({...factsFrom(f,f.get('claim')),line,kind:f.get('kind')});
    }))));
};
async function switchMode(next){
  if(busy)throw Error('Wait for the current save to finish.');
  const saved=await store(next);
  tree=saved||(next==='demo'?sample():empty());
  mode=next;
  if(next==='demo'&&!saved)await store(next,tree);
  if(targetHash)history.replaceState(null,'',location.pathname+location.search);
  cfg.set('ftf.mode',mode);
  loadFocus();
  $('search').value='';
  $('side').value='';
  $('surname').value='';
  render();
  status('');
}
$('new').onclick=action(async()=>{
  await switchMode(mode==='private'?'demo':'private');
  if(mode==='private'&&!tree.people.length)addPerson();
});
$('import').onclick=()=>$('file').click();
async function importTree(incoming){
  if(busy)throw Error('Wait for the current save to finish.');
  const previous=await store('private');
  if(previous?.people.length&&!confirm('Replace the active private tree? Its prior versions will be included in the handoff archive.'))return;
  if(previous){
    incoming.history=[...previous.history,{at:new Date().toISOString(),reason:'Previous private tree before import',state:snapshot(previous)},...incoming.history];
    incoming.media={...previous.media,...incoming.media};
  }
  incoming.updated=day();
  await store('private',incoming);
  await switchMode('private');
  status('Imported and saved on this device.');
}
$('file').onchange=action(async()=>{
  const file=$('file').files[0];
  $('file').value='';
  if(!file)return;
  await importTree(fromFile(file.name,await file.text()));
});
function download(extension,content,type){
  const url=URL.createObjectURL(new Blob([content],{type}));
  const link=el('a',{href:url,download:`family-tree-${day()}.${extension}`});
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
$('handoff').onclick=action(()=>download('md',markdown(tree),'text/markdown'));
$('export').onclick=()=>{
  dialog('Export or share',muted('Full backups contain private evidence, notes, images and earlier versions. Review who will receive them before sharing.'),
    el('div',{class:'actions'},
      button('JSON backup',action(()=>download('json',JSON.stringify(tree,null,2),'application/json'))),
      button('GEDCOM',action(()=>download('ged',gedcom(tree),'text/plain'))),
      button('Markdown handoff',action(()=>download('md',markdown(tree),'text/markdown')))),
    el('h3',{},'Share a redacted outline'),
    muted('Anyone with the link can open the outline and see its family structure. It hides potentially living people’s names and omits addresses, emails, exact birth dates, notes, sources and images. Review the outline before giving out the link.'),
    button('Generate redacted link',action(()=>{
      if(!tree.people.length)throw Error('Add a person before sharing.');
      const hash=shareTree(tree);
      const url=new URL(location.pathname,location.origin);
      url.hash='tree='+hash;
      if(url.href.length>64000)throw Error('This outline is too large for a reliable link. Export a file for private use.');
      dialog('Redacted sharing link',muted('Anyone you send this link to can open it.'),field('Copy link','link',{multiline:true,initial:url.href,readonly:true}),
        el('a',{href:url.href,target:'_blank',rel:'noopener noreferrer'},'Preview the outline'));
    })),
    mode==='shared'?button('Save as my private tree',action(async()=>{await importTree(structuredClone(tree));close();})):null);
};
$('guide').onclick=()=>{
  dialog('Find your first ancestor',
    el('ol',{},
      el('li',{},'Start with yourself. Add a parent or grandparent you can identify. Keep firsthand details with a citation and mark family recollections as leads unless they meet the confirmation criteria.'),
      el('li',{},'Pick a person whose household you can reasonably find. Open their free-first ladder and use the name, years, places and relatives as clues.'),
      el('li',{},'Work down the collections below. Record the names and places exactly as each source gives them. Log a PAID OPTION with its cost and purpose before considering a purchase.'),
      el('li',{},'Compare six identity clues before adding a match. Keep discrepant candidates in the Do NOT add list. Ask a relative about inconsistent ages or alternate spellings.'),
      el('li',{},'Run the two-pass cross-reference. If two records disagree, leave the conflict open until you have reason to pick a value. Export the Markdown handoff when you want a portable copy.')),
    el('h3',{},'Free-first order'),
    el('ol',{},...ladder.map(([label,tip,url])=>el('li',{},url?el('a',{href:url,target:'_blank',rel:'noopener noreferrer'},label):el('strong',{},label),' · ',tip))),
    el('p',{},'The ladder starts with U.S. records. If the family lived elsewhere, use equivalent census and civil records for that place.'));
};
render();
if(storageError)status(storageError);
