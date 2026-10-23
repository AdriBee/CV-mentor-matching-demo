import Fuse from './fuse.mjs';

export function createSearch(mentors) {
  const index = new Fuse(mentors, {
    threshold: 0.32, ignoreLocation: true, includeScore: true,
    keys: [
      {name: 'identity.name', weight: 4}, {name: 'research.topics', weight: 3},
      {name: 'research.specialties', weight: 2}, {name: 'research.summary', weight: 1},
      {name: 'identity.title', weight: 1}, {name: 'identity.appointment', weight: 1},
      {name: 'identity.institution', weight: 1}, {name: 'research.methods', weight: 1},
      {name: 'mentorship.desiredSkills', weight: 2}, {name: 'mentorship.projects.title', weight: 1},
      {name: 'mentorship.projects.summary', weight: 1}
    ]
  });
  return (state, saved = []) => {
    const terms = state.q.trim().split(/\s+/).filter(Boolean).slice(0, 15);
    let matches = mentors.map(item => ({item, score: 0}));
    for (const term of terms) {
      const scores = new Map(index.search(term).map(result => [result.item.id, result.score ?? 0]));
      matches = matches.filter(({item}) => scores.has(item.id)).map(result => ({...result, score: result.score + scores.get(result.item.id)}));
    }
    matches = matches.filter(({item: m}) =>
      (!state.area || m.research.areas.includes(state.area)) &&
      (!state.availability.length || state.availability.includes(m.mentorship.availability ?? 'Unconfirmed')) &&
      (!state.institution || m.identity.institution === state.institution) &&
      (!state.skill || m.mentorship.desiredSkills.includes(state.skill)) &&
      (!state.time || m.mentorship.protectedTime === state.time) &&
      (!state.saved || saved.includes(m.id))
    );
    const name = (a,b) => a.item.identity.name.localeCompare(b.item.identity.name);
    const availability = {Accepting: 0, 'By Request': 1, Closed: 2};
    matches.sort(state.sort === 'name' ? name : state.sort === 'availability'
      ? (a,b) => (availability[a.item.mentorship.availability] ?? 3) - (availability[b.item.mentorship.availability] ?? 3) || name(a,b)
      : (a,b) => a.score - b.score || name(a,b));
    return matches.map(({item}) => item);
  };
}

export function readState(search) {
  const p = new URLSearchParams(search);
  return {
    q: (p.get('q') ?? '').slice(0, 200), area: p.get('area') ?? '',
    availability: p.getAll('availability'), institution: p.get('institution') ?? '',
    skill: p.get('skill') ?? '', time: p.get('time') ?? '',
    saved: p.get('saved') === '1', sort: ['name','availability'].includes(p.get('sort')) ? p.get('sort') : 'relevance'
  };
}

export function stateToSearch(state) {
  const p = new URLSearchParams();
  for (const key of ['q','area','institution','skill','time']) if(state[key]) p.set(key,state[key]);
  state.availability.forEach(value => p.append('availability',value));
  if(state.saved) p.set('saved','1');
  if(state.sort !== 'relevance') p.set('sort',state.sort);
  return p.toString();
}
