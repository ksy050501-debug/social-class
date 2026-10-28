const auths = {};
const key = (a) => 'FAKEAUTH:' + a.app.name;
function load(a) { try { return JSON.parse(sessionStorage.getItem(key(a))); } catch (e) { return null; } }
function save(a, u) { if (u) sessionStorage.setItem(key(a), JSON.stringify(u)); else sessionStorage.removeItem(key(a)); }
export function getAuth(app) {
  if (!auths[app.name]) { const a = { app, cbs: [] }; a.currentUser = load(a); auths[app.name] = a; }
  return auths[app.name];
}
function set(a, u) { a.currentUser = u; save(a, u); a.cbs.forEach((cb) => setTimeout(() => cb(u), 0)); return { user: u }; }
export function onAuthStateChanged(a, cb) { a.cbs.push(cb); setTimeout(() => cb(a.currentUser), 5); return () => { a.cbs = a.cbs.filter((x) => x !== cb); }; }
export async function signInAnonymously(a) { return set(a, { uid: 'anon-' + Math.random().toString(36).slice(2, 10), isAnonymous: true }); }
export class GoogleAuthProvider { setCustomParameters() {} }
export async function signInWithPopup(a) { return set(a, { uid: 'teacher-1', isAnonymous: false, displayName: '테스트 교사', email: 't@example.com' }); }
export async function signOut(a) { set(a, null); }
