import {audit, choice, empty, evidence, fields, get, liveLinks, name, person, validate, value, year} from './model.js';

const encode = data => Array.from(new TextEncoder().encode(JSON.stringify(data)), b=>b.toString(16).padStart(2,'0')).join('');
const decode = text => {
  if (!/^(?:[\da-f]{2})+$/i.test(text)) throw Error('Invalid backup encoding.');
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(text.match(/../g), b=>parseInt(b,16))));
};
const clean = s => String(s??'').replace(/[\r\n]+/g,' ').trim();
const md = s => clean(s).replace(/[\\`*_{}\[\]()<>#+.!|]/g, '\\$&');
const citation = f => {
  const url = /^https?:\/\/[^\s<>]+$/i.test(f.url || '') ? ` <${f.url}>` : '';
  return `${f.tier.toUpperCase()} · ${md(f.source)}${url}`;
};
export function markdown(t) {
  const out = [`# ${md(t.title)}`, '', `Last worked on: ${t.updated?.slice(0,10)||'No edits recorded'}`, ''];
  const archive = s => {
    for (const p of s.people) {
      out.push(`## ${md(name(p))}`, '');
      for(const [k, facts] of Object.entries(p.facts)) for(const f of facts)
        out.push(`- ${fields[k]||md(k)}: ${md(f.value)} · ${citation(f)}${p.picks[k]===f.id?' · selected':''}${f.supersededBy?' · earlier assessment':''}`);
      for(const l of s.links.filter(l=>l.a===p.id||l.b===p.id))
        out.push(`- ${md(l.kind)} link: ${md(name(get(s,l.a)))} / ${md(name(get(s,l.b)))} · ${citation(l)}${l.supersededBy?' · earlier assessment':''}`);
      for(const r of p.research||[]) out.push(`- ${md(r.step)}: ${md(r.value)} · ${citation(r)}`);
      for(const q of p.questions) out.push(`- ${q.closed?'Closed':'OPEN'}: ${md(q.text)}`);
      for(const k of ['spellings','paid','images'])
        for(const item of p[k]) out.push(`- ${k}: ${md(item.text)}${item.tier?' · '+citation(item):''}`);
      for(const [label,done] of Object.entries(p.checks)) out.push(`- [${done?'x':' '}] ${md(label)}`);
      out.push('');
    }
    out.push('### Do NOT add', '');
    for(const r of s.excluded) out.push(`- ${md(r.text)} · ${citation(r)}`);
    out.push('', '### Heritage', '');
    for(const h of s.heritage) out.push(`- ${md(h.line)} · ${md(h.kind)}: ${md(h.value)} · ${citation(h)}`);
    out.push('');
  };
  archive(t);
  const review = audit(t);
  out.push('## Open questions and conflicts','',...review.gaps.map(x=>`- OPEN: ${md(x)}`),...review.conflicts.map(x=>`- OPEN: ${md(x.text)}`),'');
  out.push('## Archived versions','');
  for(const entry of t.history) {
    out.push(`### ${md(entry.at)} · ${md(entry.reason)}`,'');
    archive(JSON.parse(entry.state));
  }
  out.push('## Rebuild data','','<!-- family-tree-finder:start',encode(t),'family-tree-finder:end -->','');
  return out.join('\n');
}
const factTags={Birth:['BIRT','DATE'],BirthPlace:['BIRT','PLAC'],Death:['DEAT','DATE'],DeathPlace:['DEAT','PLAC']};
export function gedcom(t) {
  const rows=['0 HEAD','1 SOUR FAMILY_TREE_FINDER','1 GEDC','2 VERS 5.5.1','2 FORM LINEAGE-LINKED','1 CHAR UTF-8'];
  const refs = new Map(t.people.map((p,i)=>[p.id,`@I${i+1}@`]));
  const groups=new Map();
  for(const p of t.people) {
    const ancestors=[...new Set(liveLinks(t).filter(l=>l.kind==='parent'&&l.b===p.id).map(l=>l.a))];
    for(let i=0;i<ancestors.length;i+=2) {
      const pair=ancestors.slice(i,i+2).sort();
      const key=pair.join(' ');
      if(!groups.has(key)) groups.set(key,{pair,kids:[],ref:`@F${groups.size+1}@`});
      groups.get(key).kids.push(p.id);
    }
  }
  for(const l of liveLinks(t).filter(l=>l.kind==='spouse')){
    const pair=[l.a,l.b].sort(), key=pair.join(' ');
    if(!groups.has(key)) groups.set(key,{pair,kids:[],ref:`@F${groups.size+1}@`});
  }
  const selected=(p,k)=>choice(p,k);
  const source=(f, level)=>rows.push(`${level} NOTE ${clean(citation(f))}`);
  const gedDate=s=>{
    const iso=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return iso ? `${Number(iso[3])} ${['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][Number(iso[2])-1]} ${iso[1]}` : clean(s);
  };
  for(const p of t.people){
    rows.push(`0 ${refs.get(p.id)} INDI`);
    const n=selected(p,'Name');
    if(n){
      const last=value(p,'Surname')||name(p).split(/\s+/).at(-1);
      const first=n.value.endsWith(last)?n.value.slice(0,-last.length):n.value;
      rows.push(`1 NAME ${clean(first).replaceAll('/','')} /${clean(last).replaceAll('/','')}/`);
      source(n,2);
    }
    for(const event of ['BIRT','DEAT']){
      const entries=Object.entries(factTags).filter(([k,tags])=>tags[0]===event&&selected(p,k));
      if(entries.length) rows.push(`1 ${event}`);
      for(const [k,[,tag]] of entries) {
        const f=selected(p,k);
        rows.push(`2 ${tag} ${tag==='DATE'?gedDate(f.value):clean(f.value)}`);
        source(f,2);
      }
    }
    for(const g of groups.values()){
      if(g.pair.includes(p.id)) rows.push(`1 FAMS ${g.ref}`);
      if(g.kids.includes(p.id)) rows.push(`1 FAMC ${g.ref}`);
    }
  }
  for(const g of groups.values()){
    rows.push(`0 ${g.ref} FAM`);
    g.pair.forEach((p,i)=>rows.push(`1 ${i?'WIFE':'HUSB'} ${refs.get(p)}`));
    g.kids.forEach(p=>rows.push(`1 CHIL ${refs.get(p)}`));
  }
  rows.push('0 _FTF');
  for(const chunk of encode(t).match(/.{1,220}/g)) rows.push(`1 CONC ${chunk}`);
  return [...rows,'0 TRLR',''].join('\r\n');
}
export function readGedcom(text){
  const records=[];
  let current, parent;
  for(const line of text.replace(/^\uFEFF/,'').split(/\r?\n/)){
    const m=line.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?(\w+)(?:\s+(.*))?$/);
    if(!m) continue;
    const [,level,ref,tag,raw='']=m;
    if(level==='0') {current={ref,tag,entries:[]};records.push(current);parent='';continue;}
    if(!current) continue;
    if(level==='1') parent=tag;
    current.entries.push({level,tag,raw,parent});
  }
  const embedded=records.find(r=>r.tag==='_FTF');
  if(embedded) return validate(decode(embedded.entries.filter(e=>e.tag==='CONC').map(e=>e.raw).join('')));
  const t=empty(), map=new Map();
  t.title='Imported GEDCOM';
  const source='Imported GEDCOM · verify original sources';
  for(const r of records.filter(r=>r.tag==='INDI')){
    const n=r.entries.find(e=>e.tag==='NAME')?.raw?.replaceAll('/','').trim();
    const p=person(n||'Unnamed person','lead',source);
    for(const [k,[event,tag]] of Object.entries(factTags)){
      const matches=r.entries.filter(e=>e.parent===event&&e.tag===tag&&e.raw);
      if(matches.length) p.facts[k]=matches.map(e=>evidence(e.raw,'lead',source));
    }
    t.people.push(p);map.set(r.ref,p.id);
  }
  if(!t.people.length) throw Error('No individual records were found in the GEDCOM file.');
  t.root=t.people[0].id;
  const add=(a,b,kind)=>{
    if(a&&b&&a!==b&&!t.links.some(l=>l.a===a&&l.b===b&&l.kind===kind))
      t.links.push({...evidence(kind,'lead',source),a,b,kind});
  };
  for(const r of records.filter(r=>r.tag==='FAM')){
    const members=r.entries.filter(e=>['HUSB','WIFE'].includes(e.tag)).map(e=>map.get(e.raw));
    add(...[members[0],members[1],'spouse']);
    for(const p of members) for(const c of r.entries.filter(e=>e.tag==='CHIL')) add(p,map.get(c.raw),'parent');
  }
  return validate(t);
}
export function fromFile(filename,text){
  if(/\.ged(?:com)?$/i.test(filename)) return readGedcom(text);
  if(/\.md$|\.markdown$/i.test(filename)) {
    const payload=text.match(/<!-- family-tree-finder:start\s+([\da-f]+)\s+family-tree-finder:end -->/i)?.[1];
    if(!payload) throw Error('Import a Markdown handoff exported by Family Tree Finder.');
    return validate(decode(payload));
  }
  return validate(JSON.parse(text));
}
export function shareTree(t){
  const shared=empty();
  shared.title='Shared family outline';
  shared.root=t.root;
  shared.people=t.people.map((p,i)=>{
    const deceased=choice(p,'Death')?.tier==='confirmed' && !!year(value(p,'Death'));
    const n=deceased ? name(p).replace(/\S+@\S+/g,'').slice(0,120) : `Private person ${i+1}`;
    const copy=person(n,'lead','Redacted family outline');
    copy.id=p.id;
    const born=year(value(p,'Birth'));
    if(deceased && born) copy.facts.Birth=[evidence(String(born),'lead','Redacted family outline')];
    return copy;
  });
  shared.links=liveLinks(t).map(l=>({...evidence(l.kind,l.tier,'Redacted family outline'),kind:l.kind,a:l.a,b:l.b}));
  return encode(shared);
}
export function readShare(text){return validate(decode(text));}
