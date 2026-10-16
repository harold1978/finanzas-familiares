// Capa de datos: Firestore en tiempo real (onSnapshot) o modo local (localStorage) con la misma API.
const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
export const COLS = ['categorias', 'ingresos', 'gastos', 'metas'];

class LocalDB {
  constructor(fam, onStatus) {
    this.mode = 'local'; this.fam = fam; this.key = 'cff:' + fam; this.subs = {}; this.onStatus = onStatus;
    this.data = this._load();
    window.addEventListener('storage', e => { if (e.key === this.key) { this.data = this._load(); COLS.forEach(c => this._emit(c)); } });
    onStatus('local', 'Modo local (solo este navegador)');
  }
  _load() { try { return JSON.parse(localStorage.getItem(this.key)) || {}; } catch { return {}; } }
  _save() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { this.onStatus('err', 'No se pudo guardar localmente'); } }
  _emit(c) { (this.subs[c] || []).forEach(cb => cb((this.data[c] || []).map(x => ({ ...x })))); }
  subscribe(c, cb) { (this.subs[c] ||= []).push(cb); cb((this.data[c] || []).map(x => ({ ...x }))); return () => { this.subs[c] = this.subs[c].filter(f => f !== cb); }; }
  _id() { return 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  async add(c, d) { const id = this._id(); (this.data[c] ||= []).push({ ...d, id }); this._save(); this._emit(c); return id; }
  async addMany(c, arr) { const ids = arr.map(() => this._id()); (this.data[c] ||= []).push(...arr.map((d, i) => ({ ...d, id: ids[i] }))); this._save(); this._emit(c); return ids; }
  async update(c, id, d) { const l = this.data[c] || []; const i = l.findIndex(x => x.id === id); if (i >= 0) l[i] = { ...l[i], ...d }; this._save(); this._emit(c); }
  async remove(c, id) { this.data[c] = (this.data[c] || []).filter(x => x.id !== id); this._save(); this._emit(c); }
  async clearAll() { this.data = {}; this._save(); COLS.forEach(c => this._emit(c)); }
}

class FireDB {
  constructor(fam, onStatus) { this.mode = 'firestore'; this.fam = fam; this.onStatus = onStatus; this.pending = {}; }
  async init(config) {
    this.onStatus('connecting', 'Conectando a Firestore…');
    const [appM, fsM, authM] = await Promise.all([import(FB + 'firebase-app.js'), import(FB + 'firebase-firestore.js'), import(FB + 'firebase-auth.js')]);
    this.fs = fsM;
    const app = appM.initializeApp(config);
    await authM.signInAnonymously(authM.getAuth(app));
    try { this.db = fsM.initializeFirestore(app, { localCache: fsM.persistentLocalCache({ tabManager: fsM.persistentMultipleTabManager() }) }); }
    catch { this.db = fsM.getFirestore(app); }
    return this;
  }
  col(c) { return this.fs.collection(this.db, 'familias', this.fam, c); }
  subscribe(c, cb) {
    return this.fs.onSnapshot(this.col(c), { includeMetadataChanges: true }, snap => {
      cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      this.pending[c] = snap.metadata.hasPendingWrites || snap.metadata.fromCache;
      const anyPending = Object.values(this.pending).some(Boolean);
      this.onStatus(anyPending ? 'sync' : 'live', anyPending ? 'Sincronizando…' : 'En vivo · Firestore');
    }, err => this.onStatus('err', 'Error Firestore: ' + (err.code || err.message)));
  }
  async add(c, d) { const r = await this.fs.addDoc(this.col(c), d); return r.id; }
  async addMany(c, arr) {
    const ids = [];
    for (let i = 0; i < arr.length; i += 400) {
      const b = this.fs.writeBatch(this.db);
      arr.slice(i, i + 400).forEach(d => { const ref = this.fs.doc(this.col(c)); ids.push(ref.id); b.set(ref, d); });
      await b.commit();
    }
    return ids;
  }
  async update(c, id, d) { await this.fs.updateDoc(this.fs.doc(this.db, 'familias', this.fam, c, id), d); }
  async remove(c, id) { await this.fs.deleteDoc(this.fs.doc(this.db, 'familias', this.fam, c, id)); }
  async clearAll() {
    for (const c of COLS) {
      const snap = await this.fs.getDocs(this.col(c)); const docs = snap.docs;
      for (let i = 0; i < docs.length; i += 400) { const b = this.fs.writeBatch(this.db); docs.slice(i, i + 400).forEach(d => b.delete(d.ref)); await b.commit(); }
    }
  }
}

export async function connect(fam, config, onStatus) {
  if (config && config.projectId) {
    try { return await new FireDB(fam, onStatus).init(config); }
    catch (e) { console.error(e); onStatus('err', 'No se pudo conectar: ' + (e.code || e.message) + ' — usando modo local'); }
  }
  return new LocalDB(fam, onStatus);
}
