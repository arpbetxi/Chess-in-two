// Conexión con Firebase (Authentication + Firestore).
// Expone window.CuentasBackend con una interfaz sencilla que usa cuentas.js.
// Si no hay configuración o Firebase no carga, el juego sigue funcionando sin cuentas.
const VERSION = '12.18.0';
const BASE = 'https://www.gstatic.com/firebasejs/' + VERSION + '/';

async function start() {
  if (window.CuentasBackend) return;              // ya hay uno (por ejemplo, en pruebas)
  const cfg = window.FIREBASE_CONFIG;
  if (!cfg) return;
  try {
    const appMod = await import(BASE + 'firebase-app.js');
    const authMod = await import(BASE + 'firebase-auth.js');
    const fs = await import(BASE + 'firebase-firestore.js');

    const app = appMod.initializeApp(cfg);
    const auth = authMod.getAuth(app);
    authMod.setPersistence(auth, authMod.browserLocalPersistence).catch(function () {});
    const db = fs.getFirestore(app);

    const backend = {
      ready: true,
      onAuth(cb) {
        return authMod.onAuthStateChanged(auth, function (u) {
          cb(u ? { uid: u.uid, name: u.displayName || (u.email || '').split('@')[0], email: u.email } : null);
        });
      },
      async signInGoogle() {
        const provider = new authMod.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await authMod.signInWithPopup(auth, provider);
      },
      async signInEmail(email, pass) {
        await authMod.signInWithEmailAndPassword(auth, email, pass);
      },
      async signUpEmail(name, email, pass) {
        const cred = await authMod.createUserWithEmailAndPassword(auth, email, pass);
        await authMod.updateProfile(cred.user, { displayName: name });
        await fs.setDoc(fs.doc(db, 'users', cred.user.uid), { name: name, createdAt: fs.serverTimestamp() }, { merge: true });
      },
      async resetPassword(email) {
        await authMod.sendPasswordResetEmail(auth, email);
      },
      async signOut() {
        await authMod.signOut(auth);
      },
      async setName(name) {
        const u = auth.currentUser;
        if (!u) return;
        await authMod.updateProfile(u, { displayName: name });
        await fs.setDoc(fs.doc(db, 'users', u.uid), { name: name }, { merge: true });
      },
      // Guarda una partida y actualiza las estadísticas en un solo paso.
      // Si la partida ya estaba guardada, falla entero (las reglas no dejan sobrescribirla) y no se cuenta dos veces.
      async saveGame(g) {
        const u = auth.currentUser;
        if (!u) return false;
        const inc = fs.increment(1);
        const stats = { played: inc };
        stats[g.result] = inc;                           // win | loss | draw | local
        const byMode = {};
        byMode[g.mode] = { played: inc };
        byMode[g.mode][g.result] = inc;
        const batch = fs.writeBatch(db);
        batch.set(fs.doc(db, 'users', u.uid, 'games', g.id), Object.assign({}, g, { date: fs.serverTimestamp() }));
        batch.set(fs.doc(db, 'users', u.uid), { name: u.displayName || '', stats: stats, byMode: byMode }, { merge: true });
        await batch.commit();
        return true;
      },
      async loadProfile() {
        const u = auth.currentUser;
        if (!u) return null;
        const snap = await fs.getDoc(fs.doc(db, 'users', u.uid));
        return snap.exists() ? snap.data() : {};
      },
      async loadGames(n) {
        const u = auth.currentUser;
        if (!u) return [];
        const q = fs.query(fs.collection(db, 'users', u.uid, 'games'), fs.orderBy('date', 'desc'), fs.limit(n || 20));
        const snap = await fs.getDocs(q);
        return snap.docs.map(function (d) {
          const x = d.data();
          return Object.assign({}, x, { date: x.date && x.date.toDate ? x.date.toDate() : null });
        });
      },
    };
    window.CuentasBackend = backend;
    window.dispatchEvent(new Event('cuentas-backend'));
  } catch (e) {
    console.warn('Cuentas no disponibles:', e && e.message);
    window.dispatchEvent(new Event('cuentas-error'));
  }
}
start();
