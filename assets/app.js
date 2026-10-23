import {createSearch, readState, stateToSearch} from './search.js';

const base = document.body.dataset.base;
const key = `mentor-shortlist:${base}:v1`;
let saved = [];
let storageAvailable = true;
function readSaved(value) {
  const parsed = JSON.parse(value ?? '[]');
  return Array.isArray(parsed) ? [...new Set(parsed.filter(id => typeof id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)))].slice(0,200) : [];
}
try {
  saved = readSaved(localStorage.getItem(key));
} catch { storageAvailable = false; }
const announce = message => { document.querySelector('#announcement').textContent = message; };
function refreshSaved() {
  document.querySelectorAll('[data-save]').forEach(button => {
    const active = saved.includes(button.dataset.save);
    button.setAttribute('aria-pressed', String(active));
    button.querySelector('.save-label').textContent = active ? 'Saved' : 'Save mentor';
  });
  document.querySelectorAll('[data-saved-count]').forEach(el => { el.textContent = String(saved.length); });
}
function persistSaved() {
  try { localStorage.setItem(key,JSON.stringify(saved)); }
  catch { storageAvailable = false; }
}
document.addEventListener('click', event => {
  const button = event.target.closest('[data-save]');
  if(!button) return;
  const id = button.dataset.save;
  saved = saved.includes(id) ? saved.filter(value => value !== id) : [...saved, id];
  persistSaved(); refreshSaved();
  announce(`${saved.includes(id) ? 'Mentor saved.' : 'Mentor removed from saved list.'}${storageAvailable ? '' : ' Browser storage is unavailable; this change lasts only while this page is open.'}`);
  if(updateResults) updateResults();
});
refreshSaved();

let updateResults;
let publishedIds;
const dataRequest = fetch(`${base}data/mentors.public.json`, {cache: 'no-store'}).then(async response => {
  if (!response.ok) throw new Error('Data request failed');
  const mentors = await response.json();
  if (!Array.isArray(mentors)) throw new Error('Invalid directory data');
  publishedIds = new Set(mentors.map(mentor => mentor.id));
  saved = saved.filter(id => publishedIds.has(id));
  persistSaved(); refreshSaved();
  return mentors;
});
// Profile and overview pages also prune saved entries for deleted researchers.
dataRequest.catch(() => {});
window.addEventListener('storage',event => {
  if(event.key !== key && event.key !== null) return;
  try {saved = readSaved(event.key === null ? null : event.newValue);} catch {saved = [];}
  if (publishedIds) saved = saved.filter(id => publishedIds.has(id));
  refreshSaved();
  if(updateResults) updateResults();
});
const form = document.querySelector('#search-form');
if(form) {
  const query = document.querySelector('#query');
  const sort = document.querySelector('#sort');
  const filters = document.querySelector('#filters');
  const cards = [...document.querySelectorAll('[data-mentor]')];
  const list = document.querySelector('#results');
  let state = readState(location.search);
  const initialState = readState('');
  function syncControls() {
    query.value = state.q;
    sort.value = state.sort;
    for(const name of ['institution','skill','time']) filters.elements[name].value = state[name];
    filters.querySelectorAll('[name=availability]').forEach(input => {input.checked = state.availability.includes(input.value);});
    filters.elements.saved.checked = state.saved;
    document.querySelectorAll('[data-area]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.area === state.area)));
  }
  syncControls();
  try {
    const mentors = await dataRequest;
    const search = createSearch(mentors);
    updateResults = () => {
      const matches = search(state,saved);
      const ids = new Set(matches.map(m => m.id));
      const byId = new Map(cards.map(card => [card.dataset.mentor, card]));
      cards.forEach(card => {card.hidden = !ids.has(card.dataset.mentor);});
      for(const mentor of matches) list.append(byId.get(mentor.id));
      document.querySelector('#result-count').textContent = String(matches.length);
      document.querySelector('#empty-state').hidden = matches.length !== 0;
      document.querySelector('#active-description').textContent = state.saved ? 'saved mentors' : 'mentors';
      document.querySelector('#results-summary').setAttribute('aria-label',`${matches.length} ${state.saved ? 'saved mentors' : 'mentors'} found`);
    };
    const update = (historyMode = 'push') => {
      const search = stateToSearch(state);
      history[historyMode === 'replace' ? 'replaceState' : 'pushState'](null,'',`${location.pathname}${search ? `?${search}` : ''}`);
      syncControls(); updateResults();
    };
    let pending;
    query.addEventListener('input',() => { clearTimeout(pending); pending = setTimeout(() => {state.q = query.value; update('replace');},150); });
    form.addEventListener('submit',event => {event.preventDefault(); clearTimeout(pending); state.q = query.value; update();});
    filters.addEventListener('change',() => {
      clearTimeout(pending); state.q = query.value;
      for(const name of ['institution','skill','time']) state[name] = filters.elements[name].value;
      state.availability = [...filters.querySelectorAll('[name=availability]:checked')].map(input => input.value);
      state.saved = filters.elements.saved.checked; update();
    });
    document.querySelectorAll('[data-area]').forEach(button => button.addEventListener('click',() => {clearTimeout(pending);state.q = query.value;state.area = button.dataset.area;update();}));
    sort.addEventListener('change',() => {clearTimeout(pending);state.q = query.value;state.sort = sort.value; update();});
    document.querySelectorAll('[data-reset]').forEach(button => button.addEventListener('click',() => {clearTimeout(pending); state = {...initialState, availability: []};update();}));
    window.addEventListener('popstate',() => {clearTimeout(pending);state = readState(location.search);syncControls();updateResults();});
    updateResults();
  } catch {
    document.querySelector('#search-status').hidden = false;
    for(const control of [...form.elements,...filters.elements,sort,...document.querySelectorAll('[data-area]')]) control.disabled = true;
    announce('Search is unavailable. You can still browse every mentor below.');
  }
}
