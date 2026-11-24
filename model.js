export const tiers = {confirmed: 'Confirmed', lead: 'Lead / Believed', ruled: 'Ruled out'};
export const fields = {
  Name: 'Name', Surname: 'Surname', Birth: 'Birth date', BirthPlace: 'Birth place',
  Death: 'Death date', DeathPlace: 'Death place', Note: 'Note'
};
export const ladder = [
  ...[1920,1930,1940,1950].map(y => [`Census ${y}`, 'Reconstruct the household. Compare residents, ages, relationships and occupations.', 'https://www.archives.gov/research/census']),
  ['Death indexes', 'Record the jurisdiction, year and certificate number.', ''],
  ['SSA / SS-5 applications', 'Compare birth name and parents. Check for an index first. Ordering an SS-5 from SSA is a paid option.', 'https://www.ssa.gov/faqs/en/questions/KA-02585.html'],
  ['World War II draft cards', 'Check birth date, residence, employer and nearest contact.', ''],
  ['Marriage records', 'Check maiden names, parents, witnesses and residences.', ''],
  ['Birth certificates', 'Look for a free index first. Compare names, dates, places and parents.', ''],
  ['Obituaries', 'List relatives by relationship and distinguish survivors from those who died earlier.', ''],
  ['Newspapers', 'Search name variants and places across local titles.', 'https://www.loc.gov/collections/chronicling-america/'],
  ['FamilySearch', 'Search the catalog and record collections. Follow tree hints back to the original record.', 'https://www.familysearch.org/en/search/']
];
export const id = () => globalThis.crypto.randomUUID();
export const day = () => new Date(Date.now() - new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
export const empty = () => ({version:1, title:'My family', root:'', people:[], links:[], excluded:[], heritage:[], history:[], media:{}});
export function evidence(value, tier, source, url = '') {
  return {id:id(), value, tier, source, url, date:day()};
}
export function person(name, tier, source, url) {
  return {id:id(), facts:{Name:[evidence(name,tier,source,url)]}, picks:{}, checks:{}, research:[], spellings:[], paid:[], images:[], questions:[]};
}
export function active(p, k) {
  return (p.facts[k] || []).filter(f => f.tier !== 'ruled' && !f.supersededBy);
}
export function choice(p, k) {
  const facts = active(p,k);
  return facts.find(f => f.id === p.picks[k]) ||
    (new Set(facts.map(f => f.value.trim().toLowerCase())).size === 1 ? facts.find(f=>f.tier==='confirmed') || facts[0] : undefined);
}
export const value = (p,k) => choice(p,k)?.value || '';
export const name = p => p ? value(p,'Name') || 'Name unresolved' : 'Unknown person';
const normalizeName = text => text.normalize('NFD').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export function similarSpelling(a,b){
  const first=normalizeName(a), second=normalizeName(b);
  if(first===second)return true;
  const [short,long]=first.length<=second.length?[first,second]:[second,first];
  if(short.length<5||long.length-short.length>1)return false;
  const i=short.split('').findIndex((c,index)=>c!==long[index]);
  if(i<0)return true;
  if(short.length!==long.length)return short.slice(i)===long.slice(i+1);
  return short.slice(i+1)===long.slice(i+1)||
    (short[i]===long[i+1]&&short[i+1]===long[i]&&short.slice(i+2)===long.slice(i+2));
}
export const surname = p => value(p,'Surname') || name(p).trim().split(/\s+/).at(-1);
export const year = s => Number(String(s).match(/\b\d{4}\b/)?.[0]) || null;
export const liveLinks = t => t.links.filter(l => l.tier !== 'ruled' && !l.supersededBy);
export const get = (t,i) => t.people.find(p => p.id === i);
export function parents(t,i) { return liveLinks(t).filter(l=>l.kind==='parent'&&l.b===i).map(l=>l.a); }
export function children(t,i) { return liveLinks(t).filter(l=>l.kind==='parent'&&l.a===i).map(l=>l.b); }
export function closure(start, next) {
  const seen = new Set(start);
  const queue = [...start];
  for (const i of queue) for (const j of next(i)) if (!seen.has(j)) { seen.add(j); queue.push(j); }
  return seen;
}
export function generations(t, focus, all) {
  const depths = new Map();
  if (all) {
    const depth = (i, trail = new Set()) => {
      if (depths.has(i)) return depths.get(i);
      if (trail.has(i)) return 0;
      const d = Math.max(0,...parents(t,i).map(p=>1+depth(p,new Set([...trail,i]))));
      depths.set(i,d);
      return d;
    };
    t.people.forEach(p=>depth(p.id));
    return depths;
  }
  const queue = [focus];
  depths.set(focus,0);
  for (const i of queue) {
    const d = depths.get(i);
    const neighbors = [
      ...parents(t,i).map(j=>[j,d-1]), ...children(t,i).map(j=>[j,d+1]),
      ...liveLinks(t).filter(l=>l.kind!=='parent'&&(l.a===i||l.b===i)).map(l=>[l.a===i?l.b:l.a,d]),
      ...parents(t,i).flatMap(j=>children(t,j)).map(j=>[j,d])
    ];
    for (const [j,n] of neighbors) if (!depths.has(j)) { depths.set(j,n); queue.push(j); }
  }
  return depths;
}
export function relative(t,i,f,d) {
  if(i===f) return 'Selected viewpoint';
  const direct = liveLinks(t).find(l=>l.kind!=='parent'&&[l.a,l.b].includes(i)&&[l.a,l.b].includes(f));
  if(direct) return direct.kind === 'spouse' ? 'Partner' : 'Sibling';
  if(parents(t,f).includes(i)) return 'Parent';
  if(children(t,f).includes(i)) return 'Child';
  if(parents(t,f).some(p=>parents(t,i).includes(p))) return 'Sibling';
  if(closure([f],j=>parents(t,j)).has(i)) return d===-2?'Grandparent':'Ancestor';
  if(closure([f],j=>children(t,j)).has(i)) return d===2?'Grandchild':'Descendant';
  return 'Extended family';
}
export function ageAlerts(t) {
  return liveLinks(t).filter(l=>l.kind==='parent').flatMap(l=>{
    const a=get(t,l.a), b=get(t,l.b);
    const ages = [...new Set(active(a,'Birth').flatMap(x=>active(b,'Birth').map(y=>{
      const start=year(x.value), end=year(y.value);
      return start && end ? end-start : null;
    })).filter(n=>n!==null&&(n<16||n>65)))];
    return ages.length ? [{link:l,text:`${name(a)} may have been about ${ages.join(' or ')} when ${name(b)} was born. Ask family to check the dates and relationship.`}] : [];
  });
}
export function audit(t) {
  const report = {agreements:[], conflicts:[], gaps:[]};
  for(const p of t.people) {
    for(const [key,label] of Object.entries(fields)) {
      if(key==='Note') continue;
      const facts=active(p,key);
      const groups=Map.groupBy(facts,f=>f.value.trim().toLowerCase());
      if(groups.size>1 && !choice(p,key)) report.conflicts.push({p,key,text:`${name(p)} · ${label}`});
      if([...groups.values()].some(g=>new Set(g.map(f=>f.url||f.source)).size>1)) report.agreements.push(`${name(p)} · ${label} appears in multiple citations.`);
      if(['Name','Birth','BirthPlace'].includes(key)&&!facts.some(f=>f.tier==='confirmed')) report.gaps.push(`${name(p)} · ${label} needs confirmation.`);
    }
    if(!parents(t,p.id).length) report.gaps.push(`${name(p)} · Parents not recorded.`);
    for(const q of p.questions.filter(q=>!q.closed)) report.gaps.push(`${name(p)} · ${q.text}`);
  }
  for(const a of ageAlerts(t)) report.gaps.push(a.text);
  return report;
}
const demoSource = '#fictional-records';
export function sample() {
  const t=empty();
  t.title='Fictional demo · The Bramblewick family';
  const rows=[
    ['Mira Bramblewick','1988','Bellharbor'],['Iona Bramblewick','1959','Bellharbor'],
    ['Tobin Flintmere','1956','Alder Shoal'],['Perry Bramblewick','1991','Bellharbor'],
    ['Lark Bramblewick','2018','Bellharbor'],['Ada Bramblewick','1931','Alder Shoal']
  ];
  t.people=rows.map(([n,y,place])=>{
    const p=person(n,'confirmed','Fictional family interview',demoSource);
    p.facts.Birth=[evidence(y,'confirmed','Fictional family interview',demoSource)];
    p.facts.BirthPlace=[evidence(place,'lead','Fictional research notebook',demoSource)];
    return p;
  });
  t.root=t.people[0].id;
  for(const [a,b,kind] of [[5,1,'parent'],[1,0,'parent'],[2,0,'parent'],[1,3,'parent'],[2,3,'parent'],[0,4,'parent'],[1,2,'spouse']])
    t.links.push({...evidence(kind,'confirmed','Fictional family interview',demoSource),a:t.people[a].id,b:t.people[b].id,kind});
  t.people[5].facts.Birth.push(evidence('1932','lead','Fictional 1940 census transcription',demoSource));
  t.people[5].questions.push({text:'Which birth year matches Ada’s original record?',closed:false});
  return t;
}
export function snapshot(t) {
  const {history,media,...current}=t;
  return JSON.stringify(current);
}
export function validate(t) {
  if(t?.version!==1||!Array.isArray(t.people)||!Array.isArray(t.links)||!Array.isArray(t.excluded)||
     !Array.isArray(t.heritage)||!Array.isArray(t.history)||!t.media||typeof t.title!=='string')
    throw Error('Choose a Family Tree Finder backup or a supported GEDCOM file.');
  const ids=new Set(t.people.map(p=>p.id));
  const validFact=f=>f&&typeof f.value==='string'&&typeof f.source==='string'&&Object.hasOwn(tiers,f.tier);
  if(ids.size!==t.people.length||(!ids.has(t.root)&&t.people.length)||
     t.people.some(p=>typeof p.id!=='string'||!p.facts||!p.picks||!p.checks||
       !['spellings','paid','images','questions'].every(k=>Array.isArray(p[k]))||
       Object.values(p.facts).some(group=>!Array.isArray(group)||group.some(f=>!validFact(f))))||
     t.links.some(l=>!validFact(l)||!ids.has(l.a)||!ids.has(l.b)||l.a===l.b||!['parent','spouse','sibling'].includes(l.kind))||
     t.heritage.some(h=>!validFact(h)))
    throw Error('The backup contains invalid evidence or family links.');
  return t;
}
